# Justo Genie Backend Knowledge Base

This folder owns Level 1 of the Justo Genie roadmap: validated chunks, sentence-transformer embeddings, ChromaDB storage, and semantic-search smoke testing.

## Setup

```bash
python3 -m pip install -r requirements.txt
```

## Validate Chunks

```bash
python3 validate_chunks.py --chunks chunks.json
```

This verifies that every chunk has:

- `id`
- `source`
- `content`

## Build ChromaDB

```bash
python3 embed_chunks.py --chunks chunks.json --db-path chroma_db --collection justo_knowledge --cache-dir .model_cache --reset
```

By default, the embedding and search scripts use the local model cache to avoid slow network checks during demos. On a fresh machine, add `--allow-downloads` once to let `sentence-transformers/all-MiniLM-L6-v2` download into `.model_cache/`.

This uses:

- embedding model: `all-MiniLM-L6-v2`
- vector database: local persistent ChromaDB
- collection: `justo_knowledge`

Generated ChromaDB files are written to `knowledge/chroma_db/` and should not be committed.
Downloaded model files are written to `knowledge/.model_cache/` and should not be committed.

## Semantic Search Smoke Test

```bash
python3 search_chroma.py "What services does Justo offer for mobile app development?" --cache-dir .model_cache
```

Expected result: top chunks from relevant Justo website pages, including metadata like `source`, `page`, `chunk_index`, and `chunk_offset`.
