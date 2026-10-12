import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { BEL_AIR, Car, PICKUP, STUDEBAKER, WAGON } from './Cars.tsx';
import { paintCloud, paintDinerSign, paintHorizon } from './dinerArt.ts';
import { GROUND_Y } from './dims.ts';
import { paintAsphaltColour, paintAsphaltNormal, paintConcrete, paintGrass } from './surfaces.ts';
import { Tree } from './Trees.tsx';
import { useCanvasTexture } from './useCanvasTexture.ts';

// Everything outside the window, in world units on the ground plane
// GROUND_Y. Further away is more negative z.

const WALK_FAR = -3.6;
const LOT_FAR = -48;
const ROAD_FAR = -57;
const FIELD_FAR = -400;
const HORIZON_Z = -380;

const lineWhite = new THREE.MeshStandardMaterial({ color: '#d8d3c4', roughness: 0.9, transparent: true, opacity: 0.75 });
const lineYellow = new THREE.MeshStandardMaterial({ color: '#c9a23a', roughness: 0.9, transparent: true, opacity: 0.8 });
const wood = new THREE.MeshStandardMaterial({ color: '#5d4330', roughness: 0.95 });
const steel = new THREE.MeshStandardMaterial({ color: '#b9bfc6', metalness: 0.8, roughness: 0.35 });
const curbStone = new THREE.MeshStandardMaterial({ color: '#a8a39a', roughness: 0.95 });

function Ground() {
  const walk = useCanvasTexture(paintConcrete, [], [60, 1]);
  const lotColour = useCanvasTexture(paintAsphaltColour, [], [14, 5]);
  const lotNormal = useCanvasTexture(paintAsphaltNormal, [], [14, 5], true);
  const roadColour = useCanvasTexture(() => paintAsphaltColour(69), [], [40, 1]);
  const grass = useCanvasTexture(paintGrass, [], [60, 40]);
  const plane = (z0: number, z1: number, width: number) => ({
    position: [0, GROUND_Y, (z0 + z1) / 2] as [number, number, number],
    args: [width, Math.abs(z1 - z0)] as [number, number],
  });
  const walkPlane = plane(0, WALK_FAR, 400);
  const lotPlane = plane(WALK_FAR, LOT_FAR, 400);
  const roadPlane = plane(LOT_FAR, ROAD_FAR, 400);
  const field = plane(ROAD_FAR, FIELD_FAR, 1000);
  return (
    <group>
      {/* Sidewalk along the diner, a little higher than the lot, with a curb. */}
      <mesh position={[walkPlane.position[0], GROUND_Y + 0.25, walkPlane.position[2]]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={walkPlane.args} />
        <meshStandardMaterial map={walk} roughness={0.95} />
      </mesh>
      <mesh position={[0, GROUND_Y + 0.125, WALK_FAR]} material={curbStone} receiveShadow castShadow>
        <boxGeometry args={[400, 0.25, 0.3]} />
      </mesh>
      <mesh position={lotPlane.position} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={lotPlane.args} />
        <meshStandardMaterial map={lotColour} normalMap={lotNormal} normalScale={new THREE.Vector2(0.6, 0.6)} roughness={0.95} />
      </mesh>
      <mesh position={roadPlane.position} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={roadPlane.args} />
        <meshStandardMaterial map={roadColour} roughness={0.92} />
      </mesh>
      <mesh position={field.position} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={field.args} />
        <meshStandardMaterial map={grass} roughness={1} />
      </mesh>
      {/* Stall lines, faded, and parking bumpers at the head of the stalls in use. */}
      {[-32.5, -23.5, -14.5, -5.5, 5.5, 14.5, 23.5, 32.5].map((x) => (
        <group key={x}>
          <mesh position={[x, GROUND_Y + 0.01, -12]} rotation-x={-Math.PI / 2} material={lineWhite}>
            <planeGeometry args={[0.28, 13]} />
          </mesh>
          <mesh position={[x, GROUND_Y + 0.01, -31]} rotation-x={-Math.PI / 2} material={lineWhite}>
            <planeGeometry args={[0.28, 13]} />
          </mesh>
        </group>
      ))}
      {[
        [-10, -6.2],
        [10, -6.2],
        [-19, -25.2],
        [28, -25.2],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x!, GROUND_Y + 0.14, z!]} material={curbStone} castShadow receiveShadow>
          <boxGeometry args={[5.5, 0.28, 0.5]} />
        </mesh>
      ))}
      {Array.from({ length: 30 }, (_, i) => -145 + i * 10).map((x) => (
        <mesh key={x} position={[x, GROUND_Y + 0.01, (LOT_FAR + ROAD_FAR) / 2]} rotation-x={-Math.PI / 2} material={lineYellow}>
          <planeGeometry args={[4, 0.25]} />
        </mesh>
      ))}
    </group>
  );
}

const POLE_XS = [-56, -28, 0, 28, 56];
const POLE_Z = ROAD_FAR - 2.5;
const POLE_H = 22;

function TelephonePoles() {
  const wires = useMemo(
    () =>
      [-2.1, 2.1].map((dx) => {
        // A little sag between poles.
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < POLE_XS.length - 1; i++) {
          const a = POLE_XS[i]!;
          const b = POLE_XS[i + 1]!;
          for (let k = 0; k <= 8; k++) {
            const t = k / 8;
            pts.push(new THREE.Vector3(a + (b - a) * t + dx, GROUND_Y + POLE_H - 0.9 - Math.sin(t * Math.PI) * 1.2, POLE_Z));
          }
        }
        return pts;
      }),
    [],
  );
  return (
    <group>
      {POLE_XS.map((x) => (
        <group key={x} position={[x, GROUND_Y, POLE_Z]}>
          <mesh position-y={POLE_H / 2} material={wood} castShadow>
            <cylinderGeometry args={[0.26, 0.36, POLE_H, 10]} />
          </mesh>
          <mesh position-y={POLE_H - 1.1} material={wood} castShadow>
            <boxGeometry args={[5, 0.3, 0.3]} />
          </mesh>
          {[-2.1, 2.1].map((dx) => (
            <mesh key={dx} position={[dx, POLE_H - 0.75, 0]} material={steel}>
              <cylinderGeometry args={[0.08, 0.1, 0.4, 8]} />
            </mesh>
          ))}
        </group>
      ))}
      {wires.map((points, i) => (
        <Line key={i} points={points} color="#1f1f1f" lineWidth={1} />
      ))}
    </group>
  );
}

/** Roadside pole sign, lettered like the diner's own neon. */
function PoleSign({ owner }: { owner: string }) {
  const face = useCanvasTexture(() => paintDinerSign(owner), [owner]);
  const top = GROUND_Y + 10.5;
  return (
    <group position={[19, 0, -52]} rotation-y={-0.3}>
      <mesh position-y={(GROUND_Y + top - 1.8) / 2} material={steel} castShadow>
        <cylinderGeometry args={[0.3, 0.36, top - 1.8 - GROUND_Y, 12]} />
      </mesh>
      <mesh position-y={top} material={steel} castShadow>
        <boxGeometry args={[8.6, 3.6, 0.5]} />
      </mesh>
      <mesh position={[0, top, 0.26]}>
        <planeGeometry args={[8.3, 3.25]} />
        <meshBasicMaterial map={face} toneMapped={false} color={[1.1, 1.1, 1.1]} />
      </mesh>
    </group>
  );
}

/** Hills and a tree line along the horizon, behind the field. */
function Horizon() {
  const strip = useCanvasTexture(paintHorizon, []);
  return (
    <mesh position={[0, GROUND_Y + 40, HORIZON_Z]}>
      <planeGeometry args={[1400, 350]} />
      <meshBasicMaterial map={strip} transparent fog={false} toneMapped={false} />
    </mesh>
  );
}

const CLOUDS: { x: number; y: number; z: number; w: number; seed: number }[] = [
  { x: -220, y: 150, z: -520, w: 240, seed: 1 },
  { x: 60, y: 185, z: -560, w: 300, seed: 2 },
  { x: 300, y: 140, z: -500, w: 220, seed: 3 },
  { x: -420, y: 120, z: -480, w: 200, seed: 4 },
  { x: 180, y: 110, z: -450, w: 160, seed: 5 },
];

function Clouds() {
  return (
    <group>
      {CLOUDS.map((c) => (
        <CloudSprite key={c.seed} {...c} />
      ))}
    </group>
  );
}

function CloudSprite({ x, y, z, w, seed }: (typeof CLOUDS)[number]) {
  const puff = useCanvasTexture(() => paintCloud(seed), [seed]);
  return (
    <sprite position={[x, GROUND_Y + y, z]} scale={[w, w, 1]}>
      <spriteMaterial map={puff} transparent depthWrite={false} fog={false} toneMapped={false} />
    </sprite>
  );
}

const TREES: { x: number; z: number; h: number; seed: number; tint?: [number, number, number] }[] = [
  { x: -22, z: -64, h: 24, seed: 3 },
  { x: -33, z: -92, h: 28, seed: 5, tint: [0.36, 0.5, 0.2] },
  { x: -8, z: -76, h: 26, seed: 7 },
  { x: 10, z: -82, h: 27, seed: 9, tint: [0.3, 0.5, 0.24] },
  { x: 25, z: -68, h: 23, seed: 11 },
  { x: 37, z: -96, h: 29, seed: 13, tint: [0.42, 0.52, 0.2] },
  { x: -52, z: -130, h: 32, seed: 15 },
  { x: 50, z: -126, h: 30, seed: 17 },
  { x: -19, z: -44, h: 19, seed: 19 },
  { x: 2, z: -112, h: 30, seed: 21, tint: [0.34, 0.52, 0.22] },
];

export function ParkingLot({ sign }: { sign: string }) {
  return (
    <group>
      <Horizon />
      <Clouds />
      <Ground />
      <TelephonePoles />
      <PoleSign owner={sign} />
      {TREES.map((t) => (
        <Tree key={t.seed} position={[t.x, GROUND_Y, t.z]} height={t.h} seed={t.seed} tint={t.tint} />
      ))}
      {/* Parked square to the stall lines: the Studebaker and pickup nose-in,
          the Bel Air and wagon backed in, none of them quite straight. */}
      <Car spec={STUDEBAKER} position={[10.2, GROUND_Y, -12.3]} rotation-y={-Math.PI / 2 + 0.04} />
      <Car spec={BEL_AIR} position={[-9.6, GROUND_Y, -12.8]} rotation-y={Math.PI / 2 - 0.07} />
      <Car spec={PICKUP} position={[-19.3, GROUND_Y, -31.2]} rotation-y={-Math.PI / 2 - 0.05} />
      <Car spec={WAGON} position={[27.8, GROUND_Y, -31.6]} rotation-y={Math.PI / 2 + 0.06} />
    </group>
  );
}
