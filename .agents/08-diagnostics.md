# 08 - Structured diagnostics (error codes)

All node-side warnings and errors use structured diagnostics via [`nostics`](https://www.npmjs.com/package/nostics). Node-side code MUST NOT use raw `console.warn`, `console.error`, or `throw new Error` with ad-hoc messages - always define a coded diagnostic. Browser-only code is out of scope and keeps using `console.*` / `throw`.

Import `defineDiagnostics` (and `Diagnostic` for `instanceof` checks) from `devframe/utils/nostics`, never from `nostics` directly - it pre-wires devframe's ANSI console reporter, so a plugin's `diagnostics.ts` never builds its own reporter (`colors`, `ansiFormatter`) or depends on `nostics` itself.

## Code ranges

Prefix: **`DF`**. Codes are sequential 4-digit numbers (e.g. `DF0033`) - check the existing diagnostics file for the next available number.

- `DF00xx–DF07xx` - `devframe` core (RPC, host, storage, streams, …)
- `DF80xx–DF89xx` - `@devframes/hub`:
  - `DF80xx` - hub context / lifecycle
  - `DF81xx` - docks
  - `DF82xx` - terminals
  - `DF83xx` - messages
  - `DF84xx` - commands
  - `DF85xx` - built-in RPC commands

## Adding a new error

1. **Define the code** in the appropriate `diagnostics.ts`:
   <!-- eslint-skip -->
   ```ts
   DF0033: {
     why: (p: { name: string }) => `Something went wrong with "${p.name}"`,
     fix: 'Optional resolution hint for the user.',
   },
   ```

2. **Use the diagnostics** at the call site:
   ```ts
   import { diagnostics } from './diagnostics'

   // For thrown errors - always prefix with `throw` for TypeScript control flow:
   throw diagnostics.DF0033({ id, reason })

   // For reported warnings/errors (not thrown). The default console method is `warn`;
   // override with the 2nd-arg reporter options when needed:
   diagnostics.DF0033({ id, reason }) // console.warn
   diagnostics.DF0033({ id, reason }, { method: 'error' }) // console.error
   diagnostics.DF0033({ id, reason, cause: error }, { method: 'warn' }) // attach cause
   ```

3. **Create a docs page** at `docs/content/6.errors/DF0033.md`:
   ```md
   ---
   title: 'DF0033: Short Title'
   description: 'Something went wrong with "{name}"'
   ---

   ## Message
   > Something went wrong with "`{name}`"

   ## Cause
   When and why this occurs.

   ## Example
   Code that triggers it.

   ## Fix
   How to resolve it.

   ## Source
   - [`src/node/filename.ts`](...) - `functionName()` throws this when …
   ```

   The `## Source` section lists each call site that emits the code, with a one-line role per entry. Don't list the `diagnostics.ts` definition - it's implied.
