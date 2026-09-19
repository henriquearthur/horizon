# Horizon — domain vocabulary

Horizon gives one view over the issues of many repositories. The words below
are the ones used in code, in issues and in the UI. Use them as written.

## Provider

The external system that owns the issues. Horizon talks to a Provider through
an abstract contract; the only implementation is self-hosted GitLab.

## Conexão

The URL and token that reach one Provider instance. There is a single Conexão
per deployment and it comes from the environment — `HORIZON_GITLAB_URL` and
`HORIZON_GITLAB_TOKEN` — never from the UI. The token stays on the server; the
browser never sees it. See `docs/adr/0001-conexao-vem-do-ambiente.md`.

## Escopo

The groups and projects the user picked out of the Conexão. Everything Horizon
shows is restricted to the Escopo. A group may be tracked dynamically, so
projects created later join the Escopo on their own.

## Sub-issue

A work item the Provider links under another Issue — a GitLab child item. A
sub-issue never shows twice: in the list and in the Kanban it hangs under its
parent, and the parent carries the `concluídos/total` roll-up. Sub-issues are
listed oldest first, so the newest one sits at the end.

## Issue

An issue in the Provider. The Provider is canonical: Horizon caches issues and
derives data from them, but never becomes their source of truth.

## View

A named way of looking at the Issues of an Escopo: filters, ordering and
grouping. Horizon ships only the builtin View `Geral`; a saved View is one the
user named and kept. Views are Horizon-owned data and are tied to an Escopo.

## Label Horizon

A Provider label of the form `horizon::<field>::<value>`, used for properties
GitLab has no native field for. Today that means Status and Prioridade. More
than one label for the same field is an explicit conflict, surfaced to the user.

## Status

The stage of an Issue: `Backlog`, `Em andamento`, `Pausada` or `Concluído`;
`Pausada` means implementation has stopped and can be resumed by another agent.
`Concluído` corresponds to a closed Issue in the Provider; the other stages
correspond to an open Issue (without a Status label, Provider state determines
`Backlog` or `Concluído`).

`Pausada` is an accepted domain addition, pending implementation; see
[the MCP decision](docs/adr/0003-mcp-interface.md).

## Prioridade

`P1`, `P2`, `P3`, `P4` or `Sem prioridade`.

## Tipo

The kind of work item, read from the Provider labels the wayfinder skill
brings: `type:spec`, `type:ticket` and their siblings. Tipo is never drawn as a
Label: it is a single coloured glyph leading the title — in the list, in the
Kanban and in the Detail — with the word itself in the tooltip.

## Código amigável

The short name of an Issue, `DC-203`: the initials of the repository path plus
the `iid`. It is what the user reads and quotes, so it heads the Detail — a
click copies it — and it is also the Issue reference in the address:
`/?issue=DC-203` for the Drawer over the Inbox and `/issue/DC-203` for the
dedicated page. Two repositories may share initials; the reference then opens
the Issue of the lowest project id, and `projectId:iid` still works as an
unambiguous reference.

## Detail

The full reading of one Issue. It opens as a Drawer over the Inbox by default,
and its expand button leads to the dedicated page of the Issue, where the same
Detail takes the window. Both render the same component.

## Bloqueio

A dependency between two Issues, `bloqueia` in one direction and `é bloqueada
por` in the other. GitLab CE has no native link, so Horizon writes it as a
label on the blocking Issue: `horizon-blocks:<projeto>:<iid>:<projeto>:<iid>`.
The single colon is deliberate — see
`docs/adr/0002-bloqueio-nao-usa-scoped-label.md`. A new Bloqueio is only offered between
Issues of the same repository; links that already cross repositories keep being
read and shown. A link whose other end is outside the Escopo is shown as
unreachable instead of disappearing. While a blocker is still open, the blocked
Issue wears a red barred circle in place of its Status dot wherever sub-issues
are listed.

## Projeto

A cross-repository objective: one Projeto gathers Issues from any number of
repositories, groups and subgroups. Membership lives on the Issue, as the
scoped label `horizon::initiative::<id>`, so GitLab keeps an Issue in at most
one Projeto. The names are Horizon-owned data and live next to the saved Views;
an id found on an Issue but missing from the catalog still shows up, named
after its id.

## Friendly Issue ID

The human-readable short code displayed for an Issue, such as `DC-123` for
Issue 123 in `data-control`. It is a convenience reference, not a globally
unique identity; see [friendly ID resolution](docs/adr/0004-friendly-issue-id-resolution.md).

## Agent Session Metadata

The model, harness and session ID identifying the agent session responsible
for a comment submitted through Horizon's MCP interface. Human comments from
the web interface do not require this attribution.

## MCP

Horizon's agent-facing interface to the same Issues, Escopo, Views and Projetos
available through the web interface. Its accepted design is recorded in
[the MCP decision](docs/adr/0003-mcp-interface.md); implementation is pending.
