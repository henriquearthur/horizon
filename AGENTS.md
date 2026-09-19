# Horizon
Horizon is a self-hosted issue tracker.

## Multi-surface

Horizon has 2 key app surfaces: web and MCP.

Web is the UI the users interact with to manage issues, projects and track progress.

MCP is the surface agents use to manage issues and projects. It is used by harnesses like Claude Code and Codex.

Changes to this repo should work on all surfaces.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues and are managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five canonical triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
