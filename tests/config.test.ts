import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildConfig, DEFAULT_SETTINGS, isSafeHref, loadConfig, substituteEnv } from '../server/config.ts';
import { resolveIcon } from '../server/icons.ts';

const docs = (services: string, settings = '', bookmarks = '') => ({
  services: parse(services),
  settings: parse(settings),
  bookmarks: parse(bookmarks),
});

const SERVICES = `
- Media:
    - Jellyfin:
        href: https://jellyfin.example.com
        description: Movies and TV
        icon: jellyfin.png
        widget:
          type: jellyfin
          key: super-secret-api-key
    - Sonarr:
        href: https://sonarr.example.com
        icon: mdi-television
- Infra:
    - Proxmox:
        href: https://pve.example.com:8006
        description: Hypervisor
`;

describe('buildConfig', () => {
  it('reads homepage services.yaml groups in order', () => {
    const config = buildConfig(docs(SERVICES));
    expect(config.groups.map((g) => g.name)).toEqual(['Media', 'Infra']);
    expect(config.groups[0]!.items.map((i) => i.name)).toEqual(['Jellyfin', 'Sonarr']);
    expect(config.warnings).toEqual([]);
  });

  it('never passes widget settings through to the client', () => {
    const json = JSON.stringify(buildConfig(docs(SERVICES)));
    expect(json).not.toContain('super-secret-api-key');
    expect(json).not.toContain('widget');
  });

  it('fills artist from description and leaves album off by default', () => {
    const [jellyfin, sonarr] = buildConfig(docs(SERVICES)).groups[0]!.items;
    expect(jellyfin).toMatchObject({ artist: 'Movies and TV' });
    expect(jellyfin!.album).toBeUndefined();
    expect(sonarr!.artist).toBeUndefined();
  });

  it('can fill album from the link host', () => {
    const [jellyfin, sonarr] = buildConfig(docs(SERVICES, 'jukebox: { album: host }')).groups[0]!.items;
    expect(jellyfin!.album).toBe('jellyfin.example.com');
    expect(sonarr!.album).toBe('sonarr.example.com');
  });

  it('keeps explicit artist and album, and honours album: group / none', () => {
    const services = `
- Media:
    - Plex:
        href: https://plex.example.com
        description: ignored for the band
        artist: The Streamers
        album: Greatest Hits
    - Tautulli:
        href: https://tautulli.example.com
`;
    const [plex, tautulli] = buildConfig(docs(services, 'jukebox: { album: group }')).groups[0]!.items;
    expect(plex).toMatchObject({ artist: 'The Streamers', album: 'Greatest Hits' });
    expect(tautulli!.album).toBe('Media');
    const none = buildConfig(docs(services, 'jukebox: { album: none }')).groups[0]!.items[1]!;
    expect(none.album).toBeUndefined();
  });

  it('flattens nested groups onto their own pages after the parent', () => {
    const services = `
- Servers:
    - Router:
        href: https://router.example.com
    - Rack A:
        - NAS:
            href: https://nas.example.com
`;
    const config = buildConfig(docs(services));
    expect(config.groups.map((g) => [g.name, g.items.map((i) => i.name)])).toEqual([
      ['Servers', ['Router']],
      ['Rack A', ['NAS']],
    ]);
  });

  it('sorts services by weight', () => {
    const services = `
- G:
    - First:
        href: https://1.example.com
    - Second:
        href: https://2.example.com
        weight: 50
`;
    expect(buildConfig(docs(services)).groups[0]!.items.map((i) => i.name)).toEqual(['Second', 'First']);
  });

  it('skips entries without a safe href and says why', () => {
    const services = `
- G:
    - Widget only:
        widget: { type: weather }
    - Sneaky:
        href: "javascript:alert(1)"
    - Fine:
        href: /relative/path
`;
    const config = buildConfig(docs(services));
    expect(config.groups[0]!.items.map((i) => i.name)).toEqual(['Fine']);
    expect(config.warnings).toHaveLength(2);
    expect(config.warnings.join('\n')).toMatch(/Widget only.*no href/);
    expect(config.warnings.join('\n')).toMatch(/Sneaky/);
  });

  it('adds bookmarks after the services, unless turned off', () => {
    const bookmarks = `
- Docs:
    - Homepage:
        - abbr: HP
          href: https://gethomepage.dev
`;
    const config = buildConfig(docs(SERVICES, '', bookmarks));
    expect(config.groups.at(-1)).toMatchObject({ name: 'Docs', kind: 'bookmarks' });
    expect(config.groups.at(-1)!.items[0]).toMatchObject({ name: 'Homepage', href: 'https://gethomepage.dev' });
    const off = buildConfig(docs(SERVICES, 'jukebox: { bookmarks: false }', bookmarks));
    expect(off.groups.map((g) => g.name)).toEqual(['Media', 'Infra']);
  });

  it('orders and styles groups from layout, in map or list form', () => {
    const settings = `
layout:
  Infra:
    theme: blue
    color: "#ff9900"
    icon: aws.png
`;
    const config = buildConfig(docs(SERVICES, settings));
    expect(config.groups.map((g) => g.name)).toEqual(['Infra', 'Media']);
    expect(config.groups[0]).toMatchObject({
      theme: 'blue',
      color: '#ff9900',
      icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/aws.png',
    });
    expect(config.groups[1]!.theme).toBe('classic');

    const listForm = buildConfig(docs(SERVICES, 'layout:\n  - Infra: {}\n  - Media: {}'));
    expect(listForm.groups.map((g) => g.name)).toEqual(['Infra', 'Media']);
  });

  it('warns about bad layout styles and falls back', () => {
    const config = buildConfig(docs(SERVICES, 'layout:\n  Media:\n    theme: plaid\n    color: orange'));
    expect(config.groups.find((g) => g.name === 'Media')!.theme).toBe('classic');
    expect(config.warnings).toHaveLength(2);
  });

  it('applies defaults, homepage top-level target and clamps strips per page', () => {
    expect(buildConfig(docs(SERVICES)).settings).toEqual(DEFAULT_SETTINGS);
    const config = buildConfig(
      docs(SERVICES, 'title: Rex\ntarget: _self\njukebox:\n  stripsPerPage: 40\n  wrap: false\n  openAs: popup'),
    );
    expect(config.title).toBe('Rex');
    expect(config.sign).toBe("Jook's");
    expect(buildConfig(docs(SERVICES, "sign: Mel's")).sign).toBe("Mel's");
    expect(config.settings).toMatchObject({ target: '_self', stripsPerPage: 10, wrap: false, openAs: 'tab' });
    expect(config.warnings).toHaveLength(2);
  });

  it('changes version when content changes', () => {
    const a = buildConfig(docs(SERVICES));
    const b = buildConfig(docs(SERVICES.replace('Movies and TV', 'Films')));
    expect(a.version).toMatch(/^[0-9a-f]{16}$/);
    expect(a.version).not.toBe(b.version);
    expect(buildConfig(docs(SERVICES)).version).toBe(a.version);
  });

  it('tolerates empty and malformed documents', () => {
    expect(buildConfig({ settings: null, services: null, bookmarks: null }).groups).toEqual([]);
    const bad = buildConfig({ settings: 'nope', services: { not: 'a list' }, bookmarks: 7 });
    expect(bad.groups).toEqual([]);
    expect(bad.warnings).toHaveLength(2);
  });
});

describe('substituteEnv', () => {
  it('replaces homepage and jookbox VAR placeholders', () => {
    const warnings: string[] = [];
    const out = substituteEnv(
      'a: {{HOMEPAGE_VAR_HOST}}\nb: {{ JOOKBOX_VAR_PORT }}',
      { HOMEPAGE_VAR_HOST: 'nas.lan', JOOKBOX_VAR_PORT: '8080' },
      'services.yaml',
      warnings,
    );
    expect(out).toBe('a: nas.lan\nb: 8080');
    expect(warnings).toEqual([]);
  });

  it('reads FILE placeholders and warns about missing variables', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jookbox-'));
    const secret = path.join(dir, 'host.txt');
    await writeFile(secret, 'secret.lan\n');
    const warnings: string[] = [];
    const out = substituteEnv(
      'a: {{HOMEPAGE_FILE_HOST}}\nb: {{HOMEPAGE_VAR_MISSING}}',
      { HOMEPAGE_FILE_HOST: secret },
      'services.yaml',
      warnings,
    );
    expect(out).toBe('a: secret.lan\nb: {{HOMEPAGE_VAR_MISSING}}');
    expect(warnings).toEqual(['services.yaml: HOMEPAGE_VAR_MISSING is not set']);
  });
});

describe('loadConfig', () => {
  it('loads a directory and reports a missing services.yaml and YAML errors', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jookbox-'));
    let config = await loadConfig(dir, {});
    expect(config.warnings).toEqual(['services.yaml was not found in the config directory']);

    await writeFile(path.join(dir, 'services.yaml'), SERVICES.replace('example.com', '{{HOMEPAGE_VAR_DOMAIN}}'));
    await writeFile(path.join(dir, 'settings.yaml'), 'title: [unclosed');
    config = await loadConfig(dir, { HOMEPAGE_VAR_DOMAIN: 'lan.test' });
    expect(config.groups[0]!.items[0]!.href).toBe('https://jellyfin.lan.test');
    expect(config.title).toBe('JookBox');
    expect(config.warnings).toHaveLength(1);
    expect(config.warnings[0]).toMatch(/^settings\.yaml: /);
  });
});

describe('isSafeHref', () => {
  it.each([
    ['https://a.example.com', true],
    ['http://npm.lan:81/login', true],
    ['/local/path', true],
    ['ssh://root@nas', true],
    ['javascript:alert(1)', false],
    ['  JavaScript:alert(1)', false],
    ['data:text/html,hi', false],
    ['file:///etc/passwd', false],
  ])('%s -> %s', (href, safe) => {
    expect(isSafeHref(href)).toBe(safe);
  });
});

describe('resolveIcon', () => {
  it.each([
    ['grafana.png', 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/grafana.png'],
    ['grafana', 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/grafana.png'],
    ['grafana.svg', 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/grafana.svg'],
    ['mdi-chart-line', 'https://cdn.jsdelivr.net/npm/@mdi/svg@latest/svg/chart-line.svg'],
    ['mdi-robot-#f0d453', 'https://cdn.jsdelivr.net/npm/@mdi/svg@latest/svg/robot.svg'],
    ['si-github', 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/github.svg'],
    ['sh-pocket-id.webp', 'https://cdn.jsdelivr.net/gh/selfhst/icons/webp/pocket-id.webp'],
    ['/icons/mine.png', '/icons/mine.png'],
    ['https://x.example.com/i.png', 'https://x.example.com/i.png'],
  ])('%s', (spec, url) => {
    expect(resolveIcon(spec)).toBe(url);
  });

  it('ignores empty and odd values', () => {
    expect(resolveIcon('')).toBeUndefined();
    expect(resolveIcon(42)).toBeUndefined();
    expect(resolveIcon('bad name with spaces')).toBeUndefined();
  });
});
