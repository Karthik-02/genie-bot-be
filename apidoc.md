# Justo Genie Backend API Documentation

Base URL for local development:

```txt
http://127.0.0.1:8080
```

All JSON APIs use `Content-Type: application/json`.

## GET /health

Purpose: Returns backend service status, configured LLM provider/model, and knowledge-base readiness.

Request body: none.

Example request:

```bash
curl http://127.0.0.1:8080/health
```

Response body:

```json
{
  "ok": true,
  "service": "justo-genie-be",
  "llm": {
    "provider": "gemini",
    "model": "gemini-2.5-flash-lite",
    "configured": true
  },
  "knowledge": {
    "ready": true,
    "count": 468
  }
}
```

Notes:

- `llm.configured` is `false` when `GEMINI_API_KEY` is not set.
- `knowledge.count` should be `468` for the current Level 1 knowledge base.

## POST /chat

Purpose: Runs a non-streaming RAG chat response using Justo knowledge, Gemini 2.5 Flash-Lite when configured, source references, and lightweight lead metadata.

Request body:

```json
{
  "conversationId": "string",
  "sessionId": "string",
  "message": "string",
  "metadata": {
    "visitor": {
      "name": "string",
      "email": "string",
      "company": "string"
    }
  }
}
```

Required fields:

- `message`

Optional fields:

- `conversationId`: generated when omitted.
- `sessionId`: generated when omitted.
- `metadata.visitor`: used for lead metadata and prompt context.

Example request:

```bash
curl -X POST http://127.0.0.1:8080/chat \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "demo-conversation",
    "sessionId": "demo-session",
    "message": "What services does Justo offer for mobile app development?",
    "metadata": {
      "visitor": {
        "email": "visitor@example.com",
        "company": "Acme"
      }
    }
  }'
```

Response body:

```json
{
  "conversationId": "demo-conversation",
  "sessionId": "demo-session",
  "answer": "string",
  "sources": [
    {
      "id": "chunk_4_2000",
      "source": "../web/views/technology-old.ejs",
      "title": "technology old"
    }
  ],
  "lead": {
    "email": "visitor@example.com",
    "intent": "technology service",
    "industry": "",
    "sessionInterests": ["Web development", "Mobile app development"],
    "accumulatedInterests": ["Web development", "Mobile app development"],
    "urgency": "unknown",
    "score": 90
  },
  "suggestedQuestions": [
    "Can Justo build both iOS and Android apps?",
    "What app features should I prioritize first?",
    "Can Justo help with UI/UX too?"
  ],
  "metadata": {
    "provider": "gemini",
    "model": "gemini-2.5-flash-lite",
    "llmConfigured": true
  }
}
```

Error response:

```json
{
  "error": "message is required"
}
```

## POST /stream

Purpose: Streams a RAG chat response over Server-Sent Events for fast perceived response, then sends final source and lead metadata.

Request body:

```json
{
  "conversationId": "string",
  "sessionId": "string",
  "message": "string",
  "metadata": {
    "visitor": {
      "name": "string",
      "email": "string",
      "company": "string"
    }
  }
}
```

Required fields:

- `message`

Example request:

```bash
curl -N -X POST http://127.0.0.1:8080/stream \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "demo-conversation",
    "sessionId": "demo-session",
    "message": "How can Justo help with an AI chatbot for my business?"
  }'
```

Response type:

```txt
text/event-stream
```

Streaming events:

```txt
event: status
data: {"message":"Analyzing requirement..."}

event: status
data: {"message":"Searching relevant solutions..."}

event: status
data: {"message":"Preparing recommendations..."}

event: token
data: {"text":"Justo "}

event: final
data: {"conversationId":"demo-conversation","sessionId":"demo-session","answer":"...","sources":[...],"lead":{...},"suggestedQuestions":[...],"metadata":{...}}
```

Error event:

```txt
event: error
data: {"message":"Justo Genie had trouble preparing this response. Please try again."}
```

Notes:

- Token events are emitted as soon as Gemini yields output.
- The `final` event is the stable metadata contract for the frontend.
- If `GEMINI_API_KEY` is not configured, the stream still returns a fallback token and final metadata so frontend development can continue.
