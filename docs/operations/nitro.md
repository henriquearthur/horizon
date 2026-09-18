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
`~/.local/share/horizon/source`, checks out the requested commit (the current
`origin/main` by default), performs a frozen-lockfile production build and
records the full commit in `.output/.horizon-commit`. Development checkouts are
not touched. To pin the first installation explicitly, pass a commit:

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

## Operate and inspect

```bash
systemctl --user status horizon.service
systemctl --user is-enabled horizon.service
systemctl --user is-active horizon.service
loginctl show-user "$USER" --property=Linger
journalctl --user-unit=horizon.service
curl --fail http://127.0.0.1:7346/
```

The unit description and startup log contain the published commit. Runtime logs
go only to the journal; credentials are neither command-line arguments nor log
output. `Restart=on-failure` recovers a failed Node process automatically.

The installation was validated with systemd's native unit verifier, enablement,
linger, HTTP and controlled process-failure checks. Boot configuration is
verified through linger and the `default.target` link; Nitro is not rebooted
solely for this test.
