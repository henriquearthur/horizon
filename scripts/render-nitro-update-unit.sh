#!/usr/bin/env bash
set -euo pipefail

if (($# != 3)); then
  echo "Usage: $0 TEMPLATE OUTPUT PUBLISHER" >&2
  exit 2
fi

template=$1
output=$2
publisher=$3
node_path=$(command -v node)
pnpm_path=$(command -v pnpm)
tool_path="$(dirname -- "$node_path"):$(dirname -- "$pnpm_path"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|__HORIZON_PUBLISHER__|$(escape_sed "$publisher")|g" \
  -e "s|__HORIZON_TOOL_PATH__|$(escape_sed "$tool_path")|g" \
  "$template" >"$output"
