import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { JukeboxConfig } from '../shared/types.ts';
import { unlockAudio } from './audio/sfx.ts';
import { Hud } from './hud/Hud.tsx';
import { LinkIndex, ListView } from './hud/ListView.tsx';
import { motion } from './motion.ts';
import { loadFonts } from './scene/paint.ts';
import { Stage } from './scene/Stage.tsx';
import { useJukebox } from './store.ts';

let etag: string | null = null;

async function fetchConfig(): Promise<JukeboxConfig | null> {
  const res = await fetch('/api/config', { headers: etag ? { 'if-none-match': etag } : {} });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`The config request failed with HTTP ${res.status}.`);
  etag = res.headers.get('etag');
  return (await res.json()) as JukeboxConfig;
}

function hasWebGL(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function useConfig() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const config = await fetchConfig();
        if (alive && config) useJukebox.getState().setConfig(config);
        if (alive) setStatus('ready');
      } catch (err) {
        // Keep showing the last good config if a refresh fails.
        if (alive && !useJukebox.getState().config) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    };
    Promise.all([loadFonts(), refresh()]);
    // Like homepage, YAML edits show up without a rebuild: we re-check
    // whenever you come back to the tab.
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
  return { status, error };
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      unlockAudio();
      const s = useJukebox.getState();
      const views = s.catalog?.views ?? 1;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ']':
          s.turn(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
        case '[':
          s.turn(-1);
          break;
        case 'Home':
          s.goToView(0);
          break;
        case 'End':
          s.goToView(views - 1);
          break;
        case 'Escape':
          if (s.helpOpen) s.toggle('helpOpen');
          else if (s.listOpen) s.toggle('listOpen');
          else s.clearBuffer();
          break;
        case 'Enter':
          if (target?.closest('button, a') || !s.hovered) return;
          s.launch(s.hovered);
          break;
        case '?':
          s.toggle('helpOpen');
          break;
        case '+':
        case '=':
          if (!s.zoomed) s.toggle('zoomed');
          break;
        case '-':
          if (s.zoomed) s.toggle('zoomed');
          break;
        default:
          if (!/^[a-z0-9]$/i.test(e.key) || s.listOpen || s.helpOpen) return;
          s.press(e.key);
      }
      e.preventDefault();
    };
    const onPointer = () => unlockAudio();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);
}

/**
 * Mouse wheel and touch swipes turn pages too. The wheel listener is native
 * and non-passive (React's are passive) so it can claim the event: on a
 * trackpad, a sideways swipe the page doesn't claim is the browser's
 * back/forward gesture, and Firefox would leave the jukebox for the
 * previous page in the tab.
 */
function useStageGestures(stage: RefObject<HTMLElement | null>) {
  const wheel = useRef({ sum: 0, at: 0 });
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = wheel.current;
      const now = performance.now();
      w.sum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(w.sum) > 60 && now - w.at > 300) {
        useJukebox.getState().turn(Math.sign(w.sum));
        w.sum = 0;
        w.at = now;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [stage]);
  return {
    onPointerDown(e: ReactPointerEvent) {
      swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    },
    onPointerUp(e: ReactPointerEvent) {
      const start = swipe.current;
      swipe.current = null;
      if (!start || motion.drag) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && performance.now() - start.t < 700) {
        useJukebox.getState().turn(dx < 0 ? 1 : -1);
      }
    },
  };
}

export function App() {
  const { status, error } = useConfig();
  const [webgl] = useState(hasWebGL);
  const listOpen = useJukebox((s) => s.listOpen);
  const title = useJukebox((s) => s.config?.title);
  const stage = useRef<HTMLElement>(null);
  const gestures = useStageGestures(stage);
  useKeyboard();

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  return (
    <>
      <main className="stage" ref={stage} {...gestures} aria-hidden={listOpen || !webgl}>
        {status === 'ready' && webgl && <Stage />}
      </main>
      {status === 'ready' && <Hud webgl={webgl} />}
      {status === 'ready' && (listOpen || !webgl) && <ListView canClose={webgl} />}
      {status === 'ready' && <LinkIndex />}
      {status === 'loading' && (
        <div className="splash" role="status">
          Warming up the tubes…
        </div>
      )}
      {status === 'error' && (
        <div className="splash error" role="alert">
          <strong>The jukebox is unplugged.</strong>
          <span>{error}</span>
        </div>
      )}
    </>
  );
}
