# Design: Shared-iframe docks with soft navigation

**Status:** Hub side implemented — hand-off spec for the Vite DevTools UI
**Audience:** Vite DevTools (`@vitejs/devtools-kit`) UI implementers + `@devframes/hub` maintainers
**Driving use case:** hosting a foreign multi-tab devtool (e.g. **Nuxt DevTools**) as a set of first-class hub docks that all share **one** live iframe and switch between views via **client-side (soft) navigation**, for a unified experience.

> **Landed foundations.** [#129](https://github.com/devframes/devframe/pull/129) shipped client-only `docks.register()`/`docks.update()`; [#130](https://github.com/devframes/devframe/pull/130) reinterpreted a grouped entry's `category` as an in-group sub-category (outer bucket = the group's category) and made `framework` sort first. This spec and the hub-side implementation (types + the frame-nav adapter) build directly on both.

---

## 1. Summary

A large integration like Nuxt DevTools has many internal tabs (Modules, Timeline, Plugins, …) inside a single SPA with its own router. Today devframe mounts an integration as exactly **one** iframe dock ([`packages/hub/src/node/mount-devframe.ts:89`](../packages/hub/src/node/mount-devframe.ts)); the integration's own tabs are invisible to the hub. We want each of those tabs to appear as its **own hub dock**, participating in the dock bar, grouping, ordering, pinning, badges, and the command palette — while **reusing one already-booted iframe** and switching views **without reloading**.

The design splits cleanly into two concerns, mirroring the existing a11y precedent (RPC carries the durable data model; a separate direct channel carries the live loop — see [`plugins/a11y/src/shared/protocol.ts:7`](../plugins/a11y/src/shared/protocol.ts)):

- **Data model (hub-owned):** a shared-iframe axis (`frameId`) on iframe docks, plus the ability for the **viewer client** to register **client-only docks** (docks that live only in this client's dock context, never projected to the server's `devframe:docks` shared state).
- **Live loop (host↔iframe `postMessage`):** a small, versioned, origin-locked protocol carrying a **tab manifest**, **navigate** commands, **navigated** reports, and a **ready** handshake. The embedded app implements only this shim — it need **not** be a devframe and takes **no** hub/RPC dependency.

The embedded app stays maximally decoupled: **~30 lines of `postMessage` shim** and it slots into the hub as a group of managed docks with instant soft-nav between them, working cross-origin and even in static builds (no server dependency for the loop).

---

## 2. Terminology

| Term | Meaning |
|---|---|
| **Shared frame** | One `<iframe>` element, identified by a `frameId`, reused by multiple docks. Booted once, kept alive, hidden/shown — never re-`src`'d except for hard-nav fallback. |
| **`frameId`** | The axis that says "these docks render into the same iframe and soft-navigate between each other." **Fully orthogonal to `groupId`.** |
| **Anchor dock** | The single server/host-declared `iframe` dock that owns the `frameId` + the iframe URL. It is the boot target and the graceful fallback when no shim answers. |
| **Member dock** | A per-tab **client-only** dock materialized by the viewer adapter from the manifest. Shares the anchor's `frameId`, carries its own `navTarget` (+ optional `fallbackUrl`). |
| **Nav shim** | The tiny `postMessage` implementation the embedded app ships (announces its tabs, answers `navigate`, reports `navigated`). |
| **Manifest** | The declarative, full-snapshot list of tabs the shim reports. |
| **`navTarget`** | A structured `{ path, query?, state? }` describing which internal view to show. |
| **Viewer adapter** | Hub-shipped client code that runs the handshake, turns the manifest into client-only member docks, and drives the nav loop. |

### Orthogonality of `frameId` and `groupId` (important)

`frameId` and `groupId` are **independent axes**:

- `frameId` = *which iframe element* a dock renders into + the soft-nav pool it belongs to.
- `groupId` = *dock-bar UX only* (collapse members under one button), the existing flat-membership grouping ([`packages/hub/src/types/docks.ts:98`](../packages/hub/src/types/docks.ts)).

Members sharing a `frameId` **may** all sit in one group (the Nuxt-tabs case), be spread across several groups, or have **no group at all** (several top-level docks that happen to share one iframe and soft-nav between each other). The viewer adapter keys iframe-sharing and the soft-nav loop **purely on `frameId`**; grouping never enters that logic. `group.defaultChildId` only applies when a group exists; otherwise boot uses the anchor's own URL as the initial view.

Note the [#130](https://github.com/devframes/devframe/pull/130) rule when members *are* grouped: a member's outer dock-bar bucket becomes the **group's** `category`, and the member's own `category` is reinterpreted as an **in-group sub-category** used to sub-divide/sort members inside the group. So a `FrameTab.category` sub-divides tabs *within* the group, not the group's placement on the bar.

---

## 3. Architecture at a glance

```
 ┌───────────────────────── Host page (the viewer, e.g. Vite DevTools) ─────────────────────────┐
 │                                                                                               │
 │  createDevframeClientHost()                                                                    │
 │    • reads devframe:docks (server docks, incl. the ANCHOR iframe dock)                         │
 │    • client-only docks registered via context.docks.register(...)  ← MEMBERS live here         │
 │    • auto-attaches the Viewer Adapter to any iframe dock flagged subTabs:'postmessage'         │
 │                                                                                               │
 │   Dock bar / group ── selects a member ──▶ Viewer Adapter                                      │
 │                                              │  postMessage 'navigate' {tabId, navTarget}      │
 │                                              ▼                                                 │
 │                        ┌──────────── ONE shared <iframe> (frameId) ───────────┐               │
 │                        │  Nuxt DevTools SPA + nav shim                          │              │
 │                        │   • posts 'ready' + 'manifest' (tab list)             │               │
 │                        │   • on 'navigate' → router.push(navTarget) (soft)     │               │
 │                        │   • on internal nav → posts 'navigated' {tabId}       │               │
 │                        └──────────────────────────────────────────────────────┘              │
 │                                              │  postMessage 'navigated' / 'manifest'           │
 │                                              ▼                                                 │
 │            Adapter reconciles manifest → client-only member docks; updates selection           │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘

 Server / shared-state carries ONLY: the anchor dock entry (+ all other normal hub docks).
 The live nav loop + tab manifest never touch the server — pure host↔iframe postMessage.
```

Why `postMessage` (not RPC) for the live loop: devframe RPC is a **star topology** ([`packages/devframe/src/rpc/server.ts:13`](../packages/devframe/src/rpc/server.ts)) — no client→client path, no peer-presence primitive, and it is inert in static builds (`isStaticBackend`, [`packages/devframe/src/client/rpc-shared-state.ts:47`](../packages/devframe/src/client/rpc-shared-state.ts)). A host↔iframe interaction routed through the server would incur a needless round-trip and have no natural readiness signal. `window.postMessage` is the purpose-built channel: direct, cross-origin-capable, server-free, with a natural `ready` handshake.

---

## 4. Part A — Hub data model (hub-owned)

### 4.1 Extend `DevframeViewIframe`

Two additive fields; `frameId` already exists ([`packages/hub/src/types/docks.ts:126`](../packages/hub/src/types/docks.ts)).

```ts
export interface DevframeViewIframe extends DevframeDockEntryBase {
  type: 'iframe'
  url: string
  frameId?: string                 // EXISTING — shared-iframe axis
  clientScript?: ClientScriptEntry
  remote?: boolean | RemoteDockOptions

  // NEW — the soft-nav target within the shared frame (member docks).
  // Absent on the anchor; present on each member.
  navTarget?: NavTarget

  // NEW — marks an ANCHOR iframe whose sub-tabs are discovered over postMessage.
  // Presence tells the viewer to auto-attach the frame-nav adapter.
  subTabs?: FrameSubTabsConfig
}

export interface NavTarget {
  /** Opaque-to-the-hub route the embedded app maps to its own router. */
  path: string
  query?: Record<string, string | string[]>
  /** History state; JSON/structured-cloneable. Rides soft-nav only. */
  state?: unknown
}

export interface FrameSubTabsConfig {
  protocol: 'postmessage'
  /** How long to wait for the shim's `ready` before treating the frame as
   *  no-shim (anchor renders as a single plain iframe dock). Default 3000. */
  handshakeTimeoutMs?: number
}
```

**Anchor dock** (server/host-declared, e.g. via `mountDevframe` or `ctx.docks.register`):

```ts
ctx.docks.register({
  id: 'nuxt-devtools',
  type: 'iframe',
  title: 'Nuxt DevTools',
  icon: 'i-logos:nuxt-icon',
  url: 'http://localhost:3000/__nuxt_devtools__/',
  frameId: 'nuxt-devtools',           // shared iframe id
  subTabs: { protocol: 'postmessage' }, // ← auto-attach the adapter
  groupId: 'nuxt',                     // OPTIONAL — grouping is independent
})
```

`state` is dropped when a target is expressed as a URL (boot deep-link / hard-nav fallback), because history state cannot ride a URL. It survives only on the soft-nav (`postMessage`) path.

### 4.2 Client-only docks via `context.docks.register(...)` (shipped in #129)

The **client** `DevframeClientContext.docks` has `register()`/`update()` ([`packages/hub/src/client/docks.ts:115`](../packages/hub/src/client/docks.ts)). Entries registered here are **client-only**:

- They merge into the client's `entries`, `groupedEntries`, and `entryToStateMap` alongside server docks (`reconcileEntries` merges *server entries from `devframe:docks`* + *client-registered entries*; a client dock overrides a server one of the same id).
- They are **never** written back to the `devframe:docks` shared state (no server round-trip; nothing to persist server-side).
- Their ids are **namespaced** to avoid clashing with server docks — convention `"<frameId>:<tabId>"`.

The merged surface (matching what the adapter uses):

```ts
interface DocksEntriesContext {
  // ... existing surface ...
  /** Register a CLIENT-ONLY dock (not projected to the server). Throws on a
   *  duplicate client id unless `force`. */
  register: <T extends DevframeDockEntry>(entry: T, force?: boolean) => DockRegistration<T>
  /** Replace a previously client-registered dock, keyed by id. */
  update: (entry: DevframeDockUserEntry) => void
}

interface DockRegistration<T> {
  /** Patch in place; `id` is immutable. */
  update: (patch: Partial<T>) => void
  /** Remove the client dock from the local merge. */
  dispose: () => void
}
```

Member docks are plain `iframe` entries sharing the anchor's `frameId`, each with its own `navTarget` + `url` (the `fallbackUrl` for boot deep-link / hard-nav):

```ts
context.docks.register({
  id: 'nuxt-devtools:modules',
  type: 'iframe',
  title: 'Modules',
  icon: 'i-ph:puzzle-piece-duotone',
  frameId: 'nuxt-devtools',
  url: 'http://localhost:3000/__nuxt_devtools__/#/modules', // fallback/deep-link
  navTarget: { path: '/modules' },                          // soft-nav
  groupId: 'nuxt',   // optional; could be omitted or differ per member
  defaultOrder: 100,
})
```

### 4.3 What does **not** change

- Grouping stays exactly as-is (`group` entry + `groupId` flat membership, [`packages/hub/src/types/docks.ts:282`](../packages/hub/src/types/docks.ts)). Reuse `group.defaultChildId` for the initial member when a group is present.
- Remote mode (`DevframeViewIframe.remote`) is **orthogonal**: the anchor URL may carry the injected remote WS descriptor as today ([`packages/hub/src/node/host-docks.ts:44`](../packages/hub/src/node/host-docks.ts)); the `postMessage` loop is unaffected and works cross-origin.
- No new dock **kind** is introduced; we extend the existing `iframe` kind only.

---

## 5. Part B — the `postMessage` protocol (host ↔ iframe)

Namespaced, versioned, origin-locked. Every message shares an envelope:

```ts
interface FrameNavEnvelope {
  channel: 'devframe:frame-nav'
  v: 1
  frameId: string
  from: 'host' | 'frame'   // direction tag; each side ignores its own `from`
}
```

Both sides **must**: verify `event.origin` against the locked origin (§5.3), verify `channel === 'devframe:frame-nav'` and `v === 1`, ignore anything else silently.

### 5.1 Messages — frame → host (`from: 'frame'`)

| `type` | Payload | Meaning |
|---|---|---|
| `ready` | `{ tabs: FrameTab[], current?: string }` | Shim is up. Announces the initial manifest + currently-shown tab id. Sent on load **and** in reply to `hello`. |
| `manifest` | `{ tabs: FrameTab[], current?: string }` | Declarative **full snapshot** of the current tab set (see §5.4). Sent whenever tabs change. |
| `navigated` | `{ tabId?: string, navTarget?: NavTarget }` | The app navigated internally (user click or programmatic). Host reflects selection. |

### 5.2 Messages — host → frame (`from: 'host'`)

| `type` | Payload | Meaning |
|---|---|---|
| `hello` | `{}` | Host is listening. Race-proofs the handshake: whoever is late triggers a `ready`. |
| `navigate` | `{ tabId: string, navTarget: NavTarget }` | Switch to this view via **client-side** navigation (no reload). |

### 5.3 Origin locking

- **Host → frame:** the host computes the expected origin from the anchor entry `url` (`new URL(url).origin`) and posts with that exact `targetOrigin` (never `'*'`). It accepts inbound `message` events only when `event.origin` equals that origin.
- **Frame → host:** the shim posts to `window.parent` and should lock to the parent origin. Since a foreign app may not know the hub's origin a priori, it locks to the origin of the **first `hello`** it receives (or `window.location.ancestorOrigins?.[0]` where available), and posts its own messages with that `targetOrigin`. Until locked, it may reply to `hello` using `event.origin`.

### 5.4 `FrameTab` (manifest entry) — full dock-like descriptor

```ts
interface FrameTab {
  id: string                                   // unique within the frame
  title: string
  icon?: string | { light: string, dark: string }
  navTarget: NavTarget
  fallbackUrl?: string                         // absolute or relative-to-anchor;
                                               // used for boot deep-link + hard-nav
  badge?: string
  order?: number                               // maps to defaultOrder
  category?: string
  when?: string                                // when-clause expression
  groupId?: string                             // OPTIONAL — orthogonal to frameId
}
```

Each `FrameTab` maps directly onto `DevframeDockEntryBase` + `DevframeViewIframe`, so client-only member docks are first-class. If `fallbackUrl` is omitted the adapter derives one from the anchor `url` + `navTarget` (`base + path (+ query)`) purely for the fallback path.

### 5.5 Handshake & nav sequences

**Boot / handshake (race-proof both ways):**

```
Host: mounts iframe (src = boot deep-link, §7.2), starts message listener
Host: → hello {}
Frame (on load): → ready { tabs:[…], current:'modules' }   // may arrive before/after hello
Host: registers client-only member docks from tabs; marks frame READY; sets selection = current
```

**User selects a member in the dock bar:**

```
Host: select('nuxt-devtools:timeline')
Host (if READY & tabId != current): → navigate { tabId:'timeline', navTarget:{path:'/timeline'} }
Frame: router.push('/timeline')  (soft)
Frame: → navigated { tabId:'timeline' }
Host: current = 'timeline'  (idempotent no-op — already selected → nothing further)
```

**User navigates inside the app (e.g. clicks a Nuxt link):**

```
Frame: → navigated { tabId:'plugins' }
Host: switchEntry('nuxt-devtools:plugins')  (updates dock highlight)
Host: (does NOT echo a navigate back — idempotent guard, §7.4)
```

**Tabs change at runtime (plugin adds/removes a tab):**

```
Frame: → manifest { tabs:[… new full set …], current:'…' }
Host: diff vs current member docks → register new / update changed / remove missing
Host: if the active member was removed → selection = null (§7.5)
```

---

## 6. Part C — viewer UI-behavior contract (Vite DevTools implements)

This is what the **viewer** guarantees so the hub-shipped adapter works. Most of it is satisfied by driving the iframe from the hub client context.

### 6.1 One live iframe per `frameId`, kept alive

- Mount **exactly one** `<iframe>` element per distinct `frameId` and **keep it alive** for the session.
- When any dock sharing that `frameId` (anchor or member) is active, **show** that iframe.
- When an unrelated dock is active, **hide** it (`display:none`/`hidden`), **do not unmount** and **do not change `src`**. Reveal instantly on return — in-app state + scroll + soft-nav position are preserved.

### 6.2 Populate `domElements.iframe` + emit `dom:iframe:mounted`

The hub already declares the seam ([`packages/hub/src/client/docks.ts:117`](../packages/hub/src/client/docks.ts)); today the runtime never emits it. The viewer, when it mounts the iframe for an entry, **must** set `state.domElements.iframe` and emit `dom:iframe:mounted` on that entry's `DockEntryState`. The adapter uses this element to `postMessage` and to attach itself.

### 6.3 Rendering members

- Render member docks like any other dock (dock bar / group popover / segmented tabs), honoring their `title`/`icon`/`order`/`category`/`when`/`badge`/`groupId`.
- Selecting a member must go through the normal `docks.switchEntry(id)` path — the adapter listens for activation and drives the iframe.

### 6.4 Grouping is independent

Do **not** assume members share a group. Group them by `groupId` if present (the normal group UX); members with no `groupId` render as ordinary top-level docks. The shared-iframe behavior is identical either way.

---

## 7. Part D — the hub-shipped viewer adapter (implemented)

Auto-attached by `createDevframeClientHost` when it sees an iframe entry with `subTabs` set and that entry's iframe mounts (`dom:iframe:mounted`). Shipped as `attachFrameNavClient` from `@devframes/hub/client` ([`packages/hub/src/client/frame-nav.ts`](../packages/hub/src/client/frame-nav.ts)):

```ts
// @devframes/hub/client
function attachFrameNavClient(options: {
  frameId: string
  anchor: DevframeViewIframe
  iframe: Pick<HTMLIFrameElement, 'contentWindow' | 'src'>
  docks: Pick<DocksEntriesContext, 'register' | 'switchEntry' | 'getStateById'>
  window?: FrameNavListenTarget // defaults to globalThis (the host page window)
  origin?: string               // else derived from the anchor URL
  handshakeTimeoutMs?: number   // default 3000
}): FrameNavClient // { ready, currentTabId, dispose() }
```

The host wires this automatically (`maybeAttachFrameNav` in `host.ts`), one adapter per `frameId`, disposed when the anchor is removed or the host tears down. Viewers get soft-nav for free once they satisfy §6.

### 7.1 Handshake & readiness (server-relay-free)

- Start a `message` listener (origin-locked, §5.3). Post `hello`. Start a `handshakeTimeoutMs` timer.
- On `ready`/`manifest`: mark the frame **READY**, reconcile member docks (§7.3), cancel the timer.
- On timeout with no `ready`: treat as **no shim** — register **no** member docks; the anchor simply renders as a single plain iframe dock (graceful degrade).

Readiness is **gate-only**: once the frame announced `ready`, every soft-nav is trusted (no per-nav ack). The hard-nav fallback fires only for a frame that never became READY, or when navigating before READY.

### 7.2 Boot / initial view

- First time the frame becomes visible, set `iframe.src` to the **boot deep-link**: the initial member's `fallbackUrl` (or derived URL) when a member is the initial selection, else the anchor `url`.
- Initial member = `group.defaultChildId` when the anchor is grouped; otherwise none (anchor URL is the initial view).
- After READY, **all** subsequent switches are soft-nav via `postMessage` — never touch `src` again except for hard-nav fallback.

### 7.3 Manifest → client-only docks reconciliation

On each `ready`/`manifest` (declarative full snapshot):

- **Add** a client-only `iframe` member dock for each new `FrameTab` (`id = "<frameId>:<tab.id>"`, `frameId = anchor.frameId`, `navTarget`, `url = fallbackUrl|derived`, mapped `title/icon/order/category/when/badge/groupId`).
- **Update** changed descriptors via the register handle's `update`.
- **Remove** member docks whose tab id disappeared via `remove`.

### 7.4 Nav loop + idempotent echo guard

- Track `currentTabId`.
- On dock activation of a member (`entry:activated`): if `tabId !== currentTabId` and frame READY → post `navigate`; set `currentTabId`. If not READY → hard-nav `iframe.src = fallbackUrl` (drops `state`).
- On inbound `navigated`: set `currentTabId`, call `switchEntry("<frameId>:<tabId>")`. If it already equals the current selection → **no-op** (do not post `navigate`).
- The "activate the already-active dock / navigate to the already-current route = no-op" rule on **both** sides breaks the ping-pong. (Shared-state's `syncId` de-dup, [`packages/devframe/src/utils/shared-state.ts:118`](../packages/devframe/src/utils/shared-state.ts), is the analogous guard on the data-model side.)

### 7.5 Lifecycle edge cases

- **Active member removed from manifest:** selection clears to `null` (consistent with the existing reconcile behavior when a selected entry disappears, [`packages/hub/src/client/host.ts:227`](../packages/hub/src/client/host.ts)).
- **Manifest becomes empty:** only the anchor remains (single plain iframe dock).
- **Dispose:** on adapter teardown, remove all client-only member docks it registered and detach the listener.

---

## 8. Fallback & degradation (progressive enhancement)

| Situation | Behavior |
|---|---|
| Shim present, frame READY | Full soft-nav; members are first-class docks; bidirectional highlight. |
| No shim (timeout) | Anchor renders as a single plain iframe dock; no members. Nothing breaks. |
| Static build (no server) | The data model may come from the baked dump; the `postMessage` loop **still works** (server-free). |
| Navigate before READY | Hard-nav `iframe.src = fallbackUrl` (drops `state`). |
| Cross-origin iframe | Fully supported — origin-locked `postMessage`. |

---

## 9. Non-goals

- No new dock **kind** (extend `iframe` only).
- No per-tab server-side dock registration for these tabs (members are client-only, materialized from the manifest).
- The hub does **not** interpret `navTarget.path` — it is opaque, mapped by the embedded app's own router.
- No requirement that the embedded app be a devframe or speak RPC.

---

## 10. Reference: the embedded-app nav shim (what Nuxt DevTools ships)

A minimal, framework-neutral sketch (~30 lines). The app maps `navTarget` onto its own router and reports internal navigation back.

```ts
const CHANNEL = 'devframe:frame-nav'
const FRAME_ID = 'nuxt-devtools'
let hostOrigin: string | null = null

function tabsSnapshot() {
  return getTabs().map(t => ({
    id: t.id, title: t.title, icon: t.icon,
    navTarget: { path: t.path },
    order: t.order, category: t.category, badge: t.badge,
  }))
}

function post(msg: Record<string, unknown>) {
  if (!hostOrigin) return
  parent.postMessage({ channel: CHANNEL, v: 1, frameId: FRAME_ID, from: 'frame', ...msg }, hostOrigin)
}

addEventListener('message', (e) => {
  const d = e.data
  if (!d || d.channel !== CHANNEL || d.v !== 1 || d.frameId !== FRAME_ID || d.from !== 'host') return
  hostOrigin ??= e.origin
  if (d.type === 'hello')
    post({ type: 'ready', tabs: tabsSnapshot(), current: currentTabId() })
  else if (d.type === 'navigate')
    router.push({ path: d.navTarget.path, query: d.navTarget.query, state: d.navTarget.state })
})

// Announce on load (race-proof: host also sends `hello`).
post({ type: 'ready', tabs: tabsSnapshot(), current: currentTabId() })
// Report internal navigation → host highlights the right dock.
router.afterEach(to => post({ type: 'navigated', tabId: tabIdForRoute(to) }))
// Re-announce when the tab set changes.
onTabsChanged(() => post({ type: 'manifest', tabs: tabsSnapshot(), current: currentTabId() }))
```

---

## 11. Implementation checklist

**`@devframes/hub` (data model + adapter):**
- [x] Client-only `docks.register()`/`update()` on the client `DocksEntriesContext` — **#129**.
- [x] Add `navTarget` + `subTabs` to `DevframeViewIframe`; add `NavTarget`, `FrameSubTabsConfig` ([`packages/hub/src/types/docks.ts`](../packages/hub/src/types/docks.ts)).
- [x] Ship the frame-nav adapter (`attachFrameNavClient`, [`packages/hub/src/client/frame-nav.ts`](../packages/hub/src/client/frame-nav.ts)); auto-attach on `dom:iframe:mounted` for `subTabs` anchors ([`host.ts`](../packages/hub/src/client/host.ts)).
- [x] Tests: handshake, manifest reconcile add/remove, echo-guard, internal-nav highlight, origin-lock, timeout→no-shim, active-removed→null ([`frame-nav.test.ts`](../packages/hub/src/client/__tests__/frame-nav.test.ts)).
- [ ] Follow-up: a worked example (wire a `subTabs` anchor + a demo shim in `examples/minimal-vite-devframe-hub`) and a Client Context guide section.

**Vite DevTools (UI contract):**
- [ ] One kept-alive iframe per `frameId`; hide/show, never re-`src`.
- [ ] Populate `domElements.iframe` + emit `dom:iframe:mounted` on the anchor entry.
- [ ] Render member docks (grouped or not) through the normal selection path.

**Embedded app (Nuxt DevTools):**
- [ ] Ship the `postMessage` nav shim (§10).

---

*This design was produced with the help of an agent, from a structured requirements interview.*
