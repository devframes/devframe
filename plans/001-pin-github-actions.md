# Plan 001: Pin privileged GitHub Actions dependencies

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report it instead of improvising. When complete, update this plan's row in `plans/README.md` unless a reviewer says they own the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- .github/workflows/ci.yml .github/workflows/ecosystem-ci.yml .github/workflows/release.yml`
> If an in-scope workflow changed, compare it with the excerpts below. Stop if its jobs or permissions changed materially.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

The release job delegates publishing to `sxzz/workflows@main` while granting repository write and OIDC permissions. CI and ecosystem jobs also execute actions through movable branch or major-version references. Pinning each `uses:` dependency to a reviewed commit makes the executable supply-chain input immutable and auditable.

## Current state

- `.github/workflows/release.yml` owns npm publishing and release creation.
- `.github/workflows/ci.yml` delegates unit checks and runs the E2E job.
- `.github/workflows/ecosystem-ci.yml` executes the downstream compatibility job.

Current privileged reference:

```yaml
# .github/workflows/release.yml:8-15
jobs:
  release:
    uses: sxzz/workflows/.github/workflows/release.yml@main
    permissions:
      contents: write
      id-token: write
```

Current CI references include `sxzz/workflows/.github/workflows/unit-test.yml@main`, `actions/checkout@v7`, `pnpm/action-setup@v6`, and `actions/setup-node@v7`.

Repository convention: workflow changes use two-space YAML indentation. Commits and PR titles use Conventional Commits, for example `chore: update deps`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Find mutable refs | `rg -n 'uses:\s*[^#\s]+@(main|master|v[0-9]+)$' .github/workflows` | no output after the edit |
| Whitespace check | `git diff --check` | exit 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `.github/workflows/ci.yml`
- `.github/workflows/ecosystem-ci.yml`
- `.github/workflows/release.yml`

**Out of scope**:

- Workflow permissions, triggers, commands, and job structure.
- Dependency version updates unrelated to action pinning.
- Release execution, tags, version bumps, and publishing.

## Git workflow

- Work in the assigned worktree; if a branch must be created, use `fix/pin-github-actions`.
- Use a Conventional Commit such as `fix(ci): pin action dependencies`.
- Do not trigger a release. Push/open a PR only when instructed by the operator.

## Steps

### Step 1: Resolve immutable commits

For every active `uses:` entry in all three workflow files, resolve the currently referenced branch or major tag to its exact commit SHA. For GitHub-hosted actions, use `gh api repos/<owner>/<repo>/commits/<current-ref> --jq .sha` and require one 40-character result. This includes reusable workflows and ordinary actions. Pin the commit selected by the existing ref; do not substitute an unrelated latest release.

Keep the readable release or branch beside the SHA as a comment, for example:

```yaml
uses: actions/checkout@<40-character-sha> # v7
```

**Verify**: `rg -n '^\s*-?\s*uses:' .github/workflows` -> every active line ends in a 40-character hexadecimal SHA before an optional comment.

### Step 2: Confirm the reusable workflow contract

Fetch both pinned reusable workflow files with `gh api repos/sxzz/workflows/contents/.github/workflows/<file>?ref=<sha> --jq .content | base64 -d`. Save neither response. Pipe the release workflow through `rg -n 'workflow_call|publish:'`; the output must contain both keys. Pipe the unit-test workflow through `rg -n 'workflow_call|build:|test:|lint:|build-for-lint:'`; the output must contain all five keys. Do not change this repository's permissions or inputs in this plan.

**Verify**: run both `gh api ... | base64 -d | rg ...` checks above -> every named key is printed; then `git diff --word-diff=porcelain -- .github/workflows` -> only `uses:` revisions and adjacent version comments changed.

### Step 3: Run repository checks

Run the immutable-reference search, whitespace check, and the full repository verification command.

**Verify**: `rg -n 'uses:\s*[^#\s]+@(main|master|v[0-9]+)$' .github/workflows` -> no output.

## Test plan

- No new runtime tests are required; this is declarative workflow hardening.
- Verify every active `uses:` line in all three files, not only the release job.
- Run `git diff --check` and the full repository verification gate.

## Done criteria

- [ ] Every active action and reusable workflow reference is pinned to a reviewed 40-character commit SHA.
- [ ] Each pin has a readable upstream version/branch comment.
- [ ] Release permissions, triggers, and commands are unchanged.
- [ ] `git diff --check` exits 0.
- [ ] `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` changed.

## STOP conditions

- An upstream reusable workflow at the resolved commit does not accept the current inputs.
- GitHub API/network access is unavailable, rate-limited, or does not return one unambiguous 40-character commit SHA for a current ref.
- Resolving a reference requires choosing between materially different upstream implementations.
- A workflow is intentionally expected to follow a branch and no immutable release commit can be identified.
- The full verification command fails twice for a reason caused by this change.

## Maintenance notes

Dependabot or Renovate should update SHA pins together with their version comments. Reviewers should verify both the upstream diff and the displayed version whenever a pin moves.
