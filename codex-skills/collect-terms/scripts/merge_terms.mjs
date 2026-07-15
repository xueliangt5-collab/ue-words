#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    if (key === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function slugify(value) {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `imported-${slug || 'term'}`;
}

function text(value) {
  return String(value ?? '').trim();
}

function textList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const item = text(value);
  return item ? [item] : [];
}

function identityKey(value) {
  return text(value).normalize('NFKC').toLocaleLowerCase().replace(/[\s:._/\\()[\]{}-]+/g, '');
}

function termIdentityKeys(term) {
  return [term.term, term.spokenForm, ...textList(term.aliases)].map(identityKey).filter(Boolean);
}

function normalizeRelatedTerms(value) {
  return Array.isArray(value) ? value
    .filter(item => item && typeof item === 'object' && text(item.term))
    .map(item => ({ term: text(item.term), relation: text(item.relation), explanation: text(item.explanation) })) : [];
}

function normalizeContexts(value) {
  return Array.isArray(value) ? value
    .filter(item => item && typeof item === 'object' && text(item.phrase))
    .map(item => ({ phrase: text(item.phrase), explanation: text(item.explanation), experience: text(item.experience) })) : [];
}

function uniqueBy(values, keyFor) {
  const result = new Map();
  for (const value of values) result.set(keyFor(value), value);
  return [...result.values()];
}

function normalizeId(value, term) {
  const candidate = text(value).toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(candidate) ? candidate : slugify(term);
}

function normalizeTerm(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Term ${index + 1} must be an object`);
  }
  const term = text(raw.term);
  const zh = text(raw.zh);
  const definition = text(raw.definition);
  if (!term || !zh || !definition) {
    throw new Error(`Term ${index + 1} requires term, zh, and definition`);
  }
  return {
    id: normalizeId(raw.id, term),
    term,
    ipa: text(raw.ipa),
    zh,
    category: text(raw.category) || '其他',
    definition,
    example: text(raw.example),
    exampleZh: text(raw.exampleZh),
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean).join(' ') : text(raw.tags),
    spokenForm: text(raw.spokenForm),
    threadCategory: text(raw.threadCategory),
    source: text(raw.source),
    aliases: textList(raw.aliases),
    relatedTerms: normalizeRelatedTerms(raw.relatedTerms),
    contexts: normalizeContexts(raw.contexts),
    usageNotes: textList(raw.usageNotes),
  };
}

function uniqueId(preferredId, usedIds) {
  let id = preferredId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${preferredId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

async function readTerms(filePath) {
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  const terms = Array.isArray(parsed) ? parsed : parsed.terms;
  if (!Array.isArray(terms) || terms.length === 0) throw new Error('Input must contain at least one term');
  return terms.map(normalizeTerm);
}

async function writeJson(filePath, value, dryRun) {
  if (!dryRun) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) throw new Error('Usage: merge_terms.mjs --input <json> [--repo <path> | --package-output <json>] [--dry-run]');

const incoming = await readTerms(path.resolve(args.input));

if (args['package-output']) {
  const ids = new Set();
  const packageTerms = incoming.map(term => ({ ...term, id: uniqueId(term.id, ids) }));
  const outputPath = path.resolve(args['package-output']);
  await writeJson(outputPath, { format: 'ue-game-glossary', version: 1, terms: packageTerms }, args.dryRun);
  console.log(JSON.stringify({ mode: 'package', output: outputPath, saved: packageTerms.length, dryRun: Boolean(args.dryRun) }));
} else {
  if (!args.repo) throw new Error('--repo is required in published mode');
  const repo = path.resolve(args.repo);
  const targetPath = path.join(repo, 'src', 'imported-terms.json');
  const corePath = path.join(repo, 'src', 'terms.js');
  const existing = JSON.parse(await readFile(targetPath, 'utf8'));
  if (!Array.isArray(existing)) throw new Error('src/imported-terms.json must contain an array');

  const coreSource = await readFile(corePath, 'utf8');
  const coreNames = new Set(
    [...coreSource.matchAll(/term:'((?:\\'|[^'])+)'/g)]
      .map(match => identityKey(match[1].replace(/\\'/g, "'"))),
  );
  const records = new Map(existing.map(term => {
    const normalized = normalizeTerm(term, 0);
    return [normalized.id, normalized];
  }));
  const identityIndex = new Map();
  for (const record of records.values()) {
    for (const key of termIdentityKeys(record)) identityIndex.set(key, record);
  }
  const usedIds = new Set(existing.map(term => text(term.id)).filter(Boolean));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const term of incoming) {
    const keys = termIdentityKeys(term);
    if (keys.some(key => coreNames.has(key))) {
      skipped += 1;
      continue;
    }
    const current = keys.map(key => identityIndex.get(key)).find(Boolean);
    if (current) {
      const merged = {
        ...current,
        ...term,
        id: current.id,
        aliases: uniqueBy([...current.aliases, ...term.aliases], identityKey),
        relatedTerms: uniqueBy([...current.relatedTerms, ...term.relatedTerms], item => `${identityKey(item.term)}|${identityKey(item.relation)}`),
        contexts: uniqueBy([...current.contexts, ...term.contexts], item => identityKey(item.phrase)),
        usageNotes: uniqueBy([...current.usageNotes, ...term.usageNotes], identityKey),
      };
      records.set(current.id, merged);
      for (const key of termIdentityKeys(merged)) identityIndex.set(key, merged);
      updated += 1;
      continue;
    }
    const addedTerm = { ...term, id: uniqueId(term.id, usedIds) };
    records.set(addedTerm.id, addedTerm);
    for (const key of termIdentityKeys(addedTerm)) identityIndex.set(key, addedTerm);
    added += 1;
  }

  const merged = [...records.values()].sort((left, right) => left.term.localeCompare(right.term, 'en'));
  await writeJson(targetPath, merged, args.dryRun);
  console.log(JSON.stringify({ mode: 'published', target: targetPath, added, updated, skipped, total: merged.length, dryRun: Boolean(args.dryRun) }));
}
