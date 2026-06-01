const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';

const response = await fetch(`${baseUrl}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    conversationId: 'smoke-conversation',
    sessionId: 'smoke-session',
    message: 'What services does Justo offer for mobile app development?',
    metadata: {
      visitor: {
        email: 'demo@example.com',
        company: 'Demo Co',
      },
    },
  }),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (
  !response.ok ||
  !body.sources?.length ||
  body.lead?.intent !== 'technology service' ||
  !body.topRecommendations?.length ||
  typeof body.metadata?.recommendationConfidence !== 'number'
) {
  process.exit(1);
}
