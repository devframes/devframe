# Inventory existing JSON-render and runtime seams

Type: research
Status: resolved
Blocked by: none

## Question

What behavior currently exists in this repository and `vitejs/devtools`, and which devframe and hub seams can host it without violating their boundaries? Trace the current hub types, `createJsonRenderer`, shared-state transport, dock projection, Vite viewer, standalone adapters, static dumps, client host, package build conventions, and tests. Record concrete compatibility obligations and architectural constraints rather than proposing the final API.

## Answer

See [Existing JSON-render integration seams](../research/existing-integration-seams.md).

The current repository owns permissive hub types, a hub-only shared-state factory, and a JSON-render dock discriminator; `vitejs/devtools` owns the only renderer and catalog. Wire projection accidentally strips renderer methods and leaves `_stateKey`, standalone adapters have no renderer assets or factory, and static dumps can replay specs but not RPC actions. The hub's existing headless client boundary is suitable for renderer substitution, while stable scoped identities, explicit serialization, cleanup, standalone assets, declared-action isolation, and dedicated tests are missing.
