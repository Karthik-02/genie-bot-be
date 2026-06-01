const OFFERING_RULES = [
  {
    key: 'mobile-app-development',
    title: 'Web and Mobile App Development',
    category: 'service',
    interests: ['Mobile app development', 'Web development'],
    intents: ['technology service', 'enterprise'],
    sourcePatterns: [/web-and-mobile-development/i, /design-development/i, /technology/i],
    nextAction: 'Share the app type, target users, and must-have features so Justo can recommend an MVP scope.',
  },
  {
    key: 'ai-data-science',
    title: 'AI and Data Science',
    category: 'service',
    interests: ['AI solutions'],
    intents: ['technology service', 'enterprise'],
    sourcePatterns: [/ai-data-science/i, /technology/i],
    nextAction: 'Share the workflow, data sources, and decision points you want to automate.',
  },
  {
    key: 'cloud-data',
    title: 'Cloud and Data',
    category: 'service',
    interests: ['Cloud and data'],
    intents: ['technology service', 'enterprise'],
    sourcePatterns: [/cloud-data/i, /technology/i],
    nextAction: 'Share your current hosting, data, or migration challenge so Justo can map the right cloud path.',
  },
  {
    key: 'ui-ux-design',
    title: 'UI/UX Design',
    category: 'service',
    interests: ['UI/UX design'],
    intents: ['technology service', 'enterprise'],
    sourcePatterns: [/ui-ux/i, /graphic-design/i, /design-development/i],
    nextAction: 'Share the product flow or screen experience you want to improve.',
  },
  {
    key: 'managed-it',
    title: 'Managed IT Support',
    category: 'service',
    interests: ['Managed IT services'],
    intents: ['support', 'enterprise', 'technology service'],
    sourcePatterns: [/managed-it-support/i, /it-professional-services/i],
    nextAction: 'Share your current IT support model, ticket volume, and urgency.',
  },
  {
    key: 'media-video',
    title: 'Media and Video Production',
    category: 'service',
    interests: ['Media and video'],
    intents: ['media/video'],
    sourcePatterns: [/media/i, /video-production/i],
    nextAction: 'Share the format, target audience, and campaign goal for the video or media asset.',
  },
  {
    key: 'elevate',
    title: 'Elevate',
    category: 'product',
    interests: ['Elevate'],
    intents: ['elevate product interest'],
    sourcePatterns: [/elevate/i, /justo-landing/i, /technology/i],
    nextAction: 'Share what you want to achieve with Elevate so Justo can confirm the right product fit.',
  },
  {
    key: 'education',
    title: 'Education Solutions',
    category: 'industry',
    interests: [],
    intents: ['education'],
    sourcePatterns: [/education/i],
    nextAction: 'Share whether this is for a school, college, edtech platform, or training workflow.',
  },
  {
    key: 'manufacturing',
    title: 'Manufacturing Services',
    category: 'industry',
    interests: [],
    intents: ['enterprise'],
    sourcePatterns: [/manufacturing/i, /supply-chain/i],
    nextAction: 'Share the operational process or supply-chain challenge you want to improve.',
  },
  {
    key: 'case-studies',
    title: 'Relevant Case Studies',
    category: 'case_study',
    interests: [],
    intents: ['enterprise', 'technology service', 'support', 'media/video'],
    sourcePatterns: [/case/i, /singleblog/i, /managed-it-support/i, /design-development/i],
    nextAction: 'Ask for a similar example by industry or service area.',
  },
];

function sourceLabel(chunk) {
  const metadata = chunk.metadata || {};
  return metadata.page || metadata.title || metadata.source || chunk.id;
}

function sourceToUrl(source = '') {
  if (/^https?:\/\//i.test(source)) return source;

  const fileName = source.split('/').pop() || '';
  const slug = fileName.replace(/\.ejs$/i, '');

  if (!slug || slug === 'index') return 'https://www.justoglobal.com/';
  if (slug === 'layoutHeader' || slug === 'layoutFooter' || slug === 'pageHeader') {
    return 'https://www.justoglobal.com/';
  }

  return `https://www.justoglobal.com/${slug}`;
}

function chunkMatchesRule(chunk, rule) {
  const metadata = chunk.metadata || {};
  const text = `${metadata.source || ''} ${metadata.page || ''} ${chunk.content || ''}`;
  return rule.sourcePatterns.some((pattern) => pattern.test(text));
}

function ruleMatchesLead(rule, lead) {
  const intentMatch = rule.intents.includes(lead.intent);
  const interestMatch = rule.interests.some((interest) => lead.sessionInterests?.includes(interest));
  return intentMatch || interestMatch;
}

function recommendationFromChunk(rule, chunk, index) {
  return {
    id: `${rule.key}-${chunk.id || index}`,
    title: rule.title,
    source: sourceLabel(chunk),
    url: sourceToUrl(chunk.metadata?.source || ''),
    category: rule.category,
    reason: `Grounded in ${sourceLabel(chunk)} from the Justo knowledge base.`,
    nextAction: rule.nextAction,
  };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function confidenceFor({ lead, recommendations, chunks }) {
  let confidence = 0.25;
  if (lead.intent && lead.intent !== 'general inquiry') confidence += 0.25;
  if (lead.sessionInterests?.length) confidence += 0.2;
  if (recommendations.length) confidence += 0.2;
  if (chunks.some((chunk) => typeof chunk.distance === 'number' && chunk.distance < 0.85)) confidence += 0.1;
  return Math.min(Number(confidence.toFixed(2)), 0.95);
}

function clarifyingQuestionFor(lead, confidence) {
  if (confidence >= 0.65) return null;

  if (lead.intent === 'education') {
    return 'Is this for a school, university, edtech product, or internal training program?';
  }

  if (lead.intent === 'healthcare') {
    return 'Is your priority patient experience, operations, data, or a custom healthcare application?';
  }

  if (lead.sessionInterests?.includes('Mobile app development')) {
    return 'Is the app for customers, internal teams, or partners?';
  }

  if (lead.sessionInterests?.includes('AI solutions')) {
    return 'Which workflow or decision do you want AI to improve first?';
  }

  return 'Which area should I focus on first: technology, operations, media, industry solutions, or pricing?';
}

export function buildRecommendationPlan({ lead, chunks }) {
  const matchedRules = OFFERING_RULES.filter((rule) => ruleMatchesLead(rule, lead));
  const candidateRules = matchedRules.length > 0 ? matchedRules : OFFERING_RULES;

  const recommendations = [];
  for (const rule of candidateRules) {
    const matchedChunks = chunks.filter((chunk) => chunkMatchesRule(chunk, rule)).slice(0, 2);
    for (const [index, chunk] of matchedChunks.entries()) {
      recommendations.push(recommendationFromChunk(rule, chunk, index));
    }
  }

  const fallbackRecommendations = chunks.slice(0, 3).map((chunk, index) => ({
    id: `retrieved-${chunk.id || index}`,
    title: sourceLabel(chunk),
    source: sourceLabel(chunk),
    url: sourceToUrl(chunk.metadata?.source || ''),
    category: 'service',
    reason: 'Retrieved as relevant Justo context for this visitor question.',
    nextAction: 'Share more detail so Justo Genie can narrow this to the best-fit service.',
  }));

  const topRecommendations = uniqueById(recommendations).slice(0, 3);
  const finalTop = topRecommendations.length > 0 ? topRecommendations : fallbackRecommendations;
  const confidence = confidenceFor({ lead, recommendations: finalTop, chunks });
  const clarifyingQuestion = clarifyingQuestionFor(lead, confidence);

  return {
    confidence,
    recommendations: {
      services: finalTop.filter((item) => item.category === 'service'),
      products: finalTop.filter((item) => item.category === 'product'),
      industries: finalTop.filter((item) => item.category === 'industry'),
      caseStudies: finalTop.filter((item) => item.category === 'case_study'),
    },
    topRecommendations: finalTop,
    clarifyingQuestion,
    nextActions: finalTop.map((item) => item.nextAction).filter(Boolean).slice(0, 3),
  };
}
