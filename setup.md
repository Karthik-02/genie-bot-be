# Justo Genie Backend Setup

This guide is for a fresh clone of `genie-bot-be`.

## Prerequisites

- Node.js 22 or newer
- npm
- Python 3.10 or newer
- pip
- Gemini API key for live LLM responses

## 1. Install Node Dependencies

```bash
cd genie-bot-be
npm install
```

## 2. Install Knowledge Dependencies

```bash
python3 -m pip install -r knowledge/requirements.txt
```

## 3. Configure Environment

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=8080
HOST=0.0.0.0
CORS_ORIGIN=*
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
KNOWLEDGE_DB_PATH=knowledge/chroma_db
KNOWLEDGE_COLLECTION=justo_knowledge
KNOWLEDGE_MODEL=all-MiniLM-L6-v2
KNOWLEDGE_CACHE_DIR=knowledge/.model_cache
RETRIEVAL_TOP_K=5
SQLITE_DB_PATH=data/justo-genie.sqlite
```

If `GEMINI_API_KEY` is empty, `/chat` and `/stream` still work with a fallback response, but live AI answers are disabled.

SQLite is used for local persistence. The database file is created automatically at `data/justo-genie.sqlite` when the backend starts.

## 4. Prepare The Knowledge Base

Validate chunks:

```bash
npm run knowledge:validate
```

Expected current result:

```txt
chunk_count: 468
source_count: 46
```

Build ChromaDB:

```bash
npm run knowledge:embed
```

Expected final result:

```txt
stored_count: 468
```

On a fresh machine without the embedding model cache, run the download variant once:

```bash
npm run knowledge:embed:download
```

Generated files in `knowledge/chroma_db/` and `knowledge/.model_cache/` are local runtime artifacts and should not be committed.

## 5. Smoke Test Semantic Search

```bash
npm run knowledge:search -- "What services does Justo offer for mobile app development?" --top-k 3
```

Expected result: top chunks from Justo technology, development, mobile app, or UI/UX content.

## 6. Start The Backend

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

The backend listens at:

```txt
http://127.0.0.1:8080
```

## 7. Verify APIs

Health:

```bash
npm run smoke:health
```

Chat:

```bash
npm run smoke:chat
```

This verifies RAG, Gemini response generation, lead metadata, and grounded Level 9 recommendations.
The response also includes Level 11 `agentBehavior` metadata for assist, qualification, or conversion behavior.

History:

```bash
npm run smoke:history
```

Explicit lead capture:

```bash
npm run smoke:lead
```

Manual streaming test:

```bash
curl -N -X POST http://127.0.0.1:8080/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"What services does Justo offer for mobile app development?"}'
```

## Troubleshooting

If Python reports missing dependencies:

```bash
python3 -m pip install -r knowledge/requirements.txt
```

If ChromaDB count is not `468`, rebuild:

```bash
npm run knowledge:embed
```

If Gemini responses are fallback text, check:

```bash
grep GEMINI_API_KEY .env
```

If port `8080` is already in use:

```bash
PORT=8081 npm start
```
