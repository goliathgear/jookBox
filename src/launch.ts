import type { JukeboxItem, JukeboxSettings } from '../shared/types.ts';

/**
 * Opens a selection. Call it straight from the click or key handler: popup
 * blockers only allow window.open during a user gesture.
 */
export function openItem(item: JukeboxItem, settings: JukeboxSettings) {
  const target = item.target ?? settings.target;
  if (target === '_self') {
    window.location.assign(item.href);
    return;
  }
  if (target === '_blank' && settings.openAs === 'window') {
    const width = Math.round(window.screen.availWidth * 0.8);
    const height = Math.round(window.screen.availHeight * 0.85);
    window.open(item.href, '_blank', `popup,noopener,noreferrer,width=${width},height=${height}`);
    return;
  }
  window.open(item.href, target, 'noopener,noreferrer');
}
