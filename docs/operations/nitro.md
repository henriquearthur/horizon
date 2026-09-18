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
To pin the first installation explicitly, pass a commit:

```bash
scripts/install-nitro.sh 0123456789abcdef
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

## Publish and recover

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
build failure also leaves it alone. If the new process fails to start or answer
HTTP, the publisher restores the previous release, restarts it and verifies its
HTTP response. On an initial publication there is no version to recover, so a
failed candidate is removed and reported as rejected.

The final output has a machine-readable `HORIZON_PUBLISH_RESULT`:

- `published` and exit 0: the candidate is active;
- `no-change` and exit 0: the fetched commit is already active;
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
