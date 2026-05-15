---
outline: deep
---

# Structured Diagnostics

`ctx.diagnostics` is a thin layer over [`nostics`](https://www.npmjs.com/package/nostics) that lets integrations register coded errors and warnings into a shared lookup without depending on `nostics` directly. Use it for author-defined coded diagnostics — errors, warnings, deprecations — with a stable code, a documentation URL, and a structured payload. For free-form runtime output that should appear in the DevTools UI, use [`ctx.messages`](https://devtools.vite.dev/kit/messages).

| Surface | Purpose | Example |
|---------|---------|---------|
| `ctx.diagnostics` | Coded errors and warnings emitted from node-side plugin code | `MYP0001: Plugin foo not configured` |
| [`ctx.messages`](https://devtools.vite.dev/kit/messages) | Free-form, user-facing notifications shown in the Messages panel | `'Audit complete — 3 issues found'` |

## Shape

```ts
interface DevToolsDiagnosticsHost {
  /** Proxy-backed lookup over every registered code. */
  readonly logger: Record<string, DiagnosticHandle>

  /** Register additional diagnostic definitions. */
  register: (definitions: Record<string, unknown>) => void

  /** Build a typed diagnostics object with the host's ANSI reporter pre-wired. */
  defineDiagnostics: typeof defineDiagnostics
}
```

The host ships pre-seeded with devframe's own `DF*` codes, plus the host package's codes (`DTK*` for `@vitejs/devtools`, etc.). Call `register()` to add your own.

## Register your own codes

```ts
export function MyPlugin(): PluginWithDevTools {
  return {
    name: 'my-plugin',
    devtools: {
      setup(ctx) {
        const myDiagnostics = ctx.diagnostics.defineDiagnostics({
          docsBase: 'https://example.com/errors',
          codes: {
            MYP0001: {
              why: (p: { name: string }) => `Plugin "${p.name}" is not configured`,
              fix: 'Add the plugin to your `vite.config.ts` and pass an options object.',
            },
            MYP0002: {
              why: 'Cache directory missing — running cold.',
            },
          },
        })

        ctx.diagnostics.register(myDiagnostics)

        // Emit through the host's shared reporter:
        myDiagnostics.MYP0002.report()
      },
    },
  }
}
```

## Code conventions

Codes are 4-letter prefix + 4-digit number (e.g. `MYP0001`). Pick a prefix specific to your plugin or tool — short enough to type, distinctive enough to avoid collisions with other integrations.

Prefixes already in use in this monorepo:

| Prefix | Owner |
|--------|-------|
| `DF` | `devframe` |
| `DTK` | `@vitejs/devtools` (Vite-specific) |
| `RDDT` | `@vitejs/devtools-rolldown` |
| `VDT` | `@vitejs/devtools-vite` (reserved) |

Each definition supports a `why` (string or function — the message) and an optional `fix` (string or function — the suggested resolution). The `docsBase` on `defineDiagnostics({...})` auto-attaches the URL to every emitted diagnostic. See [`nostics`](https://www.npmjs.com/package/nostics) for the full schema.

## Emit a diagnostic

Each registered code becomes a `DiagnosticHandle` on the typed result of `defineDiagnostics()` (and through the shared `ctx.diagnostics.logger` lookup). Handles expose `.report()` and `.throw()`.

```ts
// Throw — control flow stops here
throw myDiagnostics.MYP0001.throw({ name: 'foo' })

// Report without throwing (default console method: `warn`)
myDiagnostics.MYP0002.report()

// Override the console method per call
myDiagnostics.MYP0002.report({}, { method: 'error' })

// Attach a `cause` — merged into the params object
myDiagnostics.MYP0001.throw({ name: 'foo', cause: error })
```

`.throw()` is typed `never`, so TypeScript treats the line after as unreachable. Prefix the call with `throw` for control-flow narrowing:

```ts
throw myDiagnostics.MYP0001.throw({ name })
```

## Typed handle reference

`ctx.diagnostics.logger` is loosely typed — it covers an unbounded set of registered codes, beyond what TypeScript can narrow. For autocompletion on your plugin's specific codes, keep the typed result of `defineDiagnostics()`:

```ts
const myDiagnostics = ctx.diagnostics.defineDiagnostics({
  docsBase: 'https://example.com/errors',
  codes: {
    MYP0001: { why: (p: { name: string }) => `…${p.name}` },
  },
})

// Register so the shared lookup can also see it
ctx.diagnostics.register(myDiagnostics)

// Use the typed handle directly for autocompletion
myDiagnostics.MYP0001.report({ name: 'foo' })
```

The host's `defineDiagnostics()` pre-wires its ANSI console reporter, so both the typed handle and the shared lookup produce the same output.

## Document your codes

Pair each code with a documentation page. devframe and the published Vite DevTools packages follow this layout:

```
docs/errors/
  index.md            # Table of all codes
  MYP0001.md          # One page per code
  MYP0002.md
```

Each page covers the message, cause, example, and fix — see any [DF code page](https://devfra.me/errors/) for the canonical template. Setting `docsBase` on `defineDiagnostics({...})` auto-attaches the URL to every emitted diagnostic.

## When to use what

- **`ctx.diagnostics`** — coded conditions worth looking up: misconfiguration, deprecations, validation failures, internal invariants. Always docs-backed. Often `.throw()`.
- **`ctx.messages`** — user-facing activity surfaces in the DevTools UI: progress indicators, audit results, "URL copied" toasts. Just a message and a level.

Diagnostics target tool authors and CI; messages target the human in front of the DevTools panel.
