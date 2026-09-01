# Plan 007: Reject pre-existing symlink escapes from filesystem roots

> **Executor instructions**: Follow this plan step by step and verify both read and mutation paths. Do not claim race-free containment if the implementation only performs lexical checks. Stop on a listed condition. Update `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- packages/devframe/src/utils/serve-static.ts packages/devframe/src/utils/serve-static.test.ts plugins/assets/src/node/paths.ts plugins/assets/src/node/scanner.ts plugins/assets/src/rpc/functions/delete.ts plugins/assets/src/rpc/functions/list.ts plugins/assets/src/rpc/functions/mkdir.ts plugins/assets/src/rpc/functions/read-image-meta.ts plugins/assets/src/rpc/functions/read-text.ts plugins/assets/src/rpc/functions/rename.ts plugins/assets/src/rpc/functions/upload.ts plugins/assets/test/assets.test.ts services/open/src/index.ts services/open/test/service.test.ts`
> If any in-scope file changed, compare its path resolution/I/O call with the excerpts below; stop on a mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

Static serving and asset RPC operations prove containment only from normalized path strings. Filesystem operations then follow symlinks, so a symlink inside an allowed root can redirect reads, writes, deletes, renames, or editor-opening outside that root. Canonical checks must reject deterministic, pre-existing symlink escapes. This plan does not claim to defeat a concurrent local process replacing path components between validation and I/O.

## Current state

- `packages/devframe/src/utils/serve-static.ts` serves local SPA/static roots through h3 and Connect variants.
- `plugins/assets/src/node/paths.ts` is the common lexical resolver used by asset RPC handlers.
- `plugins/assets/test/assets.test.ts` has integration coverage for lexical `..` traversal.
- `services/open/src/index.ts:70-100` uses the same lexical allowed-root model for editor/finder actions installed by the assets devframe.

Current lexical checks:

```ts
// serve-static.ts:65-70
const abs = normalize(join(absDir, cleaned))
if (abs !== absDir && !abs.startsWith(absDir + sep))
  return null
const direct = await statFile(abs) // stat follows symlinks

// plugins/assets/src/node/paths.ts:10-16
const normalizedRoot = resolve(root)
const absolute = resolve(normalizedRoot, cleaned)
if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}/`))
  throw diagnostics.DP_ASSETS_0001({ path: relativePath })
```

The minimal correct change may use separate helpers for async static reads and synchronous asset path resolution; do not add a broad abstraction unless it genuinely fits both call patterns.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Static tests | `pnpm exec vitest run packages/devframe/src/utils/serve-static.test.ts` | all tests pass |
| Asset tests | `pnpm exec vitest run plugins/assets/test/assets.test.ts` | all tests pass |
| Open-service tests | `pnpm exec vitest run services/open/test/service.test.ts` | all tests pass |
| Typechecks | `pnpm --filter devframe typecheck && pnpm --filter @devframes/plugin-assets typecheck && pnpm --filter @devframes/service-open typecheck` | exit 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/utils/serve-static.ts`
- `packages/devframe/src/utils/serve-static.test.ts`
- `plugins/assets/src/node/paths.ts`
- `plugins/assets/src/node/scanner.ts`
- `plugins/assets/src/rpc/functions/delete.ts`
- `plugins/assets/src/rpc/functions/list.ts`
- `plugins/assets/src/rpc/functions/mkdir.ts`
- `plugins/assets/src/rpc/functions/read-image-meta.ts`
- `plugins/assets/src/rpc/functions/read-text.ts`
- `plugins/assets/src/rpc/functions/rename.ts`
- `plugins/assets/src/rpc/functions/upload.ts`
- `plugins/assets/test/assets.test.ts`
- `services/open/src/index.ts`
- `services/open/test/service.test.ts`

**Out of scope**:

- Remote asset provider paths (Plan 004).
- Upload quotas, file type/content validation, and active SVG handling.
- Supporting arbitrary symlinked asset trees through a compatibility flag.
- Filesystem sandboxing outside configured roots.

## Git workflow

- Branch if needed: `fix/symlink-containment`.
- Commit style: `fix: enforce symlink-aware filesystem roots`.
- Do not push/open a PR unless instructed.

## Steps

### Step 1: Define the symlink policy in tests first

Add Linux/macOS tests (skip only where creating symlinks is unavailable) with a managed/served root, an outside directory, and both file and directory symlinks inside the root. Tests must prove:

- static h3 and Node middleware return 404 for a symlink escaping the served root;
- ordinary in-root files still serve;
- asset read, upload, rename, delete, mkdir, and open-service operations cannot cross an escaping ancestor symlink;
- reads/static serving allow a symlink only when its canonical target remains inside the canonical root;
- mutations reject every pre-existing symlink path component, including symlinks whose targets remain in-root;
- the open service allows canonical in-root targets and rejects canonical escapes.

In `scanner.ts`, explicitly configure the glob not to follow symbolic links and omit symlink entries from returned `AssetInfo` values. Reuse `DP_ASSETS_0001` for all rejected RPC paths; do not add a new diagnostic in this plan.

Use temporary directories and never reference real system files.

**Verify**: run all three targeted test commands -> the new escape tests fail before implementation while existing tests pass.

### Step 2: Canonicalize static read targets

Resolve the canonical served root once per handler construction. In `resolveTarget`, canonicalize each existing candidate and require it to remain beneath that root before returning `ResolvedFile`. Apply the check to direct files, index candidates, extension candidates, and SPA fallback.

Recheck containment as close as practical to opening the file. `O_NOFOLLOW` may add final-component defense where portable, but do not describe it as protecting ancestor replacement races.

**Verify**: `pnpm exec vitest run packages/devframe/src/utils/serve-static.test.ts` -> all tests pass.

### Step 3: Canonicalize asset mutation ancestors

Keep lexical rejection in `resolveAssetPath`, then canonicalize the root and the nearest existing ancestor of the requested target. Require that ancestor to remain within the canonical root. For existing targets, validate the target's canonical path too.

Because uploads/mkdir may create missing components, walk existing components with `lstat` and reject every symlink before creation, then repeat the walk after directory creation and immediately before opening/renaming/deleting. Apply canonical containment to the open service's allowed-root validation.

Preserve `DP_ASSETS_0001` for outside-root rejection; if a new node-side error is required, follow the package's existing coded diagnostics convention.

**Verify**: `pnpm exec vitest run plugins/assets/test/assets.test.ts` -> all tests pass.

### Step 4: Run cross-package verification

Run the three package typechecks, targeted tests, then the complete repository gate. Check Windows-specific path handling in code even if symlink tests skip on Windows CI.

**Verify**: `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` -> exit 0.

## Test plan

- Escaping final-component file symlink.
- Escaping ancestor-directory symlink.
- Existing and not-yet-existing mutation targets.
- Both static handler implementations.
- Every assets mutation/read family and the installed open service.
- Positive ordinary nested paths and the chosen in-root symlink policy.

## Done criteria

- [ ] Static reads reject canonical paths outside the served root.
- [ ] Asset/open operations reject escaping symlink ancestors before I/O.
- [ ] Both final-component and ancestor symlinks have regression tests.
- [ ] Lexical `..` tests continue to pass.
- [ ] Targeted tests, all affected typechecks, and full verification pass.
- [ ] Only in-scope files and `plans/README.md` changed.

## STOP conditions

- Existing product behavior explicitly requires following symlinks outside configured roots.
- The accepted threat model requires protection against a concurrent local process replacing path components between validation and I/O.
- A mutation path cannot be protected without changing its public atomicity/overwrite contract.
- The open service has external consumers that require a different symlink policy from assets.
- Tests require elevated privileges or real host files.

## Maintenance notes

Canonical checks close pre-existing symlink escapes but do not eliminate filesystem replacement races. If the threat model includes a concurrent local attacker who can mutate the managed root, STOP and escalate to a separate design using descriptor-relative/native sandbox operations; Node's ordinary path APIs and final-component `O_NOFOLLOW` are insufficient for that claim.
