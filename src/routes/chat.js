import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { extractLeadSignals, suggestedQuestionsFor } from '../services/leadSignals.js';
import { buildRagPrompt, formatSources } from '../services/prompt.js';

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

    const chunks = await app.retrieval.search(payload.message, config.knowledge.topK);
    const prompt = buildRagPrompt({ message: payload.message, visitor: payload.visitor, chunks });
    const answer = await app.llm.generate(prompt);
    const lead = extractLeadSignals(payload.message, payload.visitor, chunks);

    return {
      conversationId: payload.conversationId,
      sessionId: payload.sessionId,
      answer,
      sources: formatSources(chunks),
      lead,
      suggestedQuestions: suggestedQuestionsFor(lead.intent, lead.sessionInterests),
      metadata: {
        provider: app.llm.provider,
        model: app.llm.model,
        llmConfigured: app.llm.configured,
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
      writeSse(reply, 'status', { message: 'Analyzing requirement...' });
      const chunks = await app.retrieval.search(payload.message, config.knowledge.topK);

      writeSse(reply, 'status', { message: 'Searching relevant solutions...' });
      const prompt = buildRagPrompt({ message: payload.message, visitor: payload.visitor, chunks });

      writeSse(reply, 'status', { message: 'Preparing recommendations...' });
      let answer = '';
      for await (const token of app.llm.stream(prompt)) {
        answer += token;
        writeSse(reply, 'token', { text: token });
      }

      const lead = extractLeadSignals(payload.message, payload.visitor, chunks);
      writeSse(reply, 'final', {
        conversationId: payload.conversationId,
        sessionId: payload.sessionId,
        answer,
        sources: formatSources(chunks),
        lead,
        suggestedQuestions: suggestedQuestionsFor(lead.intent, lead.sessionInterests),
        metadata: {
          provider: app.llm.provider,
          model: app.llm.model,
          llmConfigured: app.llm.configured,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'stream failed');
      writeSse(reply, 'error', {
        message: 'Justo Genie had trouble preparing this response. Please try again.',
      });
    } finally {
      reply.raw.end();
    }
  });
}
