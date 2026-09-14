# devframe maintainer guide

devframe packages one devtool integration - RPC, SPA, diagnostics, CLI/build/embedded outputs - and `@devframes/hub` orchestrates many of them for hub UI providers.
`.agents/` describes what the code does and why. It is a map, not a standard:
where the two disagree, the packages' `src/` and test suites win, and the docs get fixed.

## Rules that apply everywhere

- **MUST**, **MUST NOT**, **SHOULD** and **MAY** use RFC 2119 meanings. They mark
  real invariants - layer boundaries, wire contracts, output shapes - not house style.
- Prose MUST follow the canonical vocabulary in
  [`docs/content/8.references/1.terms.md`](docs/content/8.references/1.terms.md):
  the tool is "a devframe", never bare `client`/`host`/`server`/`agent`/`plugin`
  ([02](./.agents/02-terminology.md)).
- Event, broadcast, shared-state and channel names MUST come from the
  `DEVFRAME_EVENTS` / `HUB_EVENTS` maps, kept in lockstep with the Events
  Reference - no re-typed string literals ([04](./.agents/04-conventions.md)).
- Node-side warnings and errors MUST be coded `DF` diagnostics via
  `devframe/utils/nostics` - no ad-hoc `console.*` / `throw new Error`
  ([08](./.agents/08-diagnostics.md)).
- `devframe` and every `@devframes/*` package MUST stay validator-neutral: no
  `zod`/`valibot`/`arktype` in runtime `dependencies`; schemas type against
  Standard Schema ([04](./.agents/04-conventions.md)).
- Dependencies go through the pnpm catalogs (`catalog:<name>`); versions MUST NOT
  be pinned in a `package.json` ([03](./.agents/03-stack-and-commands.md)).
- Before a PR, all gates MUST pass:
  `pnpm lint && pnpm knip && pnpm test && pnpm typecheck && pnpm build`.
  Commits follow Conventional Commits.

## Boundary invariants

- A feature that only makes sense when multiple tools share a UI belongs in a hub
  package; `devframe` stays single-integration and headless - no banners, no
  default styling, no opinionated stdout ([01](./.agents/01-positioning.md)).
- Adapter code that may run standalone MUST NOT hardcode mount paths; SPAs build
  with relative asset paths and discover their base at runtime
  ([01](./.agents/01-positioning.md)).
- The framework kits keep two subpaths (`.../single`, `.../hub`) parallel across
  Vite/Nuxt/Next; the bare root throws ([05](./.agents/05-framework-kits.md)).
- The two reference hosts (`examples/custom-hub-vite`, `examples/custom-hub-next`)
  stay at feature parity - a change to one lands in the other in the same PR
  ([07](./.agents/07-hub-examples.md)).
- UI builds on `@antfu/design` semantic tokens and its component vocabulary -
  no hardcoded palettes, no bespoke nav/button/tab shapes; shadow-root surfaces
  build on Wind3 ([06](./.agents/06-design-system.md)).

## Find the contract

| Task | Read |
| --- | --- |
| Layering, design principles, mount paths, CLI composition | [01 positioning](./.agents/01-positioning.md) |
| Canonical names for every concept | [02 terminology](./.agents/02-terminology.md) |
| Stack, repo layout, commands, typecheck/knip/starter machinery | [03 stack & commands](./.agents/03-stack-and-commands.md) |
| RPC ids, event maps, validator neutrality, imports, factory exports | [04 conventions](./.agents/04-conventions.md) |
| `@devframes/vite`/`nuxt`/`next` subpath shape and peers | [05 framework kits](./.agents/05-framework-kits.md) |
| `@antfu/design` preset, tokens, ports, shadow-root CSS, Storybook | [06 design system](./.agents/06-design-system.md) |
| Reference host parity rules | [07 hub examples](./.agents/07-hub-examples.md) |
| `DF` codes, ranges, adding an error | [08 diagnostics](./.agents/08-diagnostics.md) |
| Writing rules for `docs/` | [09 docs style](./.agents/09-docs-style.md) |
