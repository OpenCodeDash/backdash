# syntax=docker/dockerfile:1

# One image running both halves of OpenCode Dash:
#   * backdash (NestJS API + SSE) on 127.0.0.1:3000
#   * dash (built static SPA) served by nginx on :8080
#
# nginx is the single public origin:
#   /       -> dash SPA (client-side routing, history fallback)
#   /api/   -> backdash, with the /api prefix stripped
#   /mcp    -> reserved at the ROOT for an MCP server (never /api/mcp)
#
# The build context must contain both repos, so it is the workspace root:
#   docker build -f backdash/deploy/Dockerfile -t ocd .
# (deploy/Dockerfile.dockerignore trims the context to dash/ + backdash/.)

# ---------------------------------------------------------------------------
# backdash: compile, and a production-only dependency tree
# ---------------------------------------------------------------------------
FROM node:24-slim AS backdash-build
# better-sqlite3 has no prebuilt binary for this Node ABI, so node-gyp compiles
# it from source (python3 + a C++ toolchain).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backdash/package.json backdash/package-lock.json ./
RUN npm ci
COPY backdash/ ./
RUN npm run build

FROM node:24-slim AS backdash-prod-deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backdash/package.json backdash/package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# dash: compile the SPA against the same-origin /api path
# ---------------------------------------------------------------------------
FROM node:24-slim AS dash-build
WORKDIR /app
COPY dash/package.json dash/package-lock.json ./
RUN npm ci
COPY dash/ ./
# Vite inlines VITE_* at build time. /api keeps dash and the API on one origin
# (no CORS). Override VITE_OPENCODE_URL when the opencode server is not
# reachable at the browser's 127.0.0.1:4096 (e.g. a remote host).
ARG VITE_BACKDASH_URL=/api
ARG VITE_OPENCODE_URL=http://127.0.0.1:4096
ENV VITE_BACKDASH_URL=$VITE_BACKDASH_URL \
    VITE_OPENCODE_URL=$VITE_OPENCODE_URL
RUN npm run build

# ---------------------------------------------------------------------------
# runtime: node + nginx, with both apps in one image
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime

ENV NODE_ENV=production \
    BACKDASH_PORT=3000 \
    BACKDASH_HOST=127.0.0.1 \
    DATABASE_PATH=/data/app.sqlite

# nginx serves dash + proxies the API; gettext-base provides envsubst, curl the
# healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app/backdash

# backdash runtime (compiled output + production deps only)
COPY --from=backdash-build /app/dist ./dist
COPY --from=backdash-prod-deps /app/node_modules ./node_modules
COPY backdash/package.json ./

# dash static build
COPY --from=dash-build /app/dist /app/dash

# nginx + entrypoint
COPY backdash/deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY backdash/deploy/nginx/app.conf.template /etc/nginx/conf.d/app.conf.template
COPY backdash/deploy/nginx/mcp.location.template /etc/nginx/conf.d/mcp.location.template
COPY backdash/deploy/nginx/mcp.location.disabled /etc/nginx/conf.d/mcp.location.disabled
COPY backdash/deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/api/ >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
