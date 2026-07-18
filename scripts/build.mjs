import { spawn } from 'node:child_process';
import path from 'node:path';
import { writeReleaseMetadata } from './release_metadata.mjs';

await writeReleaseMetadata('public/release.json');

const vite = path.resolve('node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, 'build', '--configLoader', 'native'], {
  env: process.env,
  stdio: 'inherit',
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});

if (exitCode !== 0) process.exit(exitCode);
