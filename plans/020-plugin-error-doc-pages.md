# Plan 020: Add docs pages for the 15 plugin `DP_*` diagnostics (fix the 404 links)

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- docs/errors docs/.vitepress/config.ts plugins/*/src/**/diagnostics.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (docs only)
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

Every plugin diagnostic sets `docsBase: 'https://devfra.me/errors'`, so each
emitted code prints a `…/errors/<CODE>` link. 15 `DP_*` codes are defined but
`docs/errors/` has **zero** `DP_*` pages (all 40 core/hub `DF*` codes are
documented 1:1). A developer who hits `DP_TERMINALS_0003` (PTY spawn failure) or
`DP_CODE_SERVER_0002` follows the printed URL to a 404 — exactly when they need
the fix guidance most.

## Current state

Codes defined (verify each by reading the source `diagnostics.ts`):
- `plugins/inspect/src/diagnostics.ts`: `DP_INSPECT_0001`, `DP_INSPECT_0002`
- `plugins/messages/src/diagnostics.ts`: `DP_MESSAGES_0001`
- `plugins/terminals/src/node/diagnostics.ts`: `DP_TERMINALS_0001`–`DP_TERMINALS_0007`
- `plugins/code-server/src/node/diagnostics.ts`: `DP_CODE_SERVER_0001`–`DP_CODE_SERVER_0005`

`docs/.vitepress/config.ts:13-17,109` builds the Error Reference sidebar by
globbing `docs/errors/*.md` — but **only `listErrorCodes('DF')`** (prefix `DF`).
So new `DP_*` pages need the sidebar to also include the `DP` prefix.

Page template (from `AGENTS.md` → "Structured Diagnostics"):

```md
---
outline: deep
---
# DP_TERMINALS_0003: Short Title

## Message
> The `why` text (with `{param}` placeholders shown literally)

## Cause
When and why this occurs.

## Example
Code that triggers it.

## Fix
How to resolve it.

## Source
- [`plugins/terminals/src/node/manager.ts`](...) — `fn()` emits this when …
```

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Docs dev | `pnpm docs` | site builds; `/errors/DP_TERMINALS_0001` resolves |
| Docs build | `pnpm docs:build` | exit 0, no dead-link errors |

## Scope

**In scope**:
- `docs/errors/DP_INSPECT_0001.md` … `DP_CODE_SERVER_0005.md` (15 new pages)
- `docs/.vitepress/config.ts` (include the `DP` prefix in the Error Reference sidebar)

**Out of scope**: changing the diagnostics code or `docsBase`; the `DF*` pages.

## Git workflow

- Branch: `advisor/020-plugin-error-docs`.
- Commit style: `docs(errors): add reference pages for plugin DP_* diagnostics`.

## Steps

### Step 1: Read the codes

For each `diagnostics.ts` above, read every code's `why`/`fix` so each page's
Message + Fix match the actual text. Note each call site (`grep -rn "DP_TERMINALS_0003"
plugins/terminals/src`) for the `## Source` section.

### Step 2: Write one page per code

Create `docs/errors/<CODE>.md` for all 15, following the template. Keep the
`## Message` verbatim from the `why`, `## Fix` from the `fix` (expand into a
sentence), and `## Source` listing each call site (not the `diagnostics.ts`
definition). Follow the docs style in `AGENTS.md` (positive framing, concise).

### Step 3: Wire the sidebar

In `docs/.vitepress/config.ts`, extend the Error Reference `items` to include
`DP` codes, e.g.:

```ts
items: [...listErrorCodes('DF'), ...listErrorCodes('DP')].map(code => ({
  text: code, link: `${prefix}/errors/${code}`,
})),
```

### Step 4: Verify no dead links

**Verify**: `pnpm docs:build` completes with no dead-link warnings; the 15 pages
appear under Error Reference.

## Done criteria

- [ ] 15 `docs/errors/DP_*.md` pages exist, one per defined code, matching the source `why`/`fix`.
- [ ] The Error Reference sidebar lists the `DP_*` codes.
- [ ] `pnpm docs:build` exits 0 with no dead links.
- [ ] Only `docs/` files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The count of defined `DP_*` codes differs from 15 (document the actual set).
- `pnpm docs:build` flags a pre-existing dead link unrelated to these pages.

## Maintenance notes

- Also align `AGENTS.md`/`CLAUDE.md`: its diagnostics section documents the `DF`
  page convention but the `docs/errors/*.md` template header and this task now
  cover the `DP_<PLUGIN>_` codes too. A one-line note there prevents the gap
  reappearing for the next plugin.
- Reviewer: spot-check two pages against their source `why`/`fix`.
