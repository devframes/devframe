# Plan 007: Add behavioral tests for the auth/OTP trust boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- packages/devframe/src/node/auth/state.ts packages/devframe/src/utils/crypto-token.ts`
> If either source file changed since this plan was written, compare against the
> "Current state" excerpts before writing tests; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (adds tests only)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`exchangeTempAuthCode` / `verifyAuthToken` (`node/auth/state.ts`) hold every
security invariant of the OTP trust flow: TTL expiry, constant-time compare, a
5-attempt lockout that rotates the code, token minting, and code rotation on
success. There are **zero tests** exercising them, and the real handler that
calls them lives in external host adapters, so there is no integration net
either. A regression that breaks the constant-time compare, drops the attempt
cap, forgets to rotate a redeemed code, or mishandles TTL would ship silently and
downgrade the OTP from "hardened against brute force" to guessable. These are
pure, dependency-light functions — cheap to lock down.

## Current state

`packages/devframe/src/node/auth/state.ts` (module-level singletons for the
code + counters):

- `getTempAuthCode()` → current 6-digit code.
- `refreshTempAuthCode()` → rotates code, resets expiry (`TEMP_AUTH_CODE_TTL = 5*60_000`) and failed-attempt counter.
- `exchangeTempAuthCode(code, session, info, storage)` (`state.ts:92-129`):
  - expired → `refreshTempAuthCode()` + return `null` (`:99-102`);
  - wrong code → increment attempts; at `TEMP_AUTH_MAX_ATTEMPTS = 5` rotate; return `null` (`:104-110`);
  - correct → mint `randomToken()`, store in `storage.trusted[token]`, set `session.meta.isTrusted = true` + `clientAuthToken`, rotate code, return the token (`:112-128`).
- `verifyAuthToken(token, session, storage)` (`state.ts:67-78`) → `true` + marks
  session trusted when `storage.value().trusted[token]` exists; else `false`.

Storage shape (`node/hub-internals/context.ts:8-15`):
`InternalAnonymousAuthStorage = { trusted: Record<string, {...} | undefined> }`,
built with `createStorage({ initialValue: { trusted: {} } })`. For tests you can
use the underlying `createSharedState({ initialValue: { trusted: {} } })` from
`devframe/utils/shared-state` — it exposes `.value()` and `.mutate()`, which is
all `state.ts` uses.

`packages/devframe/src/utils/crypto-token.ts`: `randomToken(byteLength=16)` (hex),
`randomDigits(length)` (decimal, rejection-sampled), `timingSafeEqual(a,b)`
(length-short-circuit then XOR-accumulate).

Node test convention: co-located under `__tests__/` (see
`packages/devframe/src/node/__tests__/`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run packages/devframe/src/node/auth` | all pass |
| Typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (create):
- `packages/devframe/src/node/auth/__tests__/state.test.ts`

**Out of scope**: do NOT modify `state.ts` or `crypto-token.ts` — this plan only
adds tests. If a test reveals an actual bug, STOP and report it (it becomes its
own fix plan) rather than editing source here.

## Git workflow

- Branch: `advisor/007-auth-otp-tests`.
- Commit style: `test(auth): cover OTP exchange, lockout, rotation, and token verification`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the test file

`packages/devframe/src/node/auth/__tests__/state.test.ts`. Reset the module
singleton before each test with `refreshTempAuthCode()`. Build a fake session and
a real shared-state storage:

```ts
import { createSharedState } from 'devframe/utils/shared-state'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomDigits, randomToken, timingSafeEqual } from 'devframe/utils/crypto-token'
import {
  exchangeTempAuthCode,
  getTempAuthCode,
  refreshTempAuthCode,
  verifyAuthToken,
} from '../state'

function makeStorage() {
  return createSharedState({ initialValue: { trusted: {} as Record<string, any> } }) as any
}
function makeSession() {
  return { meta: {} } as any
}
const INFO = { ua: 'test-ua', origin: 'http://localhost' }

beforeEach(() => {
  refreshTempAuthCode()
})
```

### Step 2: Cover the exchange happy path + rotation

```ts
it('exchanges a valid code for a token, trusts the session, and rotates the code', () => {
  const storage = makeStorage()
  const session = makeSession()
  const code = getTempAuthCode()
  const token = exchangeTempAuthCode(code, session, INFO, storage)
  expect(token).toBeTruthy()
  expect(session.meta.isTrusted).toBe(true)
  expect(session.meta.clientAuthToken).toBe(token)
  expect(storage.value().trusted[token!]).toMatchObject({ authToken: token, origin: INFO.origin })
  // Code is rotated so it can't be replayed.
  expect(getTempAuthCode()).not.toBe(code)
  // The now-stale code no longer works.
  expect(exchangeTempAuthCode(code, makeSession(), INFO, storage)).toBeNull()
})
```

### Step 3: Cover the lockout (5 wrong attempts → rotate)

```ts
it('rotates the code after 5 failed attempts', () => {
  const storage = makeStorage()
  const code = getTempAuthCode()
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i++)
    expect(exchangeTempAuthCode(wrong, makeSession(), INFO, storage)).toBeNull()
  // Code rotated by the lockout — the original valid code is now dead.
  expect(getTempAuthCode()).not.toBe(code)
  expect(exchangeTempAuthCode(code, makeSession(), INFO, storage)).toBeNull()
})
```

### Step 4: Cover TTL expiry (fake timers)

```ts
it('rejects and rotates an expired code', () => {
  vi.useFakeTimers()
  try {
    refreshTempAuthCode()
    const code = getTempAuthCode()
    vi.advanceTimersByTime(5 * 60_000 + 1) // past TEMP_AUTH_CODE_TTL
    expect(exchangeTempAuthCode(code, makeSession(), makeStorage(), )).toBeNull
  }
  finally {
    vi.useRealTimers()
  }
})
```

Note: match the real signature `exchangeTempAuthCode(code, session, info, storage)`
— fix the argument order/values while writing (the snippet above is a sketch).
Assert it returns `null` and that `getTempAuthCode()` changed.

### Step 5: Cover `verifyAuthToken`

```ts
it('verifies a known token and rejects an unknown one', () => {
  const storage = makeStorage()
  const token = exchangeTempAuthCode(getTempAuthCode(), makeSession(), INFO, storage)!
  const session = makeSession()
  expect(verifyAuthToken(token, session, storage)).toBe(true)
  expect(session.meta.isTrusted).toBe(true)
  expect(verifyAuthToken('not-a-real-token', makeSession(), storage)).toBe(false)
})
```

### Step 6: Unit-test the crypto primitives

```ts
describe('crypto-token', () => {
  it('timingSafeEqual: equal for identical, false for different length/content', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
  it('randomDigits returns the requested length of decimal digits', () => {
    const d = randomDigits(6)
    expect(d).toHaveLength(6)
    expect(d).toMatch(/^\d{6}$/)
  })
  it('randomToken returns hex of the expected length', () => {
    expect(randomToken(16)).toMatch(/^[0-9a-f]{32}$/)
  })
})
```

**Verify**: `pnpm exec vitest run packages/devframe/src/node/auth` → all pass.

## Test plan

New `state.test.ts` covering: valid exchange (token minted, session trusted,
stored, code rotated, replay rejected); 5-attempt lockout rotates the code; TTL
expiry rejects+rotates; `verifyAuthToken` known vs unknown; and crypto-token
primitives. All from pure function calls + a real in-memory shared state.

## Done criteria

- [ ] `packages/devframe/src/node/auth/__tests__/state.test.ts` exists.
- [ ] Cases cover: happy-path exchange + rotation + replay-rejection, lockout, TTL expiry, token verify (known/unknown), and the 3 crypto-token functions.
- [ ] `pnpm exec vitest run packages/devframe/src/node/auth` passes.
- [ ] `pnpm --filter devframe typecheck` + `pnpm lint` exit 0.
- [ ] No source files modified — only the new test file (`git status`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- A test fails because the code's behavior differs from "Current state" (e.g.
  the lockout doesn't rotate, or the code isn't rotated after success) — that's a
  real bug; report it as a finding, don't paper over it by weakening the test.
- The module singleton makes tests order-dependent even with `refreshTempAuthCode()`
  in `beforeEach` — report; the fix may be to expose a reset or de-singletonize
  (out of scope here).

## Maintenance notes

- These tests pin the *node-side primitives*. The end-to-end handshake still
  lives in host adapters; a future in-repo handler (see plan 032) should get an
  integration test on top of these.
- Reviewer: confirm each assertion checks real behavior (a token was minted and
  stored, the code actually rotated), not just "not null".
