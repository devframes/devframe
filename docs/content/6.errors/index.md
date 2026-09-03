---
title: 'Error Reference'
description: 'Devframe surfaces warnings and errors as structured diagnostics: each with a unique code, a human-readable message, and a link to this documentation.'
---

Devframe surfaces warnings and errors as structured diagnostics: each with a unique code, a human-readable message, and a link to this documentation.

## How error codes work

- Codes follow the pattern **`DF` + a 4-digit number**. Core `devframe` uses `DF00xx`–`DF07xx`; the hub reserves `DF8xxx`.
- Every page carries the message, cause, recommended fix, and the source file that emits it.
- **Level** is the diagnostic's severity: **error** or **warn**.
- Diagnostics are powered by [`nostics`](https://www.npmjs.com/package/nostics): structured codes with docs URLs, ANSI console output, and pluggable reporters.

## Devframe (DF)

Emitted by `devframe`: the framework-neutral host, RPC, streaming, assets, services, and JSON-render surfaces.

| Code | Level | Title |
|------|-------|-------|
| [DF0006](/errors/DF0006) | error | RPC Function Not Registered |
| [DF0007](/errors/DF0007) | error | AsyncLocalStorage Not Set |
| [DF0008](/errors/DF0008) | error | View distDir Not Found |
| [DF0012](/errors/DF0012) | warn | Storage Parse Failed |
| [DF0013](/errors/DF0013) | error | Shared State Not Found |
| [DF0014](/errors/DF0014) | error | Invalid Agent Field |
| [DF0015](/errors/DF0015) | error | Agent Tool Already Registered |
| [DF0016](/errors/DF0016) | error | Agent Resource Already Registered |
| [DF0017](/errors/DF0017) | error | MCP Server Start Failure |
| [DF0019](/errors/DF0019) | error | Agent Requires JSON-Serializable RPC |
| [DF0020](/errors/DF0020) | error | Non-JSON Value in JSON-Serializable RPC |
| [DF0021](/errors/DF0021) | error | RPC Function Already Registered |
| [DF0022](/errors/DF0022) | error | RPC Function Not Registered (Update) |
| [DF0023](/errors/DF0023) | error | RPC Function Not Registered (Get) |
| [DF0024](/errors/DF0024) | error | Missing RPC Handler |
| [DF0025](/errors/DF0025) | error | Function Not in Dump Store |
| [DF0026](/errors/DF0026) | error | No Dump Match |
| [DF0027](/errors/DF0027) | error | Invalid Dump Configuration |
| [DF0028](/errors/DF0028) | error | Snapshot Type Mismatch |
| [DF0029](/errors/DF0029) | warn | Stream Buffer Overflow |
| [DF0030](/errors/DF0030) | error | Unknown Stream ID |
| [DF0031](/errors/DF0031) | error | Write to Closed Stream |
| [DF0032](/errors/DF0032) | error | Streaming Channel Already Registered |
| [DF0033](/errors/DF0033) | warn | Dev RPC Bridge Failed to Start |
| [DF0034](/errors/DF0034) | error | Already-Namespaced Scoped Registration |
| [DF0035](/errors/DF0035) | error | Storage File Persist Failed |
| [DF0036](/errors/DF0036) | error | RPC Call Rejected, Not Authorized |
| [DF0037](/errors/DF0037) | error | Duplicate Service Provider |
| [DF0038](/errors/DF0038) | error | Invalid JSON-Render Element Props |
| [DF0039](/errors/DF0039) | error | Duplicate JSON-Render View |
| [DF0040](/errors/DF0040) | error | JSON-Render View Used After Disposal |
| [DF0041](/errors/DF0041) | error | JSON-Render Spec Is Not JSON-Serializable |
| [DF0042](/errors/DF0042) | error | Static Build Disabled By The Definition |
| [DF0043](/errors/DF0043) | error | Invalid RPC Argument |
| [DF0044](/errors/DF0044) | error | Invalid RPC Return Value |
| [DF0045](/errors/DF0045) | warn | Instance Registry Update Failed |
| [DF0046](/errors/DF0046) | error | Connector Requires the MCP SDK |
| [DF0047](/errors/DF0047) | warn | Agent Tool Wire-Name Collision |
| [DF0048](/errors/DF0048) | error | Unknown Shared-State Key |
| [DF0049](/errors/DF0049) | error | Connector Call Requires Port and Tool |
| [DF0050](/errors/DF0050) | error | No Devframe Instance on Port |
| [DF0051](/errors/DF0051) | error | Instance Has No MCP Endpoint |
| [DF0052](/errors/DF0052) | error | HTTP Server Failed to Listen |
| [DF0054](/errors/DF0054) | error | connectionMeta() Before Instance Ready |
| [DF0055](/errors/DF0055) | error | Instance Already Owns Its WebSocket Transport |
| [DF0056](/errors/DF0056) | error | Instance Advertises an External WebSocket Endpoint |
| [DF0057](/errors/DF0057) | error | WebSocket Transport Disabled |
| [DF0058](/errors/DF0058) | error | Dev Server Disabled By The Definition |
| [DF0059](/errors/DF0059) | warn | Remote Assets File Listing Failed |
| [DF0060](/errors/DF0060) | error | Remote Asset Fetch Failed |
| [DF0061](/errors/DF0061) | warn | Installed Assets Package Major Version Mismatch |
| [DF0062](/errors/DF0062) | warn | Installed Assets Package Version Skew |
| [DF0063](/errors/DF0063) | warn | Remote Asset Cache Write Failed |
| [DF0064](/errors/DF0064) | error | Remote Assets Materialization Failed |
| [DF0065](/errors/DF0065) | error | Invalid Remote Assets Package Or Version |
| [DF0066](/errors/DF0066) | warn | Service Already Installed |
| [DF0067](/errors/DF0067) | error | Required Service Package Not Importable |
| [DF0068](/errors/DF0068) | error | Required Service Version Range Not Satisfied |
| [DF0069](/errors/DF0069) | warn | Service Version Range Not Satisfied |
| [DF0070](/errors/DF0070) | error | Invalid Service |
| [DF0072](/errors/DF0072) | warn | Snapshot Names Unknown RPC Method |
| [DF0073](/errors/DF0073) | error | JSON-Render Spec Does Not Match Its Schema |
| [DF0074](/errors/DF0074) | error | JSON-Render Schema Is Asynchronous |

## Hub: context & lifecycle (DF80xx)

Emitted by `@devframes/hub` while assembling and mounting the unified surface.

| Code | Level | Title |
|------|-------|-------|
| [DF8000](/errors/DF8000) | error | Devframe Id Collides With a Reserved Hub Path |
| [DF8002](/errors/DF8002) | error | Both devframes and context Passed to initHub |
| [DF8003](/errors/DF8003) | error | connectionMeta() Before Hub Instance Ready |
| [DF8004](/errors/DF8004) | error | Devframe Id Is Not a Mountable URL Segment |
| [DF8005](/errors/DF8005) | warning | Devframe MCP Ignored While Hub MCP Is Off |

## Hub: docks & mounting (DF81xx)

| Code | Level | Title |
|------|-------|-------|
| [DF8100](/errors/DF8100) | error | Dock Already Registered |
| [DF8101](/errors/DF8101) | error | Cannot Change Dock Id |
| [DF8102](/errors/DF8102) | error | Dock Not Registered |
| [DF8103](/errors/DF8103) | error | Dock Entry Cannot Group Itself |
| [DF8104](/errors/DF8104) | error | Nested Dock Groups Unsupported |
| [DF8105](/errors/DF8105) | error | Devframe Already Mounted |
| [DF8106](/errors/DF8106) | warn | Connection Meta Not Served |
| [DF8107](/errors/DF8107) | warn | Unknown Dock Activation Target |
| [DF8108](/errors/DF8108) | error | Duplicate Renderer Module Type |
| [DF8109](/errors/DF8109) | error | Renderer Module File Missing |
| [DF8110](/errors/DF8110) | error | Renderer Type Is Not URL-Safe |
| [DF8111](/errors/DF8111) | warn | Bare-Specifier Client Script Without Host Resolution |

## Hub: terminals (DF82xx)

| Code | Level | Title |
|------|-------|-------|
| [DF8200](/errors/DF8200) | error | Terminal Session Already Registered |
| [DF8201](/errors/DF8201) | error | Terminal Session Not Registered |
| [DF8202](/errors/DF8202) | error | Terminal Session Does Not Accept Input |
| [DF8203](/errors/DF8203) | error | Failed To Spawn PTY Session |
| [DF8204](/errors/DF8204) | error | Terminal Session Cannot Be Controlled |
| [DF8205](/errors/DF8205) | error | Terminal Session Is Not Restartable |
| [DF8206](/errors/DF8206) | error | Terminal Session Restart on Closed Stream |

## Hub: commands (DF84xx)

| Code | Level | Title |
|------|-------|-------|
| [DF8400](/errors/DF8400) | error | Command Already Registered |
| [DF8401](/errors/DF8401) | error | Cannot Change Command Id |
| [DF8402](/errors/DF8402) | error | Command Not Registered |
| [DF8403](/errors/DF8403) | error | Duplicate Command Id |
| [DF8404](/errors/DF8404) | error | Agent Exposure Without Handler |
