import { RoundedBox, useCursor } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { slotKey, visibleSides, type Catalog } from '../../shared/catalog.ts';
import { useJukebox } from '../store.ts';
import { TRAY_W } from './dims.ts';
import { bakelite } from './materials.ts';
import { paintKeyCap } from './paint.ts';

const KEY_H = 0.22;
const KEY_D = 0.16;
const ROW_Y = 0.13;

function Key({ label, width, x, y, z, kind }: { label: string; width: number; x: number; y: number; z: number; kind: 'page' | 'number' }) {
  const ref = useRef<THREE.Group>(null);
  const press = useJukebox((s) => s.press);
  const invalidate = useThree((s) => s.invalidate);
  const [hover, setHover] = useState(false);
  useCursor(hover);
  const travel = useRef(0);

  // Page keys glow for the pages on show and blaze while waiting for a
  // number; number keys glow while a page letter is waiting.
  const lit = useJukebox((s) => {
    if (kind === 'number') return s.buffer ? 2 : 0;
    if (s.buffer === label) return 2;
    const side = s.catalog?.sides.findIndex((p) => p.letter === label) ?? -1;
    return visibleSides(s.view).includes(side) ? 1 : 0;
  });
  const face = useMemo(() => {
    const t = new THREE.CanvasTexture(paintKeyCap(label, lit > 0));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [label, lit]);
  useEffect(() => () => face.dispose(), [face]);
  const material = useMemo(() => {
    const m = bakelite.clone();
    m.emissive = new THREE.Color(lit === 2 ? '#ff9a3c' : '#ffb347');
    m.emissiveIntensity = lit === 2 ? 0.9 : lit === 1 ? 0.3 : 0;
    return m;
  }, [lit]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    if (!ref.current || travel.current <= 0) return;
    travel.current = Math.max(0, travel.current - dt * 5);
    ref.current.position.z = z - 0.045 * Math.sin(travel.current * Math.PI * 0.5);
    invalidate();
  });

  return (
    <group
      ref={ref}
      position={[x, y, z]}
      onPointerDown={(e) => {
        e.stopPropagation();
        travel.current = 1;
        press(label);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <RoundedBox args={[width, KEY_H, KEY_D]} radius={0.025} smoothness={4} material={material} castShadow />
      <mesh position-z={KEY_D / 2 + 0.001} raycast={() => null}>
        <planeGeometry args={[width * 0.92, KEY_H * 0.92]} />
        <meshBasicMaterial map={face} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Two rows of square Bakelite keys, as on the Seeburg: page letters on top,
 * strip numbers underneath.
 */
export function KeyTray({ catalog, z }: { catalog: Catalog; z: number }) {
  const letters = catalog.sides.map((s) => s.letter);
  const numbers = Array.from({ length: catalog.stripsPerPage }, (_, i) => slotKey(i));
  const longest = Math.max(letters.length, numbers.length, 8);
  const pitch = Math.min(0.215, (TRAY_W - 0.32) / longest);
  const width = pitch - 0.022;
  const row = (labels: string[], y: number, kind: 'page' | 'number') =>
    labels.map((label, i) => (
      <Key key={label} label={label} width={width} x={(i - (labels.length - 1) / 2) * pitch} y={y} z={z} kind={kind} />
    ));
  return (
    <group>
      {row(letters, ROW_Y, 'page')}
      {row(numbers, -ROW_Y, 'number')}
    </group>
  );
}
