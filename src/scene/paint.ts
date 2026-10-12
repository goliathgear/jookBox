// 2D canvas painting for everything with lettering: title pages, keypad
// caps, the nameplate and the panel print. Canvas text is sharper and far
// more flexible than 3D text, and the result is used as a texture.

import { HEADER_RECT, PAGE_ASPECT, stripRect, type CatalogEntry, type PageSide, type Rect } from '../../shared/catalog.ts';
import { shade, themeFor, type PageTheme } from '../../shared/themes.ts';

export const FONTS = {
  title: '"Oswald", "Arial Narrow", sans-serif',
  small: '"Roboto Condensed", "Arial Narrow", sans-serif',
  script: '"Lobster", "Brush Script MT", cursive',
};

export async function loadFonts() {
  const faces = [
    `500 32px ${FONTS.title}`,
    `600 32px ${FONTS.title}`,
    `700 32px ${FONTS.title}`,
    `400 32px ${FONTS.small}`,
    `italic 400 32px ${FONTS.small}`,
    `italic 700 32px ${FONTS.small}`,
    `700 32px ${FONTS.small}`,
    `400 32px ${FONTS.script}`,
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => [])));
}

export const PAGE_PX_W = 768;
export const PAGE_PX_H = Math.round(PAGE_PX_W * PAGE_ASPECT);

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

type Ctx = CanvasRenderingContext2D;

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws text centred on (x, y), shrinking it to fit maxWidth, then eliding. */
function fitText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: (size: number) => string,
  minScale = 0.62,
) {
  let s = size;
  ctx.font = font(s);
  while (ctx.measureText(text).width > maxWidth && s > size * minScale) {
    s -= 1;
    ctx.font = font(s);
  }
  let out = text;
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    out = `${out.trimEnd()}…`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(out, x, y);
}

function px(r: Rect): Rect {
  return { x: r.x * PAGE_PX_W, y: r.y * PAGE_PX_H, w: r.w * PAGE_PX_W, h: r.h * PAGE_PX_H };
}

export interface PageArt {
  perPage: number;
  icons: boolean;
  title: string;
  images: Map<string, HTMLImageElement>;
}

/** Paints one page side; `side` null is an empty page past the last group. */
export function paintPage(ctx: Ctx, side: PageSide | null, art: PageArt) {
  const theme = side ? themeFor(side.group.theme, side.group.color) : themeFor('classic');
  const W = PAGE_PX_W;
  const H = PAGE_PX_H;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = theme.holder;
  ctx.fillRect(0, 0, W, H);

  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, shade(theme.paper, 0.1));
  paper.addColorStop(1, shade(theme.paper, -0.18));
  ctx.fillStyle = paper;
  rrect(ctx, 14, 14, W - 28, H - 28, 26);
  ctx.fill();

  // Fine vertical pinstripes, like pressed card stock.
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#000';
  for (let x = 20; x < W; x += 9) ctx.fillRect(x, 0, 2, H);
  ctx.restore();

  if (!side) {
    paintEmptyPage(ctx, theme, art.title);
    return;
  }
  paintHeader(ctx, side, theme, art);
  for (let slot = 0; slot < art.perPage; slot++) {
    const r = px(stripRect(slot, art.perPage));
    const entry = side.entries[slot];
    if (entry) paintStrip(ctx, r, entry, theme, art);
    else paintBlankStrip(ctx, r, theme);
  }
}

function paintHeader(ctx: Ctx, side: PageSide, theme: PageTheme, art: PageArt) {
  const r = px(HEADER_RECT);
  const grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  grad.addColorStop(0, shade(theme.header, 0.25));
  grad.addColorStop(0.5, theme.header);
  grad.addColorStop(1, shade(theme.header, -0.18));
  ctx.fillStyle = grad;
  rrect(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = shade(theme.header, -0.45);
  ctx.stroke();

  const d = r.h * 0.78;
  const cy = r.y + r.h / 2;
  const leftX = r.x + r.h / 2;
  const rightX = r.x + r.w - r.h / 2;

  // Page letter medallion.
  ctx.fillStyle = theme.holder;
  ctx.beginPath();
  ctx.arc(leftX, cy, d / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.header;
  fitText(ctx, side.letter, leftX, cy + 2, d * 0.8, d * 0.62, (s) => `700 ${s}px ${FONTS.title}`);

  // Right medallion: the group's icon (cloud provider logos in phase 2),
  // else the page count for split groups, else a star.
  const icon = side.group.icon ? art.images.get(side.group.icon) : undefined;
  ctx.fillStyle = shade(theme.header, 0.5);
  ctx.beginPath();
  ctx.arc(rightX, cy, d / 2, 0, Math.PI * 2);
  ctx.fill();
  if (icon) {
    drawContained(ctx, icon, rightX - d * 0.34, cy - d * 0.34, d * 0.68, d * 0.68);
  } else {
    ctx.fillStyle = theme.headerInk;
    const mark = side.parts > 1 ? `${side.part}/${side.parts}` : '★';
    fitText(ctx, mark, rightX, cy + 2, d * 0.8, d * 0.42, (s) => `700 ${s}px ${FONTS.title}`);
  }

  ctx.fillStyle = theme.headerInk;
  fitText(
    ctx,
    side.group.name.toUpperCase(),
    r.x + r.w / 2,
    cy + 3,
    r.w - r.h * 2.3,
    r.h * 0.56,
    (s) => `700 ${s}px ${FONTS.title}`,
    // Shrink a long group name (VMAAS DESTROY PIPELINES) well before cutting it short.
    0.36,
  );
}

function paintStrip(ctx: Ctx, r: Rect, entry: CatalogEntry, theme: PageTheme, art: PageArt) {
  // Card with a soft drop shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = theme.strip;
  rrect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.restore();
  const sheen = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.5)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(120,90,40,0.12)');
  ctx.fillStyle = sheen;
  rrect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.stripEdge;
  ctx.stroke();

  const h = r.h;
  const pad = h * 0.09;
  const badge = Math.min(h * 0.5, r.w * 0.13);
  const badgeX = r.x + pad;
  const cy = r.y + h / 2;

  // Selection code badge on the left.
  ctx.fillStyle = theme.holder;
  rrect(ctx, badgeX, cy - badge / 2, badge, badge, badge * 0.22);
  ctx.fill();
  ctx.fillStyle = theme.strip;
  fitText(ctx, entry.code, badgeX + badge / 2, cy + 1, badge * 0.86, badge * 0.46, (s) => `700 ${s}px ${FONTS.title}`);

  // Service icon on the right.
  const img = art.icons && entry.icon ? art.images.get(entry.icon) : undefined;
  const iconBox = badge;
  const iconX = r.x + r.w - pad - iconBox;
  if (img) drawContained(ctx, img, iconX, cy - iconBox / 2, iconBox, iconBox);

  const left = badgeX + badge + pad;
  const right = iconX - pad;
  const mid = (left + right) / 2;
  const width = right - left;

  // Title on top and the artist ribbon below it; with an album the ribbon
  // moves to the middle and the album takes the bottom line.
  const album = Boolean(entry.album);
  ctx.fillStyle = theme.ink;
  fitText(
    ctx,
    entry.name.toUpperCase(),
    mid,
    r.y + h * (album ? 0.215 : 0.3),
    width,
    h * (album ? 0.26 : 0.34),
    (s) => `700 ${s}px ${FONTS.title}`,
  );

  // The artist ribbon: a band with notched ends.
  const bandTop = r.y + h * (album ? 0.39 : 0.56);
  const bandH = entry.artist ? h * (album ? 0.25 : 0.3) : h * 0.06;
  const notch = bandH * 0.45;
  ctx.fillStyle = theme.band;
  ctx.beginPath();
  ctx.moveTo(left - pad * 0.4, bandTop);
  ctx.lineTo(right + pad * 0.4, bandTop);
  ctx.lineTo(right + pad * 0.4 - notch, bandTop + bandH / 2);
  ctx.lineTo(right + pad * 0.4, bandTop + bandH);
  ctx.lineTo(left - pad * 0.4, bandTop + bandH);
  ctx.lineTo(left - pad * 0.4 + notch, bandTop + bandH / 2);
  ctx.closePath();
  ctx.fill();
  if (entry.artist) {
    ctx.fillStyle = theme.bandInk;
    fitText(
      ctx,
      entry.artist.toUpperCase(),
      mid,
      bandTop + bandH / 2 + 1,
      width - notch * 2.2,
      bandH * 0.68,
      (s) => `500 ${s}px ${FONTS.title}`,
      0.55,
    );
  }

  if (entry.album) {
    // Full ink and bold, like the title: thin grey italic faded into the card.
    ctx.fillStyle = theme.ink;
    fitText(ctx, entry.album!, mid, r.y + h * 0.82, width, h * 0.16, (s) => `italic 700 ${s}px ${FONTS.small}`);
  }
}

function paintBlankStrip(ctx: Ctx, r: Rect, theme: PageTheme) {
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = theme.strip;
  rrect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.rule;
  ctx.lineWidth = 2;
  for (const f of [0.36, 0.64]) {
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.1, r.y + r.h * f);
    ctx.lineTo(r.x + r.w * 0.9, r.y + r.h * f);
    ctx.stroke();
  }
}

function paintEmptyPage(ctx: Ctx, theme: PageTheme, title: string) {
  const W = PAGE_PX_W;
  const H = PAGE_PX_H;
  ctx.fillStyle = theme.header;
  fitText(ctx, title, W / 2, H * 0.45, W * 0.8, 120, (s) => `400 ${s}px ${FONTS.script}`, 0.4);
  ctx.fillStyle = shade(theme.header, -0.1);
  fitText(ctx, '·  MORE HITS COMING SOON  ·', W / 2, H * 0.55, W * 0.75, 34, (s) => `600 ${s}px ${FONTS.title}`);
}

function drawContained(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || w;
  const ih = img.naturalHeight || h;
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  try {
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } catch {
    // A broken image just leaves the slot empty.
  }
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// --- Cabinet artwork ---------------------------------------------------------

/** A key's face: black lettering on a transparent background. */
export function paintKeyCap(label: string, lit: boolean) {
  const { canvas, ctx } = makeCanvas(128, 144);
  ctx.fillStyle = lit ? '#7a0d14' : '#15110e';
  fitText(ctx, label, 64, 76, 112, label.length > 1 ? 70 : 96, (s) => `700 ${s}px ${FONTS.title}`);
  return canvas;
}

/**
 * Red script painted on the lower glass, like the "Seeburg 100 Wall-o-matic"
 * logo. Wrapped round the bow-front window, so it's wide and short.
 */
export function paintGlassLogo(title: string) {
  const { canvas, ctx } = makeCanvas(2048, 256);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#d4202b';
  // As big as the band allows, with a little headroom for the script's ascenders.
  fitText(ctx, title, 1024, 134, 1800, 192, (s) => `400 ${s}px ${FONTS.script}`, 0.4);
  return canvas;
}

/** Soft glowing rounded frame for the hovered strip. */
export function paintGlowFrame() {
  const { canvas, ctx } = makeCanvas(512, 160);
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  rrect(ctx, 22, 22, 468, 116, 18);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  return canvas;
}

/** Radial falloff used for the wall shadow and neon wash. */
export function paintRadial(inner: string, outer: string) {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return canvas;
}
