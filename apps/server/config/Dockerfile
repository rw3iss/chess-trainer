# Multi-stage build for the pnpm monorepo. Build context MUST be the repo root
# (the server depends on packages/core):
#   docker build -f apps/server/config/Dockerfile -t chess-server .
# Recommended: a repo-root .dockerignore excluding **/node_modules, **/dist, .git.

# ── Build ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
# Native modules (argon2, better-sqlite3) may need a toolchain when no prebuild matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core ./packages/core
COPY apps/server ./apps/server
RUN pnpm install --frozen-lockfile --filter @chess/server... \
	&& pnpm --filter @chess/core build \
	&& pnpm --filter @chess/server build \
	&& pnpm --filter @chess/server deploy --prod --legacy /out \
	&& cp -r apps/server/dist /out/dist

# ── Runtime ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/chess.sqlite
COPY --from=build /out ./
RUN mkdir -p /app/data && chown -R node:node /app/data
# Mount engine binaries here and point ENGINE_*_PATH at them.
VOLUME ["/app/data", "/opt/engines"]
EXPOSE 3000
USER node
CMD ["node", "dist/main"]
