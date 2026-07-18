import argparse
import asyncio
import hashlib
import importlib
from importlib import metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

LOCAL_DEPENDENCIES = Path(__file__).resolve().parents[1] / ".tts-deps"
REQUIREMENTS = Path(__file__).with_name("speech-requirements.txt")


def parse_args():
    parser = argparse.ArgumentParser(description="Generate same-origin MP3 files for built-in glossary terms.")
    parser.add_argument("--node", default=shutil.which("node"), help="Path to the Node.js executable")
    parser.add_argument("--output", default="public/audio", help="Audio output directory")
    parser.add_argument("--manifest", default="src/speech-assets.json", help="Generated manifest path")
    parser.add_argument("--voice", default="en-US-AriaNeural", help="Microsoft Edge TTS voice")
    parser.add_argument("--jobs", type=int, default=5, help="Maximum concurrent downloads")
    parser.add_argument("--check-dependencies", action="store_true", help="Check the persistent TTS dependency cache and exit")
    parser.add_argument("--plan", action="store_true", help="Report reusable and missing audio without downloading or writing")
    return parser.parse_args()


def required_edge_tts_version():
    for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        requirement = line.strip()
        if requirement.lower().startswith("edge-tts=="):
            return requirement.split("==", 1)[1]
    raise RuntimeError(f"Pinned edge-tts version is missing from {REQUIREMENTS}")


def installed_edge_tts_version():
    if not LOCAL_DEPENDENCIES.exists():
        return None
    for distribution in metadata.distributions(path=[str(LOCAL_DEPENDENCIES)]):
        name = distribution.metadata.get("Name", "").lower().replace("_", "-")
        if name == "edge-tts":
            return distribution.version
    return None


def dependency_status():
    expected = required_edge_tts_version()
    installed = installed_edge_tts_version()
    package = LOCAL_DEPENDENCIES / "edge_tts" / "__init__.py"
    return {
        "ready": package.is_file() and installed == expected,
        "path": str(LOCAL_DEPENDENCIES),
        "expectedVersion": expected,
        "installedVersion": installed,
    }


def load_edge_tts(status):
    if not status["ready"]:
        raise RuntimeError(
            "Persistent TTS dependencies are missing or outdated. Install the pinned "
            f"requirements once into {LOCAL_DEPENDENCIES}; do not use a temporary directory."
        )
    sys.path.insert(0, str(LOCAL_DEPENDENCIES))
    return importlib.import_module("edge_tts")


def load_texts(node):
    if not node:
        raise RuntimeError("Node.js was not found; pass --node with its full path")
    result = subprocess.run(
        [node, "scripts/export_speech_texts.mjs"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(result.stdout)


def audio_filename(text):
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:20]
    return f"{digest}.mp3"


def audio_plan(texts, output_dir):
    reusable = sum(
        1
        for text in texts
        if (output_dir / audio_filename(text)).exists()
        and (output_dir / audio_filename(text)).stat().st_size > 1024
    )
    return {
        "total": len(texts),
        "reusable": reusable,
        "missing": len(texts) - reusable,
        "output": str(output_dir),
    }


async def generate_one(text, output_dir, voice, semaphore, edge_tts):
    filename = audio_filename(text)
    destination = output_dir / filename
    if destination.exists() and destination.stat().st_size > 1024:
        return text, filename

    temporary = destination.with_suffix(".tmp")
    async with semaphore:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, voice, rate="-10%").save(str(temporary))
                if temporary.stat().st_size <= 1024:
                    raise RuntimeError("generated audio is empty")
                os.replace(temporary, destination)
                return text, filename
            except Exception:
                temporary.unlink(missing_ok=True)
                if attempt == 2:
                    raise
                await asyncio.sleep(1 + attempt)


async def generate_all(args, texts, edge_tts):
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(max(1, args.jobs))
    tasks = [generate_one(text, output_dir, args.voice, semaphore, edge_tts) for text in texts]
    results = await asyncio.gather(*tasks)
    return dict(results)


def main():
    args = parse_args()
    status = dependency_status()
    if args.check_dependencies:
        print(json.dumps(status, ensure_ascii=False))
        raise SystemExit(0 if status["ready"] else 2)
    texts = load_texts(args.node)
    plan = audio_plan(texts, Path(args.output))
    if args.plan:
        print(json.dumps(plan, ensure_ascii=False))
        return
    edge_tts = load_edge_tts(status) if plan["missing"] else None
    manifest = asyncio.run(generate_all(args, texts, edge_tts))
    manifest_path = Path(args.manifest)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    total_bytes = sum((Path(args.output) / filename).stat().st_size for filename in manifest.values())
    print(f"Generated {len(manifest)} audio files ({total_bytes / 1024 / 1024:.1f} MiB)")


if __name__ == "__main__":
    main()
