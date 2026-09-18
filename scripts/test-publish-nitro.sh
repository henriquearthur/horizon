#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
publisher="$repo_root/scripts/publish-nitro.sh"
test_root=$(mktemp -d)
port=$((20000 + $$ % 20000))
cleanup() {
  if [[ -f $test_root/service.pid ]]; then
    kill "$(<"$test_root/service.pid")" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$test_root"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  [[ $1 == *"$2"* ]] || fail "expected output to contain '$2'"
}

assert_response() {
  local expected=$1 response
  response=$(curl --fail --silent --max-time 2 "http://127.0.0.1:$port/") ||
    fail "server did not answer"
  [[ $response == "$expected" ]] || fail "expected response '$expected', got '$response'"
}

remote="$test_root/remote.git"
seed="$test_root/seed"
state="$test_root/state"
source_dir="$state/source"
mkdir -p "$seed" "$state/data" "$test_root/config"
git init --quiet --bare "$remote"
git -C "$seed" init --quiet -b main
git -C "$seed" config user.email test@example.invalid
git -C "$seed" config user.name 'Horizon test'

commit_version() {
  local version=$1 mode=${2:-healthy} delay=${3:-0}
  printf '%s\n' "$version" >"$seed/VERSION"
  printf '%s\n' "$mode" >"$seed/MODE"
  printf '%s\n' "$delay" >"$seed/BUILD_DELAY"
  git -C "$seed" add VERSION MODE BUILD_DELAY
  git -C "$seed" commit --quiet -m "$version"
  git -C "$seed" push --quiet "$remote" main
}

commit_version one
git clone --quiet "$remote" "$source_dir"
git -C "$source_dir" checkout --quiet main
printf 'scope survives\n' >"$state/data/scope.json"
printf 'secret survives\n' >"$test_root/config/horizon.env"

builder="$test_root/build"
export BUILD_LOG="$test_root/build.log"
cat >"$builder" <<'BUILDER'
#!/usr/bin/env bash
set -euo pipefail
source_dir=$1
output_dir=$2
printf '%s\n' "$3" >>"$BUILD_LOG"
delay=$(<"$source_dir/BUILD_DELAY")
[[ -n ${BUILD_STARTED_FILE:-} ]] && : >"$BUILD_STARTED_FILE"
sleep "$delay"
[[ $(<"$source_dir/MODE") != build-fail ]] || exit 1
mkdir -p "$output_dir/server"
version=$(<"$source_dir/VERSION")
mode=$(<"$source_dir/MODE")
sed -e "s/__VERSION__/$version/g" -e "s/__MODE__/$mode/g" >"$output_dir/server/index.mjs" <<'SERVER'
import http from 'node:http'
if ('__MODE__' === 'start-fail') process.exit(1)
http.createServer((_request, response) => response.end('__VERSION__')).listen(Number(process.env.TEST_PORT), '127.0.0.1')
SERVER
BUILDER
chmod +x "$builder"

service="$test_root/service"
cat >"$service" <<'SERVICE'
#!/usr/bin/env bash
set -euo pipefail
action=$1
pid_file=$TEST_ROOT/service.pid
if [[ -f $pid_file ]]; then
  kill "$(<"$pid_file")" >/dev/null 2>&1 || true
  for _ in {1..20}; do
    kill -0 "$(<"$pid_file")" >/dev/null 2>&1 || break
    sleep 0.05
  done
  rm -f "$pid_file"
fi
[[ $action == restart ]] || exit 0
TEST_PORT=$TEST_PORT nohup node "$HORIZON_ACTIVE_LINK/server/index.mjs" \
  >"$TEST_ROOT/server.log" 2>&1 &
echo $! >"$pid_file"
SERVICE
chmod +x "$service"

export HORIZON_STATE_DIR="$state"
export HORIZON_SOURCE_DIR="$source_dir"
export HORIZON_BUILD_PROGRAM="$builder"
export HORIZON_SERVICE_PROGRAM="$service"
export HORIZON_HEALTH_URL="http://127.0.0.1:$port/"
export HORIZON_HEALTH_ATTEMPTS=20
export HORIZON_HEALTH_INTERVAL=0.05
export HORIZON_HEALTH_TIMEOUT=1
export HORIZON_ACTIVE_LINK="$state/active"
export TEST_ROOT="$test_root"
export TEST_PORT="$port"

output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=published'
assert_response one
first_commit=$(<"$state/active/.horizon-commit")

healthy_pid=$(<"$test_root/service.pid")
output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=no-change'
[[ $(<"$test_root/service.pid") == "$healthy_pid" ]] || fail 'healthy service was restarted'
"$service" stop
output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=no-change'
assert_response one
[[ $(wc -l <"$BUILD_LOG") == 1 ]] || fail 'stopped service recovery rebuilt the release'

commit_version two
output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=published'
assert_response two
second_commit=$(<"$state/active/.horizon-commit")
[[ $(<"$state/previous/.horizon-commit") == "$first_commit" ]] || fail 'previous release was not retained'

commit_version broken-build build-fail
set +e
output=$($publisher 2>&1)
status=$?
set -e
[[ $status == 21 ]] || fail "build failure returned $status"
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=rejected'
[[ $(<"$state/active/.horizon-commit") == "$second_commit" ]] || fail 'build failure changed active release'
assert_response two
rejected_commit=$(git -C "$seed" rev-parse HEAD)
rejected_builds=$(grep -c "$rejected_commit" "$BUILD_LOG")

output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=rejected-unchanged'
[[ $(grep -c "$rejected_commit" "$BUILD_LOG") == "$rejected_builds" ]] ||
  fail 'rejected commit was rebuilt automatically'

set +e
output=$($publisher --retry-rejected 2>&1)
status=$?
set -e
[[ $status == 21 ]] || fail "manual rejected retry returned $status"
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=rejected'
[[ $(grep -c "$rejected_commit" "$BUILD_LOG") == $((rejected_builds + 1)) ]] ||
  fail 'manual retry did not rebuild rejected commit'

commit_version broken-start start-fail
set +e
output=$($publisher 2>&1)
status=$?
set -e
[[ $status == 21 ]] || fail "startup failure returned $status"
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=recovered'
[[ $(<"$state/active/.horizon-commit") == "$second_commit" ]] || fail 'startup failure did not recover active release'
assert_response two

commit_version three healthy 1
export BUILD_STARTED_FILE="$test_root/build-started"
$publisher >"$test_root/first-publish.log" 2>&1 &
first_publish_pid=$!
for _ in {1..50}; do
  [[ -f $BUILD_STARTED_FILE ]] && break
  sleep 0.02
done
[[ -f $BUILD_STARTED_FILE ]] || fail 'concurrent test did not reach build'
set +e
output=$($publisher 2>&1)
status=$?
set -e
[[ $status == 22 ]] || fail "concurrent publication returned $status"
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=busy'
wait "$first_publish_pid"
assert_response three

commit_version four
git -C "$source_dir" remote set-url origin "$test_root/unavailable.git"
export HORIZON_NOW_EPOCH=1000
set +e
output=$($publisher 2>&1)
status=$?
set -e
[[ $status == 20 ]] || fail "transient fetch failure returned $status"
[[ $(<"$state/transient-failures") == 1 && $(<"$state/transient-retry-at") == 1120 ]] ||
  fail 'first failure did not schedule 120-second backoff'

export HORIZON_NOW_EPOCH=1001
output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=backoff'
[[ $(<"$state/transient-failures") == 1 && $(<"$state/transient-retry-at") == 1120 ]] ||
  fail 'backoff performed another attempt'

export HORIZON_NOW_EPOCH=1120
set +e
output=$($publisher 2>&1)
status=$?
set -e
[[ $status == 20 ]] || fail "second transient fetch failure returned $status"
[[ $(<"$state/transient-failures") == 2 && $(<"$state/transient-retry-at") == 1360 ]] ||
  fail 'second failure did not schedule 240-second backoff'

git -C "$source_dir" remote set-url origin "$remote"
export HORIZON_NOW_EPOCH=1360
output=$($publisher)
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=published'
assert_response four
[[ ! -e $state/transient-failures && ! -e $state/transient-retry-at ]] || fail 'success retained backoff'
unset HORIZON_NOW_EPOCH

[[ $(<"$state/data/scope.json") == 'scope survives' ]] || fail 'scope data changed'
[[ $(<"$test_root/config/horizon.env") == 'secret survives' ]] || fail 'connection configuration changed'
release_count=$(find "$state/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)
[[ $release_count == 2 ]] || fail "expected active and previous releases, found $release_count"

# Exercise pnpm itself: an incompatible frozen lockfile is commit-specific,
# while a refused package download must remain eligible for a later attempt.
cat >"$seed/package.json" <<'PACKAGE'
{"name":"publisher-install-test","version":"1.0.0","dependencies":{"is-number":"7.0.0"}}
PACKAGE
cat >"$seed/pnpm-lock.yaml" <<'LOCK'
lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .: {}
LOCK
git -C "$seed" add package.json pnpm-lock.yaml
commit_version invalid-lockfile
set +e
output=$(HORIZON_BUILD_PROGRAM='' "$publisher" 2>&1)
status=$?
set -e
[[ $status == 21 ]] || fail "frozen lockfile mismatch returned $status: $output"
[[ $(<"$state/rejected-commit") == "$(git -C "$seed" rev-parse HEAD)" ]] || fail 'invalid lockfile commit was not rejected'
[[ ! -e $state/transient-retry-at ]] || fail 'invalid lockfile scheduled transient retry'
output=$(HORIZON_BUILD_PROGRAM='' "$publisher")
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=rejected-unchanged'
assert_response four

cat >"$seed/pnpm-lock.yaml" <<'LOCK'
lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      is-number:
        specifier: 7.0.0
        version: 7.0.0
packages:
  is-number@7.0.0:
    resolution: {tarball: http://127.0.0.1:1/is-number-7.0.0.tgz}
snapshots:
  is-number@7.0.0: {}
LOCK
printf 'fetch-retries=0\nfetch-timeout=1000\nstore-dir=%s/pnpm-store\n' "$test_root" >"$seed/.npmrc"
git -C "$seed" add pnpm-lock.yaml .npmrc
commit_version unavailable-dependency
set +e
output=$(HORIZON_BUILD_PROGRAM='' HORIZON_NOW_EPOCH=2000 "$publisher" 2>&1)
status=$?
set -e
[[ $status == 20 ]] || fail "package download failure returned $status: $output"
[[ $(<"$state/transient-failures") == 1 && $(<"$state/transient-retry-at") == 2120 ]] || fail 'download failure did not schedule retry'
[[ $(<"$state/rejected-commit") != "$(git -C "$seed" rev-parse HEAD)" ]] || fail 'download failure rejected the commit'
assert_response four

commit_version broken-initial start-fail
initial_state="$test_root/initial-state"
git clone --quiet "$remote" "$initial_state/source"
export HORIZON_STATE_DIR="$initial_state"
export HORIZON_SOURCE_DIR="$initial_state/source"
export HORIZON_ACTIVE_LINK="$initial_state/active"
unset BUILD_STARTED_FILE
set +e
output=$($publisher 2>&1)
status=$?
set -e
[[ $status == 21 ]] || fail "initial startup failure returned $status"
assert_contains "$output" 'HORIZON_PUBLISH_RESULT=rejected'
[[ ! -e $initial_state/active && ! -L $initial_state/active ]] || fail 'failed initial release remained active'

printf 'publish-nitro external tests passed\n'
