import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * A texture painted onto a canvas, disposed when it's no longer used.
 * `repeat` tiles it, for patterns like Formica and asphalt. Normal and
 * roughness maps are `data`, not colour, and must not be sRGB-decoded.
 */
export function useCanvasTexture(paint: () => HTMLCanvasElement, deps: unknown[], repeat?: [number, number], data = false) {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(paint());
    t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }, [...deps, repeat?.[0], repeat?.[1], data]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
