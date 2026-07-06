# Plan 028 (spike): Scope the two remaining planned plugins — MCP inspector and OG viewer

> **Executor instructions**: This is a **design/spike** plan. Produce written
> designs + (for MCP-inspect) a thin prototype. Do NOT build both plugins to
> completion. If a STOP condition occurs, stop and report. When done, update this
> plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- todos plugins packages/devframe/src/adapters/mcp`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: L (spike; each full plugin is a separate large effort)
- **Risk**: MED (new SPA build stacks)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`todos/README.md` plans 7 first-party plugins; `plugins/` has 6
(inspect/terminals/git/a11y/code-server + messages). Two planned plugins are
**unbuilt**: `@devframes/plugin-og` (#4) and `@devframes/plugin-mcp-inspect` (#6).
Building them completes the stated ecosystem and the dogfooding matrix (OG proves
the Nuxt-SPA + build/`spa.loader` path; MCP proves the Next-SPA + agent/evals
path). MCP-inspect is unusually cheap here: core already ships the MCP adapter and
an agent host surface, and the inspect plugin already exposes the introspection
RPCs an MCP inspector would render.

## Current state

- `todos/README.md` — the planning index (shape, sequencing, dogfooding map) for
  all 7 plugins; read the `01`–`07` docs for OG (`04-plugin-og-viewer.md`) and
  MCP (`06-plugin-mcp-inspect.md`).
- `packages/devframe/src/adapters/mcp/` — the MCP adapter (`build-server.ts`,
  `to-json-schema.ts`, `transports.ts`, stdio transport).
- Agent RPCs exist: `packages/devframe/src/node/host-agent.ts`,
  `node/rpc/agent-*.ts`; the inspect plugin already has
  `rpc/functions/{describe-agent,invoke-agent-tool,read-agent-resource}.ts`.
- Existing plugins are the structural template (`todos/README.md` "Package
  convention" + any built plugin, e.g. `plugins/a11y` for the CLI/SPA wiring).

## Scope

**In scope** (spike deliverables):
- Two short design docs (proposal files under `plans/notes/` or the PR body):
  - **MCP inspector**: its `/node` RPC surface, how it reuses the existing agent
    RPCs + MCP adapter, the Next-SPA build, and `spa.loader`/build-mode behavior.
  - **OG viewer**: the Nuxt static-export SPA, the `views.hostStatic` usage, and
    the build/`spa.loader` path it exercises.
- A **thin MCP-inspect prototype** (scaffold `plugins/mcp-inspect/` per the
  package convention: `index.ts`, `node/index.ts`, `client/index.ts`, `cli.ts`,
  `vite.ts`, `diagnostics.ts` with `DP_MCP_*`) that lists agent tools/resources
  by reusing the existing agent RPCs — enough to prove the wiring, not a finished UI.

**Out of scope**: a finished OG viewer, finished UIs, publishing. OG stays
design-only in this spike (it introduces the untrodden Nuxt-SPA build; scope its
build separately).

## Steps

1. Read `todos/04-plugin-og-viewer.md`, `todos/06-plugin-mcp-inspect.md`, and the
   "Package convention"/"Repo wiring changes" sections of `todos/README.md`.
2. **MCP-inspect design**: map its RPCs onto the existing agent host + MCP adapter
   (what's reused vs new). Define the diagnostics prefix (`DP_MCP_`), the Axis-A
   exports, and the Next-SPA build shape.
3. **MCP-inspect prototype**: scaffold the package (mirror `plugins/a11y`'s
   structure + `tsdown` three-config pattern), wire `turbo.json`, `alias.ts`,
   `tsconfig`, and add a `typecheck` script (plan 001's rule). Implement a minimal
   `/node` that surfaces the agent tool/resource list; skip the polished SPA.
4. **OG design**: write the OG viewer proposal (Nuxt static export, `spa.loader`,
   `views.hostStatic`), listing open questions and the build-path risks. No code.
5. List sequencing + open questions (versioning/release cadence, shared UI kit —
   which `todos/README.md` leaves open).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 (new package must ship a `typecheck` script) |
| Build (new pkg) | `pnpm --filter @devframes/plugin-mcp-inspect build` | exit 0 for the thin slice |

## Done criteria

- [ ] MCP-inspect and OG viewer design docs exist (RPC surface, SPA stack, build path, open questions).
- [ ] A thin MCP-inspect package is scaffolded per the package convention, wired into `turbo.json`/`alias.ts`/`tsconfig`, with a `typecheck` script, and surfaces the agent tool/resource list from existing RPCs.
- [ ] `pnpm typecheck` passes with the new package included.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- The existing agent RPCs don't expose enough to render an inspector without new
  core surface — report the gap (it may itself be a core finding) rather than
  building new core APIs in this spike.
- Repo wiring (`turbo.json`/`alias.ts`) for a new plugin proves more involved than
  `todos/README.md` "Repo wiring changes" describes — follow that doc; report drift.

## Maintenance notes

- Each plugin becomes its own full build plan after this spike; do MCP-inspect
  first (lowest new surface), then OG.
- Reviewer: judge whether MCP-inspect genuinely reuses the existing agent/MCP
  surface (the whole point) vs. duplicating it.
