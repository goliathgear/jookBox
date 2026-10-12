import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  hitStrip,
  leafSides,
  pageLetter,
  pressKey,
  rightBoardSide,
  slotKey,
  stripRect,
  visibleSides,
  viewOfSide,
  wrapView,
} from '../shared/catalog.ts';
import { shade, themeFor, THEMES } from '../shared/themes.ts';
import type { JukeboxGroup } from '../shared/types.ts';

const group = (name: string, count: number): JukeboxGroup => ({
  name,
  kind: 'services',
  theme: 'classic',
  items: Array.from({ length: count }, (_, i) => ({ name: `${name} ${i + 1}`, href: `https://${i}.example.com` })),
});

const catalogOf = (counts: number[], stripsPerPage = 5) =>
  buildCatalog({
    groups: counts.map((n, i) => group(`G${i}`, n)),
    settings: { stripsPerPage } as never,
  });

describe('buildCatalog', () => {
  it('starts every group on a new page and splits long groups', () => {
    const catalog = catalogOf([7, 1, 6]);
    expect(catalog.sides.map((s) => [s.letter, s.group.name, s.part, s.parts, s.entries.length])).toEqual([
      ['A', 'G0', 1, 2, 5],
      ['B', 'G0', 2, 2, 2],
      ['C', 'G1', 1, 1, 1],
      ['D', 'G2', 1, 2, 5],
      ['E', 'G2', 2, 2, 1],
    ]);
    expect(catalog.views).toBe(3);
    expect(catalog.leaves).toBe(2);
  });

  it('numbers selections by page letter and strip', () => {
    const catalog = catalogOf([7]);
    expect(catalog.entries.map((e) => e.code)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2']);
    expect(catalog.entries[6]).toMatchObject({ name: 'G0 7', side: 1, slot: 1, group: 'G0' });
  });

  it('skips empty groups and still has one view when empty', () => {
    expect(catalogOf([0, 2]).sides.map((s) => s.group.name)).toEqual(['G1']);
    const empty = catalogOf([]);
    expect(empty.sides).toEqual([]);
    expect(empty.views).toBe(1);
    expect(empty.leaves).toBe(0);
  });

  it('clamps strips per page', () => {
    expect(catalogOf([1], 1).stripsPerPage).toBe(3);
    expect(catalogOf([1], 99).stripsPerPage).toBe(10);
  });
});

describe('page letters', () => {
  it('skips I and O like a Seeburg keypad', () => {
    const letters = Array.from({ length: 24 }, (_, i) => pageLetter(i)).join('');
    expect(letters).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ');
    expect(pageLetter(24)).toBe('AA');
    expect(pageLetter(25)).toBe('AB');
  });

  it('labels the tenth strip key 0', () => {
    expect([0, 8, 9].map(slotKey)).toEqual(['1', '9', '0']);
  });
});

describe('book layout', () => {
  it('shows each side exactly once across the views', () => {
    const catalog = catalogOf([5, 5, 5, 5, 5]); // 5 sides, 3 views
    const shown: number[] = [];
    for (let v = 0; v < catalog.views; v++) shown.push(...visibleSides(v));
    expect(shown).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rightBoardSide(catalog)).toBe(5);
  });

  it('puts the sides of leaf j on views j-1 (front) and j (back)', () => {
    for (let leaf = 1; leaf <= 4; leaf++) {
      const { front, back } = leafSides(leaf);
      expect(viewOfSide(front)).toBe(leaf - 1);
      expect(front % 2).toBe(1);
      expect(viewOfSide(back)).toBe(leaf);
      expect(back % 2).toBe(0);
    }
  });

  it('wraps dial steps onto views both ways', () => {
    expect([0, 3, 4, -1, -5, 9].map((s) => wrapView(s, 4))).toEqual([0, 3, 0, 3, 3, 1]);
  });
});

describe('strip geometry', () => {
  it.each([3, 5, 8, 10])('lays %i strips inside the page without overlap', (n) => {
    let previousBottom = 0;
    for (let slot = 0; slot < n; slot++) {
      const r = stripRect(slot, n);
      expect(r.y).toBeGreaterThan(previousBottom);
      previousBottom = r.y + r.h;
    }
    expect(previousBottom).toBeLessThanOrEqual(1);
  });

  it('hit-tests the middle of each strip and misses the margins', () => {
    for (let slot = 0; slot < 5; slot++) {
      const r = stripRect(slot, 5);
      expect(hitStrip(r.x + r.w / 2, r.y + r.h / 2, 5)).toBe(slot);
    }
    expect(hitStrip(0.5, 0.05, 5)).toBeNull();
    expect(hitStrip(0.01, 0.5, 5)).toBeNull();
  });
});

describe('pressKey', () => {
  const catalog = catalogOf([7, 1, 6]);

  it('selects with a letter then a number', () => {
    const first = pressKey(catalog, '', 'b');
    expect(first).toEqual({ buffer: 'B', side: 1 });
    const second = pressKey(catalog, first.buffer, '2');
    expect(second.buffer).toBe('');
    expect(second.entry?.code).toBe('B2');
  });

  it('starts over when a new letter replaces the old one', () => {
    expect(pressKey(catalog, 'A', 'D')).toEqual({ buffer: 'D', side: 3 });
  });

  it('rejects numbers without a page or past the last strip', () => {
    expect(pressKey(catalog, '', '1')).toEqual({ buffer: '', rejected: true });
    expect(pressKey(catalog, 'C', '2')).toEqual({ buffer: '', rejected: true });
    expect(pressKey(catalog, '', 'Z')).toEqual({ buffer: '', rejected: true });
  });

  it('uses 0 for strip ten', () => {
    const big = catalogOf([10], 10);
    expect(pressKey(big, 'A', '0').entry?.code).toBe('A10');
  });

  it('builds two-letter page codes', () => {
    const many = catalogOf(Array.from({ length: 26 }, () => 1));
    expect(pressKey(many, '', 'A')).toEqual({ buffer: 'A', side: 0 });
    expect(pressKey(many, 'A', 'B')).toEqual({ buffer: 'AB', side: 25 });
    expect(pressKey(many, 'AB', '1').entry?.code).toBe('AB1');
  });

  it('ignores other keys', () => {
    expect(pressKey(catalog, 'A', 'Shift')).toEqual({ buffer: 'A' });
  });
});

describe('themes', () => {
  it('falls back to classic and applies a colour override', () => {
    expect(themeFor('nope')).toBe(THEMES.classic);
    const aws = themeFor('classic', '#ff9900');
    expect(aws.paper).toBe('#ff9900');
    expect(aws.holder).not.toBe(THEMES.classic!.holder);
  });

  it('shades colours', () => {
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('not-a-colour', 0.5)).toBe('not-a-colour');
  });
});
