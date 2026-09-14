# 07 - Hub example parity

`examples/custom-hub-vite/` (Vite plugin + vanilla client) and `examples/custom-hub-next/` (Next.js App Router + React client) are the two reference hosts, and they MUST stay at feature parity. They mount the same set of plugins and demo devframes, expose the same dock rail / iframe stage / subsystem drawer, and speak the same hub protocol - the only differences are the host framework's own plumbing (how static assets are mounted, how the side-car server starts, how the client is rendered).

Any change to one MUST land in the other in the same PR: adding a dock, wiring a new hub subsystem, changing the drawer layout, adopting a new client-runtime API. Their READMEs mirror each other too. If a capability genuinely can't exist on one host, say so explicitly in **both** READMEs rather than letting the examples silently drift.

The minimal hub examples (`examples/hub-*`) sit outside this parity contract; their shape is defined by the framework kits ([05](./05-framework-kits.md)).
