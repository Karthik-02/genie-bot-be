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

export function buildRagPrompt({ message, visitor, chunks }) {
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

Visitor:
${visitorContext || 'Anonymous visitor'}

Retrieved Justo context:
${context || 'No retrieved context available.'}

Visitor question:
${message}

Answer as Justo Genie.`;
}
