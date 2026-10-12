import { RoundedBox } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { paintDinerTrim, paintFormica, paintRibbedEdge } from './dinerArt.ts';
import {
  BLINDS_BOTTOM,
  MULLION_X,
  SILL_Y,
  TABLE_FRONT,
  TABLE_W,
  TABLE_Y,
  WALL_Z,
  WINDOW_HALF,
  WINDOW_TOP,
} from './dims.ts';
import { brushedSteel, chrome, glassReflection, glassSmudges } from './materials.ts';
import { Ketchup, NapkinDispenser, Shaker } from './Props.tsx';
import { paintLaminateRoughness, paintVinylColour, paintVinylNormal } from './surfaces.ts';
import { CoffeeCup, Donut, Plate, Spoon, Toast } from './Tableware.tsx';
import { useCanvasTexture } from './useCanvasTexture.ts';

// Inside the diner: the booth table the jukebox sits on, coffee and donuts
// at each place, and the window wall behind, trimmed like the outside of a
// stainless-steel diner.

const TABLE_T = 0.36;
const TABLE_DEPTH = TABLE_FRONT - WALL_Z;

function Table() {
  const formica = useCanvasTexture(paintFormica, [], [TABLE_W / 1.3, TABLE_DEPTH / 1.3]);
  const wear = useCanvasTexture(paintLaminateRoughness, [], [TABLE_W / 4, TABLE_DEPTH / 4], true);
  const edge = useCanvasTexture(paintRibbedEdge, [], [40, 1]);
  const materials = useMemo(() => {
    const top = new THREE.MeshPhysicalMaterial({
      map: formica,
      roughness: 1,
      roughnessMap: wear,
      clearcoat: 0.5,
      clearcoatRoughness: 0.35,
    });
    const band = new THREE.MeshStandardMaterial({ map: edge, metalness: 0.9, roughness: 0.3 });
    return [band, band, top, band, band, band];
  }, [formica, wear, edge]);
  return (
    <mesh
      position={[0, TABLE_Y - TABLE_T / 2, WALL_Z + TABLE_DEPTH / 2]}
      material={materials}
      receiveShadow
      castShadow
    >
      <boxGeometry args={[TABLE_W, TABLE_T, TABLE_DEPTH]} />
    </mesh>
  );
}

/** Red vinyl booth backs either side of the table, capped in chrome. */
function Booths() {
  const colour = useCanvasTexture(paintVinylColour, [], [TABLE_DEPTH / 3, 2]);
  const normal = useCanvasTexture(paintVinylNormal, [], [TABLE_DEPTH / 3, 2], true);
  const vinyl = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: colour,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: 0.5,
        clearcoat: 0.4,
        clearcoatRoughness: 0.4,
      }),
    [colour, normal],
  );
  const height = 6.5;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (TABLE_W / 2 + 2.4), TABLE_Y - 1.2 + height / 2, WALL_Z + TABLE_DEPTH / 2 + 1]}>
          <RoundedBox args={[1.6, height, TABLE_DEPTH + 2]} radius={0.4} smoothness={4} material={vinyl} castShadow receiveShadow />
          <mesh position-y={height / 2} rotation-x={Math.PI / 2} material={chrome} castShadow>
            <capsuleGeometry args={[0.16, TABLE_DEPTH + 1.6, 6, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Venetian blinds, lowered to just above the jukebox and tilted open. */
function Blinds({ x, width }: { x: number; width: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pitch = 0.17;
  const count = Math.ceil((WINDOW_TOP - BLINDS_BOTTOM) / pitch);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.75);
    for (let i = 0; i < count; i++) {
      m.compose(new THREE.Vector3(0, BLINDS_BOTTOM + 0.12 + i * pitch, 0), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count]);
  return (
    <group position={[x, 0, WALL_Z + 0.35]}>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.16, 0.012]} />
        <meshStandardMaterial color="#e9e4d6" roughness={0.55} metalness={0.1} />
      </instancedMesh>
      {/* Lift cords. */}
      {[-0.35, 0.35].map((f) => (
        <mesh key={f} position={[f * width, (BLINDS_BOTTOM + WINDOW_TOP) / 2, 0.02]}>
          <cylinderGeometry args={[0.008, 0.008, WINDOW_TOP - BLINDS_BOTTOM, 4]} />
          <meshStandardMaterial color="#d8d2c2" roughness={0.9} />
        </mesh>
      ))}
      <mesh position-y={BLINDS_BOTTOM} material={chrome} castShadow>
        <boxGeometry args={[width, 0.07, 0.12]} />
      </mesh>
    </group>
  );
}

function WindowWall() {
  const trim = useCanvasTexture(paintDinerTrim, [], [(2 * WINDOW_HALF + 8) / ((SILL_Y - TABLE_Y) * 4), 1]);
  const bandH = SILL_Y - TABLE_Y;
  const wide = 2 * WINDOW_HALF + 8;
  const sections = [
    { x: -(WINDOW_HALF + MULLION_X) / 2, w: WINDOW_HALF - MULLION_X },
    { x: 0, w: 2 * MULLION_X },
    { x: (WINDOW_HALF + MULLION_X) / 2, w: WINDOW_HALF - MULLION_X },
  ];
  const windowH = WINDOW_TOP - SILL_Y;
  return (
    <group>
      {/* Below the sill: the stainless trim with green stripes and red diamonds. */}
      <mesh position={[0, TABLE_Y + bandH / 2, WALL_Z + 0.004]} receiveShadow>
        <planeGeometry args={[wide, bandH]} />
        <meshStandardMaterial map={trim} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, SILL_Y, WALL_Z + 0.3]} material={chrome} castShadow receiveShadow>
        <boxGeometry args={[wide, 0.16, 0.7]} />
      </mesh>
      {/* Walls beside and above the window: brushed stainless panels. */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WINDOW_HALF + 6), (TABLE_Y + WINDOW_TOP + 6) / 2, WALL_Z]} material={brushedSteel} receiveShadow>
          <planeGeometry args={[12, WINDOW_TOP + 6 - TABLE_Y]} />
        </mesh>
      ))}
      <mesh position={[0, WINDOW_TOP + 3, WALL_Z]} material={brushedSteel} receiveShadow>
        <planeGeometry args={[wide, 6]} />
      </mesh>
      {/* Window frame and mullions. */}
      {[-WINDOW_HALF, -MULLION_X, MULLION_X, WINDOW_HALF].map((x) => (
        <mesh key={x} position={[x, (SILL_Y + WINDOW_TOP) / 2, WALL_Z + 0.1]} material={chrome} castShadow receiveShadow>
          <boxGeometry args={[0.32, windowH, 0.36]} />
        </mesh>
      ))}
      <mesh position={[0, WINDOW_TOP, WALL_Z + 0.1]} material={chrome} castShadow>
        <boxGeometry args={[2 * WINDOW_HALF + 0.32, 0.3, 0.36]} />
      </mesh>
      {/* The glass: a faint tint, and smudges that catch the light. */}
      <mesh position={[0, (SILL_Y + WINDOW_TOP) / 2, WALL_Z - 0.02]}>
        <planeGeometry args={[2 * WINDOW_HALF, windowH]} />
        <meshPhysicalMaterial color="#d4e4ea" transparent opacity={0.07} roughness={0.02} depthWrite={false} />
      </mesh>
      <mesh position={[0, (SILL_Y + WINDOW_TOP) / 2, WALL_Z - 0.01]} material={glassSmudges}>
        <planeGeometry args={[2 * WINDOW_HALF, windowH]} />
      </mesh>
      <mesh position={[0, (SILL_Y + WINDOW_TOP) / 2, WALL_Z - 0.015]} material={glassReflection}>
        <planeGeometry args={[2 * WINDOW_HALF, windowH]} />
      </mesh>
      {sections.map((s) => (
        <Blinds key={s.x} x={s.x} width={s.w - 0.3} />
      ))}
    </group>
  );
}

/**
 * Breakfast for two: toast on the left, donuts on the right, coffee for
 * both, and the napkins and condiments pushed up by the jukebox. Nothing
 * lines up with anything, because nothing on a diner table does.
 */
function PlaceSettings() {
  return (
    <group position-y={TABLE_Y}>
      {/* Everything stays clear of the sill, which overhangs the back of the table. */}
      <NapkinDispenser position={[-5.3, 0, 0.35]} rotation-y={0.2} />
      <Plate position={[-3.8, 0, 2.1]} rotation-y={0.55}>
        <Toast />
      </Plate>
      {/* In front of the plate, nearest the person; it may run out of frame. */}
      <CoffeeCup position={[-2.2, 0, 4.8]} rotation-y={-0.35} />

      <CoffeeCup position={[5.1, 0, 0.9]} rotation-y={-Math.PI * 0.18} />
      {/* Resting in the saucer: bowl on its slope, handle over the rim. */}
      <Spoon position={[4.69, 0.152, 1.44]} rotation={[0, 2.1, 0.08]} />
      <Plate position={[3.0, 0, 2.5]} rotation-y={-0.5}>
        <Donut frosting="chocolate" sprinkles seed={4} position={[-0.36, 0, 0.3]} rotation-y={0.4} />
        {/* Leaning on the chocolate one: far edge on the plate, near edge up on its ring. */}
        <group position={[0.45, 0.168, -0.285]} rotation-y={0.625}>
          <group rotation-z={-0.267}>
            <Donut frosting="pink" sprinkles seed={9} />
          </group>
        </group>
      </Plate>
      <Ketchup position={[3.7, 0, 0.35]} rotation-y={-0.5} />
      <Shaker contents="salt" position={[2.95, 0, 0.1]} />
      <Shaker contents="pepper" position={[3.15, 0, 0.6]} />
    </group>
  );
}

export function Diner() {
  return (
    <group>
      <Table />
      <Booths />
      <WindowWall />
      <PlaceSettings />
    </group>
  );
}
