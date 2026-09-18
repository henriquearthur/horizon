#!/usr/bin/env bash
set -euo pipefail

state_dir=${HORIZON_STATE_DIR:-"$HOME/.local/share/horizon"}
source_dir=${HORIZON_SOURCE_DIR:-"$state_dir/source"}
releases_dir=${HORIZON_RELEASES_DIR:-"$state_dir/releases"}
active_link=${HORIZON_ACTIVE_LINK:-"$state_dir/active"}
previous_link=${HORIZON_PREVIOUS_LINK:-"$state_dir/previous"}
lock_file=${HORIZON_PUBLISH_LOCK:-"$state_dir/publish.lock"}
service_name=${HORIZON_SERVICE_NAME:-horizon.service}
health_url=${HORIZON_HEALTH_URL:-http://127.0.0.1:7346/}
health_attempts=${HORIZON_HEALTH_ATTEMPTS:-15}
health_interval=${HORIZON_HEALTH_INTERVAL:-1}
health_timeout=${HORIZON_HEALTH_TIMEOUT:-2}
remote=${HORIZON_REMOTE:-origin}
branch=${HORIZON_BRANCH:-main}
build_program=${HORIZON_BUILD_PROGRAM:-}
service_program=${HORIZON_SERVICE_PROGRAM:-}

log() { printf 'horizon-publish: %s\n' "$*"; }
result() { printf 'HORIZON_PUBLISH_RESULT=%s\n' "$1"; }

fail_transient() {
  log "$1"
  result transient-failure
  exit 20
}

fail_rejected() {
  log "$1"
  result rejected
  exit 21
}

service_action() {
  local action=$1
  if [[ -n $service_program ]]; then
    "$service_program" "$action" "$service_name" 9>&-
  else
    systemctl --user "$action" "$service_name" 9>&-
  fi
}

healthy() {
  local attempt
  for ((attempt = 1; attempt <= health_attempts; attempt++)); do
    if curl --fail --silent --output /dev/null \
      --max-time "$health_timeout" "$health_url"; then
      return 0
    fi
    sleep "$health_interval"
  done
  return 1
}

install -d -m 0755 "$state_dir" "$releases_dir"
exec 9>"$lock_file"
if ! flock -n 9; then
  log "another publication is already running"
  result busy
  exit 22
fi

[[ -d $source_dir/.git ]] || fail_transient "dedicated clone not found: $source_dir"

log "fetching $remote/$branch"
if ! git -C "$source_dir" fetch --quiet "$remote" "$branch"; then
  fail_transient "could not fetch $remote/$branch"
fi
candidate=$(git -C "$source_dir" rev-parse FETCH_HEAD) || fail_transient "could not resolve fetched commit"
log "candidate commit: $candidate"

active_commit=
old_release=
if [[ -L $active_link ]]; then
  old_release=$(readlink -f "$active_link")
  if [[ -f $old_release/.horizon-commit ]]; then
    active_commit=$(<"$old_release/.horizon-commit")
  fi
fi

if [[ -n $active_commit ]]; then
  log "active commit before attempt: $active_commit"
else
  log "no release is currently active"
fi

if [[ $candidate == "$active_commit" ]]; then
  log "commit $candidate is already active"
  result no-change
  exit 0
fi

candidate_release="$releases_dir/$candidate"
candidate_staging="$releases_dir/.$candidate.tmp"
rm -rf -- "$candidate_staging"
mkdir -m 0755 "$candidate_staging"

if ! git -C "$source_dir" checkout --quiet --detach "$candidate"; then
  rm -rf -- "$candidate_staging"
  fail_transient "could not check out candidate $candidate"
fi

log "building commit $candidate"
if [[ -n $build_program ]]; then
  if ! "$build_program" "$source_dir" "$candidate_staging" "$candidate"; then
    rm -rf -- "$candidate_staging"
    fail_rejected "build failed for commit $candidate; active version was preserved"
  fi
else
  if ! pnpm --dir "$source_dir" install --frozen-lockfile; then
    rm -rf -- "$candidate_staging"
    fail_transient "dependency installation failed for commit $candidate; active version was preserved"
  fi
  if ! pnpm --dir "$source_dir" --filter @horizon/web build ||
    ! cp -a "$source_dir/apps/web/.output/." "$candidate_staging/"; then
    rm -rf -- "$candidate_staging"
    fail_rejected "build failed for commit $candidate; active version was preserved"
  fi
fi

if [[ ! -f $candidate_staging/server/index.mjs ]]; then
  rm -rf -- "$candidate_staging"
  fail_rejected "build for commit $candidate did not create server/index.mjs"
fi
printf '%s\n' "$candidate" >"$candidate_staging/.horizon-commit"
rm -rf -- "$candidate_release"
mv -- "$candidate_staging" "$candidate_release"

new_link="$state_dir/.active.$$.tmp"
ln -s "$candidate_release" "$new_link"
mv -Tf -- "$new_link" "$active_link"

log "activating commit $candidate"
if service_action restart && healthy; then
  if [[ -n $old_release && $old_release != "$candidate_release" ]]; then
    previous_tmp="$state_dir/.previous.$$.tmp"
    ln -s "$old_release" "$previous_tmp"
    mv -Tf -- "$previous_tmp" "$previous_link"
  fi

  keep_previous=
  [[ -L $previous_link ]] && keep_previous=$(readlink -f "$previous_link")
  for release in "$releases_dir"/*; do
    [[ -d $release ]] || continue
    if [[ $release != "$candidate_release" && $release != "$keep_previous" ]]; then
      rm -rf -- "$release"
    fi
  done

  log "published commit $candidate"
  result published
  exit 0
fi

log "commit $candidate failed its startup health check"
if [[ -n $old_release && -d $old_release ]]; then
  rollback_link="$state_dir/.active.$$.rollback"
  ln -s "$old_release" "$rollback_link"
  mv -Tf -- "$rollback_link" "$active_link"
  log "recovering previous commit $active_commit"
  if service_action restart && healthy; then
    rm -rf -- "$candidate_release"
    log "recovered commit $active_commit after rejecting $candidate"
    result recovered
    exit 21
  fi
  result recovery-failed
  log "recovery of commit $active_commit failed"
  exit 23
fi

rm -f -- "$active_link"
service_action stop >/dev/null 2>&1 || true
rm -rf -- "$candidate_release"
fail_rejected "initial commit $candidate failed to start; no publication was recorded"
