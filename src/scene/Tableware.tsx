import { RoundedBox } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentProps } from 'react';
import * as THREE from 'three';
import { seeded } from './dinerArt.ts';
import { chrome } from './materials.ts';
import { makeNoise, paintCrust, paintDough, paintIcing, paintMeltPool, paintToast } from './surfaces.ts';
import { useCanvasTexture } from './useCanvasTexture.ts';

// Coffee and donuts, built from lathed profiles: a profile of (radius,
// height) points spun round the y axis.

function lathe(points: [number, number][], segments = 48) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

const ceramic = new THREE.MeshPhysicalMaterial({
  color: '#f5f1e8',
  roughness: 0.22,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  side: THREE.DoubleSide,
});

const coffee = new THREE.MeshPhysicalMaterial({ color: '#23110a', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 });
const pinstripe = new THREE.MeshStandardMaterial({ color: '#8c1c22', roughness: 0.4 });

const MUG = lathe([
  [0, 0.02],
  [0.36, 0],
  [0.42, 0.04],
  [0.45, 0.2],
  [0.47, 0.6],
  [0.49, 0.98],
  [0.5, 1.03],
  [0.47, 1.05],
  [0.43, 1.0],
  [0.41, 0.6],
  [0.38, 0.2],
  [0.3, 0.14],
  [0, 0.13],
]);

const SAUCER = lathe([
  [0, 0.04],
  [0.5, 0.01],
  [0.55, 0],
  [0.62, 0.02],
  [0.88, 0.11],
  [0.93, 0.14],
  [0.9, 0.16],
  [0.84, 0.13],
  [0.6, 0.07],
  [0.45, 0.075],
  [0, 0.075],
]);

const PLATE = lathe([
  [0, 0.03],
  [0.72, 0],
  [0.8, 0.02],
  [1.22, 0.12],
  [1.34, 0.17],
  [1.31, 0.19],
  [1.2, 0.15],
  [0.82, 0.06],
  [0, 0.06],
]);

/** A diner mug of black coffee on its saucer; the handle points along +x. */
export function CoffeeCup(props: ComponentProps<'group'>) {
  return (
    <group {...props}>
      <mesh geometry={SAUCER} material={ceramic} castShadow receiveShadow />
      <group position-y={0.075}>
        <mesh geometry={MUG} material={ceramic} castShadow receiveShadow />
        <mesh position-y={0.86} rotation-x={-Math.PI / 2} material={coffee}>
          <circleGeometry args={[0.415, 40]} />
        </mesh>
        {/* A ring of crema at the edge. */}
        <mesh position-y={0.862} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.36, 0.415, 40]} />
          <meshStandardMaterial color="#6b4327" roughness={0.6} transparent opacity={0.5} />
        </mesh>
        <mesh position={[0.56, 0.56, 0]} rotation-z={-Math.PI * 0.62} material={ceramic} castShadow>
          <torusGeometry args={[0.25, 0.065, 12, 24, Math.PI * 1.24]} />
        </mesh>
      </group>
    </group>
  );
}

/** A plate with a maroon pinstripe round the rim. */
export function Plate({ children, ...props }: ComponentProps<'group'>) {
  return (
    <group {...props}>
      <mesh geometry={PLATE} material={ceramic} castShadow receiveShadow />
      <mesh position-y={0.135} rotation-x={Math.PI / 2} material={pinstripe}>
        <torusGeometry args={[1.12, 0.012, 6, 64]} />
      </mesh>
      <group position-y={0.06}>{children}</group>
    </group>
  );
}

// --- Donuts ------------------------------------------------------------------
//
// A donut is a ring surface: phi runs round the ring, t round the tube
// (0 at the outer equator, π/2 at the top, π at the inner equator). The
// tube radius varies with both, which is what makes it look fried rather
// than turned on a lathe, and the icing is the same surface over the top
// half only, thickened, with a drip line that wanders.

const DOUGH_R = 0.42;
const TUBE_R = 0.21;
const SQUASH = 0.82;
const ICING_T = 0.02;
const TAU = Math.PI * 2;

type Radius = (phi: number, t: number) => number;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Lumpy dough: low-frequency noise over the tube, and a slightly oval ring. */
function doughRadius(seed: number): Radius {
  const noise = makeNoise(seed, 16);
  return (phi, t) => TUBE_R * (1 + (noise(phi / TAU, t / TAU, 2, 3) - 0.5) * 0.16 + 0.025 * Math.cos(2 * phi + seed));
}

/**
 * Where the icing stops down each side of the ring, as a function of phi:
 * a gently wavering edge, kept above the donut's widest point since the
 * top was dipped and nothing ran.
 */
function icingSpan(seed: number) {
  const noise = makeNoise(seed + 50, 16);
  return (phi: number): [number, number] => [
    0.2 + 0.25 * noise(phi / TAU, 0.2, 2, 5),
    Math.PI - 0.2 - 0.25 * noise(phi / TAU, 0.7, 2, 5),
  ];
}

/**
 * The icing surface: the dough, plus a poured coat that keeps its thickness
 * almost to the edge and ends in a rolled bead where it stopped flowing.
 */
function icingRadius(seed: number, dough: Radius, span: (phi: number) => [number, number]): Radius {
  const noise = makeNoise(seed + 90, 16);
  return (phi, t) => {
    const [t0, t1] = span(phi);
    const d = Math.min(t - t0, t1 - t);
    const body = 0.25 + 0.75 * smoothstep(0, 0.1, d);
    const bead = 0.7 * Math.exp(-(((d - 0.05) / 0.07) ** 2));
    // Poured icing settles unevenly.
    const pour = 0.8 + 0.4 * noise(phi / TAU, t / TAU, 2, 4);
    return dough(phi, t) + ICING_T * (body * pour + bead);
  };
}

const ringPoint = (radius: Radius, phi: number, t: number, out: THREE.Vector3) => {
  const r = radius(phi, t);
  const ring = DOUGH_R + r * Math.cos(t);
  return out.set(ring * Math.cos(phi), r * Math.sin(t), ring * Math.sin(phi));
};

/** Position and outward normal of a ring surface, by finite differences. */
function ringFrame(radius: Radius, phi: number, t: number, p: THREE.Vector3, n: THREE.Vector3, dPhi: THREE.Vector3) {
  const dT = new THREE.Vector3();
  const eps = 0.01;
  ringPoint(radius, phi, t, p);
  ringPoint(radius, phi + eps, t, dPhi).sub(p);
  ringPoint(radius, phi, t + eps, dT).sub(p);
  n.crossVectors(dT, dPhi).normalize();
}

/**
 * A ring surface mesh. `span` gives the tube-angle range at each phi; u
 * runs `uRepeat` times round the ring and v across the span.
 */
function ringGeometry(radius: Radius, span: (phi: number) => [number, number], phiSegs: number, tSegs: number, uRepeat: number) {
  const positions = new Float32Array((phiSegs + 1) * (tSegs + 1) * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array((phiSegs + 1) * (tSegs + 1) * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= phiSegs; i++) {
    const phi = (i / phiSegs) * TAU;
    const [t0, t1] = span(phi);
    for (let j = 0; j <= tSegs; j++, k++) {
      ringFrame(radius, phi, t0 + (t1 - t0) * (j / tSegs), p, n, d);
      positions.set([p.x, p.y, p.z], k * 3);
      normals.set([n.x, n.y, n.z], k * 3);
      uvs.set([(i / phiSegs) * uRepeat, j / tSegs], k * 2);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < phiSegs; i++) {
    for (let j = 0; j < tSegs; j++) {
      const a = i * (tSegs + 1) + j;
      const b = a + tSegs + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

const FULL_TUBE = (): [number, number] => [0, TAU];

function useDoughMaterial() {
  const art = useMemo(() => paintDough(), []);
  const colour = useCanvasTexture(() => art.colour, [art], [1, 1]);
  const normal = useCanvasTexture(() => art.normal, [art], [1, 1], true);
  return useMemo(() => new THREE.MeshStandardMaterial({ map: colour, normalMap: normal, roughness: 0.88 }), [colour, normal]);
}

export type Frosting = 'glazed' | 'chocolate' | 'pink';

function useIcingMaterial(frosting: Frosting) {
  const art = useMemo(() => paintIcing(frosting), [frosting]);
  const normal = useCanvasTexture(() => art.normal, [art], [1, 1], true);
  const roughness = useCanvasTexture(() => art.roughness, [art], [1, 1], true);
  return useMemo(() => {
    const maps = { normalMap: normal, roughnessMap: roughness, roughness: 1 };
    switch (frosting) {
      case 'glazed':
        return new THREE.MeshPhysicalMaterial({ ...maps, color: '#e4c284', clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.6 });
      case 'chocolate':
        // Set chocolate icing is satin, not glossy.
        return new THREE.MeshPhysicalMaterial({ ...maps, color: '#3a1f12', clearcoat: 0.3, clearcoatRoughness: 0.45 });
      case 'pink':
        return new THREE.MeshPhysicalMaterial({ ...maps, color: '#ee93b0', clearcoat: 0.5, clearcoatRoughness: 0.25 });
    }
  }, [frosting, normal, roughness]);
}

const SPRINKLE = new THREE.CapsuleGeometry(0.016, 0.07, 2, 6);
const SPRINKLE_COLOURS = ['#ff5c8a', '#ffd23f', '#3ec1d3', '#ffffff', '#7bd389', '#ff9f1c'].map((c) => new THREE.Color(c));
const UP = new THREE.Vector3(0, 1, 0);

/** Sprinkles lying flat on the icing, each pointing its own way. */
function Sprinkles({ seed, icing, count = 56 }: { seed: number; icing: Radius; count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5 }), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rand = seeded(seed);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const along = new THREE.Vector3();
    const across = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const phi = rand() * TAU;
      // Within the icing, which stops short of the sides.
      const t = 0.55 + rand() * 2.05;
      ringFrame(icing, phi, t, p, n, along);
      along.normalize();
      across.crossVectors(n, along);
      const a = rand() * Math.PI;
      dir.copy(along).multiplyScalar(Math.cos(a)).addScaledVector(across, Math.sin(a));
      q.setFromUnitVectors(UP, dir);
      m.compose(p.addScaledVector(n, 0.014), q, one);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, SPRINKLE_COLOURS[Math.floor(rand() * SPRINKLE_COLOURS.length)]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [seed, icing, count]);
  return <instancedMesh ref={ref} args={[SPRINKLE, material, count]} castShadow />;
}

/** A ring donut resting flat, bottom at y = 0. `seed` picks its lumps and drips. */
export function Donut({ frosting, sprinkles, seed = 1, ...props }: { frosting: Frosting; sprinkles?: boolean; seed?: number } & ComponentProps<'group'>) {
  const dough = useDoughMaterial();
  const icing = useIcingMaterial(frosting);
  const shape = useMemo(() => {
    const doughR = doughRadius(seed);
    const icingR = icingRadius(seed, doughR, icingSpan(seed));
    return {
      icingR,
      dough: ringGeometry(doughR, FULL_TUBE, 96, 40, 3),
      icing: ringGeometry(icingR, icingSpan(seed), 96, 28, 3),
    };
  }, [seed]);
  useEffect(
    () => () => {
      shape.dough.dispose();
      shape.icing.dispose();
    },
    [shape],
  );
  return (
    <group {...props}>
      <group position-y={TUBE_R * SQUASH} scale={[1, SQUASH, 1]}>
        <mesh geometry={shape.dough} material={dough} castShadow receiveShadow />
        <mesh geometry={shape.icing} material={icing} castShadow />
        {sprinkles && <Sprinkles seed={seed} icing={shape.icingR} />}
      </group>
    </group>
  );
}

// --- Toast -------------------------------------------------------------------

const SLICE_W = 1.24;
const SLICE_H = 1.35;
const SLICE_T = 0.22;

/** A slice of bread in plan: square-ish with two humps on top. */
const SLICE = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.55, 0);
  s.lineTo(0.55, 0);
  s.quadraticCurveTo(0.62, 0, 0.62, 0.08);
  s.lineTo(0.62, 0.85);
  s.bezierCurveTo(0.62, 1.2, 0.45, 1.35, 0.28, 1.3);
  s.quadraticCurveTo(0.05, 1.22, 0, 1.18);
  s.quadraticCurveTo(-0.05, 1.22, -0.28, 1.3);
  s.bezierCurveTo(-0.45, 1.35, -0.62, 1.2, -0.62, 0.85);
  s.lineTo(-0.62, 0.08);
  s.quadraticCurveTo(-0.62, 0, -0.55, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: SLICE_T - 0.04,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 12,
  });
  // The extrusion grows along +z from the shape plane; centre it.
  g.translate(0, 0, -(SLICE_T - 0.04) / 2);
  return g;
})();

const butterMaterial = new THREE.MeshPhysicalMaterial({ color: '#f0c850', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25 });

/** Top and crust materials for one slice; each slice gets its own seed. */
function useToastMaterials(seed: number) {
  const top = useMemo(() => paintToast(seed), [seed]);
  const crust = useMemo(() => paintCrust(seed + 2), [seed]);
  const topColour = useCanvasTexture(() => top.colour, [top]);
  const topNormal = useCanvasTexture(() => top.normal, [top], undefined, true);
  // The side walls' UVs run along the outline and across the slice's
  // thickness; this repeat makes the thickness one tile of the crust.
  const crustColour = useCanvasTexture(() => crust.colour, [crust], [3, 1 / SLICE_T]);
  const crustNormal = useCanvasTexture(() => crust.normal, [crust], [3, 1 / SLICE_T], true);
  return useMemo(() => {
    // The caps' UVs are the shape's own coordinates, so the texture is
    // scaled and shifted to cover the slice's bounding box.
    for (const t of [topColour, topNormal]) {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.repeat.set(1 / SLICE_W, 1 / SLICE_H);
      t.offset.set(0.5, 0);
    }
    return [
      new THREE.MeshStandardMaterial({ map: topColour, normalMap: topNormal, roughness: 0.92 }),
      new THREE.MeshStandardMaterial({ map: crustColour, normalMap: crustNormal, roughness: 0.7 }),
    ];
  }, [topColour, topNormal, crustColour, crustNormal]);
}

/** Two slices of toast stacked on the plate, butter melting on the top one. */
export function Toast(props: ComponentProps<'group'>) {
  const lower = useToastMaterials(89);
  const upper = useToastMaterials(93);
  const pool = useCanvasTexture(paintMeltPool, []);
  return (
    <group {...props}>
      <mesh geometry={SLICE} material={lower} position={[0, SLICE_T / 2, 0.6]} rotation={[-Math.PI / 2, 0, 0.3]} castShadow receiveShadow />
      <mesh
        geometry={SLICE}
        material={upper}
        position={[0.22, SLICE_T * 1.5 - 0.02, 0.5]}
        rotation={[-Math.PI / 2, 0, 0.62]}
        castShadow
        receiveShadow
      />
      {/* The pat, softening at the corners, in the pool it's melting into. */}
      <group position={[0.3, SLICE_T * 2 + 0.01, 0.0]} rotation-y={0.4}>
        <RoundedBox args={[0.3, 0.06, 0.26]} radius={0.018} smoothness={3} material={butterMaterial} castShadow />
        <mesh position-y={-0.026} rotation-x={-Math.PI / 2} scale={[1, 0.8, 1]} rotation-z={0.3}>
          <circleGeometry args={[0.3, 32]} />
          <meshPhysicalMaterial map={pool} transparent roughness={0.15} clearcoat={1} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      </group>
    </group>
  );
}

/** A teaspoon, bowl at the origin and the handle running along +x. */
export function Spoon(props: ComponentProps<'group'>) {
  return (
    <group {...props}>
      <mesh material={chrome} scale={[1, 0.3, 0.72]} castShadow>
        <sphereGeometry args={[0.2, 16, 10]} />
      </mesh>
      <mesh position={[0.5, 0.01, 0]} rotation-z={-0.04} material={chrome} castShadow>
        <boxGeometry args={[0.72, 0.022, 0.11]} />
      </mesh>
    </group>
  );
}
