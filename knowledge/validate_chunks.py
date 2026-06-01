import argparse
import json
from pathlib import Path


REQUIRED_FIELDS = ("id", "source", "content")


def load_chunks(chunks_path: Path) -> list[dict]:
    with chunks_path.open("r", encoding="utf-8") as chunks_file:
        chunks = json.load(chunks_file)

    if not isinstance(chunks, list):
        raise ValueError(f"{chunks_path} must contain a JSON array")

    return chunks


def validate_chunks(chunks: list[dict]) -> dict:
    seen_ids = set()
    duplicate_ids = set()
    empty_content_ids = []
    missing_field_errors = []
    sources = set()

    for index, chunk in enumerate(chunks):
        if not isinstance(chunk, dict):
            missing_field_errors.append(f"chunk at index {index} is not an object")
            continue

        for field in REQUIRED_FIELDS:
            if field not in chunk:
                missing_field_errors.append(f"chunk at index {index} is missing '{field}'")

        chunk_id = chunk.get("id")
        content = chunk.get("content")
        source = chunk.get("source")

        if chunk_id in seen_ids:
            duplicate_ids.add(chunk_id)
        elif chunk_id:
            seen_ids.add(chunk_id)

        if not isinstance(content, str) or not content.strip():
            empty_content_ids.append(chunk_id or f"index_{index}")

        if isinstance(source, str) and source.strip():
            sources.add(source)

    return {
        "chunk_count": len(chunks),
        "source_count": len(sources),
        "duplicate_ids": sorted(duplicate_ids),
        "empty_content_ids": empty_content_ids,
        "missing_field_errors": missing_field_errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Justo Genie ingestion chunks.")
    parser.add_argument("--chunks", default="chunks.json", help="Path to chunks JSON file.")
    args = parser.parse_args()

    chunks_path = Path(args.chunks)
    chunks = load_chunks(chunks_path)
    result = validate_chunks(chunks)

    print(json.dumps(result, indent=2))

    has_errors = (
        result["duplicate_ids"]
        or result["empty_content_ids"]
        or result["missing_field_errors"]
    )
    if has_errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
