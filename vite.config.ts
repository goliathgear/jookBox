import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { buildApp } from './server/app.ts';

// `npm run dev` serves the API from the same Fastify app as production,
// mounted inside the Vite dev server, so there's only one process to run.
function jookboxApi(): Plugin {
  return {
    name: 'jookbox-api',
    configureServer(server) {
      const configDir = path.resolve(process.env.CONFIG_DIR ?? 'config');
      const ready = buildApp({ configDir }).then(async (app) => {
        await app.ready();
        return app;
      });
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/') && !url.startsWith('/icons/') && url !== '/healthz') return next();
        (await ready).routing(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), jookboxApi()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
