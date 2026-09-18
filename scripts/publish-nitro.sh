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
retry_rejected=false
transient_failures_file="$state_dir/transient-failures"
transient_retry_file="$state_dir/transient-retry-at"
rejected_commit_file="$state_dir/rejected-commit"
backoff_base=${HORIZON_TRANSIENT_BACKOFF_BASE:-120}
backoff_max=${HORIZON_TRANSIENT_BACKOFF_MAX:-1800}
now=${HORIZON_NOW_EPOCH:-$(date +%s)}

if [[ ${1:-} == --retry-rejected ]]; then
  retry_rejected=true
  shift
fi
if (($#)); then
  echo "Usage: $0 [--retry-rejected]" >&2
  exit 2
fi

log() { printf 'horizon-publish: %s\n' "$*"; }
result() { printf 'HORIZON_PUBLISH_RESULT=%s\n' "$1"; }

write_state() {
  local path=$1 value=$2 temporary="$1.$$.tmp"
  printf '%s\n' "$value" >"$temporary"
  mv -f -- "$temporary" "$path"
}

clear_transient_state() {
  rm -f -- "$transient_failures_file" "$transient_retry_file"
}

fail_transient() {
  local failures=0 delay
  [[ -f $transient_failures_file ]] && read -r failures <"$transient_failures_file"
  [[ $failures =~ ^[0-9]+$ ]] || failures=0
  ((failures += 1))
  delay=$backoff_base
  for ((step = 1; step < failures && delay < backoff_max; step++)); do
    delay=$((delay * 2))
  done
  ((delay > backoff_max)) && delay=$backoff_max
  write_state "$transient_failures_file" "$failures"
  write_state "$transient_retry_file" "$((now + delay))"
  log "$1"
  log "transient attempt $failures; next automatic attempt in ${delay}s"
  result transient-failure
  exit 20
}

fail_rejected() {
  write_state "$rejected_commit_file" "$candidate"
  clear_transient_state
  log "$1"
  result rejected
  exit 21
}

replace_symlink() {
  local target=$1 link=$2 suffix=${3:-tmp} temporary
  temporary="$(dirname -- "$link")/.$(basename -- "$link").$$.$suffix"
  ln -s "$target" "$temporary"
  mv -Tf -- "$temporary" "$link"
}

dependency_failure_is_commit_error() {
  local output=$1
  grep -Eq \
    'ERR_PNPM_(OUTDATED_LOCKFILE|BROKEN_LOCKFILE|LOCKFILE_MISSING_DEPENDENCY|NO_LOCKFILE|NO_IMPORTER_MANIFEST_FOUND|INVALID_WORKSPACE_CONFIGURATION|JSON_PARSE|UNSUPPORTED_ENGINE|BAD_PM_VERSION|MISMATCHED_RELEASE_CHANNEL|PEER_DEP_ISSUES)|(^|[[:space:]])ELIFECYCLE([[:space:]]|$)' \
    "$output"
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

if [[ $retry_rejected == false && -f $transient_retry_file ]]; then
  retry_at=$(<"$transient_retry_file")
  if [[ $retry_at =~ ^[0-9]+$ && $now -lt $retry_at ]]; then
    log "waiting until epoch $retry_at after a transient failure"
    result backoff
    exit 0
  fi
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
  if healthy; then
    clear_transient_state
    log "commit $candidate is already active and healthy"
    result no-change
    exit 0
  fi

  log "commit $candidate is active but not answering; restarting it"
  if service_action restart && healthy; then
    clear_transient_state
    log "commit $candidate recovered without a new publication"
    result no-change
    exit 0
  fi
  fail_rejected "active commit $candidate did not recover after restart"
fi

rejected_commit=
[[ -f $rejected_commit_file ]] && read -r rejected_commit <"$rejected_commit_file"
if [[ $retry_rejected == false && $candidate == "$rejected_commit" ]]; then
  clear_transient_state
  log "commit $candidate was already rejected; waiting for a different commit or --retry-rejected"
  result rejected-unchanged
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
  dependency_output="$state_dir/.dependency-install.$$.log"
  if ! pnpm --dir "$source_dir" install --frozen-lockfile \
    2>&1 | tee "$dependency_output"; then
    if dependency_failure_is_commit_error "$dependency_output"; then
      rm -f -- "$dependency_output"
      rm -rf -- "$candidate_staging"
      fail_rejected "dependency installation rejected commit $candidate; active version was preserved"
    fi
    rm -f -- "$dependency_output"
    rm -rf -- "$candidate_staging"
    fail_transient "dependency retrieval failed for commit $candidate; active version was preserved"
  fi
  rm -f -- "$dependency_output"
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

replace_symlink "$candidate_release" "$active_link"

log "activating commit $candidate"
if service_action restart && healthy; then
  if [[ -n $old_release && $old_release != "$candidate_release" ]]; then
    replace_symlink "$old_release" "$previous_link"
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
  rm -f -- "$rejected_commit_file"
  clear_transient_state
  result published
  exit 0
fi

log "commit $candidate failed its startup health check"
if [[ -n $old_release && -d $old_release ]]; then
  replace_symlink "$old_release" "$active_link" rollback
  log "recovering previous commit $active_commit"
  if service_action restart && healthy; then
    rm -rf -- "$candidate_release"
    write_state "$rejected_commit_file" "$candidate"
    clear_transient_state
    log "recovered commit $active_commit after rejecting $candidate"
    result recovered
    exit 21
  fi
  result recovery-failed
  write_state "$rejected_commit_file" "$candidate"
  clear_transient_state
  log "recovery of commit $active_commit failed"
  exit 23
fi

rm -f -- "$active_link"
service_action stop >/dev/null 2>&1 || true
rm -rf -- "$candidate_release"
fail_rejected "initial commit $candidate failed to start; no publication was recorded"
