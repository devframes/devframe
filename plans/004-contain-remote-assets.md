# Plan 004: Contain remote asset materialization inside its target directory

> **Executor instructions**: Follow this plan step by step and run each verification command. Stop rather than improvising if provider path semantics differ from the assumptions below. Update `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- packages/devframe/src/utils/remote-assets.ts packages/devframe/src/utils/remote-assets.test.ts`
> If either file changed, compare the materialization loop and successful fixture with the excerpts below; stop on a mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

`RemoteAssetsStore.materialize()` trusts provider-listed paths after checking only a string prefix. A compromised provider can list a prefixed path whose suffix traverses outside the requested build directory. Build materialization must reject unsafe list entries before fetching or writing them.

## Current state

- `packages/devframe/src/utils/remote-assets.ts` implements provider listing, caching, serving, and build materialization.
- `packages/devframe/src/utils/remote-assets.test.ts` has fake jsDelivr/unpkg providers and an existing successful materialization test at lines 182-189.

Vulnerable loop:

```ts
// packages/devframe/src/utils/remote-assets.ts:343-356
for (const filePath of files.filter(f => f.startsWith(prefix))) {
  const target = join(targetDir, filePath.slice(prefix.length))
  const url = provider.fileUrl(normalized.package, normalized.version, filePath)
  // fetch, mkdir, writeFile(target, ...)
}
```

Use existing coded diagnostic `DF0064` through the local `fail()` helper. Do not add raw node-side errors.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted test | `pnpm exec vitest run packages/devframe/src/utils/remote-assets.test.ts` | all tests pass |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/utils/remote-assets.ts`
- `packages/devframe/src/utils/remote-assets.test.ts`

**Out of scope**:

- CDN integrity/signature verification.
- Cache storage permissions and cache eviction.
- Request-path handling in `serve()`; it already has separate traversal tests.
- Provider API redesign.

## Git workflow

- Branch if needed: `fix/remote-assets-traversal`.
- Commit style: `fix(devframe): contain remote asset materialization`.
- Do not push/open a PR unless instructed.

## Steps

### Step 1: Validate every listed path

Before constructing a URL or issuing a fetch, require each listed path to:

- be a package-relative provider path, not an absolute path or URL;
- contain only `/` separators; reject any backslash rather than normalizing it;
- either lie outside the configured `prefix` and remain ignored, or lie beneath that prefix on a segment boundary and pass the remaining checks;
- have a non-empty relative suffix;
- contain no traversal after normalization.

Resolve the final destination against `resolve(targetDir)` and require exact containment (`target === root` is not a writable file; descendants must start with `root + sep`). Account for Windows separators by using Node path primitives for filesystem containment rather than string `/` assumptions.

Continue ignoring ordinary package files outside the selected prefix (`package.json` is present in the existing valid fixture). Reject an entry that claims to be beneath the selected prefix but has an unsafe suffix; do not fetch it.

**Verify**: `pnpm --filter devframe typecheck` -> exit 0.

### Step 2: Add malicious-listing regression tests

Extend the test fake or add a small custom `RemoteAssetsProvider` that returns controlled file names. Cover:

- a prefixed traversal entry;
- an absolute path entry;
- a backslash traversal entry, which must be rejected on every platform;
- a prefix-confusion entry, which must be ignored as outside the selected prefix;
- an ordinary outside-prefix package file, which must remain ignored without invalidating the manifest;
- a normal nested asset still materializes.

For each rejection, assert the fetch for that file was not attempted and an outside sentinel file was not created/modified. Do not include an operating-system sensitive path in the fixture.

**Verify**: `pnpm exec vitest run packages/devframe/src/utils/remote-assets.test.ts` -> all tests pass.

## Done criteria

- [ ] Unsafe provider paths fail before network fetch and filesystem mutation.
- [ ] Final destinations are proven descendants of the resolved target directory.
- [ ] Existing jsDelivr and unpkg materialization remains functional.
- [ ] Targeted test, typecheck, and full verification pass.
- [ ] Only in-scope files and `plans/README.md` changed.

## STOP conditions

- Provider listings intentionally use absolute URLs rather than package-relative paths.
- Correct containment requires changing the public `RemoteAssetsProvider` contract.
- A platform-specific path behavior cannot be represented by deterministic tests.

## Maintenance notes

Keep validation immediately before materialization even if built-in providers sanitize listings; custom providers remain an untrusted boundary. Review future bulk extraction/materialization code for the same prefix-versus-containment mistake.
