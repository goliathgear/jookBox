// Cabinet dimensions in world units, modelled on the Seeburg Wall-O-Matic 100
// (3W1-100). The title rack's spine is the origin: x right, y up, z out of
// the wall toward the viewer.

import { PAGE_ASPECT } from '../../shared/catalog.ts';

export const PAGE_W = 1;
export const PAGE_H = PAGE_W * PAGE_ASPECT;

// The bow-front window: a page swings through a half circle in front of the
// spine, so the glass is a half cylinder a little wider than a page.
export const WIN_R = PAGE_W + 0.1;
export const WIN_TOP = PAGE_H / 2 + 0.1;
/** Extra glass below the pages for the script logo, as on the Seeburg. */
export const WIN_BOTTOM = -PAGE_H / 2 - 0.3;
export const WIN_H = WIN_TOP - WIN_BOTTOM;
export const WIN_CY = (WIN_TOP + WIN_BOTTOM) / 2;

/** Chrome hood over the window, and the coin head that sits on it. */
export const HOOD_T = 0.24;
export const HOOD_R = WIN_R + 0.16;
export const COIN_W = 1.5;
export const COIN_H = 0.5;
export const COIN_D = 0.8;

/** Bumper ledge under the window. */
export const BUMPER_T = 0.3;
export const BUMPER_R = WIN_R + 0.2;

/** Key tray under the bumper. */
export const TRAY_W = 2.5;
export const TRAY_H = 0.66;
export const TRAY_Y = WIN_BOTTOM - BUMPER_T - 0.06 - TRAY_H / 2;
export const TRAY_Z = 0.42;

/** The rounded side pods either side of the window. */
export const LOBE_W = 0.95;
export const LOBE_D = 1.3;
export const LOBE_FRONT = 0.38;
export const LOBE_X = WIN_R + LOBE_W / 2 - 0.06;

export const CAB_TOP = WIN_TOP + HOOD_T + COIN_H - 0.05;
export const CAB_BOTTOM = TRAY_Y - TRAY_H / 2 - 0.16;
export const CAB_W = 2 * (LOBE_X + LOBE_W / 2);
export const CAB_H = CAB_TOP - CAB_BOTTOM;
/** The wall the box hangs on. */
export const WALL_Z = LOBE_FRONT - LOBE_D;

/** The booth table the box sits on, running out from the window wall. */
export const TABLE_Y = CAB_BOTTOM;
export const TABLE_W = 13;
export const TABLE_FRONT = 10;
/** The window behind the box: sill, mullions and where the blinds stop. */
export const SILL_Y = TABLE_Y + 0.9;
export const WINDOW_TOP = 5.5;
export const WINDOW_HALF = 12;
export const MULLION_X = 7;
export const BLINDS_BOTTOM = 2.05;
/**
 * The parking lot outside. It's a scaled-down diorama rather than life size
 * (a car is 10 units long), set where the sill doesn't hide the cars.
 */
export const GROUND_Y = TABLE_Y - 2;

/** Resting depth of the top page on each side, and spacing in the stack. */
export const LEAF_Z = 0.06;
export const LEAF_GAP = 0.004;

/** What the camera frames: the whole wallbox, or just the title rack. */
export const FRAMES = {
  // A little table and window round the box, so the scene reads.
  cabinet: { cx: 0, cy: (CAB_TOP + CAB_BOTTOM) / 2 - 0.12, w: CAB_W + 0.2, h: CAB_H + 0.45 },
  rack: { cx: 0, cy: 0.04, w: 2 * WIN_R + 0.2, h: PAGE_H + 0.5 },
};
