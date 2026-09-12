# Horizon — domain vocabulary

Horizon gives one view over the issues of many repositories. The words below
are the ones used in code, in issues and in the UI. Use them as written.

## Provider

The external system that owns the issues. Horizon talks to a Provider through
an abstract contract; the only implementation is self-hosted GitLab.

## Conexão

The URL and token that reach one Provider instance. The first version supports
a single Conexão. The token lives on the server, encrypted at rest; the browser
only holds a session.

## Escopo

The groups and projects the user picked out of the Conexão. Everything Horizon
shows is restricted to the Escopo. A group may be tracked dynamically, so
projects created later join the Escopo on their own.

## Issue

An issue in the Provider. The Provider is canonical: Horizon caches issues and
derives data from them, but never becomes their source of truth.

## View

A named way of looking at the Issues of an Escopo: filters, ordering and
grouping. Horizon ships the builtin Views `Inbox`, `Todos os issues`,
`Por projeto` and `Atribuídos a mim`; a saved View is one the user named and
kept. Views are Horizon-owned data and are tied to an Escopo.

## Label Horizon

A Provider label of the form `horizon::<field>::<value>`, used for properties
GitLab has no native field for. Today that means Status and Prioridade. More
than one label for the same field is an explicit conflict, surfaced to the user.

## Status

`Backlog`, `Em andamento` or `Concluído`. An Issue with no status Label Horizon
is Backlog. `Concluído` closes the Issue in the Provider; the other two reopen
it.

## Prioridade

`P1`, `P2`, `P3`, `P4` or `Sem prioridade`.
