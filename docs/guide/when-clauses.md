---
outline: deep
---

# When Clauses

When clauses gate visibility and executability of docks, commands, and any UI surface, matching [VS Code's when-clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts) against a reactive context object.

The evaluator is the [`whenexpr`](https://github.com/antfu/whenexpr) package; devframe re-exports `evaluateWhen`, `resolveContextValue`, and `WhenExpression<Ctx, S>` from `devframe/utils/when`.

## Usage

### On commands

Gates palette visibility and shortcut triggering:

```ts
ctx.commands.register({
  id: 'my-devtool:embedded-only',
  title: 'Embedded-Only Action',
  when: 'clientType == embedded',
  handler: async () => { /* … */ },
})
```

### On dock entries

Gates dock-bar visibility:

```ts
ctx.docks.register({
  id: 'my-devtool:inspector',
  title: 'Inspector',
  type: 'action',
  icon: 'ph:cursor-duotone',
  when: 'clientType == embedded',
  action: { importFrom: 'my-devtool/inspector' },
})
```

### Render-only visibility on dock entries

A dock entry also takes `visibility`, a second expression that hides only its dock-bar button while leaving it registered and reachable via `docks.activate()`/`switchEntry()`, RPC, and raw entry-list walks; `when` remains its general relevance switch. The canonical case is a shared-frame anchor (`subTabs`) that stays registered to drive the postMessage nav loop while only its member tabs render.

```ts
ctx.docks.register({
  id: 'my-devtool:anchor',
  title: 'My Devtool',
  type: 'iframe',
  icon: 'ph:squares-four-duotone',
  url: '/__my-devtool/',
  subTabs: { protocol: 'postmessage' },
  visibility: 'false', // hide the anchor's own button; its tabs still render
})
```

## Expression syntax

### Operators

| Category | Operators | Example |
|----------|-----------|---------|
| Bare truthy | identifier | `dockOpen` |
| Literals | `true`, `false`, numbers, strings | `true`, `42`, `'dev'` |
| Unary | `!`, `-`, `+` | `!paletteOpen` |
| Logical | `&&`, `\|\|` | `dockOpen && !paletteOpen` |
| Equality | `==`, `!=`, `===`, `!==` | `clientType == embedded` |
| Relational | `<`, `<=`, `>`, `>=` | `count >= 10` |
| Arithmetic | `+`, `-`, `*`, `/`, `%` | `(a + b) * c` |
| Grouping | `( … )` | `(a \|\| b) && c` |

### Precedence (low → high)

`||` → `&&` → equality → relational → `+ -` → `* / %` → unary → primary.

### `==` vs `===`

- **`==` / `!=`** — VS Code idiom; right-hand side is a single token (identifier, quoted string, number, boolean), compared as strings.
- **`===` / `!==`** — JS strict equality; both sides full expressions, no coercion.

```ts
evaluateWhen('clientType == embedded', ctx) // string-style
evaluateWhen('count === 1', { count: 1 }) // true
evaluateWhen('count === 1', { count: '1' }) // false
```

### Examples

```ts
when: 'true' // always visible
when: 'false' // never visible
when: 'clientType == embedded' // only embedded
when: 'dockOpen && !paletteOpen' // dock open and palette closed
when: '(clientType == embedded && dockOpen) || clientType == standalone'
when: 'my-devtool.ready' // custom plugin context
```

## Built-in context variables

| Variable | Type | Description |
|----------|------|-------------|
| `clientType` | `'embedded' \| 'standalone'` | `embedded` when running inside the host app overlay, `standalone` in a separate window. |
| `dockOpen` | `boolean` | Whether the dock panel is currently open. |
| `paletteOpen` | `boolean` | Whether the command palette is currently open. |
| `dockSelectedId` | `string` | ID of the currently selected dock entry. Empty string `''` when none. |

## Namespaced context keys

Plugins add keys with `.` or `:` separators:

```ts
context['my-devtool.ready'] = true
context['my-devtool:step'] = 'build'
context.myDevtool = { ready: true, step: 'build' } // nested form
```

All three work in expressions:

```ts
when: 'my-devtool.ready'
when: 'my-devtool:step == build'
when: 'myDevtool.ready'
```

### Lookup order

Resolving `my-devtool.ready` tries an exact match (`ctx['my-devtool.ready']`), then the nested path (`ctx['my-devtool']?.ready`). Flat keys win when both exist.

## Type-safe `when` clauses

`defineCommand` and `defineDockEntry` validate `when:` against `WhenContext` at compile time:

```ts
import { defineCommand } from 'devframe'

defineCommand({
  id: 'my-devtool:toggle',
  title: 'Toggle',
  when: 'dockOpen && !paletteOpen', // ✓ ok
  handler: async () => {},
})

defineCommand({
  id: 'my-devtool:broken',
  title: 'Broken',
  when: 'dockOpen &&& !paletteOpen',
  //    ^^^^^^^^^^^^^^^^^^^^^^^^^^^ Type error: syntax error
  handler: async () => {},
})
```

### Key validation with plugin contexts

The default `WhenContext` leaves plugin keys open-ended (`[key: string]: unknown`), covering expression shape only. For key-name validation, declare a narrower context and a typed wrapper:

```ts
import type { WhenContext, WhenExpression } from 'devframe/utils/when'

interface MyPluginContext extends Omit<WhenContext, keyof any> {
  'clientType': 'embedded' | 'standalone'
  'dockOpen': boolean
  'paletteOpen': boolean
  'dockSelectedId': string
  'my-devtool.ready': boolean
}

function defineMyCommand<const W extends string>(cmd: {
  id: string
  title: string
  when?: WhenExpression<MyPluginContext, W>
  handler: (...args: any[]) => Promise<unknown>
}): typeof cmd {
  return cmd
}

defineMyCommand({
  id: 'my-devtool:toggle',
  title: 'Toggle',
  when: 'my-devtool.ready && dockOpen', // ✓ ok
  handler: async () => {},
})

defineMyCommand({
  id: 'my-devtool:broken',
  title: 'Broken',
  when: 'my-devtool.read', // ← typo
  //    ^^^^^^^^^^^^^^^^^^^ Type error: Unknown context key
  handler: async () => {},
})
```

## API reference

```ts
import type { WhenContext } from 'devframe/utils/when'
import { evaluateWhen, resolveContextValue } from 'devframe/utils/when'

const ctx: WhenContext = {
  'clientType': 'embedded',
  'dockOpen': true,
  'paletteOpen': false,
  'dockSelectedId': 'my-dock',
  'my-devtool.ready': true,
}

evaluateWhen('dockOpen && my-devtool.ready', ctx) // true
evaluateWhen('clientType == standalone', ctx) // false

resolveContextValue('my-devtool.ready', ctx) // true
```

### `evaluateWhen(expression, ctx, options?)`

Returns `boolean`. Pass `{ strict: true }` to throw on unknown keys.

### `resolveContextValue(key, ctx)`

Returns the current value of a single (possibly namespaced) key.

### `WhenExpression<Ctx, S>`

The branded expression type from `whenexpr`, for building typed `define*` helpers — see [Key validation with plugin contexts](#key-validation-with-plugin-contexts).
