# 02 - Terminology

The docs' canonical vocabulary lives in [`docs/content/8.references/1.terms.md`](../docs/content/8.references/1.terms.md) - one name per concept. Every docs, README, and comment edit MUST follow it.

- Bare `client`, `host`, `server`, `agent`, `plugin`, `embedded`, or `standalone` MUST NOT appear in prose. Use a fixed compound from the terms page or a code-formatted API/package name. One exception: the directional `client → server` arrows in the RPC/events reference tables.
- The tool is **"a devframe"** - never "integration", "frame", or "app". The ready-to-run `@devframes/plugin-*` packages are **built-in devframes**: devframe has no plugin concept; the `plugin-` npm prefix only sets those packages apart from core packages. "Vite plugin" stays for the bundler mechanism, and RPC ids keep the literal `devframes:plugin:<slug>:` namespace because it mirrors the package names on the wire.
- **host framework** is the environment a devframe or hub mounts into (a Vite dev server, a Next.js app, a Hono server); named forms like "the Vite host" are fine. **host page** is the browser document where the client runtime boots; **user app** is the application being developed and inspected.
- A devframe's two halves are the **node side** and the **browser side**.
- Browser-side terms: **client runtime** (`createDevframeClientRuntime()`), **client context**, **client script**, **page script** (a devframe's script in the user app's page - never "agent"; **coding agent** is the only agent), **RPC client** (`connectDevframe()`), **SPA**, **panel** (a devframe's SPA as a rendered surface), **surface** (any rendered browser view - say "API", not "API surface").
- Hub terms: **hub UI provider** (a hub UI implementation - never "shell" or bare "viewer"; "external viewer" stays for cross-origin surfaces in the security docs), **dock entry** / **dock rail** / **dock panel**, **mounted devframe** (never "frame").
- The three communication paths: **RPC** (browser side ↔ node side), the **client context** (client scripts ↔ client runtime), and the **in-page channel** (page script ↔ panel, same-origin in-browser).
- Storage scopes: **workspace scope** (committable, per-repo), **project scope** (per-checkout), **global scope** (per-user). The project scope MUST NOT be described as "per-workspace".
- **framework kits** are `@devframes/vite` / `@devframes/nuxt` / `@devframes/next`; refer to external products by their full names (`@vitejs/devtools-kit`, `@nuxt/devtools`).
- Qualify the rest: embedded/standalone only as attached adjectives (embedded adapter, standalone SPA), sessions (terminal / MCP / trust session), entries (dock entry / entry point / browser entry), bridges (RPC bridge).
