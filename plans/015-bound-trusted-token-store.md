# Plan 015: Expire and bound the persisted trusted-token store

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/node/auth/state.ts packages/devframe/src/node/hub-internals/context.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (tokens now expire after a long TTL — behavioral)
- **Depends on**: coordinates with plan 007 (shares `state.test.ts`)
- **Category**: security (at-rest hygiene)
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

Trusted bearer tokens persist to `…/auth.json` in cleartext with **no TTL and no
size cap** — `exchangeTempAuthCode` keeps adding entries and nothing ever expires
or evicts them. Over time the file grows unbounded, and old tokens remain valid
forever, so a disclosure of the file grants persistent access. Adding a
generous TTL + a max-entries cap keeps the reconnect-without-reauth UX while
bounding growth and aging out stale credentials. (No live secret is committed in
the repo — this is at-rest hygiene, not a leaked credential.)

## Current state

`packages/devframe/src/node/hub-internals/context.ts:8-15,62-67` — the store:

```ts
export interface InternalAnonymousAuthStorage {
  trusted: Record<string, { authToken: string, ua: string, origin: string, timestamp: number } | undefined>
}
// ...
const storage = createStorage<InternalAnonymousAuthStorage>({
  filepath: join(context.host.getStorageDir('global'), 'auth.json'),
  initialValue: { trusted: {} },
})
```

`packages/devframe/src/node/auth/state.ts`:

- `exchangeTempAuthCode` mint (`:112-128`) writes
  `state.trusted[authToken] = { authToken, ua, origin, timestamp: Date.now() }` —
  no prune, no cap.
- `verifyAuthToken` (`:67-78`) accepts any token present in `storage.value().trusted`,
  regardless of age.
- Existing bounded/expiring precedent: the OTP code has `TEMP_AUTH_CODE_TTL`,
  `TEMP_AUTH_MAX_ATTEMPTS` (`state.ts:9-16`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/node/auth` | all pass |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `packages/devframe/src/node/auth/state.ts` (TTL + cap + prune helper; enforce in mint/verify)
- `packages/devframe/src/node/hub-internals/context.ts` (prune once on load)
- `packages/devframe/src/node/auth/__tests__/state.test.ts` (add cases; create if plan 007 hasn't landed)

**Out of scope**: encrypting the store at rest (bigger change); the enforcement
question of whether the store gates anything (that's plan 031). This plan is
lifecycle only.

## Git workflow

- Branch: `advisor/015-bound-trusted-token-store`.
- Commit style: `fix(auth): expire and cap the persisted trusted-token store`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add TTL/cap constants + a prune helper in `state.ts`

```ts
/** Persistent trusted tokens live this long before requiring re-auth. */
const TRUSTED_TOKEN_TTL = 30 * 24 * 60 * 60_000 // 30 days
/** Max retained trusted tokens; oldest evicted past this. */
const MAX_TRUSTED_TOKENS = 100

export function pruneTrustedTokens(
  storage: SharedState<InternalAnonymousAuthStorage>,
  now: number = Date.now(),
): void {
  storage.mutate((state) => {
    const entries = Object.entries(state.trusted).filter(([, r]) => !!r) as [string, NonNullable<InternalAnonymousAuthStorage['trusted'][string]>][]
    // Drop expired.
    for (const [token, rec] of entries) {
      if (now - rec.timestamp > TRUSTED_TOKEN_TTL)
        delete state.trusted[token]
    }
    // Evict oldest beyond the cap.
    const live = Object.entries(state.trusted).filter(([, r]) => !!r) as typeof entries
    if (live.length > MAX_TRUSTED_TOKENS) {
      live.sort((a, b) => a[1].timestamp - b[1].timestamp)
      for (const [token] of live.slice(0, live.length - MAX_TRUSTED_TOKENS))
        delete state.trusted[token]
    }
  })
}
```

(Import the `InternalAnonymousAuthStorage` type — it's already referenced in
`state.ts` via `../hub-internals/context`.)

### Step 2: Enforce on mint + verify

- In `exchangeTempAuthCode`, call `pruneTrustedTokens(storage)` right after
  minting the new token (or fold the prune into the same `storage.mutate`).
- In `verifyAuthToken`, reject an expired token and delete it:

```ts
export function verifyAuthToken(token, session, storage): boolean {
  const rec = storage.value().trusted[token]
  if (!token || !rec)
    return false
  if (Date.now() - rec.timestamp > TRUSTED_TOKEN_TTL) {
    storage.mutate((s) => { delete s.trusted[token] })
    return false
  }
  session.meta.clientAuthToken = token
  session.meta.isTrusted = true
  return true
}
```

### Step 3: Prune once on load

In `getInternalContext` (`hub-internals/context.ts`), after creating `storage`,
call `pruneTrustedTokens(storage)` so a restart ages out stale tokens.

### Step 4: Tests

Add to `state.test.ts` (create if plan 007 hasn't landed — see that plan for the
fake session/storage helpers):

```ts
it('rejects and removes an expired trusted token', () => {
  const storage = makeStorage()
  storage.mutate((s: any) => { s.trusted.old = { authToken: 'old', ua: '', origin: '', timestamp: Date.now() - (31 * 24 * 60 * 60_000) } })
  expect(verifyAuthToken('old', makeSession(), storage)).toBe(false)
  expect(storage.value().trusted.old).toBeUndefined()
})

it('caps the number of retained trusted tokens', () => {
  const storage = makeStorage()
  storage.mutate((s: any) => {
    for (let i = 0; i < 150; i++)
      s.trusted[`t${i}`] = { authToken: `t${i}`, ua: '', origin: '', timestamp: i }
  })
  pruneTrustedTokens(storage)
  const count = Object.values(storage.value().trusted).filter(Boolean).length
  expect(count).toBeLessThanOrEqual(100)
})
```

**Verify**: `pnpm exec vitest run packages/devframe/src/node/auth` → all pass.

## Test plan

- New: expired token rejected + removed by `verifyAuthToken`; store capped at
  `MAX_TRUSTED_TOKENS` (oldest evicted).
- Plan 007's exchange/verify tests still pass (fresh tokens are valid, under cap).
- `pnpm --filter devframe typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `TRUSTED_TOKEN_TTL`, `MAX_TRUSTED_TOKENS`, `pruneTrustedTokens` exist in `state.ts`.
- [ ] Mint prunes; `verifyAuthToken` rejects + removes expired tokens.
- [ ] `getInternalContext` prunes once on load.
- [ ] New tests pass; existing auth tests pass.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] Only the 3 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Pruning inside `verifyAuthToken`/mint causes a re-entrancy issue with the
  shared-state `updated` → persist debounce (it shouldn't — mutate is synchronous)
  — report if a write storm appears.
- Plan 007's `state.test.ts` helpers differ from what's referenced here — adapt
  to the actual helpers, don't duplicate them.

## Maintenance notes

- TTL is 30 days; tune if UX needs longer sessions. Document the expiry once the
  auth docs land.
- Reviewer: confirm eviction is oldest-first and that a valid, recent token still
  verifies after a restart (load-time prune keeps it).
