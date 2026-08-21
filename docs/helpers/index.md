---
outline: deep
---

# Helpers

Helpers are the optional surface around `defineDevframe`: prebuilt RPC recipes and low-level utilities from the `devframe` package.

| Helper | Entry | What it does |
|--------|-------|--------------|
| [Utilities](./utilities) | `devframe/utils/*` | Colors, hashing, editor launch, structured-clone, etc. |
| [Common RPC Functions](./common-rpc-functions) | `devframe/recipes/common-rpc-functions` | "Open in editor" and "reveal in Finder" actions. |
| [Interactive Auth](./interactive-auth) | `devframe/recipes/interactive-auth` | OTP auth layer: handshake, resolver gate, connect-time trust, banner. |

Unlike [adapters](/adapters/), which deploy a `DevframeDefinition` as a runnable surface (CLI, dev server, build, MCP), a helper is a recipe or utility composed with one.

To integrate a devframe or hub with a meta-framework, see the [`@devframes/*` packages](/frameworks/).
