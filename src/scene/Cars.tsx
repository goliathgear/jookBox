import { useEffect, useMemo, type ComponentProps } from 'react';
import * as THREE from 'three';
import { paintPlate, paintWoodGrain } from './dinerArt.ts';
import { chrome, darkChrome } from './materials.ts';
import { paintRadial } from './paint.ts';
import { useCanvasTexture } from './useCanvasTexture.ts';

// Fifties cars for the parking lot. Each is a side silhouette extruded to
// the car's width with heavily rounded edges, plus wheels, chrome and
// windows. Car space: x along the car (front at +x), y up from the ground,
// z across.

type Draw = (s: THREE.Path) => void;
type Pt = [number, number];

/** Windscreen or rear window: a polyline up the cabin profile, cowl to roof. */
interface Screen {
  path: Pt[];
  /** Two-piece glass with a chrome divider down the middle. */
  split?: boolean;
}

interface CarSpec {
  width: number;
  body: Draw;
  cabin: Draw;
  /** Side windows, as flat shapes on the cabin's sides. */
  windows: Draw[];
  screens: { front: Screen; rear: Screen };
  wheelR: number;
  wheelX: [number, number];
  whitewalls: boolean;
  /** Height of the body profile's underside, between the arches. */
  sill: number;
  /** Where the door seams fall along the side. */
  doors: number[];
  plate: string;
  /** Foot of the radio aerial, on a front fender. */
  antenna?: [number, number, number];
  paint: string;
  roof: string;
  /** Contrasting side panel (two-tone flash, or wood on a wagon). */
  panel?: { draw: Draw; colour?: string; wood?: boolean };
  bumperY: number;
  front: number;
  rear: number;
  /** Height of the grille opening's centre on the nose. */
  grilleY: number;
  bulletNose?: boolean;
}

const shape = (draw: Draw) => {
  const s = new THREE.Shape();
  draw(s);
  return s;
};

// The body's rounded edges: how far the rounding runs in across the car,
// and how far it pushes the profile out in its own plane. The flat side
// face is the profile as drawn; the middle of the body is that profile
// grown by BODY_BEVEL_SIZE, so a wheel arch drawn in the profile closes
// in by that much toward the middle.
const BODY_BEVEL = 0.34;
const BODY_BEVEL_SIZE = 0.12;
const CABIN_BEVEL = 0.22;

/** How far the tyre stands out beyond the wheel's nominal radius, which is the whitewall's. */
const TYRE_EXTRA = 0.12;
/** Clearance between the tyre and the arch at the side face. */
const ARCH_GAP = 0.1;
/** Radius of a wheel arch in the body profile. */
const archR = (wheelR: number) => wheelR + TYRE_EXTRA + ARCH_GAP;
/** Height of the chrome spear: just clear of the top of the arches. */
const spearY = (wheelR: number) => wheelR + archR(wheelR) + 0.07;

/**
 * The underside of a profile from x0 to x1 at height y, arching over each
 * wheel; side panels can pass their own radius.
 */
function arches(s: THREE.Path, x0: number, x1: number, y: number, wheels: number[], wheelR: number, r = archR(wheelR)) {
  s.moveTo(x0, y);
  for (const wx of [...wheels].sort((a, b) => a - b)) {
    const dx = Math.sqrt(r * r - (y - wheelR) ** 2);
    s.lineTo(wx - dx, y);
    s.absarc(wx, wheelR, r, Math.atan2(y - wheelR, -dx), Math.atan2(y - wheelR, dx), true);
  }
  s.lineTo(x1, y);
}

/** Height of the body's underside at x: the sill, or the arch where there is one. */
function undersideAt(spec: CarSpec, x: number) {
  const r = archR(spec.wheelR);
  let y = spec.sill;
  for (const wx of spec.wheelX) {
    const dx = Math.abs(x - wx);
    if (dx < r) y = Math.max(y, spec.wheelR + Math.sqrt(r * r - dx * dx));
  }
  return y;
}

/** The part of a straight cabin edge between t0 and t1. */
function line(a: Pt, b: Pt, t0: number, t1: number): Pt[] {
  const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [at(t0), at(t1)];
}

/** 1950 Studebaker Champion: the bullet nose, and a rear as round as the front. */
export const STUDEBAKER: CarSpec = {
  width: 3.8,
  body: (s) => {
    arches(s, -4.95, 4.55, 0.62, [-3.05, 3.15], 0.72);
    s.bezierCurveTo(5.0, 0.62, 5.2, 0.9, 5.15, 1.25);
    s.bezierCurveTo(5.1, 1.6, 4.7, 1.78, 4.1, 1.8);
    s.lineTo(1.7, 1.86);
    s.lineTo(-2.3, 1.92);
    s.bezierCurveTo(-3.6, 1.9, -4.6, 1.72, -5.0, 1.35);
    s.bezierCurveTo(-5.25, 1.1, -5.2, 0.8, -4.95, 0.62);
  },
  cabin: (s) => {
    // Raked flat screens front and rear, under a domed roof.
    s.moveTo(1.75, 1.8);
    s.lineTo(0.95, 2.62);
    s.quadraticCurveTo(0.6, 2.86, 0.1, 2.86);
    s.lineTo(-1.0, 2.86);
    s.quadraticCurveTo(-1.7, 2.86, -2.1, 2.5);
    s.lineTo(-2.95, 1.86);
    s.lineTo(1.75, 1.8);
  },
  windows: [
    (s) => {
      s.moveTo(1.5, 1.94);
      s.lineTo(0.85, 2.6);
      s.lineTo(0.3, 2.74);
      s.lineTo(-0.45, 2.74);
      s.lineTo(-0.45, 1.94);
      s.lineTo(1.5, 1.94);
    },
    (s) => {
      s.moveTo(-0.65, 1.94);
      s.lineTo(-0.65, 2.74);
      s.lineTo(-1.1, 2.74);
      s.lineTo(-2.0, 2.4);
      s.lineTo(-2.6, 1.96);
      s.lineTo(-0.65, 1.94);
    },
  ],
  screens: {
    front: { path: line([1.75, 1.8], [0.95, 2.62], 0.28, 0.9) },
    rear: { path: line([-2.95, 1.86], [-2.1, 2.5], 0.18, 0.88) },
  },
  wheelR: 0.72,
  wheelX: [3.15, -3.05],
  whitewalls: true,
  sill: 0.62,
  doors: [1.6, -0.55],
  plate: 'JOOK 50',
  antenna: [4.0, 1.9, 1.0],
  paint: '#6fb3a3',
  roof: '#6fb3a3',
  bumperY: 0.72,
  front: 5.2,
  rear: -5.15,
  grilleY: 1.0,
  bulletNose: true,
};

/** '57 Bel Air-style hardtop: two-tone paint and tail fins. */
export const BEL_AIR: CarSpec = {
  width: 3.9,
  body: (s) => {
    arches(s, -5.25, 4.95, 0.6, [-3.1, 3.25], 0.7);
    s.bezierCurveTo(5.3, 0.6, 5.35, 1.0, 5.3, 1.4);
    s.lineTo(5.15, 1.82);
    s.lineTo(1.6, 1.86);
    s.lineTo(-3.4, 1.86);
    s.lineTo(-5.0, 2.06);
    s.lineTo(-5.35, 2.08);
    s.lineTo(-5.35, 1.2);
    s.bezierCurveTo(-5.35, 0.85, -5.3, 0.62, -5.25, 0.6);
  },
  cabin: (s) => {
    s.moveTo(1.5, 1.84);
    s.lineTo(0.55, 2.7);
    s.lineTo(-1.8, 2.7);
    s.lineTo(-2.7, 1.84);
    s.lineTo(1.5, 1.84);
  },
  windows: [
    (s) => {
      s.moveTo(1.2, 1.92);
      s.lineTo(0.48, 2.6);
      s.lineTo(-0.55, 2.6);
      s.lineTo(-0.55, 1.92);
      s.lineTo(1.2, 1.92);
    },
    (s) => {
      s.moveTo(-0.75, 1.92);
      s.lineTo(-0.75, 2.6);
      s.lineTo(-1.75, 2.6);
      s.lineTo(-2.45, 1.92);
      s.lineTo(-0.75, 1.92);
    },
  ],
  screens: {
    front: { path: line([1.5, 1.84], [0.55, 2.7], 0.22, 0.9) },
    rear: { path: line([-2.7, 1.84], [-1.8, 2.7], 0.2, 0.9) },
  },
  wheelR: 0.7,
  wheelX: [3.25, -3.1],
  whitewalls: true,
  sill: 0.6,
  doors: [1.4, -0.65],
  plate: 'NAS 57',
  antenna: [4.0, 1.98, 1.05],
  paint: '#b3202a',
  roof: '#efe9dc',
  panel: {
    colour: '#efe9dc',
    // The contrasting flash: a point at the door, sweeping up and widening to the fin.
    draw: (s) => {
      s.moveTo(-1.4, 1.74);
      s.lineTo(-3.4, 1.82);
      s.lineTo(-5.0, 2.02);
      s.lineTo(-5.15, 2.03);
      s.lineTo(-5.15, 1.72);
      s.lineTo(-3.4, 1.72);
      s.lineTo(-1.4, 1.74);
    },
  },
  bumperY: 0.7,
  front: 5.35,
  rear: -5.4,
  grilleY: 1.15,
};

/** '56 F-100-style pickup. */
export const PICKUP: CarSpec = {
  width: 3.7,
  body: (s) => {
    arches(s, -4.6, 4.3, 0.78, [-3.0, 3.0], 0.78);
    s.bezierCurveTo(4.55, 0.78, 4.6, 1.1, 4.6, 1.5);
    s.lineTo(4.5, 1.95);
    s.lineTo(1.3, 2.05);
    s.lineTo(-4.6, 2.05);
    s.lineTo(-4.6, 0.78);
  },
  cabin: (s) => {
    s.moveTo(1.25, 2.0);
    s.lineTo(0.95, 3.2);
    s.lineTo(-0.85, 3.2);
    s.lineTo(-0.9, 2.0);
    s.lineTo(1.25, 2.0);
  },
  windows: [
    (s) => {
      s.moveTo(1.02, 2.12);
      s.lineTo(0.8, 3.05);
      s.lineTo(-0.6, 3.05);
      s.lineTo(-0.6, 2.12);
      s.lineTo(1.02, 2.12);
    },
  ],
  screens: {
    front: { path: line([1.25, 2.0], [0.95, 3.2], 0.2, 0.88) },
    rear: { path: line([-0.9, 2.0], [-0.85, 3.2], 0.2, 0.88) },
  },
  wheelR: 0.78,
  wheelX: [3.0, -3.0],
  whitewalls: false,
  sill: 0.78,
  doors: [1.15, -1.05],
  plate: 'K8S 56',
  antenna: [3.6, 2.1, 0.95],
  paint: '#d9b65c',
  roof: '#d9b65c',
  bumperY: 0.82,
  front: 4.7,
  rear: -4.7,
  grilleY: 1.4,
};

/** '55 Country Squire-style wagon with wood-grain sides. */
export const WAGON: CarSpec = {
  width: 3.9,
  body: (s) => {
    arches(s, -5.1, 4.8, 0.62, [-3.2, 3.2], 0.7);
    s.bezierCurveTo(5.2, 0.62, 5.25, 1.0, 5.2, 1.35);
    s.lineTo(5.05, 1.86);
    s.lineTo(1.6, 1.92);
    s.lineTo(-5.1, 1.96);
    s.lineTo(-5.2, 1.2);
    s.bezierCurveTo(-5.2, 0.8, -5.15, 0.65, -5.1, 0.62);
  },
  cabin: (s) => {
    s.moveTo(1.5, 1.9);
    s.lineTo(0.6, 2.8);
    s.lineTo(-4.85, 2.8);
    s.lineTo(-5.05, 1.94);
    s.lineTo(1.5, 1.9);
  },
  windows: [
    (s) => {
      s.moveTo(1.22, 1.98);
      s.lineTo(0.54, 2.68);
      s.lineTo(-0.35, 2.68);
      s.lineTo(-0.35, 1.98);
      s.lineTo(1.22, 1.98);
    },
    (s) => {
      s.moveTo(-0.55, 1.98);
      s.lineTo(-0.55, 2.68);
      s.lineTo(-2.45, 2.68);
      s.lineTo(-2.45, 1.98);
      s.lineTo(-0.55, 1.98);
    },
    (s) => {
      s.moveTo(-2.65, 1.98);
      s.lineTo(-2.65, 2.68);
      s.lineTo(-4.7, 2.68);
      s.lineTo(-4.82, 1.98);
      s.lineTo(-2.65, 1.98);
    },
  ],
  screens: {
    front: { path: line([1.5, 1.9], [0.6, 2.8], 0.22, 0.9) },
    rear: { path: line([-5.05, 1.94], [-4.85, 2.8], 0.12, 0.9) },
  },
  wheelR: 0.7,
  wheelX: [3.2, -3.2],
  whitewalls: true,
  sill: 0.62,
  doors: [1.45, -0.45, -2.55],
  plate: 'LAB 55',
  antenna: [4.0, 2.0, 1.05],
  paint: '#7fb0d2',
  roof: '#efe9dc',
  panel: {
    wood: true,
    // Wood from under the spear down, framing the rear wheel arch (it stops short of the front one).
    draw: (s) => {
      arches(s, -4.95, 1.3, 0.88, [-3.2], 0.7, archR(0.7) + 0.05);
      s.lineTo(1.3, 1.64);
      s.lineTo(-4.95, 1.64);
      s.closePath();
    },
  },
  bumperY: 0.7,
  front: 5.25,
  rear: -5.25,
  grilleY: 1.1,
};

// Window glass is a dark mirror: what you see in a parked car's windows is
// the sky and the lot, not the seats.
const glass = new THREE.MeshStandardMaterial({ color: '#2a3a46', metalness: 0.95, roughness: 0.06, envMapIntensity: 2.2 });
const rubber = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.92 });
const whitewall = new THREE.MeshStandardMaterial({ color: '#ece8dc', roughness: 0.75 });
const tailLight = new THREE.MeshPhysicalMaterial({ color: '#b3121b', emissive: '#4a0004', roughness: 0.2, clearcoat: 1 });
const headlight = new THREE.MeshPhysicalMaterial({ color: '#dfe8ee', metalness: 0.2, roughness: 0.1, clearcoat: 1 });
const underbody = new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 1 });
const seam = new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.9 });
const plateBacking = new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.5, roughness: 0.5 });

function extrude(draw: Draw, width: number, bevel: number, bevelSize = bevel * 0.7) {
  const g = new THREE.ExtrudeGeometry(shape(draw), {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize,
    bevelSegments: 9,
    curveSegments: 32,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.computeVertexNormals();
  return g;
}

/** The same flat shape grown by `border` all round, for a chrome surround behind a window. */
function surround(g: THREE.ShapeGeometry, border: number) {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  const out = g.clone();
  out.translate(-cx, -cy, 0);
  out.scale((w + 2 * border) / w, (h + 2 * border) / h, 1);
  out.translate(cx, cy, 0);
  return out;
}

/**
 * A strip of quads lying on the cabin's front or rear slope: the profile
 * polyline pushed `lift` outward (toward +x for the front, -x for the
 * rear) and spanning `width` across the car. `extend` runs it past both
 * ends of the path, for trim that surrounds the glass.
 */
function ribbon(path: Pt[], width: number, lift: number, outX: 1 | -1, extend = 0) {
  const pts = path.map(([x, y]) => new THREE.Vector2(x, y));
  const last = pts.length - 1;
  if (extend > 0) {
    pts[0]!.addScaledVector(pts[0]!.clone().sub(pts[1]!).normalize(), extend);
    pts[last]!.addScaledVector(pts[last]!.clone().sub(pts[last - 1]!).normalize(), extend);
  }
  const segNormals = pts.slice(1).map((p, i) => {
    const d = p.clone().sub(pts[i]!).normalize();
    return new THREE.Vector2(-d.y, d.x);
  });
  const meanX = segNormals.reduce((sum, n) => sum + n.x, 0);
  const sign = Math.sign(meanX) === outX ? 1 : -1;
  const normals = pts.map((_, i) => {
    const n = i === 0 ? segNormals[0]!.clone() : i === last ? segNormals[last - 1]!.clone() : segNormals[i - 1]!.clone().add(segNormals[i]!);
    return n.normalize().multiplyScalar(sign);
  });
  const positions: number[] = [];
  const normalAttr: number[] = [];
  const uvs: number[] = [];
  pts.forEach((p, i) => {
    const n = normals[i]!;
    const x = p.x + n.x * lift;
    const y = p.y + n.y * lift;
    positions.push(x, y, -width / 2, x, y, width / 2);
    normalAttr.push(n.x, n.y, 0, n.x, n.y, 0);
    uvs.push(i / last, 0, i / last, 1);
  });
  const indices: number[] = [];
  for (let i = 0; i < last; i++) {
    const l = i * 2;
    const r = l + 1;
    // Wound so the face points along the outward normal.
    if (sign > 0) indices.push(l, r, l + 2, r, r + 2, l + 2);
    else indices.push(l, l + 2, r, r, l + 2, r + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normalAttr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/** Glass, chrome surround and optional divider for one screen, with its lower end for the wipers. */
function buildScreen(screen: Screen, cabinWidth: number, outX: 1 | -1) {
  const flat = cabinWidth - 2 * CABIN_BEVEL;
  const glassWidth = flat - 0.3;
  const lift = CABIN_BEVEL * 0.7;
  const glass = ribbon(screen.path, glassWidth, lift + 0.02, outX);
  const pos = glass.getAttribute('position');
  const nrm = glass.getAttribute('normal');
  // The lower end of the glass: where it meets the cowl or the deck.
  const n = pos.count - 1;
  const lowFirst = pos.getY(0) <= pos.getY(n);
  const a = lowFirst ? 0 : n;
  const b = lowFirst ? 2 : n - 2;
  const foot = new THREE.Vector2(pos.getX(a), pos.getY(a));
  const up = new THREE.Vector2(pos.getX(b) - foot.x, pos.getY(b) - foot.y).normalize();
  const outward = new THREE.Vector2(nrm.getX(a), nrm.getY(a));
  return {
    glass,
    trim: ribbon(screen.path, glassWidth + 0.1, lift + 0.012, outX, 0.06),
    divider: screen.split ? ribbon(screen.path, 0.05, lift + 0.028, outX) : null,
    foot,
    /** Rotation about z that takes local x up the glass; local y is then ± the outward normal. */
    tilt: Math.atan2(up.y, up.x),
    outSign: Math.sign(-up.y * outward.x + up.x * outward.y) || 1,
  };
}

function paintMaterial(colour: string) {
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.42,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.6,
    // The sun is behind them; this stands in for the sky bouncing off the lot.
    emissive: colour,
    emissiveIntensity: 0.16,
  });
}

/** A licence plate hung under a bumper, facing `facing` along x. */
function Plate({ text, facing, ...props }: { text: string; facing: 1 | -1 } & ComponentProps<'group'>) {
  const map = useCanvasTexture(() => paintPlate(text), [text]);
  return (
    <group {...props} rotation-y={(facing * Math.PI) / 2}>
      <mesh position-z={-0.012} material={plateBacking}>
        <boxGeometry args={[0.54, 0.28, 0.02]} />
      </mesh>
      <mesh>
        <planeGeometry args={[0.52, 0.26]} />
        <meshStandardMaterial map={map} roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
}

export function Car({ spec, ...props }: { spec: CarSpec } & ComponentProps<'group'>) {
  const parts = useMemo(() => {
    const cabinWidth = spec.width - 0.7;
    const windows = spec.windows.map((w) => new THREE.ShapeGeometry(shape(w)));
    return {
      body: extrude(spec.body, spec.width, BODY_BEVEL, BODY_BEVEL_SIZE),
      cabin: extrude(spec.cabin, cabinWidth, CABIN_BEVEL),
      windows,
      surrounds: windows.map((w) => surround(w, 0.04)),
      screens: [buildScreen(spec.screens.front, cabinWidth, 1), buildScreen(spec.screens.rear, cabinWidth, -1)],
      panel: spec.panel ? new THREE.ShapeGeometry(shape(spec.panel.draw)) : null,
      paint: paintMaterial(spec.paint),
      roof: paintMaterial(spec.roof),
      panelPaint: spec.panel?.colour ? paintMaterial(spec.panel.colour) : null,
      cabinHalf: cabinWidth / 2,
    };
  }, [spec]);
  useEffect(
    () => () => {
      parts.body.dispose();
      parts.cabin.dispose();
      parts.windows.forEach((w) => w.dispose());
      parts.surrounds.forEach((w) => w.dispose());
      parts.screens.forEach((s) => {
        s.glass.dispose();
        s.trim.dispose();
        s.divider?.dispose();
      });
      parts.panel?.dispose();
      parts.paint.dispose();
      parts.roof.dispose();
      parts.panelPaint?.dispose();
    },
    [parts],
  );
  const wood = useCanvasTexture(paintWoodGrain, []);
  const shadow = useCanvasTexture(() => paintRadial('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), []);

  const half = spec.width / 2;
  const length = spec.front - spec.rear;
  const tyreR = spec.wheelR + TYRE_EXTRA;
  const spear = spearY(spec.wheelR);
  const grilleBars = [-0.14, -0.05, 0.04, 0.13];
  return (
    <group {...props}>
      {/* Soft shadow under the car, where the sun's doesn't reach. */}
      <mesh position={[(spec.front + spec.rear) / 2, 0.012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[length + 0.4, spec.width + 0.6]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      {/* The tyres stand the whole car up by their extra radius. */}
      <group position-y={TYRE_EXTRA}>
        {/* The dark underside and inner fenders: what shows through the wheel arches. */}
        <mesh position={[(spec.front + spec.rear) / 2, 0.9, 0]} material={underbody}>
          <boxGeometry args={[length - 1.2, 1.5, spec.width - 0.5]} />
        </mesh>
        <mesh geometry={parts.body} material={parts.paint} castShadow receiveShadow />
        <mesh geometry={parts.cabin} material={parts.roof} castShadow receiveShadow />
        {/* Windscreen and rear window in their chrome surrounds. */}
        {parts.screens.map((s, i) => (
          <group key={i}>
            <mesh geometry={s.trim} material={chrome} />
            <mesh geometry={s.glass} material={glass} />
            {s.divider && <mesh geometry={s.divider} material={chrome} />}
            {i === 0 && (
              // Wipers parked along the bottom of the windscreen.
              <group position={[s.foot.x, s.foot.y, 0]} rotation-z={s.tilt}>
                {[-0.52, 0.22].map((z) => (
                  <mesh key={z} position={[0.13, s.outSign * 0.012, z]} rotation-y={-0.5} material={rubber}>
                    <boxGeometry args={[0.028, 0.022, 0.62]} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        ))}
        {[1, -1].map((side) => (
          <group key={side} scale={[1, 1, side]}>
            {/* Side windows, each in a chrome surround. */}
            {parts.surrounds.map((w, i) => (
              <mesh key={i} geometry={w} material={chrome} position-z={parts.cabinHalf + 0.006} />
            ))}
            {parts.windows.map((w, i) => (
              <mesh key={i} geometry={w} material={glass} position-z={parts.cabinHalf + 0.012} />
            ))}
            {parts.panel && (
              <mesh geometry={parts.panel} position-z={half + 0.01}>
                {spec.panel?.wood ? <meshStandardMaterial map={wood} roughness={0.5} /> : <primitive object={parts.panelPaint!} attach="material" />}
              </mesh>
            )}
            {/* Door seams: dark lines down the side from the belt to the sill or the arch. */}
            {spec.doors.map((x) => {
              const bottom = undersideAt(spec, x) + 0.06;
              const top = spear - 0.06;
              return (
                <mesh key={x} position={[x, (top + bottom) / 2, half + 0.003]} material={seam}>
                  <boxGeometry args={[0.014, top - bottom, 0.006]} />
                </mesh>
              );
            })}
            {/* Chrome spear along the side above the arches, and a door handle above that. */}
            <mesh position={[(spec.front + spec.rear) / 2 + 0.3, spear, half + 0.02]} rotation-z={Math.PI / 2} material={chrome}>
              <capsuleGeometry args={[0.03, length * 0.62, 4, 8]} />
            </mesh>
            <mesh position={[0.2, spear + 0.12, half + 0.03]} rotation-z={Math.PI / 2} material={chrome}>
              <capsuleGeometry args={[0.025, 0.3, 4, 8]} />
            </mesh>
            {/* Wing mirror. */}
            <mesh position={[1.4, spec.bumperY + 1.3, half + 0.15]} material={chrome}>
              <sphereGeometry args={[0.1, 12, 8]} />
            </mesh>
            {spec.wheelX.map((x) => (
              <group key={x} position={[x, spec.wheelR, half - 0.17]}>
                {/* Tyre: a drum with flat sidewalls, a tread band and rounded shoulders. */}
                <mesh material={rubber} rotation-x={Math.PI / 2} castShadow>
                  <cylinderGeometry args={[tyreR - 0.07, tyreR - 0.07, 0.4, 36]} />
                </mesh>
                <mesh material={rubber} rotation-x={Math.PI / 2} castShadow>
                  <cylinderGeometry args={[tyreR, tyreR, 0.28, 36]} />
                </mesh>
                {[-0.14, 0.14].map((z) => (
                  <mesh key={z} material={rubber} position-z={z}>
                    <torusGeometry args={[tyreR - 0.07, 0.07, 10, 36]} />
                  </mesh>
                ))}
                {spec.whitewalls && (
                  <mesh material={whitewall} position-z={0.203}>
                    <ringGeometry args={[spec.wheelR * 0.5, spec.wheelR * 0.78, 32]} />
                  </mesh>
                )}
                <mesh material={chrome} position-z={0.22} rotation-x={Math.PI / 2}>
                  <cylinderGeometry args={[spec.wheelR * 0.48, spec.wheelR * 0.5, 0.06, 24]} />
                </mesh>
                <mesh material={chrome} position-z={0.27}>
                  <sphereGeometry args={[spec.wheelR * 0.2, 12, 8]} />
                </mesh>
              </group>
            ))}
            {/* Headlight in a chrome bezel, and a tail light in its bezel. */}
            <group position={[spec.front - 0.28, spec.bumperY + 0.72, half - 0.5]}>
              <mesh material={chrome}>
                <sphereGeometry args={[0.22, 16, 12]} />
              </mesh>
              <mesh material={headlight} position-x={0.1}>
                <sphereGeometry args={[0.17, 16, 12]} />
              </mesh>
            </group>
            <mesh position={[spec.rear + 0.16, spec.bumperY + 0.6, half - 0.45]} material={chrome}>
              <boxGeometry args={[0.1, 0.42, 0.38]} />
            </mesh>
            <mesh position={[spec.rear + 0.12, spec.bumperY + 0.6, half - 0.45]} material={tailLight}>
              <boxGeometry args={[0.12, 0.34, 0.3]} />
            </mesh>
            {/* Bumper guards: the chrome uprights on each bumper. */}
            {[spec.front, spec.rear].map((x) => (
              <mesh key={x} position={[x + Math.sign(x) * 0.06, spec.bumperY + 0.03, half * 0.45]} material={chrome}>
                <capsuleGeometry args={[0.055, 0.26, 4, 10]} />
              </mesh>
            ))}
          </group>
        ))}
        {[spec.front, spec.rear].map((x) => (
          <mesh key={x} position={[x, spec.bumperY, 0]} rotation-x={Math.PI / 2} material={chrome} castShadow>
            <capsuleGeometry args={[0.14, spec.width - 0.3, 6, 12]} />
          </mesh>
        ))}
        <Plate text={spec.plate} facing={1} position={[spec.front + 0.1, spec.bumperY - 0.2, 0]} />
        <Plate text={spec.plate} facing={-1} position={[spec.rear - 0.1, spec.bumperY - 0.2, 0]} />
        {/* Exhaust tip under the rear, and the radio aerial on a front fender. */}
        <mesh position={[spec.rear + 0.05, 0.42, -(half - 0.7)]} rotation-z={Math.PI / 2} material={darkChrome}>
          <cylinderGeometry args={[0.045, 0.045, 0.36, 12]} />
        </mesh>
        {spec.antenna && (
          <group position={spec.antenna}>
            <mesh material={chrome}>
              <sphereGeometry args={[0.04, 10, 8]} />
            </mesh>
            <mesh position-y={0.62} material={chrome}>
              <cylinderGeometry args={[0.012, 0.008, 1.25, 8]} />
            </mesh>
          </group>
        )}
        {/* Grille: horizontal chrome bars across the nose. */}
        {!spec.bulletNose &&
          grilleBars.map((dy) => (
            <mesh key={dy} position={[spec.front + 0.02, spec.grilleY + dy * 2.2, 0]} rotation-x={Math.PI / 2} material={chrome}>
              <capsuleGeometry args={[0.02, spec.width * 0.55, 4, 8]} />
            </mesh>
          ))}
        {spec.bulletNose && (
          <group position={[spec.front + 0.12, 1.32, 0]}>
            <mesh material={chrome} scale={[1.7, 1, 1]}>
              <sphereGeometry args={[0.4, 24, 16]} />
            </mesh>
            <mesh rotation-y={Math.PI / 2} position-x={-0.3}>
              <torusGeometry args={[0.46, 0.08, 10, 32]} />
              <meshStandardMaterial color="#b3121b" roughness={0.3} />
            </mesh>
            {/* Grille bars either side of the bullet. */}
            {[-1, 1].map((s) =>
              [0, 1, 2].map((i) => (
                <mesh key={`${s}${i}`} position={[-0.2, -0.2 + i * 0.18, s * 1.05]} rotation-z={Math.PI / 2} material={chrome}>
                  <capsuleGeometry args={[0.02, 0.9, 4, 8]} />
                </mesh>
              )),
            )}
          </group>
        )}
      </group>
    </group>
  );
}
