#!/usr/bin/env node

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import net from 'node:net';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function log(level, msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${msg}`);
}

function logError(msg) {
  console.error(`\n❌ ERROR: ${msg}\n`);
}

function logSuccess(msg) {
  console.log(`\n✅ ${msg}\n`);
}

async function testPythonAvailable() {
  return new Promise((resolve) => {
    const proc = spawn('python3', ['--version']);
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        log('INFO', `Python available: ${output.trim()}`);
        resolve(true);
      } else {
        logError('python3 not found. Install Python 3.10+ and try again.');
        resolve(false);
      }
    });
  });
}

async function testRetrievalWorker() {
  return new Promise((resolve) => {
    log('INFO', 'Starting Python retrieval worker...');

    const workerPath = path.join(rootDir, 'knowledge/retrieval_worker.py');
    const dbPath = path.join(rootDir, process.env.KNOWLEDGE_DB_PATH || 'knowledge/chroma_db');
    const collection = process.env.KNOWLEDGE_COLLECTION || 'justo_knowledge';
    const model = process.env.KNOWLEDGE_MODEL || 'all-MiniLM-L6-v2';
    const cacheDir = path.join(rootDir, process.env.KNOWLEDGE_CACHE_DIR || 'knowledge/.model_cache');

    const proc = spawn('python3', [
      workerPath,
      '--db-path', dbPath,
      '--collection', collection,
      '--model', model,
      '--cache-dir', cacheDir,
    ], {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let ready = false;
    let chunkCount = 0;
    const startTime = Date.now();

    const lines = createInterface({ input: proc.stdout });
    lines.on('line', (line) => {
      try {
        const payload = JSON.parse(line);
        if (payload.type === 'ready') {
          ready = true;
          chunkCount = payload.count;
          log('INFO', `Retrieval worker ready: ${chunkCount} chunks loaded`);
        }
      } catch (err) {
        log('WARN', `Worker output: ${line}`);
      }
    });

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) log('WARN', `Worker stderr: ${msg}`);
    });

    const timeout = setTimeout(() => {
      if (!ready) {
        proc.kill();
        logError(
          `Retrieval worker did not start within 30s. Possible issues:\n` +
          `  - Python dependencies missing: run 'pip3 install -r knowledge/requirements.txt'\n` +
          `  - ChromaDB corrupt: delete knowledge/chroma_db/ and run 'npm run knowledge:embed'\n` +
          `  - Insufficient disk space for model cache`
        );
        resolve(false);
      }
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0 && !ready) {
        logError(`Retrieval worker exited with code ${code}`);
        resolve(false);
      }
    });

    // Give it 3 seconds to be ready
    setTimeout(() => {
      if (ready) {
        logSuccess(`Retrieval worker running (${chunkCount} chunks)`);
        proc.kill();
        resolve(true);
      }
    }, 3000);
  });
}

async function testGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    log('WARN', 'GEMINI_API_KEY not set. Chat will return fallback responses.');
    return null;
  }

  if (key.length < 20) {
    logError('GEMINI_API_KEY looks invalid (too short). Check .env file.');
    return false;
  }

  log('INFO', `GEMINI_API_KEY set: ${key.slice(0, 8)}...`);
  return true;
}

async function testBackendPort() {
  const port = process.env.PORT || 8080;
  log('INFO', `Checking if port ${port} is available...`);

  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logSuccess(`Port ${port} is in use (backend may already be running)`);
        resolve(true);
      } else {
        logError(`Port error: ${err.message}`);
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      log('INFO', `Port ${port} is available`);
      resolve(true);
    });

    server.listen(port);
  });
}

async function runDiagnostics() {
  console.log('\n========================================');
  console.log('  Justo Genie Backend Diagnostics');
  console.log('========================================\n');

  log('INFO', 'Environment:');
  log('INFO', `  PORT: ${process.env.PORT || 8080}`);
  log('INFO', `  LLM_PROVIDER: ${process.env.LLM_PROVIDER || 'gemini'}`);
  log('INFO', `  KNOWLEDGE_DB_PATH: ${process.env.KNOWLEDGE_DB_PATH || 'knowledge/chroma_db'}`);
  log('INFO', `  KNOWLEDGE_COLLECTION: ${process.env.KNOWLEDGE_COLLECTION || 'justo_knowledge'}`);
  console.log();

  let allGood = true;

  // Test 1: Python
  log('INFO', 'Test 1/5: Checking Python...');
  const pythonOk = await testPythonAvailable();
  if (!pythonOk) allGood = false;

  // Test 2: Retrieval Worker
  if (pythonOk) {
    log('INFO', 'Test 2/5: Checking retrieval worker...');
    const workerOk = await testRetrievalWorker();
    if (!workerOk) allGood = false;
  }

  // Test 3: Gemini API
  log('INFO', 'Test 3/5: Checking Gemini API key...');
  const geminiOk = await testGeminiApiKey();
  if (geminiOk === false) allGood = false;

  // Test 4: Port availability
  log('INFO', 'Test 4/5: Checking port availability...');
  const portOk = await testBackendPort();
  if (!portOk) allGood = false;

  console.log('\n========================================');
  if (allGood) {
    logSuccess('All diagnostic checks passed!');
    console.log('Next: Start the backend with:\n  npm start\n');
  } else {
    logError('Some checks failed. Fix the issues above and try again.');
  }
  console.log('========================================\n');

  process.exit(allGood ? 0 : 1);
}

runDiagnostics().catch((err) => {
  logError(`Diagnostic failed: ${err.message}`);
  process.exit(1);
});
