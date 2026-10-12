// Loads the YAML config directory. services.yaml and bookmarks.yaml use
// homepage's format unchanged, and settings.yaml accepts homepage's file
// too, ignoring the keys the jukebox has no use for. Problems become
// warnings rather than errors, so one bad entry never blanks the dashboard.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { clampStrips, MAX_STRIPS, MIN_STRIPS } from '../shared/catalog.ts';
import { DEFAULT_THEME, THEMES } from '../shared/themes.ts';
import type {
  AlbumSource,
  JukeboxConfig,
  JukeboxGroup,
  JukeboxItem,
  JukeboxSettings,
} from '../shared/types.ts';
import { resolveIcon } from './icons.ts';

export const CONFIG_FILES = ['settings.yaml', 'services.yaml', 'bookmarks.yaml'] as const;

export const DEFAULT_TITLE = 'JookBox';
export const DEFAULT_SIGN = "Jook's";

export const DEFAULT_SETTINGS: JukeboxSettings = {
  stripsPerPage: 5,
  wrap: false,
  sound: true,
  target: '_blank',
  openAs: 'tab',
  icons: true,
  album: 'none',
  bookmarks: true,
};

type Env = Record<string, string | undefined>;

export interface ConfigDocs {
  settings: unknown;
  services: unknown;
  bookmarks: unknown;
}

export async function loadConfig(dir: string, env: Env = process.env): Promise<JukeboxConfig> {
  const warnings: string[] = [];
  const read = (file: string, required = false) => readYaml(dir, file, env, warnings, required);
  const docs: ConfigDocs = {
    settings: await read('settings.yaml'),
    services: await read('services.yaml', true),
    bookmarks: await read('bookmarks.yaml'),
  };
  return buildConfig(docs, warnings);
}

async function readYaml(
  dir: string,
  file: string,
  env: Env,
  warnings: string[],
  required: boolean,
): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path.join(dir, file), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (required) warnings.push(`${file} was not found in the config directory`);
    } else {
      warnings.push(`${file}: ${(err as Error).message}`);
    }
    return null;
  }
  try {
    return parse(substituteEnv(text, env, file, warnings));
  } catch (err) {
    warnings.push(`${file}: ${(err as Error).message.split('\n')[0]}`);
    return null;
  }
}

// homepage's placeholders, plus JOOKBOX_ ones: {{X_VAR_NAME}} is replaced
// with that environment variable, {{X_FILE_NAME}} with the contents of the
// file whose path that environment variable holds.
const PLACEHOLDER = /\{\{\s*((?:HOMEPAGE|JOOKBOX)_(VAR|FILE)_[A-Z0-9_]+)\s*\}\}/g;

export function substituteEnv(text: string, env: Env, file: string, warnings: string[]): string {
  return text.replace(PLACEHOLDER, (match, name: string, kind: string) => {
    const value = env[name];
    if (value === undefined) {
      warnings.push(`${file}: ${name} is not set`);
      return match;
    }
    if (kind === 'VAR') return value;
    try {
      return readFileSync(value, 'utf8').trim();
    } catch (err) {
      warnings.push(`${file}: can't read ${name} (${(err as Error).message})`);
      return match;
    }
  });
}

export function buildConfig(docs: ConfigDocs, warnings: string[] = []): JukeboxConfig {
  const settingsDoc = asRecord(docs.settings) ?? {};
  const settings = normalizeSettings(settingsDoc, warnings);
  const layout = normalizeLayout(settingsDoc.layout, warnings);

  const services = normalizeServices(docs.services, warnings);
  const bookmarks = settings.bookmarks ? normalizeBookmarks(docs.bookmarks, warnings) : [];

  const groups = orderByLayout([...services, ...bookmarks], layout).map((group) => {
    const style = layout.get(group.name);
    return {
      ...group,
      theme: style?.theme ?? DEFAULT_THEME,
      ...(style?.color && { color: style.color }),
      ...(style?.icon && { icon: style.icon }),
      items: group.items.map((item) => withDefaults(item, group.name, settings.album)),
    } satisfies JukeboxGroup;
  });

  const body = {
    title: str(settingsDoc.title) ?? DEFAULT_TITLE,
    ...(str(settingsDoc.subtitle) && { subtitle: str(settingsDoc.subtitle) }),
    sign: str(settingsDoc.sign) ?? DEFAULT_SIGN,
    settings,
    groups,
    warnings,
  };
  const version = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return { ...body, version };
}

function normalizeSettings(doc: Record<string, unknown>, warnings: string[]): JukeboxSettings {
  const jukebox = asRecord(doc.jukebox) ?? {};
  const out: JukeboxSettings = { ...DEFAULT_SETTINGS };

  if (jukebox.stripsPerPage !== undefined) {
    const n = Number(jukebox.stripsPerPage);
    out.stripsPerPage = clampStrips(n);
    if (out.stripsPerPage !== n) {
      warnings.push(
        `settings.yaml: jukebox.stripsPerPage must be ${MIN_STRIPS}-${MAX_STRIPS}, using ${out.stripsPerPage}`,
      );
    }
  }
  for (const key of ['wrap', 'sound', 'icons', 'bookmarks'] as const) {
    if (jukebox[key] === undefined) continue;
    if (typeof jukebox[key] === 'boolean') out[key] = jukebox[key];
    else warnings.push(`settings.yaml: jukebox.${key} must be true or false`);
  }
  // homepage keeps `target` at the top level; the jukebox block wins.
  const target = str(jukebox.target) ?? str(doc.target);
  if (target) out.target = target;
  out.openAs = pick(jukebox.openAs, ['tab', 'window'], out.openAs, 'jukebox.openAs', warnings);
  out.album = pick<AlbumSource>(jukebox.album, ['host', 'group', 'none'], out.album, 'jukebox.album', warnings);
  return out;
}

interface GroupStyle {
  theme?: string;
  color?: string;
  icon?: string;
}

// homepage writes layout as a map or as a list of one-key maps; either way
// the order of the entries is the order of the groups.
function normalizeLayout(raw: unknown, warnings: string[]): Map<string, GroupStyle> {
  const layout = new Map<string, GroupStyle>();
  const entries = Array.isArray(raw)
    ? raw.flatMap((e) => Object.entries(asRecord(e) ?? {}))
    : Object.entries(asRecord(raw) ?? {});
  for (const [name, value] of entries) {
    const opts = asRecord(value) ?? {};
    const style: GroupStyle = {};
    const theme = str(opts.theme);
    if (theme && THEMES[theme]) style.theme = theme;
    else if (theme) warnings.push(`settings.yaml: layout "${name}" has unknown theme "${theme}"`);
    const color = str(opts.color);
    if (color && /^#[0-9a-f]{6}$/i.test(color)) style.color = color;
    else if (color) warnings.push(`settings.yaml: layout "${name}" color must look like #ff9900`);
    const icon = resolveIcon(opts.icon);
    if (icon) style.icon = icon;
    layout.set(String(name), style);
  }
  return layout;
}

type RawGroup = Omit<JukeboxGroup, 'theme'>;

function normalizeServices(doc: unknown, warnings: string[]): RawGroup[] {
  if (doc == null) return [];
  if (!Array.isArray(doc)) {
    warnings.push('services.yaml: expected a list of groups');
    return [];
  }
  const groups: RawGroup[] = [];
  for (const entry of doc) {
    for (const [name, services] of Object.entries(asRecord(entry) ?? {})) {
      collectServiceGroup(String(name), services, groups, warnings);
    }
  }
  return groups;
}

// A group's list holds services (one-key maps to an options map) and nested
// groups (one-key maps to another list). Nested groups get their own pages,
// right after their parent.
function collectServiceGroup(name: string, raw: unknown, out: RawGroup[], warnings: string[]) {
  const group: RawGroup = { name, kind: 'services', items: [] };
  out.push(group);
  const nested: [string, unknown][] = [];
  const weighted: { item: JukeboxItem; weight: number }[] = [];
  (Array.isArray(raw) ? raw : []).forEach((entry, index) => {
    for (const [serviceName, value] of Object.entries(asRecord(entry) ?? {})) {
      if (Array.isArray(value)) {
        nested.push([String(serviceName), value]);
        continue;
      }
      const opts = asRecord(value) ?? {};
      const item = toItem(String(serviceName), opts, `services.yaml "${name}"`, warnings);
      const weight = Number(opts.weight);
      if (item) weighted.push({ item, weight: Number.isFinite(weight) ? weight : (index + 1) * 100 });
    }
  });
  group.items = weighted.sort((a, b) => a.weight - b.weight).map((w) => w.item);
  for (const [child, value] of nested) collectServiceGroup(child, value, out, warnings);
}

function normalizeBookmarks(doc: unknown, warnings: string[]): RawGroup[] {
  if (doc == null) return [];
  if (!Array.isArray(doc)) {
    warnings.push('bookmarks.yaml: expected a list of groups');
    return [];
  }
  const groups: RawGroup[] = [];
  for (const entry of doc) {
    for (const [name, bookmarks] of Object.entries(asRecord(entry) ?? {})) {
      const items: JukeboxItem[] = [];
      for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
        for (const [bookmarkName, value] of Object.entries(asRecord(bookmark) ?? {})) {
          // homepage wraps each bookmark's options in a one-item list.
          const opts = asRecord(Array.isArray(value) ? value[0] : value) ?? {};
          const item = toItem(String(bookmarkName), opts, `bookmarks.yaml "${name}"`, warnings);
          if (item) items.push(item);
        }
      }
      groups.push({ name: String(name), kind: 'bookmarks', items });
    }
  }
  return groups;
}

function toItem(
  name: string,
  opts: Record<string, unknown>,
  where: string,
  warnings: string[],
): JukeboxItem | null {
  const href = str(opts.href);
  if (!href) {
    warnings.push(`${where}: "${name}" has no href, skipped`);
    return null;
  }
  if (!isSafeHref(href)) {
    warnings.push(`${where}: "${name}" has a link the jukebox won't open, skipped`);
    return null;
  }
  const item: JukeboxItem = { name, href };
  for (const key of ['description', 'artist', 'album', 'target'] as const) {
    const value = str(opts[key]);
    if (value) item[key] = value;
  }
  const icon = resolveIcon(opts.icon);
  if (icon) item.icon = icon;
  return item;
}

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']);

export function isSafeHref(href: string): boolean {
  try {
    return !BLOCKED_SCHEMES.has(new URL(href, 'http://relative.invalid/').protocol);
  } catch {
    return false;
  }
}

function withDefaults(item: JukeboxItem, group: string, album: AlbumSource): JukeboxItem {
  const out = { ...item };
  if (!out.artist && out.description) out.artist = out.description;
  if (!out.album) {
    const fallback = album === 'host' ? hostOf(out.href) : album === 'group' ? group : undefined;
    if (fallback && fallback !== out.artist) out.album = fallback;
  }
  return out;
}

function hostOf(href: string): string | undefined {
  try {
    return new URL(href).host || undefined;
  } catch {
    return undefined;
  }
}

function orderByLayout<T extends { name: string }>(groups: T[], layout: Map<string, unknown>): T[] {
  const rank = new Map([...layout.keys()].map((name, i) => [name, i]));
  return groups
    .map((group, i) => ({ group, key: rank.get(group.name) ?? rank.size + i }))
    .sort((a, b) => a.key - b.key)
    .map((g) => g.group);
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  key: string,
  warnings: string[],
): T {
  if (value === undefined) return fallback;
  if (allowed.includes(value as T)) return value as T;
  warnings.push(`settings.yaml: ${key} must be one of ${allowed.join(', ')}`);
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
}
