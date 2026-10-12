import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildApp } from '../server/app.ts';
import { bookmarksYaml, servicesYaml } from '../server/homepage-import.ts';
import { ensureConfig } from '../server/skeleton.ts';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'jookbox-'));
const apps: { close(): Promise<unknown> }[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function appWith(files: Record<string, string>, staticFiles?: Record<string, string>) {
  const configDir = await tmp();
  for (const [name, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(configDir, name)), { recursive: true });
    await writeFile(path.join(configDir, name), text);
  }
  let staticDir: string | undefined;
  if (staticFiles) {
    staticDir = await tmp();
    for (const [name, text] of Object.entries(staticFiles)) {
      await mkdir(path.dirname(path.join(staticDir, name)), { recursive: true });
      await writeFile(path.join(staticDir, name), text);
    }
  }
  const app = await buildApp({ configDir, staticDir });
  apps.push(app);
  return { app, configDir };
}

const SERVICES = '- G:\n    - One:\n        href: https://one.example.com\n';

describe('server', () => {
  it('answers health checks', async () => {
    const { app } = await appWith({});
    const res = await app.inject('/healthz');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('serves the normalized config with an ETag and 304s', async () => {
    const { app } = await appWith({ 'services.yaml': SERVICES });
    const res = await app.inject('/api/config');
    expect(res.statusCode).toBe(200);
    expect(res.json().groups[0].items[0]).toMatchObject({ name: 'One', href: 'https://one.example.com' });
    const etag = res.headers.etag as string;
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect(res.headers['cache-control']).toBe('no-cache');

    const again = await app.inject({ url: '/api/config', headers: { 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
  });

  it('picks up YAML edits on the next request', async () => {
    const { app, configDir } = await appWith({ 'services.yaml': SERVICES });
    const before = (await app.inject('/api/config')).json();
    await writeFile(path.join(configDir, 'services.yaml'), SERVICES.replace('One', 'Uno'));
    const after = (await app.inject('/api/config')).json();
    expect(after.groups[0].items[0].name).toBe('Uno');
    expect(after.version).not.toBe(before.version);
  });

  it('serves the built client with long caching for hashed assets', async () => {
    const { app } = await appWith(
      { 'services.yaml': SERVICES },
      { 'index.html': '<!doctype html><title>jb</title>', 'assets/app-abc123.js': 'console.log(1)' },
    );
    const index = await app.inject('/');
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('<title>jb</title>');
    expect(index.headers['cache-control']).toBe('no-cache');
    const asset = await app.inject('/assets/app-abc123.js');
    expect(asset.headers['cache-control']).toContain('immutable');
    expect((await app.inject('/nope.js')).statusCode).toBe(404);
  });

  it('serves local icons from config/icons', async () => {
    const { app } = await appWith({ 'services.yaml': SERVICES, 'icons/mine.svg': '<svg/>' });
    const res = await app.inject('/icons/mine.svg');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<svg/>');
    expect((await app.inject('/icons/../services.yaml')).statusCode).not.toBe(200);
  });
});

describe('ensureConfig', () => {
  it('creates missing starter files and leaves existing ones alone', async () => {
    const dir = path.join(await tmp(), 'config');
    expect(await ensureConfig(dir)).toHaveLength(3);
    expect((await readdir(dir)).sort()).toEqual(['bookmarks.yaml', 'services.yaml', 'settings.yaml']);

    await writeFile(path.join(dir, 'services.yaml'), SERVICES);
    expect(await ensureConfig(dir)).toEqual([]);
    expect(await readFile(path.join(dir, 'services.yaml'), 'utf8')).toBe(SERVICES);
  });

  it('ships starter files that load without warnings', async () => {
    const dir = path.join(await tmp(), 'config');
    await ensureConfig(dir);
    const app = await buildApp({ configDir: dir });
    apps.push(app);
    const config = (await app.inject('/api/config')).json();
    expect(config.warnings).toEqual([]);
    expect(config.groups[0].items.length).toBeGreaterThan(0);
  });
});

describe('homepage import', () => {
  it('round-trips homepage API output into loadable YAML', async () => {
    const services = servicesYaml(
      [
        {
          name: 'Infra',
          services: [{ name: 'GitLab', href: 'https://git.example.com', description: 'Code', icon: 'gitlab.png' }],
          groups: [{ name: 'Nested', services: [{ name: 'NAS', href: 'https://nas.example.com' }] }],
        },
      ],
      'https://homepage.example.com',
    );
    const bookmarks = bookmarksYaml(
      [{ name: 'Docs', bookmarks: [{ name: 'Homepage', abbr: 'HP', href: 'https://gethomepage.dev' }] }],
      'https://homepage.example.com',
    );
    expect(parse(services)).toEqual([
      {
        Infra: [
          { GitLab: { href: 'https://git.example.com', description: 'Code', icon: 'gitlab.png' } },
          { Nested: [{ NAS: { href: 'https://nas.example.com' } }] },
        ],
      },
    ]);
    const { app } = await appWith({ 'services.yaml': services, 'bookmarks.yaml': bookmarks });
    const config = (await app.inject('/api/config')).json();
    expect(config.warnings).toEqual([]);
    expect(config.groups.map((g: { name: string }) => g.name)).toEqual(['Infra', 'Nested', 'Docs']);
  });
});
