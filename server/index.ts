import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { ensureConfig } from './skeleton.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDir = path.resolve(process.env.CONFIG_DIR ?? path.join(root, 'config'));
const staticDir = path.resolve(process.env.STATIC_DIR ?? path.join(root, 'dist'));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = await buildApp({
  configDir,
  staticDir,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

for (const message of await ensureConfig(configDir)) app.log.info(message);
const config = await loadConfig(configDir);
app.log.info(`config ${configDir}: ${config.groups.length} groups`);
for (const warning of config.warnings) app.log.warn(warning);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ port, host });
