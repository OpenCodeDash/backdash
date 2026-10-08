#!/usr/bin/env bash
# Runs backdash and nginx together in one container, with nginx as the single
# public origin (dash at /, backdash at /api, MCP reserved at /mcp).
set -euo pipefail

BACKDASH_PORT="${BACKDASH_PORT:-3000}"
DATABASE_PATH="${DATABASE_PATH:-/data/app.sqlite}"

# --- render nginx config from the environment -------------------------------
envsubst '${BACKDASH_PORT}' \
    < /etc/nginx/conf.d/app.conf.template \
    > /etc/nginx/conf.d/app.conf

if [[ -n "${MCP_UPSTREAM:-}" ]]; then
    # Escape sed replacement metacharacters in the upstream URL.
    mcp_upstream_escaped="$(printf '%s' "${MCP_UPSTREAM}" | sed -e 's/[&\\#]/\\&/g')"
    sed "s#__MCP_UPSTREAM__#${mcp_upstream_escaped}#g" \
        /etc/nginx/conf.d/mcp.location.template \
        > /etc/nginx/conf.d/mcp.location
else
    cp /etc/nginx/conf.d/mcp.location.disabled /etc/nginx/conf.d/mcp.location
fi

# --- validate config early, then start both processes -----------------------
mkdir -p "$(dirname "${DATABASE_PATH}")"
nginx -t

echo "starting backdash on 127.0.0.1:${BACKDASH_PORT} (db ${DATABASE_PATH})" >&2
BACKDASH_HOST=127.0.0.1 PORT="${BACKDASH_PORT}" DATABASE_PATH="${DATABASE_PATH}" \
    node /app/backdash/dist/main.js &
backend_pid=$!

echo "starting nginx on :8080 (dash at /, backdash at /api, mcp at /mcp)" >&2
nginx -g 'daemon off;' &
nginx_pid=$!

shutdown() {
    kill -TERM "${backend_pid}" "${nginx_pid}" 2>/dev/null || true
}
trap shutdown TERM INT

# Exit (and take the sibling down) as soon as either process dies.
wait -n
status=$?
shutdown
wait 2>/dev/null || true
exit "${status}"
