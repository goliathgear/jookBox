import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { seeded } from './dinerArt.ts';
import { paintBark, paintLeafCard } from './surfaces.ts';
import { useCanvasTexture } from './useCanvasTexture.ts';

// A deciduous tree the way games build them: a trunk with a few branches,
// and a canopy of leaf-cluster cards scattered through several lobes. The
// cards are alpha-tested so they cast leaf-shaped shadows.

const CARD = new THREE.PlaneGeometry(1, 1);

function useBark() {
  const art = useMemo(paintBark, []);
  const colour = useCanvasTexture(() => art.colour, [art], [2, 6]);
  const normal = useCanvasTexture(() => art.normal, [art], [2, 6], true);
  return useMemo(() => new THREE.MeshStandardMaterial({ map: colour, normalMap: normal, roughness: 0.95 }), [colour, normal]);
}

function useLeafMaterial(seed: number, tint: [number, number, number]) {
  const card = useCanvasTexture(() => paintLeafCard(seed, tint), [seed, tint.join()]);
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: card,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.9,
        // Leaves glow a little where the sun comes through them.
        emissive: new THREE.Color(tint[0], tint[1], tint[2]),
        emissiveIntensity: 0.12,
      }),
    [card, tint],
  );
}

export interface TreeProps {
  position: [number, number, number];
  height: number;
  seed: number;
  tint?: [number, number, number];
}

export function Tree({ position, height, seed, tint = [0.3, 0.52, 0.22] }: TreeProps) {
  const bark = useBark();
  const leaves = useLeafMaterial(seed, tint);
  const canopy = useRef<THREE.InstancedMesh>(null);

  const plan = useMemo(() => {
    const rand = seeded(seed);
    const trunkH = height * 0.42;
    const crownR = height * 0.34;
    const crownY = trunkH + crownR * 0.7;
    // Lobes: a big one in the middle and a few off to the sides and top.
    const lobes = [{ c: new THREE.Vector3(0, crownY, 0), r: crownR }];
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      lobes.push({
        c: new THREE.Vector3(Math.cos(a) * crownR * 0.6, crownY + (rand() - 0.3) * crownR * 0.8, Math.sin(a) * crownR * 0.6),
        r: crownR * (0.45 + rand() * 0.35),
      });
    }
    const branches = lobes.slice(1).map((l) => ({
      from: new THREE.Vector3(0, trunkH * 0.85, 0),
      to: l.c.clone().sub(new THREE.Vector3(0, l.r * 0.2, 0)),
    }));
    const cardCount = Math.round(180 + height * 10);
    const cardSize = crownR * 0.55;
    return { rand, trunkH, lobes, branches, cardCount, cardSize };
  }, [seed, height]);

  useLayoutEffect(() => {
    const mesh = canopy.current;
    if (!mesh) return;
    const { rand, lobes, cardCount, cardSize } = plan;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < cardCount; i++) {
      const lobe = lobes[Math.floor(rand() * lobes.length)]!;
      // Bias cards toward the surface of each lobe, where the light is.
      const r = lobe.r * Math.cbrt(0.3 + rand() * 0.7);
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      p.set(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)).add(lobe.c);
      e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      q.setFromEuler(e);
      const k = cardSize * (0.7 + rand() * 0.6);
      s.set(k, k, k);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [plan]);

  const { trunkH, branches, cardCount } = plan;
  const trunkR = height * 0.028;
  return (
    <group position={position}>
      <mesh position-y={trunkH / 2} material={bark} castShadow receiveShadow>
        <cylinderGeometry args={[trunkR * 0.7, trunkR * 1.4, trunkH, 10]} />
      </mesh>
      {branches.map((b, i) => {
        const dir = b.to.clone().sub(b.from);
        const len = dir.length();
        const mid = b.from.clone().add(dir.clone().multiplyScalar(0.5));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        return (
          <mesh key={i} position={mid} quaternion={quat} material={bark} castShadow>
            <cylinderGeometry args={[trunkR * 0.25, trunkR * 0.55, len, 7]} />
          </mesh>
        );
      })}
      <instancedMesh ref={canopy} args={[CARD, leaves, cardCount]} castShadow receiveShadow frustumCulled={false} />
    </group>
  );
}
