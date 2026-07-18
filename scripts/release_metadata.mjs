import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function currentCommit(root) {
  if (process.env.RELEASE_COMMIT) return process.env.RELEASE_COMMIT;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export async function collectReleaseMetadata(root = process.cwd()) {
  const server = await createServer({
    appType: 'custom',
    configLoader: 'native',
    logLevel: 'silent',
    root,
    server: { middlewareMode: true },
  });

  try {
    const [{ BUILTIN_TERMS }, importedSource, speechSource] = await Promise.all([
      server.ssrLoadModule('/src/terms.js'),
      readFile(path.join(root, 'src', 'imported-terms.json'), 'utf8'),
      readFile(path.join(root, 'src', 'speech-assets.json'), 'utf8'),
    ]);
    const importedTerms = JSON.parse(importedSource);
    const speechAssets = JSON.parse(speechSource);
    return {
      schemaVersion: 1,
      commit: currentCommit(root),
      termCount: BUILTIN_TERMS.length,
      importedTermCount: importedTerms.length,
      categoryCount: new Set(BUILTIN_TERMS.map(term => term.category)).size,
      speechTextCount: Object.keys(speechAssets).length,
      audioFileCount: new Set(Object.values(speechAssets)).size,
      termDataHash: hash(BUILTIN_TERMS),
      speechManifestHash: hash(speechAssets),
    };
  } finally {
    await server.close();
  }
}

export async function writeReleaseMetadata(output, root = process.cwd()) {
  const metadata = await collectReleaseMetadata(root);
  const destination = path.resolve(root, output);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
  const metadata = output
    ? await writeReleaseMetadata(output)
    : await collectReleaseMetadata();
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}
