const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';

const response = await fetch(`${baseUrl}/lead`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    conversationId: 'smoke-conversation',
    sessionId: 'smoke-session',
    name: 'Demo Visitor',
    email: 'demo@example.com',
    company: 'Demo Co',
    interests: ['Mobile app development', 'AI solutions'],
    score: 80,
  }),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || !body.ok || !body.lead?.accumulatedInterests?.length) {
  process.exit(1);
}
