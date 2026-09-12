# Horizon

Self-hosted issue tracker that gives a unified, Linear-inspired view over the
issues of many GitLab projects. GitLab stays the canonical source; Horizon
keeps the cache, the Views and the preferences.

## Layout

| Path              | What it holds                                        |
| ----------------- | ---------------------------------------------------- |
| `apps/web`        | TanStack Start application: the shell, routes and UI |
| `packages/domain` | Domain vocabulary and schemas, written with Effect   |

## Conexão

The GitLab URL and token come from the environment, not from the UI:

```bash
cp .env.example .env.local   # then fill in HORIZON_GITLAB_URL and HORIZON_GITLAB_TOKEN
```

`.env.local` is read by the server only; the token never reaches the browser.
On the first run, `/setup` asks only which groups and projects form the Escopo,
and it explains what is missing when the environment is incomplete.

Horizon does not authenticate its own users: anything that can reach the port
sees the Escopo. Keep it on a private network.

## Commands

Run everything from the repository root. Requires Node >= 22.12 and pnpm.

```bash
pnpm install
pnpm dev          # dev server on 0.0.0.0:3000
pnpm build
pnpm typecheck
pnpm test
pnpm check        # format, typecheck, test and build
```

The dev server listens on `0.0.0.0`, so on the Nitro machine it is reachable at
`http://nitro:3000` over Tailscale.

## Docs

- `CONTEXT.md` — glossary of the domain vocabulary.
- `docs/adr/` — decisions that shaped the current design.
- `docs/agents/` — conventions for agents working in this repository.
