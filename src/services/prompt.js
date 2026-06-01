function sourceLabel(chunk) {
  const metadata = chunk.metadata || {};
  return metadata.page || metadata.title || metadata.source || chunk.id;
}

export function formatSources(chunks) {
  return chunks.map((chunk) => ({
    id: chunk.id,
    source: chunk.metadata?.source || '',
    title: sourceLabel(chunk),
  }));
}

function formatHistory(history = []) {
  return history
    .slice(-8)
    .map((item) => `${item.role === 'assistant' ? 'Justo Genie' : 'Visitor'}: ${item.content}`)
    .join('\n');
}

function formatRecommendationPlan(plan) {
  if (!plan?.topRecommendations?.length) {
    return 'No recommendation plan available.';
  }

  return plan.topRecommendations
    .map((item, index) => {
      return `${index + 1}. ${item.title} (${item.category}) - ${item.reason} Next action: ${item.nextAction}`;
    })
    .join('\n');
}

export function buildRagPrompt({
  message,
  visitor,
  chunks,
  history = [],
  summary = '',
  recommendationPlan = null,
  agentBehavior = null,
}) {
  const context = chunks
    .map((chunk, index) => {
      const label = sourceLabel(chunk);
      return `[${index + 1}] ${label}\nSource: ${chunk.metadata?.source || 'unknown'}\n${chunk.content}`;
    })
    .join('\n\n');

  const visitorContext = [
    visitor?.name ? `Name: ${visitor.name}` : '',
    visitor?.email ? `Email: ${visitor.email}` : '',
    visitor?.company ? `Company: ${visitor.company}` : '',
  ].filter(Boolean).join('\n');

  return `You are Justo Genie, a fast enterprise AI engagement assistant for Justo Global.

Use the retrieved Justo website context first. Be concise, business-oriented, and specific.
If the request is broad, ask exactly one useful clarifying question after giving immediate value.
Recommend relevant Justo services only when grounded in the context.
Do not invent case studies, prices, timelines, guarantees, or unsupported claims.
Naturally encourage sharing an email for follow-up when the visitor shows business intent, but do not block help.
Behave like an engagement agent: remember the current conversation, connect the visitor's requirement to a relevant Justo next step, and keep momentum toward qualification.
Use the recommendation plan when it is grounded in retrieved context. If confidence is low, ask only the provided clarifying question.
Follow the agent behavior mode:
- assist: answer normally and guide toward service fit.
- qualification: ask one targeted qualifying follow-up after the answer.
- conversion: invite a requirement summary or sales handoff naturally, without sounding like a form.

Visitor:
${visitorContext || 'Anonymous visitor'}

Conversation summary:
${summary || 'No prior summary.'}

Recent conversation:
${formatHistory(history) || 'No prior messages.'}

Grounded recommendation plan:
Confidence: ${recommendationPlan?.confidence ?? 'unknown'}
${formatRecommendationPlan(recommendationPlan)}
Clarifying question to ask if needed: ${recommendationPlan?.clarifyingQuestion || 'None'}

Agent behavior:
Mode: ${agentBehavior?.mode || 'assist'}
Next best action: ${agentBehavior?.nextBestAction || 'Answer helpfully.'}

Retrieved Justo context:
${context || 'No retrieved context available.'}

Visitor question:
${message}

Answer as Justo Genie.`;
}
