// Procedural surface detail: value noise, height fields turned into normal
// maps, and the painted imperfections (smudges, scratches, wear) that stop
// materials looking like untouched plastic. Everything is generated on a
// canvas at load; nothing is downloaded.

import { seeded } from './dinerArt.ts';
import { makeCanvas } from './paint.ts';

// --- Noise -------------------------------------------------------------------

/** Tileable 2D value noise with `octaves` layers of detail, in 0..1. */
export function makeNoise(seed: number, period = 64) {
  const rand = seeded(seed);
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // Each octave wraps at its own whole-number frequency, so u and v in 0..1
  // always come back to where they started.
  const sample = (x: number, y: number, wrapX: number, wrapY: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const at = (ix: number, iy: number) => lattice[mod(iy, wrapY) * period + mod(ix, wrapX)]!;
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  /**
   * Fractal noise at (u, v) in 0..1, tiling at the unit square. `scaleV`
   * stretches the pattern: more cycles across v than along u, or fewer.
   */
  return (u: number, v: number, octaves = 4, scale = 4, gain = 0.5, scaleV = scale) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let freqU = scale;
    let freqV = scaleV;
    for (let o = 0; o < octaves; o++) {
      const nu = Math.min(period, Math.max(1, Math.round(freqU)));
      const nv = Math.min(period, Math.max(1, Math.round(freqV)));
      sum += amp * sample(u * nu, v * nv, nu, nv);
      norm += amp;
      amp *= gain;
      freqU *= 2;
      freqV *= 2;
    }
    return sum / norm;
  };
}

type Field = (u: number, v: number) => number;

/** Rasterise a 0..1 height field into a float array. */
export function heightField(size: number, field: Field): Float32Array {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = field(x / size, y / size);
  }
  return out;
}

/**
 * A tangent-space normal map from a tiling height field (OpenGL convention,
 * which is what three.js expects). `strength` is how steep the bumps are.
 */
export function heightToNormal(height: Float32Array, size: number, strength: number) {
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len + 1) / 2) * 255;
      img.data[i + 1] = ((dy / len + 1) / 2) * 255;
      img.data[i + 2] = ((1 / len + 1) / 2) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A greyscale canvas from a 0..1 field; three.js reads roughness from green. */
export function greyMap(size: number, field: Field) {
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(1, field(x / size, y / size))) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** A colour canvas from an RGB field (each 0..1). */
export function colourMap(size: number, field: (u: number, v: number) => [number, number, number]) {
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = field(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = b * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// --- Chrome and steel ----------------------------------------------------------

/**
 * Handled chrome: mostly mirror, with fingerprint smudges, a faint haze of
 * polish marks, and the odd fine scratch. Roughness map.
 */
export function paintChromeRoughness(seed = 41) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  const rand = seeded(seed + 1);
  const prints = Array.from({ length: 14 }, () => ({
    x: rand(),
    y: rand(),
    rx: 0.03 + rand() * 0.05,
    ry: 0.04 + rand() * 0.07,
    a: rand() * Math.PI,
    k: 0.5 + rand() * 0.5,
  }));
  const canvas = greyMap(size, (u, v) => {
    // Base: a near-mirror with gentle variation from polishing.
    let r = 0.02 + 0.035 * noise(u, v, 3, 3);
    for (const p of prints) {
      for (const [ox, oy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const dx = u - p.x + ox;
        const dy = v - p.y + oy;
        const lx = (dx * Math.cos(p.a) + dy * Math.sin(p.a)) / p.rx;
        const ly = (-dx * Math.sin(p.a) + dy * Math.cos(p.a)) / p.ry;
        const d = lx * lx + ly * ly;
        if (d < 1) {
          // Ridged fingerprint whorls inside a soft oval.
          const ridges = 0.5 + 0.5 * Math.sin(Math.sqrt(d) * 40 + noise(u * 3, v * 3, 2, 8) * 6);
          r += p.k * (1 - d) * (0.04 + 0.04 * ridges);
        }
      }
    }
    return clamp01(r);
  });
  // A few hairline scratches.
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(110,110,110,0.45)';
  for (let i = 0; i < 18; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const len = 20 + rand() * 90;
    ctx.lineWidth = 0.6 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return canvas;
}

/** Brushed stainless: fine horizontal grain. Roughness map. */
export function paintBrushedRoughness(seed = 43, base = 0.3) {
  const size = 512;
  const noise = makeNoise(seed, 64);
  return greyMap(size, (u, v) => {
    const grain = noise(u * 0.02, v * 1, 4, 16); // stretched along u
    const wide = noise(u, v, 2, 2);
    return clamp01(base + (grain - 0.5) * 0.4 + (wide - 0.5) * 0.15);
  });
}

/** Faint streak normal map for brushed metal. */
export function paintBrushedNormal(seed = 44) {
  const size = 256;
  const noise = makeNoise(seed, 64);
  const h = heightField(size, (u, v) => noise(u * 0.03, v, 3, 24));
  return heightToNormal(h, size, 1.2);
}

// --- Glass -------------------------------------------------------------------

/** Smudges and dust on glass: an alpha-ish grey map, mostly black. */
export function paintGlassGrime(seed = 47) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  const rand = seeded(seed + 2);
  const smudges = Array.from({ length: 9 }, () => ({ x: rand(), y: rand(), r: 0.06 + rand() * 0.12, k: 0.3 + rand() * 0.5 }));
  return greyMap(size, (u, v) => {
    let g = 0.03 * noise(u, v, 4, 6);
    for (const s of smudges) {
      const d = Math.hypot(u - s.x, v - s.y) / s.r;
      if (d < 1) g += s.k * (1 - d) * (1 - d) * (0.4 + 0.6 * noise(u * 2, v * 2, 3, 12));
    }
    return clamp01(g);
  });
}

// --- Table and booth -----------------------------------------------------------

/** Fine scratches and wear on a laminate top. Roughness map. */
export function paintLaminateRoughness(seed = 53) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  const rand = seeded(seed + 3);
  const canvas = greyMap(size, (u, v) => clamp01(0.3 + (noise(u, v, 3, 3) - 0.5) * 0.3 + (noise(u, v, 2, 24) - 0.5) * 0.1));
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const len = 10 + rand() * 60;
    ctx.strokeStyle = `rgba(200,200,200,${0.15 + rand() * 0.3})`;
    ctx.lineWidth = 0.5 + rand() * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return canvas;
}

/** Tufted vinyl: a diamond grid of buttons with pillowing between. */
export function paintVinylNormal() {
  const size = 512;
  const noise = makeNoise(59, 32);
  const h = heightField(size, (u, v) => {
    // Buttons on a staggered grid; distance to the nearest one.
    const cols = 4;
    const rows = 4;
    let best = 1;
    for (let r = 0; r <= rows; r++) {
      const offset = r % 2 ? 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        const bx = ((c + offset) / cols) % 1;
        const by = r / rows;
        let dx = Math.abs(u - bx);
        let dy = Math.abs(v - by);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        best = Math.min(best, Math.hypot(dx * cols, dy * rows));
      }
    }
    const pillow = Math.min(1, best * 1.6);
    const button = best < 0.08 ? (0.08 - best) * 2 : 0;
    return clamp01(pillow * pillow * 0.8 + button + noise(u, v, 3, 16) * 0.06);
  });
  return heightToNormal(h, size, 6);
}

export function paintVinylColour() {
  const size = 256;
  const noise = makeNoise(61, 32);
  return colourMap(size, (u, v) => {
    const n = noise(u, v, 4, 8);
    const k = 0.75 + n * 0.3;
    return [0.6 * k, 0.09 * k, 0.11 * k];
  });
}

// --- Outdoors ----------------------------------------------------------------

/** Weathered asphalt colour with pebbles, patches and oil stains. */
export function paintAsphaltColour(seed = 67) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  const rand = seeded(seed + 4);
  const stains = Array.from({ length: 5 }, () => ({ x: rand(), y: rand(), r: 0.05 + rand() * 0.1 }));
  const canvas = colourMap(size, (u, v) => {
    const pebbles = noise(u, v, 2, 64);
    const patches = noise(u, v, 3, 3);
    let g = 0.3 + (patches - 0.5) * 0.14 + (pebbles - 0.5) * 0.22;
    for (const s of stains) {
      const d = Math.hypot(u - s.x, v - s.y) / s.r;
      if (d < 1) g *= 0.55 + 0.45 * d;
    }
    const warm = 0.02 * patches;
    return [clamp01(g + warm), clamp01(g), clamp01(g - warm * 0.5)];
  });
  // Cracks: dark wandering lines.
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(20,20,22,0.7)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = rand() * size;
    let y = rand() * size;
    let a = rand() * Math.PI * 2;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 30; s++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * 8;
      y += Math.sin(a) * 8;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvas;
}

export function paintAsphaltNormal(seed = 68) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  const h = heightField(size, (u, v) => noise(u, v, 3, 64) * 0.7 + noise(u, v, 2, 6) * 0.3);
  return heightToNormal(h, size, 2.5);
}

/** Tree bark: deep vertical fissures. */
export function paintBark(seed = 71) {
  const size = 256;
  const noise = makeNoise(seed, 32);
  const h = heightField(size, (u, v) => {
    const fissures = noise(u * 1, v * 0.15, 4, 10);
    return fissures * 0.8 + noise(u, v, 2, 40) * 0.2;
  });
  const colour = colourMap(size, (u, v) => {
    const k = 0.35 + h[Math.floor(v * size) * size + Math.floor(u * size)]! * 0.5;
    return [0.33 * k, 0.24 * k, 0.17 * k];
  });
  return { colour, normal: heightToNormal(h, size, 4) };
}

/**
 * A cluster of leaves on a transparent card. Dozens of these, scattered
 * through a canopy, make a tree that holds up far better than blobs do.
 */
export function paintLeafCard(seed: number, tint: [number, number, number] = [0.3, 0.52, 0.22]) {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size, size);
  const rand = seeded(seed);
  const leaf = (x: number, y: number, len: number, angle: number, shade: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const [r, g, b] = tint.map((c) => Math.round(c * shade * 255));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.35, -len * 0.28, len * 0.75, -len * 0.22, len, 0);
    ctx.bezierCurveTo(len * 0.75, len * 0.22, len * 0.35, len * 0.28, 0, 0);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,0,0,0.25)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(len * 0.05, 0);
    ctx.lineTo(len * 0.9, 0);
    ctx.stroke();
    ctx.restore();
  };
  for (let i = 0; i < 22; i++) {
    const cx = size * (0.2 + rand() * 0.6);
    const cy = size * (0.2 + rand() * 0.6);
    leaf(cx, cy, 34 + rand() * 40, rand() * Math.PI * 2, 0.65 + rand() * 0.6);
  }
  return canvas;
}

/** Lawn with worn patches. */
export function paintGrass(seed = 79) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  return colourMap(size, (u, v) => {
    const blades = noise(u, v, 2, 90);
    const patches = noise(u, v, 3, 4);
    const dry = clamp01((patches - 0.55) * 3);
    const k = 0.7 + blades * 0.45;
    const green: [number, number, number] = [0.33 * k, 0.5 * k, 0.2 * k];
    const straw: [number, number, number] = [0.6 * k, 0.55 * k, 0.3 * k];
    return [green[0] + (straw[0] - green[0]) * dry, green[1] + (straw[1] - green[1]) * dry, green[2] + (straw[2] - green[2]) * dry];
  });
}

/** Concrete sidewalk with expansion joints. */
export function paintConcrete(seed = 83) {
  const size = 512;
  const noise = makeNoise(seed, 32);
  const canvas = colourMap(size, (u, v) => {
    const g = 0.62 + (noise(u, v, 3, 40) - 0.5) * 0.14 + (noise(u, v, 2, 3) - 0.5) * 0.1;
    return [g, g * 0.99, g * 0.95];
  });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(40,40,42,0.55)';
  ctx.fillRect(0, 0, 3, size);
  ctx.fillRect(size / 2, 0, 3, size);
  return canvas;
}

// --- Breakfast ---------------------------------------------------------------

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, k: number): RGB => [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Soft round dents scattered over a tiling square, read back as a 0..1
 * field (1 where nothing was drawn). Drawn with gradients rather than
 * evaluated per pixel, so hundreds of them cost nothing.
 */
function scatterDents(size: number, count: number, rand: () => number, radius: [number, number], depth: [number, number]) {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const r = radius[0] + rand() * (radius[1] - radius[0]);
    const x = rand() * size;
    const y = rand() * size;
    const k = depth[0] + rand() * (depth[1] - depth[0]);
    // Copies across the edges keep the field tileable.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const cx = x + ox;
        const cy = y + oy;
        if (cx < -r || cx > size + r || cy < -r || cy > size + r) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(0,0,0,${k})`);
        g.addColorStop(0.65, `rgba(0,0,0,${k * 0.6})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      }
    }
  }
  const data = ctx.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4]! / 255;
  return out;
}

/**
 * The top of a slice of toast. Open crumb full of air holes, toasted
 * hardest in the middle, paler just inside the crust, and a dark crust rim
 * with a ragged edge. Mapped to the slice's bounding box.
 */
export function paintToast(seed = 89) {
  const size = 512;
  const noise = makeNoise(seed, 64);
  const rand = seeded(seed + 5);
  const holes = scatterDents(size, 1100, rand, [1.5, 7], [0.35, 0.9]);
  const height = heightField(size, (u, v) => {
    const i = Math.floor(v * size) * size + Math.floor(u * size);
    return clamp01(0.55 + 0.45 * holes[i]! + (noise(u, v, 3, 6) - 0.5) * 0.2);
  });
  const golden: RGB = [0.88, 0.66, 0.38];
  const toasted: RGB = [0.52, 0.3, 0.12];
  const crustColour: RGB = [0.4, 0.2, 0.07];
  const colour = colourMap(size, (u, v) => {
    const i = Math.floor(v * size) * size + Math.floor(u * size);
    // Distance to the edge of the slice, roughened so the crust line wanders.
    const edge = Math.min(u, 1 - u, v, 1 - v) + (noise(u, v, 2, 12) - 0.5) * 0.03;
    const crust = smoothstep(0.06, 0.025, edge);
    const pale = smoothstep(0.04, 0.14, edge) * smoothstep(0.3, 0.15, edge);
    const centre = 1 - smoothstep(0.05, 0.5, Math.hypot(u - 0.5, v - 0.5));
    const patches = noise(u, v, 3, 3);
    const brown = clamp01(0.15 + 0.55 * patches + 0.3 * centre - 0.3 * pale);
    let c = mix(golden, toasted, brown);
    // Holes are in shadow; the ridges between them catch the heat.
    c = shade(c, 0.7 + 0.3 * holes[i]! + (height[i]! - 0.7) * 0.25);
    c = shade(c, 0.94 + 0.12 * noise(u, v, 1, 64));
    return mix(c, crustColour, crust);
  });
  return { colour, normal: heightToNormal(height, size, 2.4) };
}

/** Crust around the edge of a slice: dark, blistered, a little glossy. */
export function paintCrust(seed = 91) {
  const size = 256;
  const noise = makeNoise(seed, 32);
  const rand = seeded(seed + 6);
  const blisters = scatterDents(size, 320, rand, [2, 9], [0.4, 1]);
  const height = heightField(size, (u, v) => {
    const i = Math.floor(v * size) * size + Math.floor(u * size);
    // Dents inverted: blisters stand proud.
    return clamp01(0.35 + 0.5 * (1 - blisters[i]!) + (noise(u, v, 3, 8) - 0.5) * 0.3);
  });
  const base: RGB = [0.5, 0.27, 0.1];
  const dark: RGB = [0.3, 0.14, 0.05];
  const colour = colourMap(size, (u, v) => {
    const i = Math.floor(v * size) * size + Math.floor(u * size);
    const c = mix(base, dark, smoothstep(0.35, 0.8, height[i]!) * 0.7);
    return shade(c, 0.85 + 0.3 * noise(u, v, 3, 5));
  });
  return { colour, normal: heightToNormal(height, size, 3) };
}

/**
 * Fried dough for a ring donut. `v` runs round the tube: 0 is the outer
 * equator, 0.25 the top, 0.5 the inner equator, 0.75 the bottom. The pale
 * band at each equator is the fry line, where the dough floated.
 */
export function paintDough(seed = 73) {
  const size = 256;
  const noise = makeNoise(seed, 32);
  const rand = seeded(seed + 7);
  const pores = scatterDents(size, 260, rand, [1, 4], [0.3, 0.8]);
  const height = heightField(size, (u, v) => {
    const i = Math.floor(v * size) * size + Math.floor(u * size);
    return clamp01(0.4 + noise(u, v, 4, 6) * 0.45 + 0.15 * pores[i]!);
  });
  const brown: RGB = [0.76, 0.48, 0.22];
  const deep: RGB = [0.55, 0.3, 0.12];
  const cream: RGB = [0.93, 0.8, 0.56];
  const colour = colourMap(size, (u, v) => {
    const i = Math.floor(v * size) * size + Math.floor(u * size);
    const band = Math.min(Math.abs(v), Math.abs(v - 0.5), Math.abs(v - 1)) + (noise(u, v, 2, 10) - 0.5) * 0.05;
    const fryLine = smoothstep(0.1, 0.035, band);
    const blotch = noise(u, v, 3, 5);
    let c = mix(brown, deep, smoothstep(0.55, 0.8, blotch));
    c = shade(c, 0.85 + 0.3 * noise(u, v, 2, 24) + (height[i]! - 0.6) * 0.3);
    return mix(c, shade(cream, 0.92 + 0.16 * blotch), fryLine);
  });
  return { colour, normal: heightToNormal(height, size, 2.2) };
}

/**
 * Icing surface detail: the gentle swells poured chocolate settles into, a
 * fine orange peel for pink fondant. Normal and roughness maps.
 */
export function paintIcing(kind: 'chocolate' | 'pink' | 'glazed', seed = 75) {
  const size = 256;
  const noise = makeNoise(seed, 32);
  const swells = (u: number, v: number) => (kind === 'chocolate' ? noise(u, v, 2, 5) : noise(u, v, 2, 20) * 0.5);
  const height = heightField(size, (u, v) => swells(u, v) + noise(u, v, 2, 40) * 0.08);
  const base = kind === 'chocolate' ? 0.55 : kind === 'pink' ? 0.36 : 0.08;
  const roughness = greyMap(size, (u, v) => clamp01(base + (noise(u, v, 3, 6) - 0.5) * 0.2));
  return { normal: heightToNormal(height, size, kind === 'chocolate' ? 1.0 : 0.8), roughness };
}

/**
 * The puddle under a pat of butter: the toast soaked darker and amber,
 * thinning to a wobbly edge. The shine comes from the material.
 */
export function paintMeltPool(seed = 95) {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size, size);
  const rand = seeded(seed);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  // Soaked right out to the rim, then a quick fade: the pat covers the middle.
  g.addColorStop(0, 'rgba(118,58,6,0.9)');
  g.addColorStop(0.72, 'rgba(132,68,10,0.82)');
  g.addColorStop(1, 'rgba(160,90,18,0)');
  ctx.fillStyle = g;
  const s1 = rand() * 6;
  const s2 = rand() * 6;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = c * (0.84 + 0.1 * Math.sin(3 * a + s1) + 0.05 * Math.sin(7 * a + s2));
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return canvas;
}
