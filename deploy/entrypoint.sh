#!/usr/bin/env bash
# Runs backdash and nginx together in one container, with nginx as the single
# public origin (dash /, backdash /api, opencode /opencode, MCP /mcp).
set -euo pipefail

BACKDASH_PORT="${BACKDASH_PORT:-3000}"
DATABASE_PATH="${DATABASE_PATH:-/data/app.sqlite}"

# render_upstream_location TEMPLATE DISABLED PLACEHOLDER URL OUT
# Renders a nginx location block that proxies to URL when it is set, otherwise
# copies the DISABLED block (a loud 502) so the reserved path never falls through
# to the SPA.
render_upstream_location() {
    local template="$1" disabled="$2" placeholder="$3" url="$4" out="$5"
    url="${url%/}"
    if [[ -n "${url}" ]]; then
        # Escape sed replacement metacharacters in the upstream URL.
        local escaped
        escaped="$(printf '%s' "${url}" | sed -e 's/[&\\#]/\\&/g')"
        sed "s#${placeholder}#${escaped}#g" "${template}" > "${out}"
    else
        cp "${disabled}" "${out}"
    fi
}

# --- render everything from the environment --------------------------------
# ${BACKDASH_PORT} is a literal for envsubst, not a shell expansion.
# shellcheck disable=SC2016
envsubst '${BACKDASH_PORT}' \
    < /etc/nginx/conf.d/app.conf.template \
    > /etc/nginx/conf.d/app.conf

render_upstream_location \
    /etc/nginx/conf.d/opencode.location.template \
    /etc/nginx/conf.d/opencode.location.disabled \
    __OPENCODE_UPSTREAM__ "${OPENCODE_UPSTREAM:-}" \
    /etc/nginx/conf.d/opencode.location

render_upstream_location \
    /etc/nginx/conf.d/mcp.location.template \
    /etc/nginx/conf.d/mcp.location.disabled \
    __MCP_UPSTREAM__ "${MCP_UPSTREAM:-}" \
    /etc/nginx/conf.d/mcp.location

# --- validate config early, then start both processes -----------------------
mkdir -p "$(dirname "${DATABASE_PATH}")"
nginx -t

echo "starting backdash on 127.0.0.1:${BACKDASH_PORT} (db ${DATABASE_PATH})" >&2
BACKDASH_HOST=127.0.0.1 PORT="${BACKDASH_PORT}" DATABASE_PATH="${DATABASE_PATH}" \
    node /app/backdash/dist/main.js &
backend_pid=$!

echo "starting nginx on :8080 (dash /, backdash /api, opencode /opencode, mcp /mcp)" >&2
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
