import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { extractLeadSignals, suggestedQuestionsFor } from '../services/leadSignals.js';
import { buildRagPrompt, formatSources } from '../services/prompt.js';
import { buildRecommendationPlan } from '../services/recommendations.js';
import { buildAgentBehavior } from '../services/agentBehavior.js';

function normalizePayload(body = {}) {
  return {
    conversationId: body.conversationId || `conv_${randomUUID()}`,
    sessionId: body.sessionId || `sess_${randomUUID()}`,
    message: String(body.message || '').trim(),
    visitor: body.metadata?.visitor || {},
  };
}

function writeSse(reply, event, data) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function chatRoutes(app) {
  app.post('/chat', async (request, reply) => {
    const payload = normalizePayload(request.body);
    if (!payload.message) {
      return reply.code(400).send({ error: 'message is required' });
    }

    app.store.ensureSession(payload);
    app.store.addMessage({
      conversationId: payload.conversationId,
      sessionId: payload.sessionId,
      role: 'user',
      content: payload.message,
      metadata: { visitor: payload.visitor },
    });
    const history = app.store.recentMessages(payload.conversationId, 8);
    const summary = app.store.summarizeConversation(payload.conversationId);

    const chunks = await app.retrieval.search(payload.message, config.knowledge.topK);
    const leadSignals = extractLeadSignals(payload.message, payload.visitor, chunks, history);
    const recommendationPlan = buildRecommendationPlan({ lead: leadSignals, chunks });
    const agentBehavior = buildAgentBehavior({ lead: leadSignals, recommendationPlan });
    const prompt = buildRagPrompt({
      message: payload.message,
      visitor: payload.visitor,
      chunks,
      history,
      summary,
      recommendationPlan,
      agentBehavior,
    });
    const answer = await app.llm.generate(prompt);
    app.store.addMessage({
      conversationId: payload.conversationId,
      sessionId: payload.sessionId,
      role: 'assistant',
      content: answer,
      metadata: { sources: formatSources(chunks) },
    });

    const conversationSummary = app.store.summarizeConversation(payload.conversationId);
    app.store.updateConversationSummary(payload.conversationId, conversationSummary);
    const lead = app.store.upsertLead({
      visitor: payload.visitor,
      lead: leadSignals,
      sessionId: payload.sessionId,
      conversationId: payload.conversationId,
      summary: conversationSummary,
    });

    return {
      conversationId: payload.conversationId,
      sessionId: payload.sessionId,
      answer,
      sources: formatSources(chunks),
      lead,
      recommendations: recommendationPlan.recommendations,
      topRecommendations: recommendationPlan.topRecommendations,
      clarifyingQuestion: recommendationPlan.clarifyingQuestion,
      nextActions: recommendationPlan.nextActions,
      agentBehavior,
      suggestedQuestions: agentBehavior.proactivePrompts || suggestedQuestionsFor(lead.intent, lead.sessionInterests),
      metadata: {
        provider: app.llm.provider,
        model: app.llm.model,
        llmConfigured: app.llm.configured,
        recommendationConfidence: recommendationPlan.confidence,
      },
    };
  });

  app.post('/stream', async (request, reply) => {
    const payload = normalizePayload(request.body);
    if (!payload.message) {
      return reply.code(400).send({ error: 'message is required' });
    }

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    try {
      app.store.ensureSession(payload);
      app.store.addMessage({
        conversationId: payload.conversationId,
        sessionId: payload.sessionId,
        role: 'user',
        content: payload.message,
        metadata: { visitor: payload.visitor },
      });
      const history = app.store.recentMessages(payload.conversationId, 8);
      const summary = app.store.summarizeConversation(payload.conversationId);

      writeSse(reply, 'status', { message: 'Analyzing requirement...' });
      const chunks = await app.retrieval.search(payload.message, config.knowledge.topK);
      const leadSignals = extractLeadSignals(payload.message, payload.visitor, chunks, history);
      const recommendationPlan = buildRecommendationPlan({ lead: leadSignals, chunks });
      const agentBehavior = buildAgentBehavior({ lead: leadSignals, recommendationPlan });

      writeSse(reply, 'status', { message: 'Searching relevant solutions...' });
      const prompt = buildRagPrompt({
        message: payload.message,
        visitor: payload.visitor,
        chunks,
        history,
        summary,
        recommendationPlan,
        agentBehavior,
      });

      writeSse(reply, 'status', { message: 'Preparing recommendations...' });
      let answer = '';
      for await (const token of app.llm.stream(prompt)) {
        answer += token;
        writeSse(reply, 'token', { text: token });
      }

      app.store.addMessage({
        conversationId: payload.conversationId,
        sessionId: payload.sessionId,
        role: 'assistant',
        content: answer,
        metadata: { sources: formatSources(chunks) },
      });

      const conversationSummary = app.store.summarizeConversation(payload.conversationId);
      app.store.updateConversationSummary(payload.conversationId, conversationSummary);
      const lead = app.store.upsertLead({
        visitor: payload.visitor,
        lead: leadSignals,
        sessionId: payload.sessionId,
        conversationId: payload.conversationId,
        summary: conversationSummary,
      });

      writeSse(reply, 'final', {
        conversationId: payload.conversationId,
        sessionId: payload.sessionId,
        answer,
        sources: formatSources(chunks),
        lead,
        recommendations: recommendationPlan.recommendations,
        topRecommendations: recommendationPlan.topRecommendations,
        clarifyingQuestion: recommendationPlan.clarifyingQuestion,
        nextActions: recommendationPlan.nextActions,
        agentBehavior,
        suggestedQuestions: agentBehavior.proactivePrompts || suggestedQuestionsFor(lead.intent, lead.sessionInterests),
        metadata: {
          provider: app.llm.provider,
          model: app.llm.model,
          llmConfigured: app.llm.configured,
          recommendationConfidence: recommendationPlan.confidence,
        },
      });
    } catch (error) {
      const errorMessage = error?.message || String(error);
      request.log.error({ error, errorMessage }, 'stream failed');
      
      let userMessage = 'Justo Genie had trouble preparing this response. Please try again.';
      
      // Provide diagnostic hints for common errors
      if (errorMessage.includes('Retrieval')) {
        userMessage = '[Knowledge base issue] The search system is unavailable. Restart backend: npm start';
      } else if (errorMessage.includes('timed out')) {
        userMessage = '[Timeout] The request took too long. Try again or check backend performance.';
      } else if (errorMessage.includes('GEMINI')) {
        userMessage = '[API issue] Gemini API is not responding. Check GEMINI_API_KEY in .env.';
      } else if (errorMessage.includes('worker')) {
        userMessage = '[System issue] Python worker crashed. Run: npm run diagnose';
      }
      
      writeSse(reply, 'error', {
        message: userMessage,
        debug: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      });
    } finally {
      reply.raw.end();
    }
  });

  app.get('/history/:conversationId', async (request, reply) => {
    const conversationId = String(request.params.conversationId || '').trim();
    if (!conversationId) {
      return reply.code(400).send({ error: 'conversationId is required' });
    }

    const history = app.store.history(conversationId);
    if (!history.conversation) {
      return reply.code(404).send({ error: 'conversation not found' });
    }

    return {
      conversationId,
      sessionId: history.conversation.session_id,
      summary: history.conversation.summary || '',
      messages: history.messages,
    };
  });

  app.post('/lead', async (request, reply) => {
    const body = request.body || {};
    const visitor = {
      name: body.name || body.visitor?.name || '',
      email: body.email || body.visitor?.email || '',
      company: body.company || body.visitor?.company || '',
      phone: body.phone || body.visitor?.phone || '',
    };

    if (!visitor.email) {
      return reply.code(400).send({ error: 'email is required' });
    }

    const sessionId = body.sessionId || `sess_${randomUUID()}`;
    const conversationId = body.conversationId || `conv_${randomUUID()}`;
    app.store.ensureSession({ sessionId, conversationId, visitor });
    const lead = app.store.explicitLeadCapture({
      sessionId,
      conversationId,
      visitor,
      interests: Array.isArray(body.interests) ? body.interests : [],
      score: Number(body.score) || 0,
    });

    return {
      ok: true,
      conversationId,
      sessionId,
      lead,
    };
  });
}
