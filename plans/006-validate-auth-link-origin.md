# Plan 006: Validate request-derived origins before printing authentication links

> **Executor instructions**: Follow this plan step by step. Preserve proxy/host-framework use cases only through explicit trusted configuration; never fall back to accepting an arbitrary request authority. Stop on any listed condition. Update `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- packages/devframe/src/node/instance-shell.ts packages/devframe/src/adapters/initiate.ts packages/devframe/src/adapters/__tests__/initiate.test.ts packages/devframe/src/adapters/__tests__/dev.test.ts docs/content/1.guide/14.security.md docs/content/2.adapters/1.initiate.md`
> If an in-scope file changed, compare origin capture and banner timing with the excerpts below; stop on a mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

For handler-owned hosts without an explicit public origin, the first request permanently determines the origin used in the terminal's OTP magic link. Node middleware builds that value directly from `Host`; fetch handlers trust the absolute request URL. An unauthenticated first request can redirect the credential-bearing link to another origin.

## Current state

- `packages/devframe/src/node/instance-shell.ts` owns late origin discovery and banner timing.
- `packages/devframe/src/adapters/__tests__/initiate.test.ts` exercises handler/middleware instances.
- `packages/devframe/src/adapters/__tests__/dev.test.ts` exercises owned listeners and wildcard binds.
- `docs/content/1.guide/14.security.md` documents the OTP fragment and trust model.

Current origin capture:

```ts
// instance-shell.ts:430-433
function noteOrigin(origin: string): void {
  derivedOrigin ??= origin
  maybePrintBanner()
  maybeRegister()
}

// instance-shell.ts:670-674
const host = req.headers.host
if (host)
  noteOrigin(`${encrypted ? 'https' : 'http'}://${host}`)
```

`handleRequest()` similarly calls `noteOrigin(new URL(request.url).origin)` at lines 640-643. `interactive-auth.ts:79-90` puts this origin into the OTP URL.

## Target trust rule

- Explicit `options.origin` remains authoritative.
- An owned listener derives its advertised origin from the bound address/port, not an inbound Host header.
- A handler/middleware may adopt a request-derived origin only when its parsed hostname passes `isLoopbackHostname`, or when its canonical origin exactly equals an entry in the existing `allowedOrigins` array.
- If `allowedOrigins` is `false` or a dynamic `WsOriginRegistry`, request-derived origin adoption is disabled; non-loopback deployments in those modes must provide explicit `origin`. Do not honor forwarded headers.
- A rejected candidate must not print a banner, register a poisoned origin, or prevent a later valid candidate from being adopted.

Reuse `isLoopbackHostname` from `devframe/rpc/transports/ws-server`; do not reuse `isAllowedOrigin`, because it accepts an origin-shaped string before this plan's stricter canonical-origin validation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Adapter tests | `pnpm exec vitest run packages/devframe/src/adapters/__tests__/initiate.test.ts packages/devframe/src/adapters/__tests__/dev.test.ts` | all tests pass |
| Core typecheck | `pnpm --filter devframe typecheck` | exit 0 |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/node/instance-shell.ts`
- `packages/devframe/src/adapters/initiate.ts`
- `packages/devframe/src/adapters/__tests__/initiate.test.ts`
- `packages/devframe/src/adapters/__tests__/dev.test.ts`
- `docs/content/1.guide/14.security.md`
- `docs/content/2.adapters/1.initiate.md`

**Out of scope**:

- General reverse-proxy support or automatic trust of `Forwarded`/`X-Forwarded-*`.
- Changes to OTP entropy, TTL, token persistence, or per-handler OTP state.
- Vite `allowedHosts` examples (finding 16 was not selected).
- Changes to WebSocket origin authorization semantics.

## Git workflow

- Branch if needed: `fix/auth-link-origin`.
- Commit style: `fix(devframe): validate authentication link origins`.
- Do not push/open a PR unless instructed.

## Steps

### Step 1: Separate candidate validation from origin adoption

Replace unconditional `noteOrigin` with a function that canonicalizes a candidate URL and checks it against the trusted rule above. Reject credentials, paths, query strings, fragments, malformed ports, and non-HTTP(S) schemes. Compare canonical origins exactly.

Keep the first-valid-origin behavior, not first-request behavior. Invalid candidates must be ignored without setting `derivedOrigin`.

Ignore invalid candidates silently to avoid a request-amplified warning. Do not add a diagnostic in this plan.

**Verify**: `pnpm --filter devframe typecheck` -> exit 0.

### Step 2: Route both request adapters through validation

Apply the same candidate validation to web `Request` and Node middleware paths. For owned listeners, preserve current `localhost:<bound-port>` behavior independently of request headers. Ensure an explicit `origin` bypasses derivation because it was supplied by the host framework.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/__tests__/dev.test.ts` -> all tests pass.

### Step 3: Add first-request poisoning regression tests

In `initiate.test.ts`, construct an instance with a banner spy and no explicit origin. Cover:

- a first request with an untrusted authority does not print/adopt/register it;
- a later loopback request becomes the origin and prints exactly one link;
- an exactly allow-listed non-loopback origin is accepted;
- an origin that only prefix/suffix-matches an allow-listed value is rejected;
- explicit `origin` wins regardless of inbound Host;
- protocol and port are canonicalized consistently.

Assert only the URL origin and fragment parameter presence; never snapshot a live credential value.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/__tests__/initiate.test.ts` -> all tests pass.

### Step 4: Correct the public guidance

Document that non-loopback handler deployments set `origin` explicitly and that request-derived origins are accepted only through the loopback/exact allow-list policy. Follow repository terminology and positive framing.

**Verify**: `pnpm test` -> build, tests, and API snapshots pass.

## Done criteria

- [ ] No raw Host/request URL can become an OTP-link origin without validation.
- [ ] Invalid first requests do not lock out a later valid origin.
- [ ] Explicit origin and owned-listener behavior still work.
- [ ] Regression tests cover hostile-first/valid-second ordering and exact allow-list matching.
- [ ] Targeted tests, typecheck, and full verification pass.
- [ ] Only in-scope files, any required diagnostic page, and `plans/README.md` changed.

## STOP conditions

- A host framework requires arbitrary request-derived non-loopback origins without any explicit trusted configuration.
- Canonical origin validation would need DNS resolution in the request path.
- The change begins trusting forwarded headers implicitly.
- Existing API snapshots show an unrelated public change.

## Maintenance notes

The terminal magic link is a credential-delivery mechanism, so its destination must always come from trusted configuration or a strict local policy. Review future registry-origin and absolute-dock URL derivation against the same rule.
