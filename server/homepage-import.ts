// Converts a running homepage instance's /api/services and /api/bookmarks
// responses back into services.yaml / bookmarks.yaml documents.

import { stringify } from 'yaml';

interface ApiService {
  name: string;
  href?: string;
  description?: string;
  icon?: string;
  target?: string;
}

interface ApiServiceGroup {
  name: string;
  services?: ApiService[];
  groups?: ApiServiceGroup[];
}

interface ApiBookmarkGroup {
  name: string;
  bookmarks?: (ApiService & { abbr?: string })[];
}

const SERVICE_FIELDS = ['href', 'description', 'icon', 'target'] as const;

function pickFields<T extends object>(source: T, fields: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (source as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== '') out[field] = value;
  }
  return out;
}

function serviceGroupToYaml(group: ApiServiceGroup): Record<string, unknown[]> {
  const entries: unknown[] = (group.services ?? []).map((service) => ({
    [service.name]: pickFields(service, SERVICE_FIELDS),
  }));
  for (const child of group.groups ?? []) entries.push(serviceGroupToYaml(child));
  return { [group.name]: entries };
}

export function servicesYaml(groups: ApiServiceGroup[], source: string): string {
  return header(source) + stringify(groups.map(serviceGroupToYaml));
}

export function bookmarksYaml(groups: ApiBookmarkGroup[], source: string): string {
  const doc = groups.map((group) => ({
    [group.name]: (group.bookmarks ?? []).map((bookmark) => ({
      [bookmark.name]: [pickFields(bookmark, ['abbr', ...SERVICE_FIELDS])],
    })),
  }));
  return header(source) + stringify(doc);
}

function header(source: string): string {
  return `# Imported from ${source} by \`npm run import:homepage\`.\n# homepage format: https://gethomepage.dev/configs/\n\n`;
}
