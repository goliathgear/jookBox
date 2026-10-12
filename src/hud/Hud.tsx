import { useEffect, useState, type ReactNode } from 'react';
import { useJukebox } from '../store.ts';

const NOTICE_MS = 2600;

/** Re-render while a timed notice is up, so it disappears on schedule. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Ticker() {
  const hovered = useJukebox((s) => s.hovered);
  const buffer = useJukebox((s) => s.buffer);
  const notice = useJukebox((s) => s.notice);
  const view = useJukebox((s) => s.view);
  const catalog = useJukebox((s) => s.catalog);
  const now = useNow(notice !== null);
  const fresh = notice && now - notice.at < NOTICE_MS ? notice : null;

  let code = '';
  let main = '';
  let detail = '';
  if (fresh?.kind === 'playing' && fresh.entry) {
    code = fresh.entry.code;
    main = `Now playing: ${fresh.entry.name}`;
    detail = fresh.entry.href;
  } else if (fresh?.kind === 'rejected') {
    main = fresh.text;
    detail = 'Press a page letter, then a strip number';
  } else if (buffer) {
    code = `${buffer}_`;
    main = `Page ${buffer} selected`;
    detail = 'Now press a strip number';
  } else if (hovered) {
    code = hovered.code;
    main = hovered.name;
    detail = [hovered.artist, hovered.album].filter(Boolean).join('  ·  ');
  } else if (catalog) {
    const letters = catalog.sides.slice(2 * view, 2 * view + 2).map((s) => s.letter);
    code = letters.join('·') || '—';
    main = catalog.sides.length ? 'Pull a page across to browse' : 'No selections loaded';
    detail = catalog.sides.length
      ? 'Click a title strip, or press a letter then a number'
      : 'Add services to config/services.yaml';
  }

  return (
    <div className={`ticker ${fresh?.kind ?? ''}`} data-testid="ticker" data-view={view} aria-live="polite">
      <span className="ticker-code">{code}</span>
      <span className="ticker-text">
        <span className="ticker-main">{main}</span>
        {detail && <span className="ticker-detail">{detail}</span>}
      </span>
    </div>
  );
}

function IconButton({ label, onClick, pressed, children }: { label: string; onClick(): void; pressed?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="hud-btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

function Help() {
  const toggle = useJukebox((s) => s.toggle);
  const warnings = useJukebox((s) => s.config?.warnings ?? []);
  return (
    <div className="modal-backdrop" onClick={() => toggle('helpOpen')}>
      <section className="help" role="dialog" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <dl>
          <dt>Turn pages</dt>
          <dd>Grab a page and pull it across, or use the mouse wheel, ← → or the ◀ ▶ buttons. On a phone, swipe.</dd>
          <dt>Make a selection</dt>
          <dd>Click a title strip, or press its page letter and then its number (B then 3 plays B3).</dd>
          <dt>Shortcuts</dt>
          <dd>Enter plays the strip under the pointer · Esc clears · + / − zoom · Home / End · ? this card</dd>
          <dt>Running slowly?</dt>
          <dd>✦ turns the visual effects (depth of field, glow, film grain) off so it draws faster. This browser remembers the choice.</dd>
          <dt>Change the records</dt>
          <dd>Edit settings.yaml, services.yaml and bookmarks.yaml in the config folder; the jukebox reloads them when you come back to the tab.</dd>
        </dl>
        {warnings.length > 0 && (
          <>
            <h3>Config warnings</h3>
            <ul className="warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}
        <button type="button" className="hud-btn wide" onClick={() => toggle('helpOpen')}>
          Close
        </button>
      </section>
    </div>
  );
}

export function Hud({ webgl }: { webgl: boolean }) {
  const turn = useJukebox((s) => s.turn);
  const toggle = useJukebox((s) => s.toggle);
  const muted = useJukebox((s) => s.muted);
  const effects = useJukebox((s) => s.effects);
  const zoomed = useJukebox((s) => s.zoomed);
  const listOpen = useJukebox((s) => s.listOpen);
  const helpOpen = useJukebox((s) => s.helpOpen);
  const warnings = useJukebox((s) => s.config?.warnings.length ?? 0);

  return (
    <>
      {webgl && <Ticker />}
      <nav className="hud-controls" aria-label="Jukebox controls">
        {webgl && (
          <>
            <IconButton label="Previous page" onClick={() => turn(-1)}>
              ◀
            </IconButton>
            <IconButton label="Next page" onClick={() => turn(1)}>
              ▶
            </IconButton>
            <IconButton label={zoomed ? 'Show the whole jukebox' : 'Zoom in on the pages'} pressed={zoomed} onClick={() => toggle('zoomed')}>
              {zoomed ? '⤢' : '⊕'}
            </IconButton>
            <IconButton label={listOpen ? 'Back to the jukebox' : 'List view'} pressed={listOpen} onClick={() => toggle('listOpen')}>
              ☰
            </IconButton>
            <IconButton
              label={effects ? 'Visual effects off (faster)' : 'Visual effects on'}
              pressed={effects}
              onClick={() => toggle('effects')}
            >
              {effects ? '✦' : '✧'}
            </IconButton>
          </>
        )}
        <IconButton label={muted ? 'Sound on' : 'Sound off'} pressed={!muted} onClick={() => toggle('muted')}>
          {muted ? '🔇' : '♪'}
        </IconButton>
        <IconButton label="How to play" pressed={helpOpen} onClick={() => toggle('helpOpen')}>
          ?{warnings > 0 && <span className="badge">{warnings}</span>}
        </IconButton>
      </nav>
      {helpOpen && <Help />}
    </>
  );
}
