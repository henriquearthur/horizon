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
active_link="$state_dir/active"
releases_dir="$state_dir/releases"

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
unit_template="$repo_root/ops/systemd/horizon.service.in"

for command in curl flock git node pnpm systemctl loginctl systemd-analyze; do
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

install -d -m 0755 "$state_dir" "$releases_dir" "$(dirname -- "$data_file")" "$config_dir" "$unit_dir"

if [[ ! -d $source_dir/.git ]]; then
  git clone --origin origin "$repository" "$source_dir"
elif [[ $(git -C "$source_dir" remote get-url origin) != "$repository" ]]; then
  echo "Dedicated clone has an unexpected origin: $source_dir" >&2
  exit 1
fi

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

legacy_output="$source_dir/apps/web/.output"
if [[ ! -L $active_link && -f $legacy_output/server/index.mjs && -f $legacy_output/.horizon-commit ]]; then
  legacy_commit=$(<"$legacy_output/.horizon-commit")
  if [[ $legacy_commit =~ ^[0-9a-f]{40}$ ]]; then
    legacy_release="$releases_dir/$legacy_commit"
    if [[ ! -d $legacy_release ]]; then
      legacy_staging="$releases_dir/.$legacy_commit.migration"
      rm -rf -- "$legacy_staging"
      mkdir -m 0755 "$legacy_staging"
      cp -a "$legacy_output/." "$legacy_staging/"
      mv -- "$legacy_staging" "$legacy_release"
    fi
    ln -s "$legacy_release" "$active_link"
    echo "Preserved the existing production commit $legacy_commit for recovery"
  fi
fi

node_path=$(command -v node)
escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
sed \
  -e "s|__HORIZON_ACTIVE__|$(escape_sed "$active_link")|g" \
  -e "s|__HORIZON_DATA_FILE__|$(escape_sed "$data_file")|g" \
  -e "s|__HORIZON_ENV_FILE__|$(escape_sed "$env_file")|g" \
  -e "s|__NODE__|$(escape_sed "$node_path")|g" \
  "$unit_template" >"$temporary_unit"
chmod 0644 "$temporary_unit"
systemd-analyze --user verify "$temporary_unit"
mv "$temporary_unit" "$unit_file"

systemctl --user daemon-reload
systemctl --user enable horizon.service

HORIZON_BRANCH=${ref#origin/} "$script_dir/publish-nitro.sh"

echo "Horizon is installed on http://nitro:7346"
echo "Scope data: $data_file"
echo "Logs: journalctl --user-unit=horizon.service"
