import { RoundedBox } from '@react-three/drei';
import { useMemo, type ComponentProps } from 'react';
import * as THREE from 'three';
import { paintKetchupLabel } from './dinerArt.ts';
import { brushedSteel, chrome } from './materials.ts';
import { useCanvasTexture } from './useCanvasTexture.ts';

// The clutter every diner table has: a napkin dispenser, salt and pepper,
// and a squeeze bottle of ketchup.

const glass = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  roughness: 0.04,
  transmission: 0.92,
  thickness: 0.25,
  ior: 1.45,
  transparent: true,
});
const salt = new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.95 });
const pepper = new THREE.MeshStandardMaterial({ color: '#2a221d', roughness: 0.95 });
const paper = new THREE.MeshStandardMaterial({ color: '#f8f6f0', roughness: 0.95, side: THREE.DoubleSide });
const rubber = new THREE.MeshStandardMaterial({ color: '#15110e', roughness: 0.9 });
const hole = new THREE.MeshBasicMaterial({ color: '#1a1512' });
const ketchupRed = new THREE.MeshPhysicalMaterial({ color: '#b0141a', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 });
const capWhite = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.5 });

function lathe(points: [number, number][], segments = 32) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

// Shaker: a waisted glass jar with a domed chrome cap.
const SHAKER = lathe([
  [0, 0],
  [0.2, 0],
  [0.23, 0.04],
  [0.22, 0.3],
  [0.2, 0.46],
  [0.17, 0.54],
  [0, 0.54],
]);
const SHAKER_CAP = lathe([
  [0, 0.54],
  [0.175, 0.54],
  [0.18, 0.6],
  [0.16, 0.68],
  [0.1, 0.73],
  [0, 0.74],
]);
const HOLES = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i / 6) * Math.PI * 2) * 0.08, Math.sin((i / 6) * Math.PI * 2) * 0.08] as const);
/** Height of the cap's dome at radius r, from its profile. */
const capTop = (r: number) => (r < 0.1 ? 0.74 - r * 0.1 : 0.73 - (r - 0.1) * 0.83);

/** Salt or pepper, with the contents showing through the glass. */
export function Shaker({ contents, ...props }: { contents: 'salt' | 'pepper' } & ComponentProps<'group'>) {
  const fill = contents === 'salt' ? 0.8 : 0.66;
  return (
    <group {...props}>
      <mesh geometry={SHAKER} material={contents === 'salt' ? salt : pepper} scale={[0.86, fill, 0.86]} position-y={0.015} />
      <mesh geometry={SHAKER} material={glass} castShadow />
      <mesh geometry={SHAKER_CAP} material={chrome} castShadow />
      {/* Holes: dark discs lying on the dome. */}
      {[...HOLES, [0, 0] as const].map(([x, z], i) => (
        <mesh key={i} position={[x, capTop(Math.hypot(x, z)) + 0.003, z]} rotation-x={-Math.PI / 2} material={hole}>
          <circleGeometry args={[0.019, 12]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A satin-steel napkin dispenser with a fan of napkins showing through the
 * opening, on a rubber foot.
 */
export function NapkinDispenser(props: ComponentProps<'group'>) {
  const w = 1.6;
  const h = 1.25;
  const d = 0.95;
  const napkins = [0, 1, 2, 3, 4, 5];
  return (
    <group {...props}>
      <mesh position-y={0.025} material={rubber}>
        <boxGeometry args={[w + 0.04, 0.05, d + 0.04]} />
      </mesh>
      <RoundedBox args={[w, h, d]} radius={0.07} smoothness={4} position-y={0.05 + h / 2} material={brushedSteel} castShadow receiveShadow />
      {/* The opening, and the napkins fanned out of it. */}
      <mesh position={[0, 0.05 + h * 0.62, d / 2 - 0.03]} material={rubber}>
        <boxGeometry args={[w * 0.7, 0.44, 0.1]} />
      </mesh>
      {napkins.map((i) => (
        <mesh
          key={i}
          position={[(i - 2.5) * 0.012, 0.05 + h * 0.62 - 0.12 + i * 0.045, d / 2 + 0.1 + i * 0.02]}
          rotation={[-0.25 + i * 0.08, 0, (i - 2.5) * 0.03]}
          material={paper}
          castShadow
        >
          <boxGeometry args={[w * 0.62, 0.012, 0.5]} />
        </mesh>
      ))}
      {/* Chrome lip along the top edge. */}
      <mesh position={[0, 0.05 + h - 0.02, 0]} material={chrome}>
        <boxGeometry args={[w - 0.1, 0.04, d - 0.1]} />
      </mesh>
    </group>
  );
}

const BOTTLE = lathe([
  [0, 0],
  [0.25, 0],
  [0.28, 0.05],
  [0.28, 0.78],
  [0.25, 0.95],
  [0.13, 1.1],
  [0.11, 1.18],
  [0, 1.18],
]);
const NOZZLE = lathe([
  [0, 1.18],
  [0.11, 1.18],
  [0.1, 1.3],
  [0.05, 1.38],
  [0.02, 1.42],
  [0, 1.42],
]);

/** The classic red squeeze bottle. */
export function Ketchup(props: ComponentProps<'group'>) {
  const label = useCanvasTexture(paintKetchupLabel, []);
  const labelGeometry = useMemo(() => new THREE.CylinderGeometry(0.284, 0.284, 0.5, 24, 1, true, -0.95, 1.9), []);
  return (
    <group {...props}>
      <mesh geometry={BOTTLE} material={ketchupRed} castShadow receiveShadow />
      <mesh geometry={NOZZLE} material={capWhite} castShadow />
      <mesh geometry={labelGeometry} position-y={0.5}>
        <meshStandardMaterial map={label} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
