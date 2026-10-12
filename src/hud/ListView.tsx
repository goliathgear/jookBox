import type { CSSProperties } from 'react';
import { themeFor } from '../../shared/themes.ts';
import { useJukebox } from '../store.ts';

const rel = 'noopener noreferrer';

/**
 * The title pages as plain links: the fallback when WebGL is unavailable, a
 * quicker view on small screens, and real anchors (middle-click, copy link).
 */
export function ListView({ canClose }: { canClose: boolean }) {
  const catalog = useJukebox((s) => s.catalog);
  const config = useJukebox((s) => s.config);
  const toggle = useJukebox((s) => s.toggle);
  const launch = useJukebox((s) => s.launch);
  if (!catalog || !config) return null;

  return (
    <div className="list-overlay" role="dialog" aria-label={`${config.title} selections`}>
      <header className="list-header">
        <h1>{config.title}</h1>
        {canClose && (
          <button type="button" className="hud-btn wide" onClick={() => toggle('listOpen')}>
            Back to the jukebox
          </button>
        )}
      </header>
      <div className="list-grid">
        {catalog.sides.map((side) => {
          const theme = themeFor(side.group.theme, side.group.color);
          const style = {
            '--holder': theme.holder,
            '--paper': theme.paper,
            '--header': theme.header,
            '--header-ink': theme.headerInk,
            '--strip': theme.strip,
            '--ink': theme.ink,
            '--band': theme.band,
            '--band-ink': theme.bandInk,
          } as CSSProperties;
          return (
            <section key={side.letter} className="list-page" style={style}>
              <h2>
                <span className="list-letter">{side.letter}</span>
                <span className="list-group">{side.group.name}</span>
                {side.parts > 1 && (
                  <span className="list-part">
                    {side.part}/{side.parts}
                  </span>
                )}
              </h2>
              {side.entries.map((entry) => (
                <a
                  key={entry.code}
                  className="list-strip"
                  href={entry.href}
                  target={entry.target ?? config.settings.target}
                  rel={rel}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    launch(entry);
                  }}
                >
                  <span className="list-code">{entry.code}</span>
                  <span className="list-body">
                    <span className="list-title">{entry.name}</span>
                    {entry.artist && <span className="list-artist">{entry.artist}</span>}
                    {entry.album && <span className="list-album">{entry.album}</span>}
                  </span>
                  {entry.icon && config.settings.icons && <img className="list-icon" src={entry.icon} alt="" loading="lazy" />}
                </a>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Every link, invisible on screen, for screen readers and keyboard users. */
export function LinkIndex() {
  const catalog = useJukebox((s) => s.catalog);
  const config = useJukebox((s) => s.config);
  if (!catalog || !config) return null;
  return (
    <nav className="sr-only" aria-label="All selections">
      <ul>
        {catalog.entries.map((entry) => (
          <li key={entry.code}>
            <a href={entry.href} target={entry.target ?? config.settings.target} rel={rel}>
              {entry.code} {entry.name}
              {entry.description ? ` — ${entry.description}` : ''}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
