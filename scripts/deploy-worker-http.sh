#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_DEPLOY_TOKEN:?CLOUDFLARE_DEPLOY_TOKEN is required}"

config_path="${1:-wrangler.jsonc}"
metadata_path="$(mktemp)"
response_path="$(mktemp)"
trap 'rm -f "$metadata_path" "$response_path"' EXIT

node - "$config_path" "$metadata_path" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [configPath, metadataPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const required = (value, label) => {
  if (!value) throw new Error(`Missing ${label} in ${configPath}`);
  return value;
};

const bindings = [
  ...(config.d1_databases ?? []).map((binding) => ({
    name: binding.binding,
    type: 'd1',
    id: binding.database_id
  })),
  ...(config.r2_buckets ?? []).map((binding) => ({
    name: binding.binding,
    type: 'r2_bucket',
    bucket_name: binding.bucket_name
  })),
  ...(config.kv_namespaces ?? []).map((binding) => ({
    name: binding.binding,
    type: 'kv_namespace',
    namespace_id: binding.id
  })),
  ...(config.services ?? []).map((binding) => ({
    name: binding.binding,
    type: 'service',
    service: binding.service,
    ...(binding.entrypoint ? { entrypoint: binding.entrypoint } : {})
  }))
];

for (const binding of bindings) {
  required(binding.name, 'binding name');
  required(binding.type, 'binding type');
}

const metadata = {
  main_module: path.basename(required(config.main, 'main module')),
  compatibility_date: required(config.compatibility_date, 'compatibility date'),
  compatibility_flags: config.compatibility_flags ?? [],
  bindings,
  keep_bindings: ['secret_text'],
  ...(config.observability ? { observability: config.observability } : {})
};

fs.writeFileSync(metadataPath, JSON.stringify(metadata));
NODE

account_id="$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).account_id)" "$config_path")"
script_name="$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).name)" "$config_path")"
entry_file="$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).main)" "$config_path")"

[ -f "$entry_file" ] || { echo "Worker entry file is missing: $entry_file" >&2; exit 1; }

curl --http1.1 --silent --show-error --fail-with-body \
  --retry 3 --retry-all-errors --retry-delay 2 \
  --connect-timeout 20 --max-time 360 \
  --request PUT \
  --header "Authorization: Bearer $CLOUDFLARE_DEPLOY_TOKEN" \
  --form "metadata=@${metadata_path};type=application/json" \
  --form "$(basename "$entry_file")=@${entry_file};type=application/javascript+module" \
  "https://api.cloudflare.com/client/v4/accounts/${account_id}/workers/scripts/${script_name}" \
  --output "$response_path"

node - "$response_path" <<'NODE'
const fs = require('node:fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!result.success) {
  console.error(JSON.stringify({ success: false, errors: result.errors ?? [] }));
  process.exit(1);
}
console.log('cloudflare_worker_publish=success');
NODE
