# Horizon production on Nitro

Nitro runs Horizon as a user systemd service on `0.0.0.0:7346`. The service is
private to the Tailscale network: use `http://nitro:7346` for the application
and `http://nitro:7346/mcp` for MCP. Do not expose this unauthenticated service
to the public internet.

## Install

Run from a clean checkout with Node 22.12 or newer and pnpm 11.13.1:

```bash
scripts/install-nitro.sh
```

The installer can be run again safely. It creates a dedicated clone at
`~/.local/share/horizon/source`, fetches the requested commit (the current
`origin/main` by default), performs a frozen-lockfile production build and
records the full commit in its release. Development checkouts are not touched.
To choose another remote branch, pass its remote ref:

```bash
scripts/install-nitro.sh origin/main
```

The service uses an absolute Node executable and is enabled under
`default.target`. The installer refuses to continue unless user linger is on;
this lets the user manager start at boot and remain available without an
interactive login. Enable linger, if needed, with
`sudo loginctl enable-linger "$USER"`, then rerun the installer.

## Connection and Scope

Production configuration is outside the clone and build:

- `~/.config/horizon/horizon.env` contains `HORIZON_GITLAB_URL` and
  `HORIZON_GITLAB_TOKEN` and is mode 0600. On its first run the installer copies
  an existing `~/Workspace/apps/horizon/.env.local`, when present, without
  printing its contents. Otherwise, fill the new file manually.
- `~/.local/share/horizon/data/scope.json` stores the Escopo selected in the UI.

Neither file is replaced during reinstallation, so the Conexão and Escopo
survive builds and service restarts. Restart after changing the environment:

```bash
systemctl --user restart horizon.service
```

## Automatic updates, publish and recover

`horizon-update.timer` starts two minutes after boot and then starts
`horizon-update.service` every two minutes (about 30 checks per hour). The
oneshot service and manual commands use the same publisher and lock. Each run
fetches authenticated Git through the dedicated clone's configured `origin`;
there is no CI gate, webhook or runner. Inspect the schedule and its journal:

```bash
systemctl --user status horizon-update.timer
systemctl --user list-timers horizon-update.timer
journalctl --user-unit=horizon-update.service --since today
```

Publish the latest commit from `origin/main` manually:

```bash
scripts/publish-nitro.sh
```

The command fetches and fixes one candidate commit for the entire attempt. It
builds into `~/.local/share/horizon/releases`, switches the `active` symlink,
restarts the service and waits for an HTTP response with a bounded timeout. The
check only confirms that Horizon starts and serves HTTP. It does not contact
GitLab and cannot detect every functional bug.

Only one publication can hold `~/.local/share/horizon/publish.lock`. A second
manual invocation exits without changing the active release. After a successful
publication, `active` points to the new release, `previous` points to the prior
working release and older releases are removed.

A dependency installation or fetch failure leaves the current service alone. A
transient failure is retried after 2, 4, 8, 16 and then at most 30 minutes;
scheduled checks during that wait do no work. A build failure also leaves the
service alone and records the rejected commit. Scheduled checks do not rebuild
that commit until `main` changes. Retry that exact commit explicitly with:

```bash
~/.local/libexec/horizon/publish-nitro.sh --retry-rejected
```

The explicit retry also bypasses a current transient wait. If the new process
fails to start or answer HTTP, the publisher restores the previous release,
restarts it and verifies its HTTP response. On an initial publication there is
no version to recover, so a failed candidate is removed and reported as
rejected.

The final output has a machine-readable `HORIZON_PUBLISH_RESULT`:

- `published` and exit 0: the candidate is active;
- `no-change` and exit 0: the fetched commit is already active;
- `rejected-unchanged` and exit 0: the fetched commit remains suppressed;
- `backoff` and exit 0: the next transient retry is not due yet;
- `transient-failure` and exit 20: fetching, checkout or dependency installation
  failed;
- `rejected` or `recovered` and exit 21: the candidate did not build or did not
  pass startup verification;
- `busy` and exit 22: another publication owns the lock;
- `recovery-failed` and exit 23: neither the candidate nor the previous release
  passed the HTTP check.

Inspect a failed attempt without exposing the environment file:

```bash
journalctl --user-unit=horizon.service --since today
readlink -f ~/.local/share/horizon/active
cat ~/.local/share/horizon/active/.horizon-commit
```

## Operate and inspect

```bash
systemctl --user status horizon.service
systemctl --user is-enabled horizon.service
systemctl --user is-active horizon.service
loginctl show-user "$USER" --property=Linger
journalctl --user-unit=horizon.service
curl --fail http://127.0.0.1:7346/
```

The startup log contains the published commit. Publication output names the
candidate, active version, result and any recovery. Runtime logs go only to the
journal; credentials are neither command-line arguments nor log output.
`Restart=on-failure` recovers a failed Node process automatically.

The installation was validated with systemd's native unit verifier, enablement,
linger, HTTP and controlled process-failure checks. Boot configuration is
verified through linger and the `default.target` link; Nitro is not rebooted
solely for this test.
