#!/usr/bin/env python3
"""Validate and convert UE Words term-submission JSON and CSV files."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any


FORMAT = "ue-words-term-submission"
VERSION = 1
VISIBILITIES = {"public-review", "private-review"}
META_FIELDS = ["submissionFormat", "submissionVersion", "contributor", "visibility"]
TERM_FIELDS = [
    "term", "abbreviation", "fullForm", "spokenForm", "ipa", "zh", "category",
    "threadCategory", "definition", "example", "exampleZh", "tags", "aliases",
    "wordParts", "relatedTerms", "contexts", "usageNotes", "source",
]
LIST_FIELDS = {"aliases", "wordParts", "relatedTerms", "contexts", "usageNotes"}
REQUIRED_FIELDS = ("term", "zh", "definition")


class SubmissionError(ValueError):
    pass


def clean(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    return value


def default_metadata() -> dict[str, Any]:
    return {"format": FORMAT, "version": VERSION, "contributor": "", "visibility": "public-review"}


def normalize_record(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise SubmissionError("Each term must be a JSON object")
    return {
        field: clean(raw.get(field, [] if field in LIST_FIELDS else ""))
        for field in TERM_FIELDS
    }


def load_json(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    parsed = json.loads(path.read_text(encoding="utf-8-sig"))
    metadata = default_metadata()
    if isinstance(parsed, list):
        raw_terms = parsed
    elif isinstance(parsed, dict):
        raw_terms = parsed.get("terms")
        metadata.update({
            "format": parsed.get("format", FORMAT),
            "version": parsed.get("version", VERSION),
            "contributor": clean(parsed.get("contributor", "")),
            "visibility": clean(parsed.get("visibility", "public-review")),
        })
    else:
        raise SubmissionError("JSON must be an array or an object containing terms")
    if not isinstance(raw_terms, list):
        raise SubmissionError("JSON must contain a terms array")
    return metadata, [normalize_record(item) for item in raw_terms]


def parse_json_cell(value: str, field: str, row_number: int) -> list[Any]:
    if not value.strip():
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise SubmissionError(
            f"CSV row {row_number} field {field} must contain a JSON array: {exc.msg}"
        ) from exc
    if not isinstance(parsed, list):
        raise SubmissionError(f"CSV row {row_number} field {field} must contain a JSON array")
    return parsed


def load_csv(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    metadata = default_metadata()
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise SubmissionError("CSV has no header")
        missing = [field for field in META_FIELDS + TERM_FIELDS if field not in reader.fieldnames]
        if missing:
            raise SubmissionError(f"CSV is missing columns: {', '.join(missing)}")
        first_meta: dict[str, str] | None = None
        for row_number, row in enumerate(reader, start=2):
            row_meta = {field: (row.get(field) or "").strip() for field in META_FIELDS}
            if first_meta is None:
                first_meta = row_meta
                metadata.update({
                    "format": row_meta["submissionFormat"] or FORMAT,
                    "version": int(row_meta["submissionVersion"] or VERSION),
                    "contributor": row_meta["contributor"],
                    "visibility": row_meta["visibility"] or "public-review",
                })
            elif row_meta != first_meta:
                raise SubmissionError(f"CSV row {row_number} has inconsistent submission metadata")
            raw: dict[str, Any] = {field: row.get(field, "") for field in TERM_FIELDS}
            for field in LIST_FIELDS:
                raw[field] = parse_json_cell(str(raw[field]), field, row_number)
            records.append(normalize_record(raw))
    return metadata, records


def load_submission(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if path.suffix.lower() == ".json":
        return load_json(path)
    if path.suffix.lower() == ".csv":
        return load_csv(path)
    raise SubmissionError("Input must use a .json or .csv extension")


def identity(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def validate_submission(
    metadata: dict[str, Any], records: list[dict[str, Any]]
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if metadata.get("format") != FORMAT:
        errors.append(f"format must be {FORMAT}")
    if metadata.get("version") != VERSION:
        errors.append(f"version must be {VERSION}")
    if metadata.get("visibility") not in VISIBILITIES:
        errors.append("visibility must be public-review or private-review")
    if not records:
        warnings.append("submission contains no terms")

    seen: dict[tuple[str, str, str], int] = {}
    for index, record in enumerate(records, start=1):
        label = f"term {index}"
        for field in REQUIRED_FIELDS:
            if not isinstance(record.get(field), str) or not record[field].strip():
                errors.append(f"{label}: {field} is required")
        for field in TERM_FIELDS:
            value = record.get(field)
            expected = list if field in LIST_FIELDS else str
            if not isinstance(value, expected):
                errors.append(f"{label}: {field} must be {'an array' if expected is list else 'a string'}")

        if isinstance(record.get("term"), str) and record["term"].strip():
            key = (
                identity(record["term"]),
                identity(str(record.get("category", ""))),
                identity(str(record.get("threadCategory", ""))),
            )
            if key in seen:
                errors.append(f"{label}: duplicates term {seen[key]} in the same category and thread")
            else:
                seen[key] = index

        if bool(record.get("abbreviation")) != bool(record.get("fullForm")):
            warnings.append(f"{label}: abbreviation and fullForm should normally be provided together")
        if bool(record.get("example")) != bool(record.get("exampleZh")):
            warnings.append(f"{label}: example and exampleZh should be provided together")
        for field in ("category", "tags", "source"):
            if not record.get(field):
                warnings.append(f"{label}: {field} is empty")

        for item_number, item in enumerate(record.get("wordParts", []), start=1):
            if not isinstance(item, dict) or not item.get("word") or not item.get("zh"):
                errors.append(f"{label}: wordParts item {item_number} requires word and zh")
        for item_number, item in enumerate(record.get("relatedTerms", []), start=1):
            if not isinstance(item, dict) or not item.get("term"):
                errors.append(f"{label}: relatedTerms item {item_number} requires term")
        for item_number, item in enumerate(record.get("contexts", []), start=1):
            if not isinstance(item, dict) or not item.get("phrase"):
                errors.append(f"{label}: contexts item {item_number} requires phrase")
        for field in ("aliases", "usageNotes"):
            for item_number, item in enumerate(record.get(field, []), start=1):
                if not isinstance(item, str) or not item.strip():
                    errors.append(f"{label}: {field} item {item_number} must be a non-empty string")
    return errors, warnings


def write_json(path: Path, metadata: dict[str, Any], records: list[dict[str, Any]]) -> None:
    payload = {
        "format": FORMAT,
        "version": VERSION,
        "contributor": metadata.get("contributor", ""),
        "visibility": metadata.get("visibility", "public-review"),
        "terms": records,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv(path: Path, metadata: dict[str, Any], records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=META_FIELDS + TERM_FIELDS)
        writer.writeheader()
        for record in records:
            row: dict[str, Any] = {
                "submissionFormat": FORMAT,
                "submissionVersion": VERSION,
                "contributor": metadata.get("contributor", ""),
                "visibility": metadata.get("visibility", "public-review"),
            }
            for field in TERM_FIELDS:
                value = record.get(field, [] if field in LIST_FIELDS else "")
                row[field] = json.dumps(value, ensure_ascii=False, separators=(",", ":")) if field in LIST_FIELDS else value
            writer.writerow(row)


def write_submission(path: Path, metadata: dict[str, Any], records: list[dict[str, Any]]) -> None:
    if path.suffix.lower() == ".json":
        write_json(path, metadata, records)
    elif path.suffix.lower() == ".csv":
        write_csv(path, metadata, records)
    else:
        raise SubmissionError("Output must use a .json or .csv extension")


def sample_record() -> dict[str, Any]:
    return normalize_record({
        "term": "RHI",
        "abbreviation": "RHI",
        "fullForm": "Render Hardware Interface",
        "spokenForm": "R H I",
        "zh": "渲染硬件接口",
        "category": "图形与渲染",
        "definition": "Unreal Engine 用于抽象底层图形 API 的接口层。",
        "example": "The RHI translates commands for the active graphics API.",
        "exampleZh": "RHI 会为当前图形 API 转换命令。",
        "tags": "RHI Render Hardware Interface 渲染硬件接口 graphics API",
        "wordParts": [
            {"word": "Render", "zh": "渲染"},
            {"word": "Hardware", "zh": "硬件"},
            {"word": "Interface", "zh": "接口"},
        ],
        "source": "Unreal Engine documentation",
    })


def result(path: Path, metadata: dict[str, Any], records: list[dict[str, Any]], errors: list[str], warnings: list[str]) -> None:
    print(json.dumps({
        "path": str(path.resolve()),
        "format": metadata.get("format"),
        "version": metadata.get("version"),
        "visibility": metadata.get("visibility"),
        "terms": len(records),
        "errors": errors,
        "warnings": warnings,
    }, ensure_ascii=False, indent=2))


def command_validate(args: argparse.Namespace) -> int:
    path = Path(args.input)
    metadata, records = load_submission(path)
    errors, warnings = validate_submission(metadata, records)
    result(path, metadata, records, errors, warnings)
    return 1 if errors else 0


def command_convert(args: argparse.Namespace) -> int:
    source, output = Path(args.input), Path(args.output)
    metadata, records = load_submission(source)
    if args.contributor is not None:
        metadata["contributor"] = args.contributor.strip()
    if args.visibility is not None:
        metadata["visibility"] = args.visibility
    errors, warnings = validate_submission(metadata, records)
    if errors:
        result(source, metadata, records, errors, warnings)
        return 1
    write_submission(output, metadata, records)
    result(output, metadata, records, [], warnings)
    return 0


def command_template(args: argparse.Namespace) -> int:
    output = Path(args.output)
    if output.suffix.lower() != f".{args.format}":
        raise SubmissionError(f"Template output must end with .{args.format}")
    metadata = default_metadata()
    metadata.update({"contributor": args.contributor.strip(), "visibility": args.visibility})
    records = [sample_record()] if args.sample else []
    write_submission(output, metadata, records)
    errors, warnings = validate_submission(metadata, records)
    result(output, metadata, records, errors, warnings)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("--input", required=True)
    validate.set_defaults(handler=command_validate)
    convert = commands.add_parser("convert")
    convert.add_argument("--input", required=True)
    convert.add_argument("--output", required=True)
    convert.add_argument("--contributor")
    convert.add_argument("--visibility", choices=sorted(VISIBILITIES))
    convert.set_defaults(handler=command_convert)
    template = commands.add_parser("template")
    template.add_argument("--format", choices=("json", "csv"), required=True)
    template.add_argument("--output", required=True)
    template.add_argument("--contributor", default="")
    template.add_argument("--visibility", choices=sorted(VISIBILITIES), default="public-review")
    template.add_argument("--sample", action="store_true")
    template.set_defaults(handler=command_template)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.handler(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
