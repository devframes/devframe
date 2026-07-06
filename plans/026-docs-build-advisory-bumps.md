# Plan 026: Clear the remaining dev/docs-only dependency advisories

> **Executor instructions**: Follow this plan step by step. If a STOP condition
> occurs, stop and report. When done, update this plan's row in `plans/README.md`
> unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- pnpm-workspace.yaml pnpm-lock.yaml`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (dev/docs tooling only; no runtime impact)
- **Depends on**: plan 002 (handles the one runtime-shipped critical, `shell-quote`)
- **Category**: dependencies
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`pnpm audit` reports advisories that are confined to the **examples' and docs'
build tooling** (not the published `devframe`/`@devframes/hub`/plugin runtime):
`vite` `server.fs.deny` bypass and `mermaid → dompurify` XSS under `docs`
(vitepress), `postcss` under the Next examples, and two low Nuxt advisories.
None reach a consumer's runtime, but clearing the actionable ones reduces
`pnpm audit` noise so a future real advisory stands out.

## Current state

- Catalogs in `pnpm-workspace.yaml`: `docs` (`vitepress: ^2.0.0-alpha.17`,
  `mermaid: ^11.15.0`, `vitepress-plugin-mermaid`), `build` (`nuxt: ^4.4.6`),
  `frontend` (`next`, `vite`, …). `overrides` already pins `chokidar`, `crossws`,
  `semver` (and `shell-quote` after plan 002).
- Advisory locations (from `pnpm audit -r`): all under `examples__*` and `docs`
  dependency paths — e.g. `docs > vitepress[-plugin-mermaid] > mermaid > dompurify`,
  `examples__minimal-next-devframe-hub > next > postcss`,
  `packages__nuxt > nuxt` (patched ≥ 4.4.7 vs catalog `^4.4.6`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Audit (before) | `pnpm audit -r` | records the current advisory set |
| Install / relock | `pnpm install` | exit 0 |
| Audit (after) | `pnpm audit -r` | actionable dev advisories cleared or reduced |
| Build docs | `pnpm docs:build` | exit 0 (no regression) |

## Scope

**In scope**:
- `pnpm-workspace.yaml` (catalog bumps and/or `overrides` for transitive dev deps)
- `pnpm-lock.yaml` (regenerated)

**Out of scope**: `shell-quote` (plan 002); upgrading `vitepress` off alpha or
`next`/`nuxt` majors (behavioral risk — separate). Do not touch runtime deps.

## Git workflow

- Branch: `advisor/026-dev-advisory-bumps`.
- Commit style: `chore(deps): clear dev/docs-only audit advisories`.

## Steps

### Step 1: Snapshot the advisories

Run `pnpm audit -r` and note each advisory + its dependency path. Confirm every
one is under `examples`/`docs`/`nuxt` dev tooling (not the published runtime).

### Step 2: Bump what has an in-range/patched fix

- Bump the `nuxt` catalog to the patched version (`^4.4.7` or later) in
  `pnpm-workspace.yaml`.
- For `vite`/`postcss`/`dompurify` advisories, add a `pnpm.overrides` entry for
  the transitive package pointing at its patched version **only if** that version
  is compatible with the pinned `vitepress`/`next` (a patch/minor). Where the fix
  requires a major that vitepress-alpha/next can't take yet, leave it and record
  it as accepted dev-only in the PR.

### Step 3: Relock + re-audit

`pnpm install`, then `pnpm audit -r`. Confirm the actionable advisories cleared;
document any intentionally-left ones (blocked by the alpha/major constraint).

### Step 4: Verify docs still build

**Verify**: `pnpm docs:build` exits 0.

## Done criteria

- [ ] `nuxt` catalog bumped to the patched version; its low advisories cleared.
- [ ] Any in-range transitive fixes applied via `overrides`; remaining advisories documented as dev-only/blocked.
- [ ] `pnpm audit -r` shows a reduced set; no **runtime** advisories remain (post plan 002).
- [ ] `pnpm docs:build` exits 0.
- [ ] Only `pnpm-workspace.yaml` + `pnpm-lock.yaml` changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:
- A fix requires a major bump of `vitepress`, `next`, or `nuxt` (behavioral risk)
  — record it as a follow-up rather than forcing it here.
- An override introduces a peer-dependency conflict.

## Maintenance notes

- These are dev/build-tooling advisories with no consumer-runtime reach; the
  priority is noise reduction, not urgency.
- Reviewer: confirm no runtime dependency versions changed.
