import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import * as THREE from 'three';
import {
  hitStrip,
  leafSides,
  LEFT_BOARD_SIDE,
  rightBoardSide,
  stripRect,
  visibleSides,
  type Catalog,
  type CatalogEntry,
} from '../../shared/catalog.ts';
import type { JukeboxConfig } from '../../shared/types.ts';
import { motion } from '../motion.ts';
import { useJukebox } from '../store.ts';
import { LEAF_GAP, LEAF_Z, PAGE_H, PAGE_W } from './dims.ts';
import { loadImage, makeCanvas, paintGlowFrame, paintPage, PAGE_PX_H, PAGE_PX_W, type PageArt } from './paint.ts';

/** One canvas texture per page side, repainted once the icons arrive. */
function usePageTextures(catalog: Catalog, config: JukeboxConfig): THREE.Texture[] {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const pages = useMemo(() => {
    const art: PageArt = {
      perPage: catalog.stripsPerPage,
      icons: config.settings.icons,
      title: config.title,
      images: new Map(),
    };
    const list = Array.from({ length: 2 * catalog.views }, (_, i) => {
      const { canvas, ctx } = makeCanvas(PAGE_PX_W, PAGE_PX_H);
      const side = catalog.sides[i] ?? null;
      paintPage(ctx, side, art);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = gl.capabilities.getMaxAnisotropy();
      return { ctx, side, texture };
    });
    return { art, list };
  }, [catalog, config, gl]);

  useEffect(() => {
    const urls = new Set<string>();
    for (const side of catalog.sides) {
      if (side.group.icon) urls.add(side.group.icon);
      if (config.settings.icons) for (const e of side.entries) if (e.icon) urls.add(e.icon);
    }
    if (urls.size === 0) return;
    let cancelled = false;
    Promise.all([...urls].map(async (url) => [url, await loadImage(url)] as const)).then((loaded) => {
      if (cancelled) return;
      for (const [url, img] of loaded) if (img) pages.art.images.set(url, img);
      for (const page of pages.list) {
        paintPage(page.ctx, page.side, pages.art);
        page.texture.needsUpdate = true;
      }
      invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [pages, catalog, config, invalidate]);

  useEffect(() => () => pages.list.forEach((p) => p.texture.dispose()), [pages]);
  return pages.list.map((p) => p.texture);
}

/** The selection under the pointer, if this side is face-up and the rack is still. */
function entryUnder(e: ThreeEvent<PointerEvent | MouseEvent>, side: number, catalog: Catalog): CatalogEntry | null {
  const { view } = useJukebox.getState();
  if (!e.uv || motion.drag || Math.abs(motion.pagePos - view) > 0.02) return null;
  if (!visibleSides(view).includes(side)) return null;
  const slot = hitStrip(e.uv.x, 1 - e.uv.y, catalog.stripsPerPage);
  return slot === null ? null : (catalog.sides[side]?.entries[slot] ?? null);
}

/**
 * Grab a page and pull it across the spine. The rack follows the pointer;
 * let go and it settles on the nearest page. A quick flick in the direction
 * you were already pulling finishes that turn, but a page never flips the
 * other way from the drag.
 */
function usePageDrag() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  return (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    // Every page in the stack under the pointer gets this event; only the
    // one on top may start a drag.
    e.stopPropagation();
    const { catalog, config, step, view } = useJukebox.getState();
    if (!catalog || !config) return;
    // Pulling a page from the right across to the left covers about two
    // page widths, so that much travel is one turn.
    const rect = gl.domElement.getBoundingClientRect();
    const a = new THREE.Vector3(0, 0, LEAF_Z).project(camera);
    const b = new THREE.Vector3(PAGE_W, 0, LEAF_Z).project(camera);
    const perTurn = Math.max(80, (Math.abs(b.x - a.x) / 2) * rect.width * 1.8);
    const x0 = e.nativeEvent.clientX;
    const y0 = e.nativeEvent.clientY;
    const start = step + (motion.pagePos - view);
    let active = false;
    // Recent pointer positions, for the speed at the moment of release.
    const trail: { x: number; t: number }[] = [{ x: x0, t: performance.now() }];

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!active) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(ev.clientY - y0)) return;
        active = true;
        useJukebox.getState().setHovered(null);
        document.body.style.cursor = 'grabbing';
      }
      const now = performance.now();
      trail.push({ x: ev.clientX, t: now });
      while (trail.length > 2 && now - trail[0]!.t > 120) trail.shift();
      let target = start - dx / perTurn;
      if (!config.settings.wrap) target = THREE.MathUtils.clamp(target, -0.3, catalog.views - 1 + 0.3);
      motion.drag = { target };
      invalidate();
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!active) return;
      document.body.style.cursor = '';
      const target = motion.drag?.target ?? start;
      motion.drag = null;

      const moved = target - start;
      const dir = Math.sign(moved);
      // Speed over the last 120ms, in turns per second; zero if the hand
      // paused before letting go.
      const first = trail[0]!;
      const last = trail[trail.length - 1]!;
      const now = performance.now();
      const dt = (last.t - first.t) / 1000;
      const speed = now - last.t < 150 && dt > 0 ? -(last.x - first.x) / perTurn / dt : 0;
      const flick = Math.abs(moved) > 0.2 && Math.sign(speed) === dir && Math.abs(speed) > 2.2;
      const settled = flick ? (dir > 0 ? Math.ceil(target) : Math.floor(target)) : Math.round(target);
      useJukebox.getState().settleTurn(settled);
      invalidate();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
}

function Face({
  side,
  texture,
  catalog,
  ...props
}: { side: number; texture: THREE.Texture; catalog: Catalog } & ComponentProps<'mesh'>) {
  const setHovered = useJukebox((s) => s.setHovered);
  const launch = useJukebox((s) => s.launch);
  const drag = usePageDrag();
  return (
    <mesh
      {...props}
      castShadow
      receiveShadow
      onPointerDown={drag}
      onPointerMove={(e) => {
        e.stopPropagation();
        const entry = entryUnder(e, side, catalog);
        setHovered(entry);
        if (!motion.drag) document.body.style.cursor = entry ? 'pointer' : 'grab';
      }}
      onPointerOut={() => {
        if (!motion.drag) document.body.style.cursor = '';
        if (useJukebox.getState().hovered?.side === side) setHovered(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 8) return;
        const entry = entryUnder(e, side, catalog);
        if (entry) launch(entry);
      }}
    >
      <planeGeometry args={[PAGE_W, PAGE_H]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.62}
        emissive="#ffffff"
        emissiveMap={texture}
        emissiveIntensity={0.24}
      />
    </mesh>
  );
}

// A smooth start and finish, so a page peels off and settles.
const ease = (p: number) => p * p * (3 - 2 * p);

function Leaf({ index, textures, catalog }: { index: number; textures: THREE.Texture[]; catalog: Catalog }) {
  const ref = useRef<THREE.Group>(null);
  const { front, back } = leafSides(index);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const p = THREE.MathUtils.clamp(motion.pagePos - (index - 1), 0, 1);
    group.rotation.y = -Math.PI * ease(p);
    // Depth in its stack: 0 for the page on top, which must be in front.
    const depth = p < 0.5 ? index - 1 - motion.pagePos : motion.pagePos - index;
    group.position.z = LEAF_Z - Math.max(0, depth) * LEAF_GAP;
  });
  return (
    <group ref={ref}>
      <Face side={front} texture={textures[front]!} catalog={catalog} position={[PAGE_W / 2, 0, 0.001]} />
      <Face
        side={back}
        texture={textures[back]!}
        catalog={catalog}
        position={[PAGE_W / 2, 0, -0.001]}
        rotation={[0, Math.PI, 0]}
      />
    </group>
  );
}

function SelectionGlow({ catalog }: { catalog: Catalog }) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(paintGlowFrame());
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    const mat = material.current;
    if (!mesh || !mat) return;
    const { hovered, flash, view } = useJukebox.getState();
    const flashing = flash && Date.now() - flash.at < 1600 ? catalog.entries.find((e) => e.code === flash.code) : undefined;
    const entry = flashing ?? hovered;
    if (!entry || !visibleSides(view).includes(entry.side) || Math.abs(motion.pagePos - view) > 0.02) {
      mesh.visible = false;
      return;
    }
    const r = stripRect(entry.slot, catalog.stripsPerPage);
    const pageLeft = entry.side % 2 === 0 ? -PAGE_W : 0;
    mesh.position.set(pageLeft + (r.x + r.w / 2) * PAGE_W, PAGE_H / 2 - (r.y + r.h / 2) * PAGE_H, LEAF_Z + 0.008);
    // The glow texture's frame fills 91% x 72.5% of the canvas.
    mesh.scale.set((r.w * PAGE_W) / 0.914, (r.h * PAGE_H) / 0.725, 1);
    const t = clock.getElapsedTime();
    mat.opacity = flashing ? (Math.sin(t * 22) > 0 ? 0.9 : 0.15) : 0.5 + 0.15 * Math.sin(t * 5);
    mesh.visible = true;
  });

  return (
    <mesh ref={ref} raycast={() => null} visible={false}>
      <planeGeometry />
      <meshBasicMaterial
        ref={material}
        map={texture}
        color={[3.2, 2.2, 0.9]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export function TitleRack({ catalog, config }: { catalog: Catalog; config: JukeboxConfig }) {
  const textures = usePageTextures(catalog, config);
  const boardZ = LEAF_Z - (catalog.leaves + 1) * LEAF_GAP;
  const leaves = Array.from({ length: catalog.leaves }, (_, i) => i + 1);
  return (
    <group>
      <Face
        side={LEFT_BOARD_SIDE}
        texture={textures[LEFT_BOARD_SIDE]!}
        catalog={catalog}
        position={[-PAGE_W / 2, 0, boardZ]}
      />
      <Face
        side={rightBoardSide(catalog)}
        texture={textures[rightBoardSide(catalog)]!}
        catalog={catalog}
        position={[PAGE_W / 2, 0, boardZ]}
      />
      {leaves.map((index) => (
        <Leaf key={index} index={index} textures={textures} catalog={catalog} />
      ))}
      <SelectionGlow catalog={catalog} />
    </group>
  );
}
