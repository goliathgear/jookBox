import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { loadConfig } from './config.ts';

export interface AppOptions {
  configDir: string;
  /** Built client (vite build output). Skipped when it doesn't exist. */
  staticDir?: string;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    // A dashboard refetches its config on every tab focus; don't log each one.
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  // Read fresh on every request so YAML edits show up on the next page load,
  // the way homepage behaves. The files are tiny.
  app.get('/api/config', async (request, reply) => {
    const config = await loadConfig(opts.configDir);
    const etag = `"${config.version}"`;
    reply.header('cache-control', 'no-cache').header('etag', etag);
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return config;
  });

  if (opts.staticDir && existsSync(path.join(opts.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: opts.staticDir,
      cacheControl: false,
      setHeaders(reply, filePath) {
        // Vite fingerprints everything under assets/, so it never goes stale.
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        reply.header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  // Your own icons: config/icons/foo.png is referenced as `icon: /icons/foo.png`.
  const iconsDir = path.join(opts.configDir, 'icons');
  if (existsSync(iconsDir)) {
    await app.register(fastifyStatic, {
      root: iconsDir,
      prefix: '/icons/',
      decorateReply: false,
      maxAge: '1h',
    });
  }

  return app;
}
