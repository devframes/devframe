# Plan 002: Require authentication on route-based MCP

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report it instead of weakening authorization. Update this plan's row in `plans/README.md` when complete unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 2d978f84..HEAD -- packages/devframe/src/adapters packages/devframe/src/types/devframe.ts packages/devframe/src/cli packages/devframe/src/node/diagnostics.ts packages/hub/src/node packages/next/src packages/next/test packages/vite/test/single.test.ts tests/optional-mcp-bundles.test.ts examples/files-inspector/src/devframe.ts examples/hub-next docs/content/1.guide/14.security.md docs/content/1.guide/18.hub-initiate.md docs/content/2.adapters/7.mcp.md docs/content/3.frameworks/1.vite.md docs/content/3.frameworks/3.next.md docs/content/6.errors tests/__snapshots__/tsnapi`
> Stop if MCP transport or route option interfaces have materially changed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-pin-github-actions.md`
- **Category**: security
- **Planned at**: commit `2d978f84`, 2026-09-01

## Why this matters

The MCP HTTP route currently treats a caller-provided `Origin` as authorization. `Origin` is useful for browser DNS-rebinding and cross-site request protection, but native clients can supply any value. A reachable route can therefore invoke privileged agent tools without proving identity; `@devframes/next/hub` enables this route by default.

## Current state

- `packages/devframe/src/adapters/mcp/fetch.ts` is the web-standard HTTP boundary.
- `packages/devframe/src/adapters/mcp/http.ts` mounts that boundary into h3.
- `packages/devframe/src/adapters/initiate.ts`, `packages/hub/src/node/initiate.ts`, and `packages/next/src/host.ts` mount route-based MCP.
- `packages/devframe/src/types/devframe.ts:94-113` defines `McpRouteOptions` with only `path` and `allowedOrigins`.
- `packages/devframe/src/cli/connect.ts:246-272` creates native MCP transports with only an `Origin` header.
- `packages/devframe/src/cli/main.ts:13-24` constructs the native gateway.

The vulnerable boundary is:

```ts
// packages/devframe/src/adapters/mcp/fetch.ts:75-85
const origin = req.headers.get('origin') ?? undefined
if (allowedOrigins !== false && (origin === undefined || !isAllowedOrigin(origin, allowedOrigins ?? [])))
  return new Response('Forbidden: origin required', { status: 403 })
return handler.fetch(req)
```

Tool invocation occurs at `packages/devframe/src/adapters/mcp/build-server.ts:287-305`. Keep the origin check as a separate defense; do not replace it with authentication. Node-side failures use coded diagnostics, and public API changes require fresh `tsnapi` snapshots after a build.

## Target authorization contract

Implement this exact, independent MCP authorization model:

- Add `McpRouteOptions.authorization` with three accepted values: a non-empty bearer token string, a callback `(request: Request) => boolean | Promise<boolean>`, or explicit `false` for an origin-only local opt-out.
- `mcp: true` reads its bearer from `DEVFRAME_MCP_AUTH_TOKEN`. Missing/empty configuration fails startup with a new coded diagnostic instead of mounting a route.
- An object MCP config must include `authorization`; omission fails with the same diagnostic.
- The origin gate runs first and authorization second. Missing/invalid bearer credentials return `401` plus `WWW-Authenticate: Bearer`; disallowed origins remain `403`.
- Compare configured token strings in constant time. A callback cannot disable origin checking.
- `devframe connect` reads `DEVFRAME_MCP_AUTH_TOKEN` by default. `ConnectServerOptions.authToken` accepts either one token string or `(record: DevframeInstanceRecord) => string | undefined` for callers connecting to instances with distinct credentials.
- `@devframes/next/hub` changes its omitted MCP default from enabled to disabled. Callers opt in with an explicit authorization policy.
- Never place an MCP token in URLs, connection metadata, instance registry records, logs, diagnostics, tool payloads, or command-line arguments.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| MCP tests | `pnpm exec vitest run packages/devframe/src/adapters/mcp/__tests__/mcp-http.test.ts packages/devframe/src/adapters/__tests__/initiate.test.ts` | all tests pass |
| Host tests | `pnpm exec vitest run packages/hub/src/node/__tests__/initiate.test.ts packages/next/test/handler.test.ts` | all tests pass |
| Compatibility tests | `pnpm exec vitest run packages/devframe/src/adapters/__tests__/dev.test.ts packages/vite/test/single.test.ts tests/optional-mcp-bundles.test.ts examples/hub-next/tests/next-devframe-hub.test.ts` | all tests pass |
| Typechecks | `pnpm --filter devframe typecheck && pnpm --filter @devframes/hub typecheck && pnpm --filter @devframes/next typecheck` | exit 0 |
| API snapshots | `pnpm build && pnpm exec vitest run tests/exports.test.ts -u` | only intended public snapshots change |
| Full verification | `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build` | every command exits 0 |

## Scope

**In scope**:

- `packages/devframe/src/adapters/mcp/fetch.ts`
- `packages/devframe/src/adapters/mcp/http.ts`
- `packages/devframe/src/adapters/mcp/__tests__/mcp-http.test.ts`
- `packages/devframe/src/adapters/_shared.ts`
- `packages/devframe/src/adapters/cac.ts`
- `packages/devframe/src/adapters/initiate.ts`
- `packages/devframe/src/adapters/__tests__/initiate.test.ts`
- `packages/devframe/src/adapters/__tests__/dev.test.ts`
- `packages/devframe/src/types/devframe.ts`
- `packages/devframe/src/cli/connect.ts`
- `packages/devframe/src/cli/main.ts`
- New `packages/devframe/src/cli/connect.test.ts`
- `packages/devframe/src/node/diagnostics.ts`
- One new `docs/content/6.errors/DFxxxx.md` for missing MCP authorization
- `packages/hub/src/node/initiate.ts`
- `packages/hub/src/node/__tests__/initiate.test.ts`
- `packages/next/src/host.ts`
- `packages/next/src/hub.ts`
- `packages/next/test/handler.test.ts`
- `packages/vite/test/single.test.ts`
- `tests/optional-mcp-bundles.test.ts`
- `examples/files-inspector/src/devframe.ts`
- `examples/hub-next/src/client/devframe/next-devframe-hub.ts`
- `examples/hub-next/tests/next-devframe-hub.test.ts`
- `tests/__snapshots__/tsnapi/devframe/types.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/devframe/adapters/mcp.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/devframe/adapters/dev.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/devframe/initiate.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/devframe/index.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/devframe/internal.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/@devframes/hub/initiate.snapshot.d.ts`
- `tests/__snapshots__/tsnapi/@devframes/next/hub.snapshot.d.ts`
- `docs/content/1.guide/14.security.md`
- `docs/content/1.guide/18.hub-initiate.md`
- `docs/content/2.adapters/7.mcp.md`
- `docs/content/3.frameworks/1.vite.md`
- `docs/content/3.frameworks/3.next.md`

**Out of scope**:

- RPC/browser authentication and remote-dock tokens.
- Shared-state filtering; Plan 003 owns it.
- MCP tool argument validation and safety annotations.
- Stdio MCP's local transport.
- Compatibility code that silently preserves unauthenticated HTTP behavior.

## Git workflow

- Use the assigned worktree; branch if needed: `fix/authenticate-mcp-http`.
- Commit style: `fix(devframe): authenticate HTTP MCP requests`.
- Do not push/open a PR unless instructed by the operator.

## Steps

### Step 1: Add the MCP authorization policy

Add `authorization` to `McpRouteOptions` and matching MCP handler options. Implement one internal authorization function in `fetch.ts`: parse exactly one `Authorization: Bearer <token>` credential for string policies, compare it with the configured value using the existing crypto-token utility, invoke callback policies, and bypass identity only for explicit `false`. Reject malformed, empty, or multiple credentials without logging them.

Define `mcp: true` as shorthand for `authorization: process.env.DEVFRAME_MCP_AUTH_TOKEN`. Add the next sequential `DF` diagnostic and required error page when the shorthand has no token or an object omits authorization.

**Verify**: `pnpm --filter devframe typecheck` -> exit 0.

### Step 2: Enforce both HTTP gates

In `createMcpFetchHandler.handle`, retain origin validation, then authorize before calling `handler.fetch(req)`. Add tests for allowed Origin with no/wrong/correct bearer, disallowed Origin with correct bearer, callback allow/deny, and explicit `authorization: false`.

Use generic response bodies. No response may reveal whether a supplied token was close to correct.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/mcp/__tests__/mcp-http.test.ts` -> all tests pass.

### Step 3: Wire every route and disable the Next default

Propagate the MCP authorization policy through `initDevframe`, `initHub`, and the Next host. The behavior matrix is:

| MCP setting | HTTP behavior |
|---|---|
| omitted/`false` | route absent |
| `true` + non-empty environment token | requires that bearer |
| `true` + missing token | coded startup failure; route absent |
| object + token | requires that bearer |
| object + callback | delegates identity to callback |
| object + `authorization: false` | explicit origin-only opt-out |

Change `createNextDevframeHub` from `mcp: options.mcp ?? true` to the secure disabled default. Update existing hub/Next tests that currently expect Origin-only success.

**Verify**: `pnpm exec vitest run packages/devframe/src/adapters/__tests__/initiate.test.ts packages/hub/src/node/__tests__/initiate.test.ts packages/next/test/handler.test.ts` -> all tests pass.

### Step 4: Preserve the native gateway through explicit credentials

Add `ConnectServerOptions.authToken?: string | ((record: DevframeInstanceRecord) => string | undefined)`. `main.ts` passes `process.env.DEVFRAME_MCP_AUTH_TOKEN`; do not add a CLI flag because command-line secrets are process-visible. Resolve the token for each record and pass it into `withInstanceClient`, which sets the Authorization header. An unauthorized instance reports auth-required and never retries without authentication.

Add focused tests with fake SDK transports or the smallest extracted header helper. Prove the token is in request headers but absent from indexed results and formatted errors.

**Verify**: `pnpm exec vitest run packages/devframe/src/cli/connect.test.ts` -> all tests pass.

### Step 5: Update docs and API snapshots

Update the scoped docs to distinguish origin validation from identity, explain `DEVFRAME_MCP_AUTH_TOKEN`, document callback/explicit-false policies, and state that the Next hub no longer enables MCP by default. Update runnable examples: use an explicit environment-backed authorization policy where they demonstrate MCP; use explicit `authorization: false` only in test fixtures that are provably loopback-bound. Follow repository terminology: use “node side”, “RPC client”, and “host framework”; avoid bare “client”, “server”, and “host” in prose.

Run `pnpm build && pnpm exec vitest run tests/exports.test.ts -u`, inspect the diff, and keep only listed snapshots whose public types actually changed.

**Verify**: `pnpm test` -> build, tests, and API snapshots pass.

## Test plan

- Allowed Origin + no/invalid bearer -> 401.
- Disallowed Origin + valid bearer -> 403.
- Valid configured bearer -> initialize/list/call succeeds.
- Callback policy allow/deny -> success/401.
- Explicit `authorization: false` + allowed Origin -> succeeds.
- `mcp: true` without environment token -> coded startup failure.
- Next hub omitted default -> no route.
- Native gateway forwards the selected per-instance bearer and never serializes it.

## Done criteria

- [ ] No route reaches `handler.fetch(req)` without passing both applicable gates.
- [ ] Every route mount uses an explicit MCP authorization policy.
- [ ] `Origin` is documented and tested as request hardening, not identity.
- [ ] The Next hub defaults MCP to disabled.
- [ ] Credentials occur only in configuration and Authorization headers.
- [ ] Targeted tests, listed typechecks, API snapshots, and full verification pass.
- [ ] Only in-scope files and `plans/README.md` changed.

## STOP conditions

- A supported connector can be preserved only by publishing a bearer in metadata, URLs, registry data, logs, or command arguments.
- Route authorization cannot be wired without coupling it to browser/RPC token storage.
- A host framework bypasses `createMcpFetchHandler` and would remain unauthenticated.
- The token resolver would need to expose credentials through MCP tool arguments/results.
- API snapshot changes include unrelated exports.

## Maintenance notes

Every future HTTP transport must keep identity authorization separate from Origin/Host validation. Reviewers should trace all `mountMcpHttp` and `createMcpFetchHandler` call sites and verify credentials never enter diagnostics. Multi-instance callers should use the resolver form rather than sharing one token unless shared configuration is intentional.
