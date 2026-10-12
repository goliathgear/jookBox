import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_FILES } from './config.ts';

const SKELETON_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skeleton');

/**
 * Copies a starter file into the config directory for each config file that
 * is missing, like homepage does on first run. Existing files are never
 * touched. Returns what it did, for the startup log.
 */
export async function ensureConfig(dir: string, skeletonDir = SKELETON_DIR): Promise<string[]> {
  const messages: string[] = [];
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    return [`can't create config directory ${dir}: ${(err as Error).message}`];
  }
  for (const file of CONFIG_FILES) {
    try {
      await copyFile(path.join(skeletonDir, file), path.join(dir, file), constants.COPYFILE_EXCL);
      messages.push(`created ${file} from the starter config`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      messages.push(`can't create ${file}: ${(err as Error).message}`);
    }
  }
  return messages;
}
