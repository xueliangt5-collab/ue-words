import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

LOCAL_DEPENDENCIES = Path(__file__).resolve().parents[1] / ".tts-deps"
if LOCAL_DEPENDENCIES.exists():
    sys.path.insert(0, str(LOCAL_DEPENDENCIES))
import edge_tts


def parse_args():
    parser = argparse.ArgumentParser(description="Generate same-origin MP3 files for built-in glossary terms.")
    parser.add_argument("--node", default=shutil.which("node"), help="Path to the Node.js executable")
    parser.add_argument("--output", default="public/audio", help="Audio output directory")
    parser.add_argument("--manifest", default="src/speech-assets.json", help="Generated manifest path")
    parser.add_argument("--voice", default="en-US-AriaNeural", help="Microsoft Edge TTS voice")
    parser.add_argument("--jobs", type=int, default=5, help="Maximum concurrent downloads")
    return parser.parse_args()


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


async def generate_one(text, output_dir, voice, semaphore):
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


async def generate_all(args, texts):
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(max(1, args.jobs))
    tasks = [generate_one(text, output_dir, args.voice, semaphore) for text in texts]
    results = await asyncio.gather(*tasks)
    return dict(results)


def main():
    args = parse_args()
    texts = load_texts(args.node)
    manifest = asyncio.run(generate_all(args, texts))
    manifest_path = Path(args.manifest)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    total_bytes = sum((Path(args.output) / filename).stat().st_size for filename in manifest.values())
    print(f"Generated {len(manifest)} audio files ({total_bytes / 1024 / 1024:.1f} MiB)")


if __name__ == "__main__":
    main()
