#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT

rendered_unit="$test_root/horizon-update.service"
"$repo_root/scripts/render-nitro-update-unit.sh" \
  "$repo_root/ops/systemd/horizon-update.service.in" \
  "$rendered_unit" \
  /tmp/publish-nitro.sh

tool_path=$(sed -n 's/^Environment=PATH=//p' "$rendered_unit")
[[ -n $tool_path ]] || {
  echo 'FAIL: rendered update unit has no tool PATH' >&2
  exit 1
}

env -i HOME="$test_root" PATH="$tool_path" pnpm --version >/dev/null
grep -Fqx 'ExecStart=/tmp/publish-nitro.sh' "$rendered_unit"

printf 'systemd tool path test passed\n'
