import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, type FontData } from 'three/addons/loaders/FontLoader.js';
import type { Catalog } from '../../shared/catalog.ts';
import type { JukeboxConfig } from '../../shared/types.ts';
import {
  BUMPER_R,
  BUMPER_T,
  CAB_BOTTOM,
  COIN_D,
  COIN_H,
  COIN_W,
  HOOD_R,
  HOOD_T,
  LEAF_Z,
  LOBE_D,
  LOBE_FRONT,
  LOBE_W,
  LOBE_X,
  TRAY_H,
  TRAY_W,
  TRAY_Y,
  TRAY_Z,
  WALL_Z,
  WIN_BOTTOM,
  WIN_CY,
  WIN_H,
  WIN_R,
  WIN_TOP,
} from './dims.ts';
import lobster from './fonts/lobster.typeface.json';
import oswald from './fonts/oswald-bold.typeface.json';
import { KeyTray } from './Keys.tsx';
import { chrome, darkChrome, glassReflection, glassSmudges, glassTint, trayLining, velvet } from './materials.ts';
import { paintGlassLogo } from './paint.ts';
import { TitleRack } from './TitleRack.tsx';
import { useCanvasTexture } from './useCanvasTexture.ts';

const noRaycast = () => null;

// Raised lettering on the coin head, as extruded glyph outlines: the badge
// in the same script as the glass logo, the price in the title strips' face.
const badgeFont = new FontLoader().parse(lobster as unknown as FontData);
const plateFont = new FontLoader().parse(oswald as unknown as FontData);
// Cast relief: warm off-white letters, not glossy enough to look like
// plastic, on a deep red enamel field.
const enamelWhite = new THREE.MeshPhysicalMaterial({ color: '#e9e2d2', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
const enamelRed = new THREE.MeshPhysicalMaterial({ color: '#8e1a1c', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
const gasket = new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.9 });

/**
 * Letters standing `depth` proud of a surface: centred on the origin, back
 * face at z = 0, shrunk if need be to fit `maxWidth`.
 */
function useRaisedText(text: string, size: number, depth: number, maxWidth: number, font = badgeFont) {
  const geometry = useMemo(() => {
    const g = new TextGeometry(text, {
      font,
      size,
      depth: depth * 0.7,
      curveSegments: 8,
      bevelEnabled: true,
      // A small, crisp edge; a fat bevel reads as puffy plastic.
      bevelThickness: depth * 0.3,
      bevelSize: size * 0.012,
      bevelSegments: 2,
    });
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const w = b.max.x - b.min.x;
    g.translate(-(b.min.x + w / 2), -(b.min.y + (b.max.y - b.min.y) / 2), -b.min.z);
    const k = Math.min(1, maxWidth / w);
    g.scale(k, k, 1);
    return g;
  }, [text, size, depth, maxWidth, font]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** The coin entry: where it sits on the coin head's face, the hole, the funnel lip and the cup behind. */
const COIN_X = 0.42;
const COIN_R = 0.14;
// Also the coin head's edge rounding: one bevel does both, so a bigger lip
// would also mean a bigger mouth.
const COIN_LIP = 0.05;
/** A coin's thickness or so: the quarter goes in flat and drops through the slot at the bottom. */
const COIN_CUP = 0.05;

/**
 * The coin entry's recess, behind the hole in the coin head: painted the
 * badge's red, with the price filling it. `position` is the hole's centre
 * on the face.
 */
function CoinEntry({ position }: { position: [number, number, number] }) {
  const price = useRaisedText('25¢', 0.17, 0.01, 2 * COIN_R - 0.06, plateFont);
  const walls = useMemo(() => {
    const m = enamelRed.clone();
    m.side = THREE.BackSide;
    return m;
  }, []);
  const back = -(COIN_LIP + COIN_CUP);
  return (
    <group position={position}>
      <mesh position-z={-COIN_LIP - COIN_CUP / 2} rotation-x={Math.PI / 2} material={walls} raycast={noRaycast}>
        <cylinderGeometry args={[COIN_R, COIN_R, COIN_CUP, 32, 1, true]} />
      </mesh>
      <mesh position-z={back} material={enamelRed} raycast={noRaycast}>
        <circleGeometry args={[COIN_R, 32]} />
      </mesh>
      <mesh geometry={price} position-z={back + 0.002} material={enamelWhite} castShadow raycast={noRaycast} />
    </group>
  );
}

/**
 * A maker's badge: white script standing up out of a sunken oxblood field,
 * inside a chrome frame it comes up level with.
 */
function Badge({ text, width, height, position }: { text: string; width: number; height: number; position: [number, number, number] }) {
  // Shallow relief, standing a little way up out of the recess.
  const letters = useRaisedText(text, height * 0.7, 0.014, width - 0.1);
  const frame = useMemo(() => {
    const shape = roundedRect(new THREE.Shape(), width + 0.1, height + 0.1, 0.05);
    shape.holes.push(roundedRect(new THREE.Path(), width, height, 0.02));
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelOffset: -0.008,
      bevelSegments: 3,
      curveSegments: 12,
    });
  }, [width, height]);
  useEffect(() => () => frame.dispose(), [frame]);
  return (
    <group position={position}>
      <mesh geometry={frame} material={chrome} castShadow raycast={noRaycast} />
      <mesh position-z={0.0075} material={enamelRed} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[width, height, 0.015]} />
      </mesh>
      <mesh geometry={letters} position-z={0.015} material={enamelWhite} castShadow raycast={noRaycast} />
    </group>
  );
}

/**
 * A rounded slab whose plan (looking down) is `outline`, `thickness` tall,
 * with its bottom face at y = 0. The bevel rounds every edge like pressed
 * chrome trim.
 */
function useSlab(outline: () => THREE.Shape, thickness: number, bevel: number) {
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(outline(), {
      depth: thickness - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 8,
      curveSegments: 72,
    });
    // Shape y becomes world z (toward the viewer); extrusion runs up.
    g.rotateX(Math.PI / 2);
    g.translate(0, thickness - bevel, 0);
    return g;
  }, [outline, thickness, bevel]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Half-disk in front of the spine plus a strip running back into the box. */
function bowOutline(r: number, back: number) {
  return () => {
    const s = new THREE.Shape();
    s.moveTo(r, -back);
    s.lineTo(r, 0);
    s.absarc(0, 0, r, 0, Math.PI, false);
    s.lineTo(-r, -back);
    s.closePath();
    return s;
  };
}

/** The bumper: full width between the pods, bulging out under the window. */
function bumperOutline(r: number, halfWidth: number, sideZ: number, back: number) {
  return () => {
    const s = new THREE.Shape();
    const a = Math.asin(sideZ / r);
    s.moveTo(halfWidth, -back);
    s.lineTo(halfWidth, sideZ);
    s.lineTo(Math.cos(a) * r, sideZ);
    s.absarc(0, 0, r, a, Math.PI - a, false);
    s.lineTo(-halfWidth, sideZ);
    s.lineTo(-halfWidth, -back);
    s.closePath();
    return s;
  };
}

function roundedRect<T extends THREE.Path>(path: T, w: number, h: number, r: number): T {
  path.moveTo(-w / 2 + r, -h / 2);
  path.lineTo(w / 2 - r, -h / 2);
  path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  path.lineTo(w / 2, h / 2 - r);
  path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  path.lineTo(-w / 2 + r, h / 2);
  path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  path.lineTo(-w / 2, -h / 2 + r);
  path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return path;
}

const HOOD_OUTLINE = bowOutline(HOOD_R - 0.06, 0.6);
const BUMPER_OUTLINE = bumperOutline(BUMPER_R - 0.1, LOBE_X, LOBE_FRONT - 0.2, 0.6);

/**
 * The front half of a thin band round a pod, in plan: `proud` of the pod's
 * surface outside, `buried` in it inside, ending halfway down the sides.
 */
function ribOutline(w: number, d: number, r: number, proud: number, buried: number) {
  return () => {
    const hw = w / 2;
    const hd = d / 2;
    const s = new THREE.Shape();
    s.moveTo(-hw - proud, 0);
    s.lineTo(-hw - proud, hd - r);
    s.absarc(-hw + r, hd - r, r + proud, Math.PI, Math.PI / 2, true);
    s.lineTo(hw - r, hd + proud);
    s.absarc(hw - r, hd - r, r + proud, Math.PI / 2, 0, true);
    s.lineTo(hw + proud, 0);
    s.lineTo(hw - buried, 0);
    s.lineTo(hw - buried, hd - r);
    s.absarc(hw - r, hd - r, r - buried, 0, Math.PI / 2, false);
    s.lineTo(-hw + r, hd - buried);
    s.absarc(-hw + r, hd - r, r - buried, Math.PI / 2, Math.PI, false);
    s.lineTo(-hw + buried, 0);
    s.closePath();
    return s;
  };
}
const POD_RIB_OUTLINE = ribOutline(LOBE_W, LOBE_D, 0.42, 0.02, 0.03);
const POD_RIB_T = 0.034;

/** Chrome hood over the window, with the ribbed coin head sitting on top. */
function Hood({ label }: { label: string }) {
  const hood = useSlab(HOOD_OUTLINE, HOOD_T, 0.08);
  const top = WIN_TOP + HOOD_T;
  const coinZ = HOOD_R - COIN_D / 2 - 0.28;
  const front = coinZ + COIN_D / 2;
  // The badge and the coin entry sit at the same height on the face.
  const faceY = top + 0.15;
  const headY = WIN_TOP + (HOOD_T + COIN_H) / 2;
  // The coin head: a rounded loaf with the coin entry cut right through
  // it, so the bevel rolls a chrome funnel round the hole. It starts
  // inside the hood so its rounded underside never shows.
  const coinHead = useMemo(() => {
    const shape = roundedRect(new THREE.Shape(), COIN_W, HOOD_T + COIN_H, 0.24);
    shape.holes.push(new THREE.Path().absarc(COIN_X, faceY - headY, COIN_R, 0, Math.PI * 2, true));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: COIN_D - 2 * COIN_LIP,
      bevelEnabled: true,
      bevelThickness: COIN_LIP,
      bevelSize: COIN_LIP,
      bevelOffset: -COIN_LIP,
      bevelSegments: 6,
      curveSegments: 48,
    });
    g.translate(0, 0, COIN_LIP - COIN_D / 2);
    return g;
  }, [faceY, headY]);
  useEffect(() => () => coinHead.dispose(), [coinHead]);
  const ribs = [0, 1, 2, 3];
  return (
    <group>
      <mesh geometry={hood} position-y={WIN_TOP} material={chrome} castShadow receiveShadow raycast={noRaycast} />
      <mesh geometry={coinHead} position={[0, headY, coinZ]} material={chrome} castShadow raycast={noRaycast} />
      {/* The maker's badge on the face of the coin head, with the coin entry beside it. */}
      <Badge text={label} width={0.56} height={0.24} position={[-0.2, faceY, front + 0.002]} />
      <CoinEntry position={[COIN_X, faceY, front]} />
      {/* Louvred ribs on the left, balancing the coin entry. */}
      {ribs.map((i) => (
        <mesh key={i} position={[-0.63, top + 0.05 + i * 0.065, front + 0.01]} rotation-z={Math.PI / 2} material={chrome} raycast={noRaycast}>
          <capsuleGeometry args={[0.02, 0.1, 6, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/** Bow-front window: tinted glass, reflections, and the script logo. */
function Window({ title }: { title: string }) {
  const logo = useCanvasTexture(() => paintGlassLogo(title), [title]);
  const logoTheta = 1.9;
  const logoH = (WIN_R * logoTheta) / 8;
  return (
    <group position-y={WIN_CY}>
      <mesh material={glassTint} raycast={noRaycast} renderOrder={10}>
        <cylinderGeometry args={[WIN_R, WIN_R, WIN_H, 96, 1, true, -Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh material={glassReflection} raycast={noRaycast} renderOrder={11}>
        <cylinderGeometry args={[WIN_R + 0.002, WIN_R + 0.002, WIN_H, 96, 1, true, -Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh material={glassSmudges} raycast={noRaycast} renderOrder={11}>
        <cylinderGeometry args={[WIN_R + 0.003, WIN_R + 0.003, WIN_H, 96, 1, true, -Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh position-y={WIN_BOTTOM + 0.17 - WIN_CY} raycast={noRaycast} renderOrder={12}>
        <cylinderGeometry args={[WIN_R + 0.004, WIN_R + 0.004, logoH, 64, 1, true, -logoTheta / 2, logoTheta]} />
        <meshBasicMaterial map={logo} transparent depthWrite={false} />
      </mesh>
      {/* Chrome beads over a dark gasket where the glass meets the hood and the bumper. */}
      {[WIN_TOP - 0.035, WIN_BOTTOM + 0.035].map((y) => (
        <mesh key={y} position-y={y - WIN_CY} rotation-x={Math.PI / 2} material={chrome} castShadow raycast={noRaycast}>
          <torusGeometry args={[WIN_R + 0.012, 0.028, 10, 96, Math.PI]} />
        </mesh>
      ))}
      {[WIN_TOP - 0.008, WIN_BOTTOM + 0.008].map((y) => (
        <mesh key={y} position-y={y - WIN_CY} rotation-x={Math.PI / 2} material={gasket} raycast={noRaycast}>
          <torusGeometry args={[WIN_R + 0.012, 0.012, 8, 96, Math.PI]} />
        </mesh>
      ))}
      {/* Chrome mullions where the glass meets the pods. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WIN_R + 0.02), 0, 0.02]} material={chrome} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.05, 0.05, WIN_H, 20]} />
        </mesh>
      ))}
    </group>
  );
}

/** Inside the window: dark back wall, the spine, and a warm lamp under the hood. */
function Interior() {
  return (
    <group>
      <mesh position={[0, WIN_CY, 0]} material={velvet} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[2 * WIN_R + 0.2, WIN_H + 0.1]} />
      </mesh>
      <mesh position={[0, WIN_CY, LEAF_Z]} material={chrome} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.022, 0.022, WIN_H, 16]} />
      </mesh>
      <pointLight position={[0, WIN_TOP - 0.12, 0.65]} intensity={2.8} distance={3.2} color="#ffd9a6" />
    </group>
  );
}

/** The two big rounded chrome pods, ribbed the height of the window, and the box that joins them. */
function Body() {
  const lobeTop = WIN_TOP + HOOD_T * 0.6;
  const lobeH = lobeTop - CAB_BOTTOM;
  const rib = useSlab(POD_RIB_OUTLINE, POD_RIB_T, 0.012);
  // Three clusters of four louvres, like the coin head's, down the window's height.
  const ribYs = useMemo(
    () => [WIN_BOTTOM + 0.32, WIN_CY, WIN_TOP - 0.32].flatMap((c) => [-1.5, -0.5, 0.5, 1.5].map((k) => c + k * 0.075)),
    [],
  );
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * LOBE_X, 0, LOBE_FRONT - LOBE_D / 2]}>
          <RoundedBox
            args={[LOBE_W, lobeH, LOBE_D]}
            radius={0.42}
            smoothness={8}
            position-y={CAB_BOTTOM + lobeH / 2}
            material={chrome}
            castShadow
            receiveShadow
            raycast={noRaycast}
          />
          {ribYs.map((y) => (
            <mesh key={y} geometry={rib} position-y={y - POD_RIB_T / 2} material={chrome} raycast={noRaycast} />
          ))}
        </group>
      ))}
      <mesh position={[0, (WIN_TOP + CAB_BOTTOM) / 2, WALL_Z / 2 - 0.01]} material={darkChrome} raycast={noRaycast}>
        <boxGeometry args={[2 * LOBE_X, WIN_TOP - CAB_BOTTOM, -WALL_Z]} />
      </mesh>
    </group>
  );
}

function Bumper() {
  const geometry = useSlab(BUMPER_OUTLINE, BUMPER_T, 0.13);
  return (
    <mesh
      geometry={geometry}
      position-y={WIN_BOTTOM - BUMPER_T}
      material={chrome}
      castShadow
      receiveShadow
      raycast={noRaycast}
    />
  );
}

/** Chrome-framed recess holding the two rows of keys. */
function Tray({ catalog }: { catalog: Catalog }) {
  const bezel = useMemo(() => {
    const shape = roundedRect(new THREE.Shape(), TRAY_W, TRAY_H, 0.14);
    shape.holes.push(roundedRect(new THREE.Path(), TRAY_W - 0.14, TRAY_H - 0.14, 0.08));
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 5,
      curveSegments: 16,
    });
  }, []);
  useEffect(() => () => bezel.dispose(), [bezel]);

  return (
    <group>
      {/* Lower front of the body, between the pods. */}
      <RoundedBox
        args={[2 * LOBE_X, TRAY_H + 0.34, 0.9]}
        radius={0.16}
        smoothness={6}
        position={[0, TRAY_Y - 0.03, TRAY_Z - 0.53]}
        material={chrome}
        castShadow
        receiveShadow
        raycast={noRaycast}
      />
      <group position={[0, TRAY_Y, 0]}>
        <mesh position-z={TRAY_Z - 0.12} material={trayLining} receiveShadow raycast={noRaycast}>
          <boxGeometry args={[TRAY_W - 0.1, TRAY_H - 0.1, 0.2]} />
        </mesh>
        <mesh geometry={bezel} position-z={TRAY_Z - 0.06} material={chrome} castShadow raycast={noRaycast} />
        <KeyTray catalog={catalog} z={TRAY_Z - 0.02} />
      </group>
    </group>
  );
}

export function Wallbox({ config, catalog }: { config: JukeboxConfig; catalog: Catalog }) {
  return (
    <group>
      <Body />
      <Interior />
      <TitleRack catalog={catalog} config={config} />
      <Window title={config.title} />
      <Hood label={config.subtitle ?? 'JookBox'} />
      <Bumper />
      <Tray catalog={catalog} />
    </group>
  );
}
