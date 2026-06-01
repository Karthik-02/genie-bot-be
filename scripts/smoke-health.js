const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';

const response = await fetch(`${baseUrl}/health`);
const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || !body.ok || body.knowledge.count !== 468) {
  process.exit(1);
}
