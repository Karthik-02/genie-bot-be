import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { RetrievalService } from './services/retrieval.js';
import { LlmService } from './services/llm.js';
import { SqliteStore } from './db/sqlite.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  app.decorate('retrieval', new RetrievalService(app.log));
  app.decorate('llm', new LlmService());
  app.decorate('store', new SqliteStore(config.sqliteDbPath, app.log));

  app.register(cors, { origin: config.corsOrigin });
  app.register(healthRoutes);
  app.register(chatRoutes);

  app.addHook('onReady', async () => {
    app.retrieval.start();
  });

  app.addHook('onClose', async () => {
    if (app.retrieval.worker) {
      app.retrieval.worker.kill();
    }
    app.store.close();
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  app.listen({ host: config.host, port: config.port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
