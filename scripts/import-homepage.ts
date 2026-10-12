// Usage: npm run import:homepage -- <homepage-url> [config-dir] [--force]
//
// Copies the services and bookmarks of a running homepage instance into
// services.yaml and bookmarks.yaml. Refuses to overwrite existing files
// unless --force is given.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bookmarksYaml, servicesYaml } from '../server/homepage-import.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const [base, dir = 'config'] = args.filter((a) => a !== '--force');

if (!base) {
  console.error('usage: npm run import:homepage -- <homepage-url> [config-dir] [--force]');
  process.exit(2);
}

async function fetchJson(endpoint: string): Promise<unknown> {
  const url = new URL(endpoint, base);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

const outputs = [
  ['services.yaml', servicesYaml((await fetchJson('/api/services')) as never, base)],
  ['bookmarks.yaml', bookmarksYaml((await fetchJson('/api/bookmarks')) as never, base)],
] as const;

for (const [file, text] of outputs) {
  const target = path.join(dir, file);
  if (existsSync(target) && !force) {
    console.error(`${target} exists; pass --force to overwrite it`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(target, text);
  console.log(`wrote ${target}`);
}
