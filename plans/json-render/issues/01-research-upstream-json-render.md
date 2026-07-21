# Research upstream json-render contracts

Type: research
Status: resolved
Blocked by: none

## Question

Which public contracts and runtime semantics in the current `@json-render/core` and `@json-render/vue` releases must the Devframes packages adopt, re-export, configure, or deliberately constrain? Compare the current release with the version embedded by `vitejs/devtools`, covering schema/catalog typing, registries, state and binding expressions, actions and validation, streaming, extension composition, renderer lifecycle, package stability, and licensing.

## Answer

See [Upstream json-render contracts](../research/upstream-json-render.md).

The current upstream pair is `@json-render/core@0.19.0` and `@json-render/vue@0.19.0`. Its catalog and registry types aid authoring but do not fully validate component props, authorize actions, compose extensions, or guarantee lifecycle behavior. A direct Devframes re-export therefore needs reviewed named exports, exact upstream pinning, a separately versioned protocol validator, and compatibility tests. The report also records the Apache-2.0 obligations and recommends keeping streaming optional until the protocol decision explicitly adopts it.
