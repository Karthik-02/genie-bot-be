export async function healthRoutes(app) {
  app.get('/health', async () => {
    let knowledge = { ready: false, count: 0 };
    try {
      knowledge = await app.retrieval.health();
    } catch (error) {
      app.log.warn({ error }, 'knowledge health failed');
    }

    return {
      ok: true,
      service: 'justo-genie-be',
      llm: {
        provider: app.llm.provider,
        model: app.llm.model,
        configured: app.llm.configured,
      },
      knowledge,
    };
  });
}
