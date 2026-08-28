# A11y × Messages Playground

A focused hub playground for testing **[`@devframes/plugin-a11y`](../../plugins/a11y)**
alongside **[`@devframes/plugin-messages`](../../plugins/messages)** - and, above
all, the **message → dock navigation** they share.

Where [`vite-devframe-hub`](../vite-devframe-hub) mounts every
built-in devframe against the hub's own (mostly accessible) UI, this example ships a
deliberately **inaccessible, multi-route app under test** so the a11y scanner
always has real violations to find, track per route, and link back to from the
messages feed.

## Run it

```sh
pnpm install
pnpm --filter a11y-messages-playground dev
```

The `dev` script builds the workspace first (the a11y page-script bundle and both
devframe SPAs must exist), then starts Vite bound to `0.0.0.0`. Open the printed
URL.

## What you'll see

The window is split in two:

- **Left - App under test.** A tiny client-side-routed app whose every route is
  broken on purpose:
  - `/` - a missing `alt`, an icon-only button, an empty link, a skipped heading
    level
  - `/images` - a gallery of `alt`-less images
  - `/forms` - inputs and a select with no labels
  - `/contrast` - low-contrast text and a custom control with no accessible name
- **Right - Devtools.** The **A11y Inspector** and **Messages** docks.

## What to try

1. **Live scanning** - open the **A11y Inspector**. It scans the left pane on
   load; the Dashboard shows the totals and severity breakdown.
2. **Route tracking** - click the route tabs in the app under test (`Home`,
   `Images`, `Forms`, `Contrast`). Each navigation is a `history.pushState`,
   which the page script patches - the Violations tab accrues one group per route.
3. **Select + highlight** - hover a violation to ring the element in the page;
   tick a violation's checkbox to highlight all its elements with numbered
   badges, then hit **Generate fix prompts** in the nav for a paste-ready AI
   prompt covering everything you selected.
4. **Message → dock navigation** *(the headline)* - open the **Messages** dock.
   Each scan mirrors a summary entry plus one entry per violated rule, and every
   entry carries a navigation action. Select an entry and click **View in a11y
   inspector** (or **Open a11y dashboard**): the hub switches the focused dock to
   the A11y Inspector, deep-linked to that rule + route, and pins the offending
   elements.

## How it's wired

`src/a11y-messages-playground.ts` is the entire host-framework integration - a ~120-line Vite plugin
that runs `@devframes/hub` in the dev server and mounts the two devframes as docks
(the a11y inspector declares its own page script):

```ts
a11yMessagesPlayground({
  devframes: [a11yDevframe, messagesDevframe],
})
```

`src/client/main.ts` boots the hub's client runtime with
`createDevframeClientRuntime()`, which imports that page script into the host page (so it
scans the app under test) and renders the dock rail from `devframe:docks` shared
state. The navigation itself rides existing hub primitives: the messages panel
calls `hub:docks:activate`, the hub broadcasts it, and the client runtime switches
the focused dock - the same path a manual dock click takes.

## Files

| File | Role |
|---|---|
| `src/a11y-messages-playground.ts` | The Vite host - hub context, static + connection-meta mounts, side-car WS, instance-registry registration |
| `vite.config.ts` | Mounts a11y + messages |
| `src/client/main.ts` | Boots the client runtime, renders the dock rail + iframe stage |
| `src/client/app-under-test.ts` | The intentionally-broken, multi-route app the page script scans |
| `src/client/icons.ts` | Offline Phosphor icons for the dock rail |
| `index.html` | The two-pane host page (app under test · devtools) |
