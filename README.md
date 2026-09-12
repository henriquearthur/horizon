# Horizon

Self-hosted issue tracker that gives a unified, Linear-inspired view over the
issues of many GitLab projects. GitLab stays the canonical source; Horizon
keeps the cache, the Views and the preferences.

## Layout

| Path              | What it holds                                        |
| ----------------- | ---------------------------------------------------- |
| `apps/web`        | TanStack Start application: the shell, routes and UI |
| `packages/domain` | Domain vocabulary and schemas, written with Effect   |

## Commands

Run everything from the repository root. Requires Node >= 22 and pnpm.

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
- `docs/agents/` — conventions for agents working in this repository.
