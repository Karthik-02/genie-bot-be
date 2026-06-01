import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { config, resolveFromRoot } from '../config.js';

export class RetrievalService {
  constructor(logger) {
    this.logger = logger;
    this.worker = null;
    this.ready = false;
    this.readyCount = 0;
    this.pending = new Map();
    this.nextId = 1;
  }

  start() {
    if (this.worker) return;

    const args = [
      resolveFromRoot('knowledge/retrieval_worker.py'),
      '--db-path',
      resolveFromRoot(config.knowledge.dbPath),
      '--collection',
      config.knowledge.collection,
      '--model',
      config.knowledge.model,
      '--cache-dir',
      resolveFromRoot(config.knowledge.cacheDir),
    ];

    this.worker = spawn('python3', args, {
      cwd: config.rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = createInterface({ input: this.worker.stdout });
    lines.on('line', (line) => this.handleLine(line));

    this.worker.stderr.on('data', (chunk) => {
      this.logger.warn({ message: chunk.toString().trim() }, 'retrieval worker stderr');
    });

    this.worker.on('exit', (code) => {
      this.logger.error({ code }, 'retrieval worker exited');
      this.worker = null;
      this.ready = false;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('Retrieval worker exited'));
      }
      this.pending.clear();
    });
  }

  handleLine(line) {
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      this.logger.warn({ line }, 'invalid retrieval worker line');
      return;
    }

    if (payload.type === 'ready') {
      this.ready = true;
      this.readyCount = payload.count;
      this.logger.info({ count: payload.count }, 'retrieval worker ready');
      return;
    }

    const pending = this.pending.get(payload.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(payload.id);

    if (payload.ok) {
      pending.resolve(payload);
    } else {
      pending.reject(new Error(payload.error || 'Retrieval failed'));
    }
  }

  request(payload, timeoutMs = 15000) {
    this.start();
    if (!this.worker || !this.worker.stdin.writable) {
      return Promise.reject(new Error('Retrieval worker is not available'));
    }

    const id = String(this.nextId++);
    const request = { ...payload, id };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Retrieval timed out'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.worker.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  async health() {
    const response = await this.request({ type: 'health' }, 15000);
    return { ready: true, count: response.count };
  }

  async search(query, topK = config.knowledge.topK) {
    const response = await this.request({ type: 'query', query, topK });
    return response.results || [];
  }
}
