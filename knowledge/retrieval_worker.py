import argparse
import json
import os
import sys


def require_dependencies():
    try:
        import chromadb
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise SystemExit(
            "Missing Python dependency. Run: "
            "python3 -m pip install -r knowledge/requirements.txt"
        ) from error

    return chromadb, SentenceTransformer


def write_event(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def format_results(results: dict) -> list[dict]:
    formatted = []
    ids = results.get("ids", [[]])[0]
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for index, chunk_id in enumerate(ids):
        formatted.append(
            {
                "id": chunk_id,
                "content": documents[index],
                "metadata": metadatas[index] or {},
                "distance": distances[index],
            }
        )

    return formatted


def main() -> None:
    parser = argparse.ArgumentParser(description="Persistent Justo Genie retrieval worker.")
    parser.add_argument("--db-path", required=True)
    parser.add_argument("--collection", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--cache-dir", required=True)
    args = parser.parse_args()

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    chromadb, SentenceTransformer = require_dependencies()

    client = chromadb.PersistentClient(path=args.db_path)
    collection = client.get_collection(args.collection)
    model = SentenceTransformer(args.model, cache_folder=args.cache_dir)
    write_event({"type": "ready", "count": collection.count()})

    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            request_type = request.get("type")

            if request_type == "health":
                write_event(
                    {
                        "type": "response",
                        "id": request_id,
                        "ok": True,
                        "count": collection.count(),
                    }
                )
                continue

            if request_type != "query":
                raise ValueError(f"Unsupported request type: {request_type}")

            query = str(request.get("query", "")).strip()
            top_k = int(request.get("topK", 5))
            if not query:
                raise ValueError("query is required")

            embedding = model.encode(
                [query],
                normalize_embeddings=True,
                show_progress_bar=False,
            ).tolist()[0]

            results = collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
                include=["documents", "metadatas", "distances"],
            )

            write_event(
                {
                    "type": "response",
                    "id": request_id,
                    "ok": True,
                    "results": format_results(results),
                }
            )
        except Exception as error:
            write_event(
                {
                    "type": "response",
                    "id": request.get("id"),
                    "ok": False,
                    "error": str(error),
                }
            )


if __name__ == "__main__":
    main()
