# genie-bot-be

Backend home for Justo Genie.

Start here:

- [setup.md](setup.md) for install, environment, knowledge-base preparation, and run commands.
- [apidoc.md](apidoc.md) for backend API contracts.

Level 1 knowledge-base assets live in `knowledge/`:

- `chunks.json`
- validation script
- embedding script
- semantic-search smoke test
- local ChromaDB output

Useful commands:

```bash
npm run knowledge:validate
npm run knowledge:embed
npm run knowledge:search -- "What services does Justo offer for mobile app development?" --top-k 3
```
