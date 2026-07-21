# JSON Render Packages Wayfinder

## Destination

Produce an implementation-ready specification for `@devframes/json-render` and `@devframes/json-render-ui`: their package boundaries, public APIs, protocol semantics, official Vue renderer, devframe runtime support, hub integration, migration inside this repository, acceptance criteria, and implementation sequence.

## Notes

- This map plans the work; implementing or releasing the packages is outside its destination.
- `@devframes/json-render` is a stable, devframe-native protocol package. It directly re-exports the relevant `@json-render/core` API and owns the Devframes catalog, declared-action contract, runtime handles, and integration helpers.
- `@devframes/json-render-ui` is the official Vue implementation. Its registry implements the catalog with `@antfu/design`, while third-party registries can replace it.
- The catalog has a versioned portable base and explicit extensions. A registry is a framework-specific implementation of a catalog.
- Views work in standalone and hub deployments across live and static devframe outputs. Live outputs can use RPC actions; static behavior must be specified explicitly.
- Specs invoke only actions declared for that view. An arbitrary string-to-RPC bridge is not part of the target contract.
- The final specification covers this repository. Adoption and code removal in `vitejs/devtools` is a separate effort.
- Relevant skills: `research`, `grilling`, `domain-modeling`, `prototype`, `antfu`, `antfu-design`, `vue-best-practices`, `unocss`, `vite`, `tsdown`, and `vitest`.
- Local tracker operations: tickets are files under `issues/`; `Status: open` is unclaimed, `Status: claimed` is in progress, and `Status: resolved` is closed. A ticket is on the frontier when every number in `Blocked by` is resolved.

## Decisions so far

- [Research upstream json-render contracts](issues/01-research-upstream-json-render.md) — Upstream `0.19.0` is structurally reusable but pre-1.0 typing is not a validation or authorization boundary; direct re-exports require pinning and a Devframes-owned protocol guard.
- [Inventory existing JSON-render and runtime seams](issues/02-research-existing-integration-seams.md) — The current hub transports whole specs through shared state and an accidental `_stateKey` projection; portable standalone/static rendering, stable identity, action isolation, cleanup, and tests remain to be designed.

## Not yet specified

- The implementation slices and test matrix. These become precise after the public API prototype establishes the package seams.

## Out of scope

- Implementing, publishing, or releasing the packages.
- Changing `vitejs/devtools` to consume the packages or deleting its current implementation.
- Official React, Solid, Svelte, or vanilla registries; third-party renderer compatibility is specified through the core contract.
- Agent-driven UI generation beyond any protocol capability required to keep the base catalog compatible with json-render.
