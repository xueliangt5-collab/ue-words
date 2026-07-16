import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  configLoader: 'native',
  logLevel: 'silent',
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  const { BUILTIN_TERMS } = await server.ssrLoadModule('/src/terms.js');
  const clean = value => String(value || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\//g, ' ')
    .trim();
  const texts = [...new Set(BUILTIN_TERMS.flatMap(term => [
    clean(term.spokenForm || term.term),
    clean(term.example),
  ]).filter(Boolean))];
  process.stdout.write(JSON.stringify(texts));
} finally {
  await server.close();
}
