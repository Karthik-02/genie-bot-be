export function buildAgentBehavior({ lead, recommendationPlan }) {
  const score = Number(lead.score || 0);
  const confidence = Number(recommendationPlan?.confidence || 0);
  const hasEmail = Boolean(lead.email);
  const highUrgency = lead.urgency === 'high';

  if ((score >= 75 && hasEmail) || (score >= 65 && highUrgency)) {
    return {
      tier: 'high',
      mode: 'conversion',
      nextBestAction: 'Invite the visitor to share a short requirement summary for sales follow-up.',
      proactivePrompts: [
        'Can you share your timeline and must-have requirements?',
        'Would you like Justo to suggest an MVP scope?',
        'Should I summarize this for the Justo team?',
      ],
      handoffReady: true,
    };
  }

  if (score >= 45 || confidence >= 0.65) {
    return {
      tier: 'medium',
      mode: 'qualification',
      nextBestAction: 'Ask one qualifying follow-up that narrows scope, urgency, or service fit.',
      proactivePrompts: [
        'What outcome matters most for this project?',
        'What timeline are you working with?',
        'Which team or workflow will use this solution?',
      ],
      handoffReady: false,
    };
  }

  return {
    tier: 'low',
    mode: 'assist',
    nextBestAction: 'Answer normally and guide the visitor toward a clearer Justo service area.',
    proactivePrompts: [
      'Which Justo service should I focus on?',
      'Are you exploring technology, media, or industry solutions?',
      'Do you want a quick recommendation?',
    ],
    handoffReady: false,
  };
}
