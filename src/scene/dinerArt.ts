// Canvas artwork for the diner and the parking lot outside: Formica, the
// stainless trim from the front of the diner, vinyl, asphalt and the sky.

import { FONTS, makeCanvas } from './paint.ts';

/** Seeded random, so the patterns come out the same on every load. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Fifties boomerang Formica: a dense scatter of small, thin, muted
 * boomerangs on a speckled cream ground. Tiles seamlessly.
 */
export function paintFormica() {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#ece4d0';
  ctx.fillRect(0, 0, size, size);
  const rand = seeded(7);
  // Ground speckle, like the real laminate's flecks.
  for (let i = 0; i < 3200; i++) {
    const v = 180 + Math.floor(rand() * 60);
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 24},${0.25 + rand() * 0.4})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand(), 1 + rand());
  }
  const colours = ['#8fb7b1', '#c9908a', '#c5ad72', '#9a9ea6', '#7f9f9b', '#b89a93', '#d6c7a8'];
  const boomerang = (x: number, y: number, angle: number, scale: number, colour: string) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.moveTo(-30, 8);
        ctx.quadraticCurveTo(0, -22, 30, 8);
        ctx.lineTo(24, 12);
        ctx.quadraticCurveTo(0, -10, -24, 12);
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();
      }
    }
  };
  for (let i = 0; i < 90; i++) {
    boomerang(rand() * size, rand() * size, rand() * Math.PI * 2, 0.45 + rand() * 0.5, colours[i % colours.length]!);
  }
  return canvas;
}

/** Ribbed aluminium edging for the table. */
export function paintRibbedEdge() {
  const { canvas, ctx } = makeCanvas(64, 64);
  for (let y = 0; y < 64; y += 8) {
    const g = ctx.createLinearGradient(0, y, 0, y + 8);
    g.addColorStop(0, '#f4f6f8');
    g.addColorStop(0.5, '#9aa1a9');
    g.addColorStop(1, '#e4e8ec');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 64, 8);
  }
  return canvas;
}

/**
 * The trim off the front of the diner: stainless with green stripes and a
 * row of red diamonds. Tiles horizontally.
 */
export function paintDinerTrim() {
  const W = 1024;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const steel = ctx.createLinearGradient(0, 0, 0, H);
  steel.addColorStop(0, '#eef1f4');
  steel.addColorStop(0.5, '#b9c0c8');
  steel.addColorStop(1, '#e6eaee');
  ctx.fillStyle = steel;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = '#2f9a4e';
  ctx.fillRect(0, H * 0.1, W, H * 0.08);
  ctx.fillRect(0, H * 0.82, W, H * 0.08);
  ctx.fillStyle = '#d63a2c';
  const count = 4;
  const dw = W / count;
  for (let i = 0; i < count; i++) {
    const cx = dw * (i + 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - dw * 0.47, H * 0.5);
    ctx.lineTo(cx, H * 0.28);
    ctx.lineTo(cx + dw * 0.47, H * 0.5);
    ctx.lineTo(cx, H * 0.72);
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

/** Plain brushed stainless panelling. */
export function paintStainless() {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#dfe4e9');
  g.addColorStop(1, '#b4bcc5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const rand = seeded(3);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.2})`;
    ctx.fillRect(0, rand() * 256, 256, 1);
  }
  return canvas;
}

/** Tufted red booth vinyl. */
export function paintVinyl() {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#a3161f';
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 64) {
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.9, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 64, 256);
  }
  return canvas;
}

/** Faint diagonal light streaks on window glass. */
export function paintGlassStreaks() {
  const { canvas, ctx } = makeCanvas(1024, 512);
  for (const [x, w, a] of [
    [180, 90, 0.5],
    [300, 30, 0.35],
    [700, 140, 0.4],
    [860, 40, 0.3],
  ] as const) {
    ctx.save();
    ctx.translate(x, 256);
    ctx.rotate(-0.5);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, -600, w, 1200);
    ctx.restore();
  }
  return canvas;
}

/** Distant hills and a tree line on a transparent strip, for the horizon. */
export function paintHorizon() {
  const W = 2048;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  const rand = seeded(19);
  const hills = (base: number, amp: number, colour: string, seed: number) => {
    const r = seeded(seed);
    const phases = [r() * 6, r() * 6, r() * 6];
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = x / W;
      const y =
        base -
        amp *
          (0.55 * Math.sin(t * 7 + phases[0]!) + 0.3 * Math.sin(t * 17 + phases[1]!) + 0.15 * Math.sin(t * 41 + phases[2]!));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };
  hills(H * 0.5, 70, '#9fb4c2', 23);
  hills(H * 0.64, 46, '#7d9a8e', 29);
  // A ragged tree line.
  for (let x = 0; x < W; x += 5) {
    const h = 26 + rand() * 40;
    ctx.fillStyle = ['#44633f', '#4c6d46', '#3d5a3a'][Math.floor(rand() * 3)]!;
    ctx.beginPath();
    ctx.arc(x, H * 0.84 - h * 0.4, h * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#44633f';
  ctx.fillRect(0, H * 0.84, W, H * 0.16);
  return canvas;
}

/** One soft cumulus puff on a transparent square, for billboard clouds. */
export function paintCloud(seed: number) {
  const size = 512;
  const { canvas, ctx } = makeCanvas(size, size);
  const rand = seeded(seed);
  const puffs = 14 + Math.floor(rand() * 8);
  for (let p = 0; p < puffs; p++) {
    const x = size * (0.25 + rand() * 0.5);
    const y = size * (0.42 + rand() * 0.25) - (p / puffs) * size * 0.1;
    const r = size * (0.08 + rand() * 0.14);
    const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(246,248,252,0.7)');
    g.addColorStop(0.85, 'rgba(214,222,232,0.25)');
    g.addColorStop(1, 'rgba(200,210,224,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // Flat, shaded underside.
  const base = ctx.createLinearGradient(0, size * 0.55, 0, size * 0.75);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(90,100,120,0.35)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** The roadside sign: the owner's name small in the corner, DINER big. */
export function paintDinerSign(owner: string) {
  const { canvas, ctx } = makeCanvas(1024, 400);
  ctx.fillStyle = '#f6efdc';
  ctx.beginPath();
  ctx.roundRect(8, 8, 1008, 384, 48);
  ctx.fill();
  ctx.lineWidth = 22;
  ctx.strokeStyle = '#2f9a4e';
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#d63a2c';
  ctx.beginPath();
  ctx.roundRect(40, 40, 944, 320, 32);
  ctx.stroke();
  ctx.shadowColor = '#ff3b30';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#d4202b';
  ctx.textBaseline = 'middle';
  if (owner) {
    ctx.font = `400 170px ${FONTS.script}`;
    ctx.textAlign = 'left';
    ctx.fillText(owner, 80, 108);
  }
  ctx.font = `400 ${owner ? 225 : 230}px ${FONTS.script}`;
  ctx.textAlign = 'center';
  ctx.fillText('Diner', owner ? 595 : 512, owner ? 266 : 210);
  return canvas;
}

/** Wood-grain panel for the station wagon's sides. */
export function paintWoodGrain() {
  const { canvas, ctx } = makeCanvas(512, 128);
  ctx.fillStyle = '#9a6234';
  ctx.fillRect(0, 0, 512, 128);
  const rand = seeded(31);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${60 + rand() * 40},${30 + rand() * 20},10,${0.25 + rand() * 0.3})`;
    ctx.lineWidth = 1 + rand() * 2;
    const y = rand() * 128;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
    ctx.stroke();
  }
  return canvas;
}

/** A ketchup bottle's paper label. */
/** A fifties licence plate: embossed dark green on cream, with the year across the top. */
export function paintPlate(text: string) {
  const { canvas, ctx } = makeCanvas(256, 128);
  ctx.fillStyle = '#ece3c4';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1e4b2f';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#1e4b2f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 16px ${FONTS.small}`;
  ctx.fillText('HOMELAB · 1957', 128, 24);
  // A hint of the embossing: a pale offset under the characters.
  ctx.font = `700 62px ${FONTS.title}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(text, 129, 77);
  ctx.fillStyle = '#1e4b2f';
  ctx.fillText(text, 127, 75);
  return canvas;
}

export function paintKetchupLabel() {
  const { canvas, ctx } = makeCanvas(256, 160);
  ctx.fillStyle = '#f4ead6';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#b8151b';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 140);
  ctx.fillStyle = '#b8151b';
  ctx.beginPath();
  ctx.ellipse(128, 52, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3d8a3a';
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(128, 36);
    ctx.rotate((i / 5) * Math.PI * 2);
    ctx.fillRect(-2, -10, 4, 10);
    ctx.restore();
  }
  ctx.fillStyle = '#b8151b';
  ctx.font = `700 40px ${FONTS.title}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KETCHUP', 128, 104);
  ctx.fillStyle = '#5a4a3a';
  ctx.font = `400 14px ${FONTS.small}`;
  ctx.fillText('TOMATO', 128, 132);
  return canvas;
}
