// Page colour schemes. A group picks one with `theme:` under `layout:` in
// settings.yaml, and can override the page colour with `color:`.
//
// Phase 2 adds cloud-provider presets here (aws, azure, gcp) so a group can
// say `theme: aws` and get the brand colour plus the provider logo in the
// page header. The header icon slot already exists for that.

export interface PageTheme {
  /** Plastic page holder around the paper. */
  holder: string;
  paper: string;
  header: string;
  headerInk: string;
  strip: string;
  stripEdge: string;
  /** Title line ink. */
  ink: string;
  band: string;
  bandInk: string;
  /** Faint guide lines on empty strips. */
  rule: string;
}

export const THEMES: Record<string, PageTheme> = {
  classic: {
    holder: '#2a1012',
    paper: '#7d1a1f',
    header: '#f3c64b',
    headerInk: '#3a0d10',
    strip: '#fbf4df',
    stripEdge: '#c9b98f',
    ink: '#1d2440',
    band: '#c3262d',
    bandInk: '#fff6e2',
    rule: '#d9a0a0',
  },
  blue: {
    holder: '#0d1a2e',
    paper: '#1d4f8f',
    header: '#e9eef7',
    headerInk: '#0d1a2e',
    strip: '#fbf4df',
    stripEdge: '#b9c3d6',
    ink: '#1d2440',
    band: '#1f5fb4',
    bandInk: '#ffffff',
    rule: '#a7bde0',
  },
  green: {
    holder: '#0f2118',
    paper: '#1e6145',
    header: '#f1e7c4',
    headerInk: '#0f2118',
    strip: '#fbf4df',
    stripEdge: '#bfcfb0',
    ink: '#1d2a22',
    band: '#2c8a5d',
    bandInk: '#fffbe8',
    rule: '#a9d1b8',
  },
  black: {
    holder: '#0b0b0d',
    paper: '#222228',
    header: '#d7dce2',
    headerInk: '#111114',
    strip: '#fbf4df',
    stripEdge: '#b8b3a5',
    ink: '#16161a',
    band: '#33333c',
    bandInk: '#f7d774',
    rule: '#cfc8b4',
  },
};

export const DEFAULT_THEME = 'classic';

export function themeFor(name: string | undefined, color?: string): PageTheme {
  const base = THEMES[name ?? ''] ?? THEMES[DEFAULT_THEME]!;
  if (!color) return base;
  return { ...base, paper: color, band: color, holder: shade(color, -0.55) };
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 0xff;
    const target = amount < 0 ? 0 : 255;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  const out = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  return `#${out.toString(16).padStart(6, '0')}`;
}
