import { Environment, Lightformer, Sky } from '@react-three/drei';
import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  BrightnessContrast,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sfx } from '../audio/sfx.ts';
import { motion, springStep } from '../motion.ts';
import { useJukebox } from '../store.ts';
import { Diner } from './Diner.tsx';
import { FRAMES, WIN_R } from './dims.ts';
import { ParkingLot } from './ParkingLot.tsx';
import { Wallbox } from './Wallbox.tsx';

/** Springs the pages toward the store's view (or the dragging hand), with sound. */
function Animator() {
  const invalidate = useThree((s) => s.invalidate);
  const flipped = useRef(0);

  useEffect(() => useJukebox.subscribe(() => invalidate()), [invalidate]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const { view, catalog, flash } = useJukebox.getState();
    if (!catalog) return;
    const target = motion.drag ? scrubTarget(motion.drag.target, catalog.views) : view;
    let moving: boolean;
    [motion.pagePos, motion.pageVel, moving] = springStep(motion.pagePos, motion.pageVel, target, dt, 60, 15.5);

    const f = Math.round(motion.pagePos);
    if (f !== flipped.current) {
      flipped.current = f;
      sfx.flip();
    }
    const flashing = flash !== null && Date.now() - flash.at < 1700;
    if (moving || flashing || motion.drag) invalidate();
  });
  return null;
}

/**
 * While a page is held, the rack follows the hand. Past the last spread
 * there's no page to show, so halfway through that stretch the rack riffles
 * back to the start.
 */
function scrubTarget(turn: number, views: number): number {
  if (views <= 1) return 0;
  const w = ((turn % views) + views) % views;
  if (w <= views - 1) return w;
  return w < views - 0.5 ? views - 1 : 0;
}

const DEG = Math.PI / 180;

const INTRO_HOLD = 1.1; // seconds on the wide shot of the booth
const INTRO_MOVE = 2.6; // seconds pushing in to the jukebox

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Frames the wallbox (or just the rack when zoomed) from a little above,
 * and orbits a few degrees as the pointer moves so the chrome shows its depth.
 * The orbit pivots on the title rack, so the strips barely move under the
 * pointer. On first load it opens on the whole booth, then pushes in.
 */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const zoomed = useJukebox((s) => s.zoomed);
  const look = useMemo(() => new THREE.Vector3(0, FRAMES.cabinet.cy, 0.3), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const desiredLook = useMemo(() => new THREE.Vector3(), []);
  const wide = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  const chosen = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  const first = useRef(true);
  const intro = useRef({ start: performance.now(), done: params.has('view') || !!debugCamera });

  // The intro needs frames while the camera is holding still.
  useEffect(() => {
    const id = setInterval(invalidate, 40);
    const stop = setTimeout(() => clearInterval(id), (INTRO_HOLD + INTRO_MOVE + 0.5) * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [invalidate]);
  // Touching the zoom button ends the intro; the camera is theirs.
  const zoomedAtStart = useRef(zoomed);
  useEffect(() => {
    if (zoomed !== zoomedAtStart.current) intro.current.done = true;
  }, [zoomed]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const tan = Math.tan((camera.fov * DEG) / 2);
    const W = Math.max(1, size.width);
    const H = Math.max(1, size.height);
    // Keep clear of the HUD: buttons along the top, the ticker at the bottom.
    const top = 64;
    const bottom = W < 700 ? 92 : 104;
    const fracH = Math.max(0.4, (H - top - bottom) / H);
    const fracW = Math.max(0.4, (W - 24) / W);
    const yaw = state.pointer.x * 9 * DEG;
    const pitch = (7 - state.pointer.y * 4) * DEG;

    const framing = (frame: (typeof FRAMES)['rack'], close: boolean, out: { pos: THREE.Vector3; look: THREE.Vector3 }) => {
      const fit = Math.max(frame.h / (2 * tan * fracH), frame.w / (2 * tan * (W / H) * fracW));
      const dist = fit + (close ? WIN_R : 0.9);
      const shift = ((bottom - top) / 2) * ((2 * dist * tan) / H);
      out.look.set(frame.cx, frame.cy - shift, 0.3);
      out.pos.set(
        out.look.x + dist * Math.sin(yaw) * Math.cos(pitch),
        out.look.y + dist * Math.sin(pitch),
        out.look.z + dist * Math.cos(yaw) * Math.cos(pitch),
      );
    };
    framing(zoomed ? FRAMES.rack : FRAMES.cabinet, zoomed, chosen);

    // During the intro, blend from the wide shot to the chosen framing.
    let mix = 1;
    if (!intro.current.done) {
      const t = (performance.now() - intro.current.start) / 1000 - INTRO_HOLD;
      if (t < 0) mix = 0;
      else if (t < INTRO_MOVE) mix = smoothstep(t / INTRO_MOVE);
      else intro.current.done = true;
    }
    if (mix < 1) {
      framing(FRAMES.cabinet, false, wide);
      desired.lerpVectors(wide.pos, chosen.pos, mix);
      desiredLook.lerpVectors(wide.look, chosen.look, mix);
    } else {
      desired.copy(chosen.pos);
      desiredLook.copy(chosen.look);
    }

    if (params.get('view') === 'over') {
      desired.set(9, 7, 11);
      desiredLook.set(0, -2, 1);
    } else if (debugCamera) {
      desired.fromArray(debugCamera, 0);
      desiredLook.fromArray(debugCamera, 3);
    }
    if (first.current) {
      camera.position.copy(desired);
      look.copy(desiredLook);
      first.current = false;
    }
    // The intro's own easing does the work; afterwards a gentle lag.
    const k = intro.current.done ? 1 - Math.exp(-dt * 3.5) : 1;
    camera.position.lerp(desired, k);
    look.lerp(desiredLook, k);
    camera.lookAt(look);
    if (camera.position.distanceTo(desired) > 0.002 || look.distanceTo(desiredLook) > 0.002) invalidate();
  });
  return null;
}

/**
 * What the chrome reflects: a bright sky above (the window), a warm diner
 * interior behind the camera, and a couple of soft boxes for the highlights.
 */
function Studio() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.45}>
      <color attach="background" args={['#7d848b']} />
      {/* Ceiling: bright, with two fluorescent tubes as the hard highlights. */}
      <Lightformer form="rect" intensity={1.3} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} color="#e3e9ee" />
      <Lightformer form="rect" intensity={6} position={[0, 10, 5]} rotation-x={Math.PI / 2} scale={[14, 0.9, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={4} position={[0, 10, -5]} rotation-x={Math.PI / 2} scale={[14, 0.9, 1]} color="#fff8ee" />
      {/* Dark floor and the red booth backs low down. */}
      <Lightformer form="rect" intensity={0.6} position={[0, -12, 0]} rotation-x={-Math.PI / 2} scale={[40, 40, 1]} color="#d9ccb3" />
      <Lightformer form="rect" intensity={0.5} position={[0, -3, 12]} scale={[30, 4, 1]} color="#7a1c22" />
      {/* The window behind the box: bright daylight. */}
      <Lightformer form="rect" intensity={2.4} position={[0, 3, -14]} scale={[30, 8, 1]} color="#eaf3fb" />
      {/* The far wall of the diner, behind the camera: cream, mid-tone. */}
      <Lightformer form="rect" intensity={1.3} position={[0, 3, 14]} scale={[30, 8, 1]} color="#ece6d8" />
      <Lightformer form="rect" intensity={2.6} position={[-7, 4, 4]} scale={[1.2, 7, 1]} color="#fff6e8" />
      <Lightformer form="rect" intensity={2.6} position={[7, 4, 4]} scale={[1.2, 7, 1]} color="#eef5ff" />
    </Environment>
  );
}

/**
 * Late-afternoon sun: about 30° up, from the right, out beyond the window.
 * Low enough to clear the sill and reach across the table.
 */
export const SUN_DIRECTION = new THREE.Vector3(0.5, 0.5, -0.7).normalize();

/**
 * Sun through the window (with the blinds' shadows), sky fill, and a warm
 * spot over the booth as the key light on the jukebox face.
 */
function Lights() {
  const spot = useRef<THREE.SpotLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    spot.current?.target.position.set(0, -0.9, 0.6);
    spot.current?.target.updateMatrixWorld();
    if (sun.current) {
      sun.current.target.position.set(0, -2, -14);
      sun.current.target.updateMatrixWorld();
    }
  }, []);
  const sunPos = useMemo(() => SUN_DIRECTION.clone().multiplyScalar(90).add(new THREE.Vector3(0, -2, -14)), []);
  return (
    <>
      <hemisphereLight args={['#bfd8ee', '#6b5a48', 0.26]} />
      <directionalLight
        ref={sun}
        position={sunPos}
        intensity={3.2}
        color="#ffe6c0"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-radius={4}
        shadow-camera-near={30}
        shadow-camera-far={160}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={30}
        shadow-camera-bottom={-22}
      />
      {/* From the front-left, so its shadow falls to the right where it can be seen. */}
      <spotLight
        ref={spot}
        position={[-4.5, 6.5, 7.5]}
        angle={0.66}
        penumbra={0.85}
        intensity={190}
        decay={2}
        color="#ffe2bd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-radius={8}
      />
      {/* The pendant over the table: warm light on the jukebox face and the keys. */}
      <pointLight position={[1.4, 4, 5]} intensity={40} distance={18} decay={2} color="#ffe2c2" />
      <directionalLight position={[4, 2, 6]} intensity={0.25} color="#d9f2ff" />
    </>
  );
}

/**
 * The camera look: depth of field on the jukebox, a touch of lens colour
 * fringing, film grain, a vignette, and a filmic grade that pulls the
 * saturation down a notch.
 */
function Look() {
  const focus = useMemo(() => new THREE.Vector3(0, FRAMES.cabinet.cy, 0.3), []);
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes quality="medium" aoRadius={0.5} distanceFalloff={0.6} intensity={2.6} />
      <DepthOfField target={focus} focusRange={4.5} bokehScale={5} />
      <Bloom mipmapBlur luminanceThreshold={1.5} luminanceSmoothing={0.1} intensity={0.4} />
      <ChromaticAberration offset={[0.0007, 0.0007]} radialModulation modulationOffset={0.4} />
      <HueSaturation saturation={-0.12} />
      <BrightnessContrast brightness={-0.01} contrast={0.1} />
      <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.09} />
      <Vignette offset={0.28} darkness={0.62} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

// Development aids: ?fx=off renders without the post-processing stack, and
// ?view=over looks down on the booth from the side to check the lighting;
// ?cam=x,y,z,lx,ly,lz parks the camera at a point looking at another.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const effectsOff = params.get('fx') === 'off';
const debugCamera = (() => {
  const v = params.get('cam')?.split(',').map(Number);
  return v?.length === 6 && v.every(Number.isFinite) ? v : null;
})();

/** With ?debug, hands the scene to the console as window.__three. */
function DebugHandle() {
  const three = useThree();
  useEffect(() => {
    if (!params.has('debug')) return;
    (window as unknown as { __three?: unknown }).__three = { scene: three.scene, camera: three.camera, gl: three.gl, THREE };
  }, [three]);
  return null;
}

export function Stage() {
  const config = useJukebox((s) => s.config);
  const catalog = useJukebox((s) => s.catalog);

  if (!config || !catalog) return null;
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMappingExposure: 0.55 }}
      camera={{ fov: 34, position: [0, 0, 14], near: 0.1, far: 1200 }}
      onPointerMissed={() => useJukebox.getState().setHovered(null)}
      onPointerMove={() => invalidate()}
    >
      {/* Haze on the far field; starts well beyond the booth. */}
      <fog attach="fog" args={['#cfe0ec', 80, 420]} />
      <Sky
        distance={900}
        sunPosition={SUN_DIRECTION.clone().multiplyScalar(100)}
        turbidity={3.2}
        rayleigh={1.1}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
      />
      <Animator />
      <CameraRig />
      <DebugHandle />
      <Lights />
      <Suspense fallback={null}>
        <Studio />
        <Wallbox config={config} catalog={catalog} />
        <Diner />
        <ParkingLot sign={config.sign} />
      </Suspense>
      {!effectsOff && <Look />}
    </Canvas>
  );
}
