const INTENT_PATTERNS = [
  ['education', /\b(school|college|university|student|learning|education|edtech|lms)\b/i],
  ['healthcare', /\b(healthcare|hospital|clinic|patient|medical|doctor|pharma)\b/i],
  ['donor', /\b(donor|fundraising|ngo|nonprofit|non-profit|charity|donation)\b/i],
  ['enterprise', /\b(enterprise|operation|workflow|automation|scale|team|business process)\b/i],
  ['technology service', /\b(web|mobile|app|software|cloud|data|ai|development|integration|it service)\b/i],
  ['media/video', /\b(video|media|creative|animation|production|editing)\b/i],
  ['elevate product interest', /\b(elevate)\b/i],
  ['pricing', /\b(price|pricing|cost|budget|quote|package|plan)\b/i],
  ['partnership', /\b(partner|partnership|collaborate|alliance)\b/i],
  ['support', /\b(support|help|issue|problem|contact)\b/i],
];

const INTEREST_PATTERNS = [
  ['Web development', /\b(web|website|frontend|backend)\b/i],
  ['Mobile app development', /\b(mobile|ios|android|app)\b/i],
  ['AI solutions', /\b(ai|artificial intelligence|automation|chatbot|ml)\b/i],
  ['Cloud and data', /\b(cloud|data|analytics|database|migration)\b/i],
  ['UI/UX design', /\b(ui|ux|design|prototype|user experience)\b/i],
  ['Managed IT services', /\b(managed it|it support|infrastructure)\b/i],
  ['Elevate', /\b(elevate)\b/i],
  ['Media and video', /\b(video|media|production|creative)\b/i],
];

export function extractLeadSignals(message, visitor = {}, retrievedChunks = []) {
  const retrievedText = retrievedChunks.map((chunk) => chunk.content).join(' ');
  const combinedText = `${message} ${retrievedText}`;
  const intent = INTENT_PATTERNS.find(([, pattern]) => pattern.test(message))?.[0] || 'general inquiry';
  const sessionInterests = INTEREST_PATTERNS
    .filter(([, pattern]) => pattern.test(combinedText))
    .map(([interest]) => interest);

  const email = visitor.email || message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const urgency = /\b(urgent|asap|immediately|this week|quickly|soon)\b/i.test(message)
    ? 'high'
    : /\b(next month|quarter|planning|exploring)\b/i.test(message)
      ? 'medium'
      : 'unknown';

  const score =
    (email ? 25 : 0) +
    (visitor.company ? 15 : 0) +
    (intent !== 'general inquiry' ? 20 : 0) +
    Math.min(sessionInterests.length * 10, 30) +
    (urgency === 'high' ? 10 : 0);

  return {
    email,
    intent,
    industry: ['education', 'healthcare', 'donor'].includes(intent) ? intent : '',
    sessionInterests,
    accumulatedInterests: sessionInterests,
    urgency,
    score,
  };
}

export function suggestedQuestionsFor(intent, interests = []) {
  if (intent === 'pricing') {
    return ['What affects the project cost?', 'Can Justo recommend a starting scope?', 'How can I share my requirements?'];
  }
  if (interests.includes('Mobile app development')) {
    return ['Can Justo build both iOS and Android apps?', 'What app features should I prioritize first?', 'Can Justo help with UI/UX too?'];
  }
  if (interests.includes('AI solutions')) {
    return ['How can AI improve my workflow?', 'Can Justo build an AI chatbot?', 'What data do you need to start?'];
  }
  return ['Which Justo service fits my requirement?', 'Can you recommend a next step?', 'Can I share my email for follow-up?'];
}
