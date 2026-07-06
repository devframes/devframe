# Plan 017: Make `allowArbitraryCommands` authoritative for preset arg/env overrides

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 610a7b0..HEAD -- plugins/terminals/src/node/manager.ts`
> On any change since this plan was written, compare against the "Current state"
> excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — **⚠️ BREAKING** for clients that pass `args`/`env` to presets under a locked-down config
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `610a7b0`, 2026-07-06

## Why this matters

`allowArbitraryCommands: false` reads like a sandbox but isn't: for a **preset**
spawn, the manager takes `args: req.args ?? preset.args` and
`env: buildEnv({ ...preset.env, ...req.env })`, so a client can override a
preset's args on any interpreter-style command (`node -e …`, `sh -c …`) — arbitrary
execution — and inject env (`NODE_OPTIONS`, `BASH_ENV`, `LD_PRELOAD`) that
subverts even an output-only "readonly" preset. The flag only restricts the
command *name* on the `req.command` path, not preset overrides. Making the flag
govern preset overrides closes that hole.

## Current state

`plugins/terminals/src/node/manager.ts`:

- `:139` `this.allowArbitraryCommands = options.allowArbitraryCommands ?? false`
- preset branch of `resolveSpawn` (`:239-254`):
  ```ts
  if (req.presetId) {
    const preset = this.presets.find(p => p.id === req.presetId)
    if (!preset) throw diagnostics.DP_TERMINALS_0006({ id: req.presetId })
    return {
      command: preset.command,
      args: req.args ?? preset.args ?? [],                     // ← client override
      cwd: req.cwd ?? preset.cwd ?? this.defaultCwd,
      mode: req.mode ?? preset.mode ?? 'readonly',
      env: this.buildEnv({ ...preset.env, ...req.env }),       // ← client override
      title: req.title ?? preset.title,
      cols, rows, presetId: preset.id,
    }
  }
  ```
- command branch (`:256-269`): `allowArbitraryCommands` gates only the command name.
- `buildEnv(extra)` (`:219-233`) merges `process.env` + defaults + `options.env` + `extra`.

The terminals test suite is `plugins/terminals/test/terminals.test.ts`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Test | `pnpm exec vitest run plugins/terminals/test` | all pass incl. new case |
| Typecheck | `pnpm --filter @devframes/plugin-terminals typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope**:
- `plugins/terminals/src/node/manager.ts` (extract + apply an override policy)
- `plugins/terminals/test/preset-policy.test.ts` (create — pure unit test)

**Out of scope**: the default-shell path and the `req.command` path (a terminal's
purpose is command execution; gating those further is a separate product
decision — see STOP conditions). Do not change the streaming/PTY plumbing.

## Git workflow

- Branch: `advisor/017-terminals-preset-policy`.
- Commit style: `fix(plugin-terminals)!: ignore client preset arg/env overrides when arbitrary commands are disallowed`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extract a pure, testable policy helper

Add a module-level export in `manager.ts`:

```ts
/**
 * When arbitrary commands are disallowed, a preset runs exactly as defined —
 * clients cannot override its args/env (which would let a "readonly" preset be
 * turned into arbitrary execution). When allowed, client overrides apply.
 */
export function applyPresetOverridePolicy(
  preset: Pick<TerminalPreset, 'args' | 'env'>,
  req: Pick<SpawnRequest, 'args' | 'env'>,
  allowArbitraryCommands: boolean,
): { args: string[], env: Record<string, string> } {
  if (allowArbitraryCommands) {
    return { args: req.args ?? preset.args ?? [], env: { ...preset.env, ...req.env } }
  }
  return { args: preset.args ?? [], env: { ...preset.env } }
}
```

### Step 2: Use it in `resolveSpawn`

Replace the preset branch's `args`/`env` with the policy result:

```ts
if (req.presetId) {
  const preset = this.presets.find(p => p.id === req.presetId)
  if (!preset) throw diagnostics.DP_TERMINALS_0006({ id: req.presetId })
  const { args, env } = applyPresetOverridePolicy(preset, req, this.allowArbitraryCommands)
  return {
    command: preset.command,
    args,
    cwd: req.cwd ?? preset.cwd ?? this.defaultCwd,
    mode: req.mode ?? preset.mode ?? 'readonly',
    env: this.buildEnv(env),
    title: req.title ?? preset.title,
    cols, rows, presetId: preset.id,
  }
}
```

### Step 3: Test the policy

Create `plugins/terminals/test/preset-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyPresetOverridePolicy } from '../src/node/manager'

describe('applyPresetOverridePolicy', () => {
  const preset = { args: ['run', 'dev'], env: { A: '1' } }

  it('ignores client args/env overrides when arbitrary commands are disallowed', () => {
    const out = applyPresetOverridePolicy(preset, { args: ['-e', 'evil()'], env: { NODE_OPTIONS: '--x' } }, false)
    expect(out.args).toEqual(['run', 'dev'])
    expect(out.env).toEqual({ A: '1' })
  })

  it('applies client overrides when arbitrary commands are allowed', () => {
    const out = applyPresetOverridePolicy(preset, { args: ['-e', 'ok()'], env: { B: '2' } }, true)
    expect(out.args).toEqual(['-e', 'ok()'])
    expect(out.env).toEqual({ A: '1', B: '2' })
  })
})
```

**Verify**: `pnpm exec vitest run plugins/terminals/test` → all pass.

## Test plan

- New pure test: overrides ignored when disallowed, applied when allowed.
- Existing terminals tests keep passing (they don't rely on overriding preset
  args under a locked config — confirm).
- `pnpm --filter @devframes/plugin-terminals typecheck` + `pnpm lint` clean.

## Done criteria

- [ ] `applyPresetOverridePolicy` exported and used in the preset branch of `resolveSpawn`.
- [ ] With `allowArbitraryCommands: false`, a preset's args/env are not overridable by the client.
- [ ] New test passes; existing terminals tests pass.
- [ ] `pnpm --filter @devframes/plugin-terminals typecheck` + `pnpm lint` exit 0.
- [ ] Only the 2 in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- An existing test or example relies on passing `args`/`env` to a preset while
  `allowArbitraryCommands` is false — surface it; the breaking change needs a
  documented migration (set `allowArbitraryCommands: true` or define a dedicated
  preset).
- The maintainer needs to decide whether the **default-shell** path should also
  be restricted when `allowArbitraryCommands` is false (a raw interactive shell is
  itself arbitrary execution). This plan leaves it as-is; note the open question
  rather than changing shell behavior unilaterally.

## Maintenance notes

- Document precisely what `allowArbitraryCommands` guarantees: it governs the
  initial command name **and** whether clients may override preset args/env;
  terminal access itself must be trust-gated (plan 031) since a terminal is
  arbitrary execution by nature.
- Reviewer: confirm readonly presets can no longer be turned into arbitrary
  execution via `req.args`/`req.env` under a locked config.
