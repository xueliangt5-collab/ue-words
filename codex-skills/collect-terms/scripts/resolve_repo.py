#!/usr/bin/env python3
"""Find a UE Words repository without depending on a specific user's folders."""

import argparse
import os
from pathlib import Path


def is_repo(path: Path) -> bool:
    return (path / ".git").exists() and (path / "src" / "imported-terms.json").is_file()


def candidates(start: Path):
    current = start.resolve()
    yield current
    yield from current.parents


def main():
    parser = argparse.ArgumentParser(description="Resolve the UE Words repository path")
    parser.add_argument("--repo", help="Explicit repository path")
    parser.add_argument("--start", default=os.getcwd(), help="Directory whose parents should be searched")
    args = parser.parse_args()

    explicit = args.repo or os.environ.get("UE_WORDS_REPO")
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if not is_repo(path):
            raise SystemExit(f"Not a UE Words repository: {path}")
        print(path)
        return

    for path in candidates(Path(args.start)):
        if is_repo(path):
            print(path)
            return

    raise SystemExit(
        "UE Words repository not found. Open the cloned repository as the current project "
        "or set UE_WORDS_REPO to its path."
    )


if __name__ == "__main__":
    main()
