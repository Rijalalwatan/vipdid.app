#!/usr/bin/env bash
set -euo pipefail
: "${CLOUDFLARE_DEPLOY_TOKEN:?CLOUDFLARE_DEPLOY_TOKEN is required}"
node "$(dirname "$0")/deploy-worker-http.mjs" "${1:-wrangler.jsonc}"
