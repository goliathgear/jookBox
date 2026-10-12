import * as THREE from 'three';
import { paintBrushedNormal, paintBrushedRoughness, paintChromeRoughness, paintGlassGrime } from './surfaces.ts';

// Shared materials. Chrome only looks like chrome with something to reflect;
// the Lightformer studio in Stage.tsx provides that. None of this is a
// perfect surface: the chrome carries fingerprints and polish haze, the
// steel its brushing, the glass its smudges.

function canvasTexture(paint: () => HTMLCanvasElement, repeat = 1, colour = false) {
  const t = new THREE.CanvasTexture(paint());
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

const chromeRoughness = canvasTexture(() => paintChromeRoughness(), 1.5);
const brushedRoughness = canvasTexture(() => paintBrushedRoughness(), 2);
const brushedNormal = canvasTexture(() => paintBrushedNormal(), 2);
export const glassGrime = canvasTexture(() => paintGlassGrime(), 1);

export const chrome = new THREE.MeshStandardMaterial({
  color: '#e9edf1',
  metalness: 1,
  roughness: 1,
  roughnessMap: chromeRoughness,
  envMapIntensity: 2.9,
});

export const darkChrome = new THREE.MeshStandardMaterial({
  color: '#a3aab3',
  metalness: 1,
  roughness: 0.5,
  roughnessMap: chromeRoughness,
  envMapIntensity: 2.2,
});

/** Brushed stainless for the diner's panelling and trim. */
export const brushedSteel = new THREE.MeshStandardMaterial({
  color: '#cfd5db',
  metalness: 0.95,
  roughness: 1,
  roughnessMap: brushedRoughness,
  normalMap: brushedNormal,
  normalScale: new THREE.Vector2(0.35, 0.35),
  envMapIntensity: 2,
});

export const velvet = new THREE.MeshStandardMaterial({
  color: '#1c0809',
  roughness: 1,
});

/** The dark red recess the keys sit in. */
export const trayLining = new THREE.MeshStandardMaterial({
  color: '#3a0a0e',
  roughness: 0.6,
});

export const bakelite = new THREE.MeshPhysicalMaterial({
  color: '#ece0c0',
  roughness: 0.38,
  clearcoat: 0.7,
  clearcoatRoughness: 0.3,
});

// The bow-front window is two layers: a barely-there tint carrying the
// smudges, and an additive mirror that only adds the bright studio
// reflections. One faded material would either fog the pages or lose the
// highlights.
export const glassTint = new THREE.MeshPhysicalMaterial({
  color: '#dfe9f2',
  roughness: 0.05,
  transparent: true,
  opacity: 0.05,
  depthWrite: false,
});

export const glassReflection = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  metalness: 1,
  roughness: 0.04,
  envMapIntensity: 2.2,
  transparent: true,
  opacity: 0.07,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

/** Smudges that catch the light on any sheet of glass. */
export const glassSmudges = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  alphaMap: glassGrime,
  transparent: true,
  opacity: 0.35,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
