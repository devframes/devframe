# Plan 027 (spike): Design a `@devframes/next` host-integration package

> **Executor instructions**: This is a **design/spike** plan — investigate,
> prototype minimally, and produce a written proposal + a thin working slice. Do
> NOT build the full package to production polish. If a STOP condition occurs,
> stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/nuxt examples/minimal-next-devframe-hub examples/next-runtime-snapshot packages/devframe/src/utils/serve-static.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

Both Next examples hand-roll static serving that re-implements what devframe
already owns and tests — `examples/minimal-next-devframe-hub/src/client/app/__[id]/[[...path]]/route.ts`
is a ~109-line catch-all with its own content-type map, path-traversal guard, and
SPA fallback, duplicating `packages/devframe/src/utils/serve-static.ts`
(`serveStaticHandler`/`mountStaticHandler`, tested in `serve-static.test.ts`).
`@devframes/nuxt` exists but there is **no `/next` counterpart** — a surface
asymmetry, despite `todos/README.md` listing `/next` as a first-class Axis-A
target. A thin package removes fragile boilerplate for a stated audience and
closes the Nuxt/Next parity gap.

## Current state

- `packages/nuxt/` is the model: a real `@devframes/nuxt` module (`src/module.ts`
  + `src/runtime/`), peer-depends on `devframe`, framework as an optional peer.
- `packages/devframe/src/utils/serve-static.ts` exports `serveStaticHandler`,
  `mountStaticHandler`, and `serveStaticNodeMiddleware` — the reusable core.
- The two Next examples wire devframe by hand (`examples/next-runtime-snapshot/src/devframe.ts`;
  the minimal-next route file above).
- `todos/README.md:43-52` documents the Axis-A targets (`.`/`/cli`/`/vite` baseline
  + opt-in `/nuxt`,`/next`,…).

## Scope

**In scope** (spike deliverables):
- A written proposal: `plans/notes/devframes-next-proposal.md` (or inline in the
  PR description) covering the API surface, Next runtime choice (Node vs Edge),
  and how the connection descriptor (`__connection.json`) is served.
- A thin prototype package `packages/next/` OR a proof in one example: a Next
  route-handler factory that serves the SPA via `serveStaticHandler` and responds
  with connection meta, replacing the hand-rolled route in **one** example as the
  acceptance test.

**Out of scope**: shipping/publishing the package, full docs, `/rspack`/`/webpack`.
Keep it a spike behind a clear "proposed" label.

## Steps

1. **Study the model**: read `packages/nuxt/` (module + runtime), the hand-rolled
   Next route(s), and `serve-static.ts`'s exports. Note what the Next route needs
   that Nuxt's module provides.
2. **Draft the API**: a `createDevframeNextHandler(definition, options)` (or
   similar) returning a catch-all `GET` handler + a `__connection.json` responder,
   built on `serveStaticHandler`/`serveStaticNodeMiddleware`. Decide Node vs Edge
   runtime and document the tradeoff.
3. **Prototype**: implement the thin handler (in `packages/next/` or inline) and
   refactor **one** Next example onto it. Confirm the example still runs
   (`pnpm --filter <example> build` + a manual/e2e check) and serves the SPA +
   connection meta identically.
4. **Write up open questions**: package naming/exports (mirror the Axis-A
   baseline), peer-dep shape (Next as optional peer), and whether the runtime
   snapshot example also migrates.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build an example | `pnpm --filter minimal-next-devframe-hub build` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 (if a new package is added, it needs a `typecheck` script — see plan 001) |

## Done criteria

- [ ] A written proposal (API, runtime choice, connection-meta serving, open questions) exists.
- [ ] A thin prototype serves an example's SPA + `__connection.json` via `serveStaticHandler` (no hand-rolled static logic in that example's path).
- [ ] The migrated example builds and serves identically (manual/e2e check noted).
- [ ] If a new `packages/next/` is added, it has a `typecheck` script and passes `pnpm typecheck`.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The Next App-Router runtime makes reusing `serveStaticHandler` (h3/Node stream
  based) impractical on the target runtime — report the constraint and propose
  the `serveStaticNodeMiddleware` or a fetch-based adaptation instead.
- The connection-descriptor contract differs between the two Next examples —
  reconcile in the proposal before generalizing.

## Maintenance notes

- Ship as a spike/proposal; a follow-up plan promotes it to a published package
  with docs once the API is agreed.
- Reviewer: judge the proposal's API against `@devframes/nuxt` for consistency.
