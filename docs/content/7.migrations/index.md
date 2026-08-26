---
title: 'Migrations'
description: 'Version-by-version upgrade guides for devframe and @devframes/hub. Each release below has a drop-in path from the previous one.'
---

Upgrade guides for devframe and `@devframes/hub`, newest first. Each one lists every breaking change with its drop-in replacement.

| Version | What changed |
| ------- | ------------ |
| [Migrating to 0.10](/migrations/migration-0.10) | Moves the MCP surface to the stateless MCP 2026-07-28 protocol. |
| [Migrating to 0.9](/migrations/migration-0.9) | Removes the compatibility shims deprecated across the 0.7 series and trims the public API. |
| [Migrating to 0.8](/migrations/migration-0.8) | Makes RPC schemas validator-neutral and runtime-validated, and adds the agent-native MCP surface. |
| [Migrating to 0.7](/migrations/migration-0.7) | Makes `cac` an optional peer and moves json-render into an opt-in package. |
| [Migrating to 0.6](/migrations/migration-0.6) | Tightens `defineDevframe`'s metadata, replaces the terminal and WebSocket transports, and adds enforced auth. |

For the full changelog of every release, see the [release notes on GitHub](https://github.com/devframes/devframe/releases).
