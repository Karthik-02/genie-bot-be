import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  rootDir,
  host: process.env.HOST || '0.0.0.0',
  port: readNumber('PORT', 8080),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  llmProvider: process.env.LLM_PROVIDER || 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  sqliteDbPath: process.env.SQLITE_DB_PATH || 'data/justo-genie.sqlite',
  knowledge: {
    dbPath: process.env.KNOWLEDGE_DB_PATH || 'knowledge/chroma_db',
    collection: process.env.KNOWLEDGE_COLLECTION || 'justo_knowledge',
    model: process.env.KNOWLEDGE_MODEL || 'all-MiniLM-L6-v2',
    cacheDir: process.env.KNOWLEDGE_CACHE_DIR || 'knowledge/.model_cache',
    topK: readNumber('RETRIEVAL_TOP_K', 5),
  },
};

export function resolveFromRoot(relativePath) {
  return path.resolve(config.rootDir, relativePath);
}
