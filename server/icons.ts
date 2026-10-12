// Resolves homepage-style icon names to URLs, using the same CDNs homepage
// does, so an existing services.yaml shows the same icons.

const DASHBOARD_ICONS = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';
const SELFHST_ICONS = 'https://cdn.jsdelivr.net/gh/selfhst/icons';
const MDI = 'https://cdn.jsdelivr.net/npm/@mdi/svg@latest/svg';
const SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons';

export function resolveIcon(spec: unknown): string | undefined {
  if (typeof spec !== 'string') return undefined;
  const icon = spec.trim();
  if (!icon) return undefined;

  // Full URLs and paths on this server (config/icons is served at /icons/).
  if (/^https?:\/\//i.test(icon) || icon.startsWith('/')) return icon;

  // mdi-name and si-name, optionally with a homepage colour suffix (-#ff0000).
  const prefixed = /^(mdi|si)-(.+?)(?:-#[0-9a-f]{3,8})?$/i.exec(icon);
  if (prefixed) {
    const [, set, name] = prefixed;
    return set!.toLowerCase() === 'mdi' ? `${MDI}/${name}.svg` : `${SIMPLE_ICONS}/${name}.svg`;
  }

  const file = /^(sh-)?([\w.-]+?)(?:\.(png|svg|webp))?$/i.exec(icon);
  if (!file) return undefined;
  const [, selfhst, name, ext = 'png'] = file;
  const base = selfhst ? SELFHST_ICONS : DASHBOARD_ICONS;
  return `${base}/${ext.toLowerCase()}/${name}.${ext.toLowerCase()}`;
}
