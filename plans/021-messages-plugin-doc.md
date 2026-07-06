# Plan 021: Document the `@devframes/plugin-messages` package

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- docs/plugins docs/.vitepress/config.ts plugins/messages`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`@devframes/plugin-messages` is a published plugin (full RPC surface:
`add`/`clear`/`list`/`remove`/`update`) but it has **no docs page** — `docs/plugins/`
covers a11y/code-server/git/inspect/terminals only, and the plugins sidebar
(`docs/.vitepress/config.ts:61-70`) omits it. Users can't discover it or its
API without reading source.

## Current state

- `docs/plugins/` contains: `index.md`, `a11y.md`, `code-server.md`, `git.md`,
  `inspect.md`, `terminals.md` — **no `messages.md`**.
- `docs/.vitepress/config.ts:61-70` `pluginsItems` lists the 5 existing plugin
  pages; messages is absent.
- Source of truth for the page: `plugins/messages/` — its `src/rpc/functions/*`
  (add/clear/list/remove/update), `src/types.ts`, and the hub message-feed
  behavior (it ports the vitejs/devtools messages view as a hub message-feed panel).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Docs build | `pnpm docs:build` | exit 0, no dead links; `/plugins/messages` resolves |

## Scope

**In scope**:
- `docs/plugins/messages.md` (create)
- `docs/.vitepress/config.ts` (add a `pluginsItems` entry)

**Out of scope**: plugin source; the `docs/plugins/index.md` overview beyond
adding messages to any list it maintains.

## Git workflow

- Branch: `advisor/021-messages-plugin-doc`.
- Commit style: `docs(plugins): document @devframes/plugin-messages`.

## Steps

### Step 1: Write the page

Create `docs/plugins/messages.md`, mirroring the structure of an existing plugin
page (read `docs/plugins/git.md` for the shape: intro sentence, install/usage,
RPC/API surface, hub integration). Source the actual RPC names + shapes from
`plugins/messages/src/rpc/functions/*` and `src/types.ts`. Follow `AGENTS.md`
docs style (positive framing, lead with what the reader can build, concise).

### Step 2: Add to the sidebar/nav

In `docs/.vitepress/config.ts` `pluginsItems`, add:

```ts
{ text: 'Messages', link: `${prefix}/plugins/messages` },
```

(placed logically among the others). If `docs/plugins/index.md` enumerates the
plugins, add messages there too.

### Step 3: Verify

**Verify**: `pnpm docs:build` completes with no dead links; the Messages page is
reachable from the Plugins sidebar/nav.

## Done criteria

- [ ] `docs/plugins/messages.md` exists and documents the RPC surface + hub feed usage.
- [ ] The Plugins sidebar/nav includes Messages.
- [ ] `pnpm docs:build` exits 0, no dead links.
- [ ] Only `docs/` files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if the plugin's public API differs materially from the other
plugin docs' assumptions (e.g. it's hub-only with no standalone CLI) — reflect
reality rather than copying an ill-fitting template.

## Maintenance notes

- Reviewer: confirm the documented RPC names match `plugins/messages/src/rpc/functions/*`.
