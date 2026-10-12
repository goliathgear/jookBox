import { create } from 'zustand';
import {
  buildCatalog,
  pressKey,
  viewOfSide,
  wrapView,
  type Catalog,
  type CatalogEntry,
} from '../shared/catalog.ts';
import type { JukeboxConfig } from '../shared/types.ts';
import { setSoundEnabled, sfx } from './audio/sfx.ts';
import { openItem } from './launch.ts';

const MUTE_KEY = 'jookbox:muted';
const EFFECTS_KEY = 'jookbox:effects';

export type Notice = { kind: 'playing' | 'rejected'; text: string; entry?: CatalogEntry; at: number };

interface State {
  config: JukeboxConfig | null;
  catalog: Catalog | null;
  /** Pages turned, in whole steps; unbounded so turning can wrap round. */
  step: number;
  /** The spread on show, 0..views-1. */
  view: number;
  hovered: CatalogEntry | null;
  /** Keypad letters pressed so far, waiting for a number. */
  buffer: string;
  /** Strip to flash after a selection. */
  flash: { code: string; at: number } | null;
  notice: Notice | null;
  listOpen: boolean;
  helpOpen: boolean;
  zoomed: boolean;
  muted: boolean;
  /** Post-processing (depth of field, bloom, grain); off draws faster on slow machines. */
  effects: boolean;

  setConfig(config: JukeboxConfig): void;
  turn(delta: number): void;
  goToView(view: number): void;
  settleTurn(target: number): void;
  press(key: string): void;
  launch(entry: CatalogEntry): void;
  setHovered(entry: CatalogEntry | null): void;
  clearBuffer(): void;
  toggle(key: 'listOpen' | 'helpOpen' | 'zoomed' | 'muted' | 'effects'): void;
}

function savedMute(): boolean | null {
  try {
    const v = localStorage.getItem(MUTE_KEY);
    return v === null ? null : v === 'true';
  } catch {
    return null;
  }
}

/** ?fx=off or ?fx=on for this visit, else what this browser chose last, else on. */
function initialEffects(): boolean {
  const fx = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fx') : null;
  if (fx === 'off' || fx === 'on') return fx === 'on';
  try {
    return localStorage.getItem(EFFECTS_KEY) !== 'false';
  } catch {
    return true;
  }
}

function remember(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private windows can refuse storage; the toggle still works this visit.
  }
}

export const useJukebox = create<State>()((set, get) => ({
  config: null,
  catalog: null,
  step: 0,
  view: 0,
  hovered: null,
  buffer: '',
  flash: null,
  notice: null,
  listOpen: false,
  helpOpen: false,
  // The camera opens on the whole booth and pushes in to the pages.
  zoomed: true,
  muted: false,
  effects: initialEffects(),

  setConfig(config) {
    const first = get().config === null;
    const catalog = buildCatalog(config);
    const view = Math.min(get().view, catalog.views - 1);
    const muted = first ? (savedMute() ?? !config.settings.sound) : get().muted;
    setSoundEnabled(!muted);
    set({ config, catalog, view, step: view, muted, hovered: null, buffer: '' });
  },

  turn(delta) {
    const { catalog, config, step, view } = get();
    if (!catalog || !config) return;
    const wrap = config.settings.wrap;
    if (catalog.views === 1 || (!wrap && (view + delta < 0 || view + delta >= catalog.views))) {
      sfx.thunk();
      return;
    }
    set({ step: step + delta, view: wrapView(step + delta, catalog.views), hovered: null });
  },

  goToView(target) {
    const { catalog, step, view } = get();
    if (!catalog || target === view) return;
    set({ step: step + (target - view), view: target, hovered: null });
  },

  settleTurn(target) {
    const { catalog, config } = get();
    if (!catalog || !config) return;
    let step = Math.round(target);
    if (!config.settings.wrap) step = Math.min(catalog.views - 1, Math.max(0, step));
    set({ step, view: wrapView(step, catalog.views), hovered: null });
  },

  press(key) {
    const { catalog, buffer } = get();
    if (!catalog) return;
    const result = pressKey(catalog, buffer, key);
    sfx.click();
    set({ buffer: result.buffer });
    if (result.side !== undefined) get().goToView(viewOfSide(result.side));
    if (result.entry) get().launch(result.entry);
    if (result.rejected) {
      sfx.buzz();
      set({ notice: { kind: 'rejected', text: 'No such selection', at: Date.now() } });
    }
  },

  launch(entry) {
    const { config } = get();
    if (!config) return;
    openItem(entry, config.settings);
    sfx.bell();
    get().goToView(viewOfSide(entry.side));
    const now = Date.now();
    set({
      flash: { code: entry.code, at: now },
      notice: { kind: 'playing', text: entry.name, entry, at: now },
      buffer: '',
    });
  },

  setHovered(entry) {
    if (get().hovered?.code !== entry?.code) set({ hovered: entry });
  },

  clearBuffer() {
    set({ buffer: '' });
  },

  toggle(key) {
    const next = !get()[key];
    set({ [key]: next });
    if (key === 'muted') {
      setSoundEnabled(!next);
      remember(MUTE_KEY, next);
    }
    if (key === 'effects') remember(EFFECTS_KEY, next);
  },
}));
