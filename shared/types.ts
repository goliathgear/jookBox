// The normalized config the server sends to the browser. Everything the
// jukebox renders comes from here; raw YAML never reaches the client, so
// homepage widget settings (API keys, passwords) can't leak.

export interface JukeboxItem {
  /** Big top line of the title strip: the "song title". */
  name: string;
  href: string;
  /** Middle band: the "artist". Defaults to the description. */
  artist?: string;
  /** Small bottom line: the "album". Defaults per `settings.album`. */
  album?: string;
  description?: string;
  /** Resolved icon URL, if the entry has an icon. */
  icon?: string;
  /** Link target; falls back to `settings.target`. */
  target?: string;
}

export interface JukeboxGroup {
  name: string;
  kind: 'services' | 'bookmarks';
  /** Key into THEMES. */
  theme: string;
  /** Page colour override, e.g. a cloud provider's brand colour. */
  color?: string;
  /** Resolved icon URL shown in the page header. */
  icon?: string;
  items: JukeboxItem[];
}

export type AlbumSource = 'host' | 'group' | 'none';

export interface JukeboxSettings {
  /** Title strips per page side, 3-10. */
  stripsPerPage: number;
  /** Turning past the last page riffles back to the first. */
  wrap: boolean;
  sound: boolean;
  /** Default link target, like homepage's `target` setting. */
  target: string;
  /** `window` opens links in a separate browser window instead of a tab. */
  openAs: 'tab' | 'window';
  icons: boolean;
  /** What the bottom line shows when an entry has no `album`. */
  album: AlbumSource;
  /** Add bookmarks.yaml groups as pages after the services. */
  bookmarks: boolean;
}

export interface JukeboxConfig {
  title: string;
  subtitle?: string;
  /** Whose diner it is: the roadside sign reads "<sign> Diner". */
  sign: string;
  settings: JukeboxSettings;
  groups: JukeboxGroup[];
  /** Problems found while loading; the jukebox still renders the rest. */
  warnings: string[];
  /** Content hash, also served as the ETag. */
  version: string;
}
