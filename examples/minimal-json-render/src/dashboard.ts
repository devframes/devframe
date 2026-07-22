import type { DevframeJsonRenderSpec, JsonRenderView } from '@devframes/json-render'
import type { DevframeNodeContext } from 'devframe/types'
import { createJsonRenderView } from '@devframes/json-render/node'
import { defineRpcFunction } from 'devframe'
import { DEPLOY_ACTION, REFRESH_ACTION, SAVE_ACTION, VIEW_ID } from './shared.ts'

const VITE_CONFIG = `import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { outDir: 'dist/client' },
})
`

// Initial state model. Every value the spec reads via \`{ $state: '/…' }\`
// resolves from here and updates live as the server patches it.
export const dashboardState = {
  project: { name: 'acme-app', version: '1.4.2', license: 'MIT', repository: 'github.com/acme/app' },
  metrics: { coverage: 82, bundle: 64 },
  modules: [
    { name: '@acme/core', size: '42 kB', status: 'ok' },
    { name: '@acme/ui', size: '88 kB', status: 'ok' },
    { name: '@acme/cli', size: '17 kB', status: 'stale' },
  ],
  deps: {
    runtime: { vue: '^3.5', birpc: '^4.0' },
    dev: { vite: '^8.1', tsdown: '^0.22', vitest: '^4.1' },
  },
  form: { name: '', darkMode: true, notifications: false },
  building: false,
  uptime: 0,
}

/**
 * A server-authored spec exercising every base-catalog component. Values marked
 * `{ $state: '/…' }` resolve from live state; `{ $bindState: '/…' }` are
 * two-way inputs that write back into it.
 */
export const dashboardSpec: DevframeJsonRenderSpec = {
  root: 'root',
  elements: {
    root: { type: 'Stack', props: { gap: 16 }, children: ['header', 'overview', 'settings', 'modules', 'config', 'tree', 'footerDivider', 'footer'] },

    // ── Header ────────────────────────────────────────────────────────────
    header: { type: 'Stack', props: { direction: 'row', gap: 10, align: 'center', justify: 'between' }, children: ['headLeft', 'headRight'] },
    headLeft: { type: 'Stack', props: { direction: 'row', gap: 8, align: 'center' }, children: ['logo', 'headTitle'] },
    logo: { type: 'Icon', props: { name: 'ph:cube-duotone', size: 26 }, children: [] },
    headTitle: { type: 'Text', props: { text: 'Acme Dashboard', variant: 'heading' }, children: [] },
    headRight: { type: 'Stack', props: { direction: 'row', gap: 8, align: 'center' }, children: ['status', 'refreshBtn', 'deployBtn'] },
    status: { type: 'Badge', props: { text: 'healthy', variant: 'success' }, children: [] },
    refreshBtn: {
      type: 'Button',
      props: { label: 'Refresh', variant: 'ghost', icon: 'ph:arrow-clockwise' },
      on: { press: { action: REFRESH_ACTION } },
      children: [],
    },
    deployBtn: {
      type: 'Button',
      props: { label: 'Deploy', variant: 'primary', icon: 'ph:rocket-launch' },
      on: { press: { action: DEPLOY_ACTION } },
      children: [],
    },

    // ── Overview: KeyValueTable + Progress ────────────────────────────────
    overview: { type: 'Card', props: { title: 'Overview' }, children: ['overviewBody'] },
    overviewBody: { type: 'Stack', props: { gap: 14 }, children: ['meta', 'coverage', 'bundle'] },
    meta: { type: 'KeyValueTable', props: { data: { $state: '/project' } }, children: [] },
    coverage: { type: 'Progress', props: { label: 'Test coverage', value: { $state: '/metrics/coverage' }, max: 100 }, children: [] },
    bundle: { type: 'Progress', props: { label: 'Bundle budget', value: { $state: '/metrics/bundle' }, max: 100 }, children: [] },

    // ── Settings: TextInput + Switch + Divider + Button ───────────────────
    settings: { type: 'Card', props: { title: 'Settings', collapsible: true }, children: ['settingsBody'] },
    settingsBody: { type: 'Stack', props: { gap: 10 }, children: ['nameInput', 'greeting', 'prefsDivider', 'darkSwitch', 'notifSwitch', 'saveBtn'] },
    nameInput: { type: 'TextInput', props: { label: 'Display name', placeholder: 'Type your name…', value: { $bindState: '/form/name' } }, children: [] },
    greeting: { type: 'Text', props: { text: { $state: '/form/name' }, variant: 'caption', color: 'primary' }, children: [] },
    prefsDivider: { type: 'Divider', props: { label: 'preferences' }, children: [] },
    darkSwitch: { type: 'Switch', props: { label: 'Dark mode', value: { $bindState: '/form/darkMode' } }, children: [] },
    notifSwitch: { type: 'Switch', props: { label: 'Email notifications', value: { $bindState: '/form/notifications' } }, children: [] },
    saveBtn: {
      type: 'Button',
      props: { label: 'Save settings', variant: 'secondary', icon: 'ph:floppy-disk' },
      // Bound values are resolved into the action params before dispatch, so the
      // server receives whatever the user typed/toggled.
      on: { press: { action: SAVE_ACTION, params: { name: { $state: '/form/name' } } } },
      children: [],
    },

    // ── Modules: DataTable (loading bound to /building) ───────────────────
    modules: { type: 'Card', props: { title: 'Modules' }, children: ['modulesTable'] },
    modulesTable: {
      type: 'DataTable',
      props: {
        columns: [
          { key: 'name', label: 'Module' },
          { key: 'size', label: 'Size' },
          { key: 'status', label: 'Status' },
        ],
        rows: { $state: '/modules' },
        height: 180,
        loading: { $state: '/building' },
      },
      children: [],
    },

    // ── Config: CodeBlock ─────────────────────────────────────────────────
    config: { type: 'Card', props: { title: 'Config' }, children: ['code'] },
    code: { type: 'CodeBlock', props: { filename: 'vite.config.ts', language: 'ts', code: VITE_CONFIG }, children: [] },

    // ── Dependency tree: Tree ─────────────────────────────────────────────
    tree: { type: 'Card', props: { title: 'Dependency tree', collapsible: true, defaultCollapsed: true }, children: ['depTree'] },
    depTree: { type: 'Tree', props: { data: { $state: '/deps' }, defaultExpanded: true }, children: [] },

    // ── Footer ────────────────────────────────────────────────────────────
    footerDivider: { type: 'Divider', props: {}, children: [] },
    footer: { type: 'Stack', props: { direction: 'row', gap: 6 }, children: ['footerLabel', 'footerValue', 'footerSuffix'] },
    footerLabel: { type: 'Text', props: { text: 'Rendered from a JSON-render spec · uptime', variant: 'caption', color: 'faint' }, children: [] },
    footerValue: { type: 'Text', props: { text: { $state: '/uptime' }, variant: 'caption', color: 'faint' }, children: [] },
    footerSuffix: { type: 'Text', props: { text: 's', variant: 'caption', color: 'faint' }, children: [] },
  },
  state: dashboardState,
}

/**
 * Create the dashboard JSON-render view on a devframe context and register the
 * actions its spec dispatches. Shared by the standalone devframe and the hub
 * shells (which additionally project it onto a `json-render` dock). Returns the
 * view handle so callers can build a dock ref from it.
 */
export function createDashboardView(ctx: DevframeNodeContext): JsonRenderView {
  const view = createJsonRenderView(ctx, { id: VIEW_ID, title: 'Dashboard', spec: dashboardSpec })

  // The action bridge dispatches a spec action as an RPC call of the same
  // name. `Refresh` re-samples the metrics.
  ctx.rpc.register(defineRpcFunction({
    name: REFRESH_ACTION,
    type: 'query',
    jsonSerializable: true,
    handler: () => {
      const coverage = 70 + Math.floor(Math.random() * 30)
      const bundle = 40 + Math.floor(Math.random() * 55)
      view.patchState([
        { op: 'replace', path: '/metrics/coverage', value: coverage },
        { op: 'replace', path: '/metrics/bundle', value: bundle },
      ])
      return { coverage, bundle }
    },
  }))

  // `Deploy` flips the DataTable into a loading state, then appends a module —
  // demonstrating the per-action loading + a live spec/state change.
  let deployed = 0
  ctx.rpc.register(defineRpcFunction({
    name: DEPLOY_ACTION,
    type: 'query',
    jsonSerializable: true,
    handler: () => {
      view.patchState([{ op: 'replace', path: '/building', value: true }])
      setTimeout(() => {
        deployed += 1
        const modules = [
          ...(view.value().state?.modules as unknown[] ?? []),
          { name: `@acme/edge-${deployed}`, size: '9 kB', status: 'ok' },
        ]
        view.patchState([
          { op: 'replace', path: '/modules', value: modules },
          { op: 'replace', path: '/building', value: false },
        ])
      }, 1200)
      return { building: true }
    },
  }))

  // `Save` receives the bound form values as params (resolved client-side from
  // `$state`) and writes the display name into the project metadata.
  ctx.rpc.register(defineRpcFunction({
    name: SAVE_ACTION,
    type: 'query',
    jsonSerializable: true,
    handler: (params?: { name?: string }) => {
      const name = params?.name?.trim()
      if (name)
        view.patchState([{ op: 'replace', path: '/project/name', value: name }])
      return { saved: true }
    },
  }))

  // Live, server-driven state: tick uptime every second in dev. Unref the
  // timer so it never keeps a one-shot `build` run alive.
  if (ctx.mode === 'dev') {
    let uptime = 0
    const timer = setInterval(() => {
      uptime += 1
      view.patchState([{ op: 'replace', path: '/uptime', value: uptime }])
    }, 1000)
    timer.unref?.()
  }

  return view
}
