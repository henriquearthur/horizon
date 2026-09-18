#!/usr/bin/env bash
set -euo pipefail

repository=${HORIZON_REPOSITORY:-https://github.com/henriquearthur/horizon.git}
ref=${1:-origin/main}
state_dir=${HORIZON_STATE_DIR:-"$HOME/.local/share/horizon"}
source_dir=${HORIZON_SOURCE_DIR:-"$state_dir/source"}
data_file=${HORIZON_DATA_FILE:-"$state_dir/data/scope.json"}
config_dir=${HORIZON_CONFIG_DIR:-"$HOME/.config/horizon"}
env_file=${HORIZON_ENV_FILE:-"$config_dir/horizon.env"}
existing_env=${HORIZON_EXISTING_ENV_FILE:-"$HOME/Workspace/apps/horizon/.env.local"}
unit_dir=${HORIZON_UNIT_DIR:-"$HOME/.config/systemd/user"}
unit_file="$unit_dir/horizon.service"
temporary_unit="$unit_dir/horizon-install.service"

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
unit_template="$repo_root/ops/systemd/horizon.service.in"

for command in git node pnpm systemctl loginctl systemd-analyze; do
  command -v "$command" >/dev/null || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

linger=$(loginctl show-user "$USER" --property=Linger --value)
if [[ $linger != yes ]]; then
  echo "User linger is disabled. Enable it with: sudo loginctl enable-linger $USER" >&2
  exit 1
fi

install -d -m 0755 "$state_dir" "$(dirname -- "$data_file")" "$config_dir" "$unit_dir"

if [[ ! -d $source_dir/.git ]]; then
  git clone --origin origin "$repository" "$source_dir"
elif [[ $(git -C "$source_dir" remote get-url origin) != "$repository" ]]; then
  echo "Dedicated clone has an unexpected origin: $source_dir" >&2
  exit 1
fi

git -C "$source_dir" fetch --prune origin
git -C "$source_dir" checkout --detach "$ref"
commit=$(git -C "$source_dir" rev-parse HEAD)

if [[ ! -f $env_file ]]; then
  if [[ -f $existing_env ]]; then
    install -m 0600 "$existing_env" "$env_file"
    echo "Reused the existing Connection configuration in $env_file"
  else
    install -m 0600 /dev/null "$env_file"
    echo "Created $env_file; configure HORIZON_GITLAB_URL and HORIZON_GITLAB_TOKEN"
  fi
else
  chmod 0600 "$env_file"
fi

pnpm --dir "$source_dir" install --frozen-lockfile
pnpm --dir "$source_dir" --filter @horizon/web build
output_dir="$source_dir/apps/web/.output"
[[ -f $output_dir/server/index.mjs ]] || {
  echo "Production build did not create $output_dir/server/index.mjs" >&2
  exit 1
}
printf '%s\n' "$commit" >"$output_dir/.horizon-commit"

node_path=$(command -v node)
escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|__HORIZON_COMMIT__|$(escape_sed "$commit")|g" \
  -e "s|__HORIZON_OUTPUT__|$(escape_sed "$output_dir")|g" \
  -e "s|__HORIZON_DATA_FILE__|$(escape_sed "$data_file")|g" \
  -e "s|__HORIZON_ENV_FILE__|$(escape_sed "$env_file")|g" \
  -e "s|__NODE__|$(escape_sed "$node_path")|g" \
  "$unit_template" >"$temporary_unit"
chmod 0644 "$temporary_unit"
systemd-analyze --user verify "$temporary_unit"
mv "$temporary_unit" "$unit_file"

systemctl --user daemon-reload
systemctl --user enable --now horizon.service

echo "Horizon commit $commit is installed on http://nitro:7346"
echo "Scope data: $data_file"
echo "Logs: journalctl --user-unit=horizon.service"
