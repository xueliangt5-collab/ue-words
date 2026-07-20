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

function text(value) {
  return String(value ?? '').trim();
}

function slugify(value) {
  return text(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'article';
}

function normalizeId(value, fallback) {
  const candidate = text(value).toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(candidate) ? candidate : slugify(fallback);
}

function titleKey(article) {
  return `${text(article.titleEn).normalize('NFKC').toLocaleLowerCase()}|${text(article.titleZh).normalize('NFKC')}`;
}

function normalizeLink(raw, label) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label} must be an object`);
  const termId = text(raw.termId);
  const textEn = text(raw.textEn);
  const textZh = text(raw.textZh);
  if (!termId || (!textEn && !textZh)) throw new Error(`${label} requires termId and textEn or textZh`);
  return { termId, textEn, textZh, note: text(raw.note) };
}

function normalizeSection(raw, articleIndex, sectionIndex) {
  const label = `Article ${articleIndex + 1}, section ${sectionIndex + 1}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label} must be an object`);
  const headingEn = text(raw.headingEn);
  const headingZh = text(raw.headingZh);
  const en = text(raw.en);
  const zh = text(raw.zh);
  if (!headingEn || !headingZh || !en || !zh) throw new Error(`${label} requires headingEn, headingZh, en, and zh`);
  const termLinks = Array.isArray(raw.termLinks)
    ? raw.termLinks.map((link, linkIndex) => normalizeLink(link, `${label}, link ${linkIndex + 1}`))
    : [];
  const linkedTermIds = new Set();
  for (const link of termLinks) {
    if (linkedTermIds.has(link.termId)) throw new Error(`${label} has duplicate termId: ${link.termId}`);
    linkedTermIds.add(link.termId);
    if (link.textEn && !en.toLocaleLowerCase().includes(link.textEn.toLocaleLowerCase())) {
      throw new Error(`${label} textEn is not present in the English paragraph: ${link.textEn}`);
    }
    if (link.textZh && !zh.toLocaleLowerCase().includes(link.textZh.toLocaleLowerCase())) {
      throw new Error(`${label} textZh is not present in the Chinese paragraph: ${link.textZh}`);
    }
  }
  return {
    id: normalizeId(raw.id, headingEn),
    headingEn,
    headingZh,
    en,
    zh,
    termLinks,
  };
}

function normalizeArticle(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Article ${index + 1} must be an object`);
  const titleEn = text(raw.titleEn);
  const titleZh = text(raw.titleZh);
  const summaryEn = text(raw.summaryEn);
  const summaryZh = text(raw.summaryZh);
  const category = text(raw.category);
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((section, sectionIndex) => normalizeSection(section, index, sectionIndex))
    : [];
  if (!titleEn || !titleZh || !summaryEn || !summaryZh || !category || !sections.length) {
    throw new Error(`Article ${index + 1} requires bilingual titles, bilingual summaries, category, and sections`);
  }
  const sectionIds = new Set();
  for (const section of sections) {
    if (sectionIds.has(section.id)) throw new Error(`Article ${index + 1} has duplicate section id: ${section.id}`);
    sectionIds.add(section.id);
  }
  return {
    id: normalizeId(raw.id, titleEn),
    titleEn,
    titleZh,
    summaryEn,
    summaryZh,
    category,
    level: text(raw.level) || '入门',
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags.map(text).filter(Boolean))] : [],
    source: text(raw.source),
    sections,
  };
}

async function readArticles(filePath) {
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  const articles = Array.isArray(parsed) ? parsed : parsed.articles;
  if (!Array.isArray(articles) || !articles.length) throw new Error('Input must contain at least one article');
  return articles.map(normalizeArticle);
}

async function knownTermIds(repo) {
  const [coreSource, importedSource] = await Promise.all([
    readFile(path.join(repo, 'src', 'terms.js'), 'utf8'),
    readFile(path.join(repo, 'src', 'imported-terms.json'), 'utf8'),
  ]);
  const coreIds = [...coreSource.matchAll(/id:'((?:\\'|[^'])+)'/g)].map(match => match[1].replace(/\\'/g, "'"));
  const imported = JSON.parse(importedSource);
  return new Set([...coreIds, ...imported.map(term => text(term.id)).filter(Boolean)]);
}

async function writeJson(filePath, value, dryRun) {
  if (dryRun) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.repo) {
  throw new Error('Usage: merge_articles.mjs --repo <path> --input <json> [--dry-run]');
}

const repo = path.resolve(args.repo);
const targetPath = path.join(repo, 'src', 'imported-articles.json');
const [incoming, termIds, existingSource] = await Promise.all([
  readArticles(path.resolve(args.input)),
  knownTermIds(repo),
  readFile(targetPath, 'utf8'),
]);
const existing = JSON.parse(existingSource);
if (!Array.isArray(existing)) throw new Error('src/imported-articles.json must contain an array');

for (const article of incoming) {
  for (const section of article.sections) {
    for (const link of section.termLinks) {
      if (!termIds.has(link.termId)) throw new Error(`Unknown termId ${link.termId} in ${article.id}/${section.id}`);
    }
  }
}

const records = new Map(existing.map((article, index) => {
  const normalized = normalizeArticle(article, index);
  return [normalized.id, normalized];
}));
const titleIndex = new Map([...records.values()].map(article => [titleKey(article), article.id]));
let added = 0;
let updated = 0;
let skipped = 0;

for (const article of incoming) {
  const currentId = records.has(article.id) ? article.id : titleIndex.get(titleKey(article));
  if (currentId) {
    const candidate = { ...article, id: currentId };
    if (JSON.stringify(records.get(currentId)) === JSON.stringify(candidate)) {
      skipped += 1;
    } else {
      records.set(currentId, candidate);
      updated += 1;
    }
  } else {
    let id = article.id;
    let suffix = 2;
    while (records.has(id)) {
      id = `${article.id}-${suffix}`;
      suffix += 1;
    }
    const addedArticle = { ...article, id };
    records.set(id, addedArticle);
    titleIndex.set(titleKey(addedArticle), id);
    added += 1;
  }
}

const merged = [...records.values()].sort((left, right) => left.titleEn.localeCompare(right.titleEn, 'en'));
await writeJson(targetPath, merged, args.dryRun);
console.log(JSON.stringify({ target: targetPath, added, updated, skipped, total: merged.length, dryRun: Boolean(args.dryRun) }));
