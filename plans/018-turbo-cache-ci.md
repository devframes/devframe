# Plan 018: Persist a Turbo cache in CI so jobs stop rebuilding the whole monorepo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- .github/workflows/ci.yml turbo.json`
> On any change since this plan was written, compare against the "Current state"
> excerpt before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (cache-only; a cold miss equals today)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

The `e2e` job runs `pnpm test:e2e` (= `turbo run build && playwright test`),
rebuilding `devframe` → hub → 6 plugins → examples from scratch every run, with
no `.turbo` cache restored. A restored Turbo cache lets unchanged packages skip
rebuild, cutting CI wall-clock and giving faster PR feedback.

## Current state

`.github/workflows/ci.yml:16-42` — the `e2e` job caches only the pnpm store
(via `setup-node` `cache: pnpm`) and Playwright browsers; there is no `.turbo`
cache step:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with: { path: ~/.cache/ms-playwright, key: playwright-${{ hashFiles('pnpm-lock.yaml') }} }
      - run: |
          ...
          pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      ...
```

The `unit-test` job uses an external reusable workflow
(`sxzz/workflows/.github/workflows/unit-test.yml@main`) that this repo does not
own — leave it alone; scope this change to the in-repo `e2e` job.

Turbo writes its local cache to `.turbo/` (default `.turbo/cache`) at the repo
root; `turbo.json` already sets `globalDependencies: ["pnpm-lock.yaml", "tsconfig.base.json"]`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Validate YAML | (local) `pnpm exec … ` n/a — rely on GitHub Actions parse | workflow parses |
| Lint | `pnpm lint` | exit 0 (eslint ignores workflow YAML; run to be safe) |

## Scope

**In scope**:
- `.github/workflows/ci.yml` (add a `.turbo` cache step to the `e2e` job)

**Out of scope**: the external `unit-test.yml` reusable workflow; Turbo *remote*
caching (a bigger setup); adding a separate build/lint/typecheck job.

## Git workflow

- Branch: `advisor/018-turbo-cache-ci`.
- Commit style: `ci: cache the Turbo build cache in the e2e job`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a `.turbo` cache step before `pnpm test:e2e`

Insert into the `e2e` job's steps (after install, before/near the Playwright
cache):

```yaml
      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
            turbo-${{ runner.os }}-
```

The `github.sha` in the primary key writes a fresh entry per commit; the
`restore-keys` fall back to the most recent compatible cache so unchanged
packages are restored.

### Step 2: Confirm Turbo uses `.turbo`

If Turbo in this repo writes to `node_modules/.cache/turbo` instead of `.turbo`
(version-dependent), set the `path:` accordingly (check by running
`pnpm build` locally and observing which directory appears). Turbo 2.x defaults
to `.turbo`.

**Verify**: after a push (or via `act`/a test branch), the second CI run logs
Turbo cache hits (`cache hit, replaying logs`) for unchanged packages. Locally,
`pnpm build` twice shows `>>> FULL TURBO` / cache hits on the second run.

## Test plan

- No unit tests. Verification is operational: the workflow parses, and a repeat
  run restores the Turbo cache (visible as cache hits in the build log).
- `pnpm lint` still exits 0.

## Done criteria

- [ ] `e2e` job has an `actions/cache@v4` step for the Turbo cache dir with sensible key + restore-keys.
- [ ] The `path:` matches where Turbo actually writes its cache in this repo.
- [ ] Workflow YAML is valid (CI parses it).
- [ ] Only `.github/workflows/ci.yml` changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Turbo's cache directory in this repo is neither `.turbo` nor
  `node_modules/.cache/turbo` (report what you observe).
- The maintainer prefers Turbo *remote* caching (that's a different setup —
  don't wire tokens/secrets without explicit instruction).

## Maintenance notes

- If a dedicated `build`/`typecheck`/`lint` job is added later, cache `.turbo`
  there too (same key scheme).
- Reviewer: confirm the cache `path` matches Turbo's actual output dir, else the
  step is a no-op.
