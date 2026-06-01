import argparse
import json
import os
import re
from pathlib import Path


DEFAULT_MODEL = "all-MiniLM-L6-v2"
DEFAULT_COLLECTION = "justo_knowledge"
DEFAULT_DB_PATH = "chroma_db"


def require_dependencies():
    try:
        import chromadb
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise SystemExit(
            "Missing Python dependency. Run: "
            "python3 -m pip install -r requirements.txt"
        ) from error

    return chromadb, SentenceTransformer


def load_chunks(chunks_path: Path) -> list[dict]:
    with chunks_path.open("r", encoding="utf-8") as chunks_file:
        chunks = json.load(chunks_file)

    if not isinstance(chunks, list):
        raise ValueError(f"{chunks_path} must contain a JSON array")

    return chunks


def parse_chunk_offset(chunk_id: str) -> int:
    match = re.search(r"_(\d+)$", chunk_id)
    return int(match.group(1)) if match else 0


def source_to_page(source: str) -> str:
    page = Path(source).stem
    return page.replace("-", " ").replace("_", " ").strip()


def normalize_chunk(chunk: dict, index: int) -> dict:
    chunk_id = str(chunk.get("id", f"chunk_{index}")).strip()
    content = str(chunk.get("content", "")).strip()
    source = str(chunk.get("source", "unknown")).strip()

    if not chunk_id:
        chunk_id = f"chunk_{index}"

    if not content:
        raise ValueError(f"Chunk '{chunk_id}' has empty content")

    return {
        "id": chunk_id,
        "content": content,
        "metadata": {
            "source": source,
            "page": source_to_page(source),
            "chunk_index": index,
            "chunk_offset": parse_chunk_offset(chunk_id),
        },
    }


def batched(items: list[dict], batch_size: int):
    for start in range(0, len(items), batch_size):
        yield items[start : start + batch_size]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Embed Justo Genie chunks and store them in ChromaDB."
    )
    parser.add_argument("--chunks", default="chunks.json", help="Path to chunks JSON file.")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH, help="Persistent ChromaDB path.")
    parser.add_argument("--collection", default=DEFAULT_COLLECTION, help="ChromaDB collection.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SentenceTransformer model name.")
    parser.add_argument("--cache-dir", default=".model_cache", help="Writable model cache path.")
    parser.add_argument("--batch-size", type=int, default=64, help="Embedding batch size.")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate collection.")
    parser.add_argument(
        "--allow-downloads",
        action="store_true",
        help="Allow model downloads instead of requiring the local cache.",
    )
    args = parser.parse_args()

    if not args.allow_downloads:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    chromadb, SentenceTransformer = require_dependencies()

    chunks = [normalize_chunk(chunk, index) for index, chunk in enumerate(load_chunks(Path(args.chunks)))]
    if not chunks:
        raise SystemExit("No chunks found to embed.")

    client = chromadb.PersistentClient(path=args.db_path)

    if args.reset:
        try:
            client.delete_collection(args.collection)
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=args.collection,
        metadata={"description": "Justo Global website knowledge for Justo Genie"},
    )

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    model = SentenceTransformer(args.model, cache_folder=str(cache_dir))

    total = len(chunks)
    for batch_number, batch in enumerate(batched(chunks, args.batch_size), start=1):
        documents = [item["content"] for item in batch]
        embeddings = model.encode(
            documents,
            batch_size=args.batch_size,
            normalize_embeddings=True,
            show_progress_bar=False,
        ).tolist()

        collection.upsert(
            ids=[item["id"] for item in batch],
            documents=documents,
            embeddings=embeddings,
            metadatas=[item["metadata"] for item in batch],
        )

        completed = min(batch_number * args.batch_size, total)
        print(f"Embedded {completed}/{total} chunks")

    print(
        json.dumps(
            {
                "collection": args.collection,
                "db_path": args.db_path,
                "model": args.model,
                "cache_dir": str(cache_dir),
                "chunk_count": total,
                "stored_count": collection.count(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
