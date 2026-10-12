# --- Build the browser bundle ------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
COPY shared ./shared
COPY server ./server
RUN npm run build

# --- Runtime: Fastify serving the bundle and the YAML config -----------------
# The browser libraries are devDependencies (they're bundled into dist/), so
# the runtime install only pulls the three server packages.
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    CONFIG_DIR=/app/config \
    STATIC_DIR=/app/dist
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
# The repo's own config, for hosts that deploy from git and have no folder
# to mount (Coolify): set CONFIG_DIR=/app/bundled-config. Unused otherwise;
# Compose mounts ./config over /app/config instead.
COPY config ./bundled-config
RUN mkdir -p /app/config && chown node:node /app/config
USER node
EXPOSE 3000
VOLUME ["/app/config"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
# Node 24 runs the TypeScript server directly (type stripping), no build step.
CMD ["node", "server/index.ts"]
