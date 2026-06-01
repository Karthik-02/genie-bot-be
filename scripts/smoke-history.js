const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';
const conversationId = process.env.CONVERSATION_ID || 'smoke-conversation';

const response = await fetch(`${baseUrl}/history/${conversationId}`);
const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || !Array.isArray(body.messages) || body.messages.length === 0) {
  process.exit(1);
}
