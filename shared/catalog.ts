// Turns the config's groups into wallbox pages and selection codes, and holds
// the page geometry shared by the texture painter and the click hit-test.

import type { JukeboxConfig, JukeboxGroup, JukeboxItem } from './types.ts';

// Seeburg keypads skip I and O so they can't be confused with 1 and 0.
export const PAGE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const MIN_STRIPS = 3;
export const MAX_STRIPS = 10;

export interface CatalogEntry extends JukeboxItem {
  /** Selection code printed on the strip, e.g. "C4". */
  code: string;
  side: number;
  /** 0-based strip position on its page side. */
  slot: number;
  group: string;
}

export interface PageSide {
  index: number;
  letter: string;
  group: JukeboxGroup;
  /** 1-based page number within a group that spans several sides. */
  part: number;
  parts: number;
  entries: CatalogEntry[];
}

export interface Catalog {
  sides: PageSide[];
  stripsPerPage: number;
  /** Two-page spreads you can turn to. Always at least one. */
  views: number;
  /** Turnable leaves between the fixed left and right boards. */
  leaves: number;
  entries: CatalogEntry[];
}

export function pageLetter(index: number): string {
  const n = PAGE_LETTERS.length;
  if (index < n) return PAGE_LETTERS[index]!;
  return PAGE_LETTERS[Math.floor(index / n) - 1]! + PAGE_LETTERS[index % n]!;
}

/** Strip numbers run 1-10; the keypad's 0 key means 10. */
export function slotKey(slot: number): string {
  return slot === 9 ? '0' : String(slot + 1);
}

export function buildCatalog(config: Pick<JukeboxConfig, 'groups' | 'settings'>): Catalog {
  const perPage = clampStrips(config.settings.stripsPerPage);
  const sides: PageSide[] = [];
  for (const group of config.groups) {
    if (group.items.length === 0) continue;
    const parts = Math.ceil(group.items.length / perPage);
    for (let part = 0; part < parts; part++) {
      const index = sides.length;
      const letter = pageLetter(index);
      const items = group.items.slice(part * perPage, (part + 1) * perPage);
      sides.push({
        index,
        letter,
        group,
        part: part + 1,
        parts,
        entries: items.map((item, slot) => ({
          ...item,
          code: `${letter}${slot + 1}`,
          side: index,
          slot,
          group: group.name,
        })),
      });
    }
  }
  const views = Math.max(1, Math.ceil(sides.length / 2));
  return {
    sides,
    stripsPerPage: perPage,
    views,
    leaves: views - 1,
    entries: sides.flatMap((s) => s.entries),
  };
}

export function clampStrips(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(MAX_STRIPS, Math.max(MIN_STRIPS, Math.round(n)));
}

// --- The title rack is a book bound at a vertical centre spine -------------
//
// View v shows side 2v on the left and side 2v+1 on the right. Leaf j
// (1..leaves) carries side 2j-1 on its front and side 2j on its back, so
// turning leaf j over takes you from view j-1 to view j. The fixed left board
// shows side 0 and the fixed right board shows the last right-hand side.

export function viewOfSide(side: number): number {
  return Math.floor(side / 2);
}

export function leafSides(leaf: number): { front: number; back: number } {
  return { front: 2 * leaf - 1, back: 2 * leaf };
}

export const LEFT_BOARD_SIDE = 0;

export function rightBoardSide(catalog: Catalog): number {
  return 2 * catalog.views - 1;
}

export function visibleSides(view: number): [number, number] {
  return [2 * view, 2 * view + 1];
}

/** Map an unbounded dial position onto a view, wrapping both ways. */
export function wrapView(step: number, views: number): number {
  return ((step % views) + views) % views;
}

// --- Page geometry, in page fractions (x right, y down from the top) -------

/** Page height as a multiple of page width. */
export const PAGE_ASPECT = 1.7;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HEADER_RECT: Rect = { x: 0.06, y: 0.03, w: 0.88, h: 0.1 };

const STRIPS_TOP = 0.155;
const STRIPS_BOTTOM = 0.975;
const STRIP_GAP = 0.012;

export function stripRect(slot: number, perPage: number): Rect {
  const h = (STRIPS_BOTTOM - STRIPS_TOP - (perPage - 1) * STRIP_GAP) / perPage;
  return { x: 0.06, y: STRIPS_TOP + slot * (h + STRIP_GAP), w: 0.88, h };
}

/** The strip slot under a point on the page, or null for the margins. */
export function hitStrip(x: number, y: number, perPage: number): number | null {
  for (let slot = 0; slot < perPage; slot++) {
    const r = stripRect(slot, perPage);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return slot;
  }
  return null;
}

// --- Keypad: press a page letter, then a strip number -----------------------

export interface KeyResult {
  buffer: string;
  /** Side whose letter was just completed; the rack turns to show it. */
  side?: number;
  /** The selection, once letter and number are both in. */
  entry?: CatalogEntry;
  /** The key didn't make a valid selection; the buffer was reset. */
  rejected?: boolean;
}

export function pressKey(catalog: Catalog, buffer: string, rawKey: string): KeyResult {
  const key = rawKey.toUpperCase();
  if (/^[A-Z]$/.test(key)) {
    const extended = /^[A-Z]+$/.test(buffer) ? buffer + key : key;
    for (const candidate of [extended, key]) {
      const exact = catalog.sides.find((s) => s.letter === candidate);
      if (exact) return { buffer: candidate, side: exact.index };
      if (catalog.sides.some((s) => s.letter.startsWith(candidate))) return { buffer: candidate };
    }
    return { buffer: '', rejected: true };
  }
  if (/^[0-9]$/.test(key)) {
    const side = catalog.sides.find((s) => s.letter === buffer);
    const slot = key === '0' ? 9 : Number(key) - 1;
    const entry = side?.entries[slot];
    if (entry) return { buffer: '', entry };
    return { buffer: '', rejected: true };
  }
  return { buffer };
}
