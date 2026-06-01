import argparse
import json
import os


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Search Justo Genie ChromaDB knowledge.")
    parser.add_argument("query", help="Semantic search query.")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH, help="Persistent ChromaDB path.")
    parser.add_argument("--collection", default=DEFAULT_COLLECTION, help="ChromaDB collection.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="SentenceTransformer model name.")
    parser.add_argument("--cache-dir", default=".model_cache", help="Writable model cache path.")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results to return.")
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

    client = chromadb.PersistentClient(path=args.db_path)
    collection = client.get_collection(args.collection)
    model = SentenceTransformer(args.model, cache_folder=args.cache_dir)
    query_embedding = model.encode(
        [args.query],
        normalize_embeddings=True,
        show_progress_bar=False,
    ).tolist()[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=args.top_k,
        include=["documents", "metadatas", "distances"],
    )

    formatted_results = []
    for result_index, chunk_id in enumerate(results["ids"][0]):
        formatted_results.append(
            {
                "id": chunk_id,
                "distance": results["distances"][0][result_index],
                "metadata": results["metadatas"][0][result_index],
                "preview": results["documents"][0][result_index][:300],
            }
        )

    print(json.dumps(formatted_results, indent=2))


if __name__ == "__main__":
    main()
