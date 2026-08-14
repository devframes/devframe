---
outline: deep
---

# Helpers

Helpers are the optional, opt-in surface around the core `defineDevframe` API: prebuilt RPC recipes and a curated set of low-level utilities, all served from the `devframe` package itself. None of them are required to ship a devframe — reach for them when they match the shape of what you're building.

| Helper | Entry | What it does |
|--------|-------|--------------|
| [Utilities](./utilities) | `devframe/utils/*` | Bundled small utilities — terminal colors, hashing, editor launch, structured-clone serialization, and more. |
| [Common RPC Functions](./common-rpc-functions) | `devframe/recipes/common-rpc-functions` | Prebuilt RPC actions for "open in editor" and "reveal in Finder". |
| [Interactive Auth](./interactive-auth) | `devframe/recipes/interactive-auth` | Ready-made OTP auth layer — handshake, resolver gate, connect-time trust, and the code/link banner. |

Helpers vs. [adapters](/adapters/): an adapter takes a `DevframeDefinition` and deploys it as a runnable surface (CLI, dev server, static build, MCP server). A helper is a smaller piece — a recipe or a utility function — that you compose alongside an adapter.

For integrating a devframe (or a whole hub) with a specific meta-framework's dev server, see the dedicated [`@devframes/*` framework packages](/frameworks/) instead.
