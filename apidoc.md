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
  },
  "persistence": {
    "provider": "sqlite",
    "ready": true
  }
}
```

Notes:

- `llm.configured` is `false` when `GEMINI_API_KEY` is not set.
- `knowledge.count` should be `468` for the current Level 1 knowledge base.

## POST /chat

Purpose: Runs a non-streaming RAG chat response using Justo knowledge, Gemini 2.5 Flash-Lite when configured, source references, short conversation memory, SQLite persistence, and lead metadata.

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
  "recommendations": {
    "services": [
      {
        "id": "mobile-app-development-chunk_4_2000",
        "title": "Web and Mobile App Development",
        "source": "technology old",
        "url": "https://www.justoglobal.com/technology-old",
        "category": "service",
        "reason": "Grounded in technology old from the Justo knowledge base.",
        "nextAction": "Share the app type, target users, and must-have features so Justo can recommend an MVP scope."
      }
    ],
    "products": [],
    "industries": [],
    "caseStudies": []
  },
  "topRecommendations": [
    {
      "id": "mobile-app-development-chunk_4_2000",
      "title": "Web and Mobile App Development",
      "source": "technology old",
      "url": "https://www.justoglobal.com/technology-old",
      "category": "service",
      "reason": "Grounded in technology old from the Justo knowledge base.",
      "nextAction": "Share the app type, target users, and must-have features so Justo can recommend an MVP scope."
    }
  ],
  "clarifyingQuestion": null,
  "nextActions": [
    "Share the app type, target users, and must-have features so Justo can recommend an MVP scope."
  ],
  "agentBehavior": {
    "tier": "high",
    "mode": "conversion",
    "nextBestAction": "Invite the visitor to share a short requirement summary for sales follow-up.",
    "proactivePrompts": [
      "Can you share your timeline and must-have requirements?",
      "Would you like Justo to suggest an MVP scope?",
      "Should I summarize this for the Justo team?"
    ],
    "handoffReady": true
  },
  "suggestedQuestions": [
    "Can Justo build both iOS and Android apps?",
    "What app features should I prioritize first?",
    "Can Justo help with UI/UX too?"
  ],
  "metadata": {
    "provider": "gemini",
    "model": "gemini-2.5-flash-lite",
    "llmConfigured": true,
    "recommendationConfidence": 0.95
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
data: {"conversationId":"demo-conversation","sessionId":"demo-session","answer":"...","sources":[...],"lead":{...},"recommendations":{...},"topRecommendations":[...],"clarifyingQuestion":null,"nextActions":[...],"agentBehavior":{...},"suggestedQuestions":[...],"metadata":{...}}
```

Error event:

```txt
event: error
data: {"message":"Justo Genie had trouble preparing this response. Please try again."}
```

Notes:

- Token events are emitted as soon as Gemini yields output.
- The `final` event is the stable metadata contract for the frontend.
- `topRecommendations` and `recommendations` are grounded in retrieved Justo chunks and mapped from detected intent/interests.
- `clarifyingQuestion` is set when the recommendation confidence is low or the visitor requirement is broad.
- `agentBehavior` drives Level 11 behavior: low-score assist, medium-score qualification, and high-score conversion/handoff prompts.
- If `GEMINI_API_KEY` is not configured, the stream still returns a fallback token and final metadata so frontend development can continue.

## GET /history/:conversationId

Purpose: Returns persisted conversation history for the current widget conversation.

Path parameters:

- `conversationId`: conversation identifier originally sent to `/chat` or `/stream`.

Example request:

```bash
curl http://127.0.0.1:8080/history/demo-conversation
```

Response body:

```json
{
  "conversationId": "demo-conversation",
  "sessionId": "demo-session",
  "summary": "Visitor asked about mobile app development...",
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "What services does Justo offer for mobile app development?",
      "metadata": {
        "visitor": {
          "email": "visitor@example.com"
        }
      },
      "created_at": "2026-06-01T12:00:00.000Z"
    }
  ]
}
```

Error responses:

```json
{
  "error": "conversation not found"
}
```

## POST /lead

Purpose: Explicitly captures or updates a visitor lead when the frontend collects contact details. This also merges interests into the existing lead profile for the same email.

Request body:

```json
{
  "conversationId": "string",
  "sessionId": "string",
  "name": "string",
  "email": "string",
  "company": "string",
  "phone": "string",
  "interests": ["Mobile app development", "AI solutions"],
  "score": 80
}
```

Required fields:

- `email`

Example request:

```bash
curl -X POST http://127.0.0.1:8080/lead \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "demo-conversation",
    "sessionId": "demo-session",
    "name": "Demo Visitor",
    "email": "visitor@example.com",
    "company": "Acme",
    "interests": ["Mobile app development"],
    "score": 80
  }'
```

Response body:

```json
{
  "ok": true,
  "conversationId": "demo-conversation",
  "sessionId": "demo-session",
  "lead": {
    "email": "visitor@example.com",
    "intent": "explicit lead capture",
    "sessionInterests": ["Mobile app development"],
    "accumulatedInterests": ["Mobile app development"],
    "urgency": "unknown",
    "score": 80
  }
}
```
