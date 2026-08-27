<script setup lang="ts">
/**
 * Interactive "what should I read" wizard for the Getting Started guide.
 *
 * Every question is a grid of selectable cards (multiple answers allowed per
 * question, since a real devtool usually spans more than one answer — e.g.
 * it reads from both the node side and the user's web app). Selections
 * persist to `localStorage` so a reader can leave the page and pick up where
 * they left off; the recommended reading list at the bottom recomputes from
 * whatever is currently checked.
 */

interface WizardItem {
  value: string
  label: string
  icon: string
  description?: string
}

interface WizardSection {
  key: string
  title: string
  hint: string
  items: WizardItem[]
}

interface DocEntry {
  title: string
  description: string
  icon: string
}

const STORAGE_KEY = 'devframe-docs:getting-started'

const sections: WizardSection[] = [
  {
    key: 'dataSource',
    title: 'Data source',
    hint: 'Where do you want to visualize data from?',
    items: [
      { value: 'node', label: 'The node side', icon: 'i-lucide-server', description: 'Server state, build output, the filesystem, child processes' },
      { value: 'browser', label: 'The user\'s web app', icon: 'i-lucide-app-window', description: 'State living in the page you\'re developing' },
    ],
  },
  {
    key: 'environments',
    title: 'Target environments',
    hint: 'What do you expect your tool to work with?',
    items: [
      { value: 'standalone', label: 'Standalone', icon: 'i-lucide-terminal', description: 'A CLI or dev server with no host framework' },
      { value: 'vite', label: 'Vite', icon: 'i-simple-icons-vite' },
      { value: 'next', label: 'Next.js', icon: 'i-simple-icons-nextdotjs' },
      { value: 'framework', label: 'A specific framework', icon: 'i-lucide-puzzle', description: 'Nuxt, or a host framework the kits don\'t cover yet' },
      { value: 'all', label: 'All frameworks', icon: 'i-lucide-infinity', description: 'Anything that speaks a Web Standard Request/Response' },
    ],
  },
  {
    key: 'availability',
    title: 'Data availability',
    hint: 'When is the data available?',
    items: [
      { value: 'dev', label: 'Development time', icon: 'i-lucide-code', description: 'Live, over a running dev server' },
      { value: 'build', label: 'Production build time', icon: 'i-lucide-hammer' },
      { value: 'static', label: 'Statically available', icon: 'i-lucide-hard-drive', description: 'Local filesystem, a static dump, etc.' },
      { value: 'remote', label: 'Remotely', icon: 'i-lucide-cloud', description: 'Over the web, not on localhost' },
    ],
  },
  {
    key: 'frontend',
    title: 'Frontend approach',
    hint: 'How do you want to build the frontend view?',
    items: [
      { value: 'framework', label: 'A preferred framework', icon: 'i-lucide-component', description: 'Vue, React, Svelte, Solid...' },
      { value: 'webcomponents', label: 'Web Components', icon: 'i-lucide-box' },
      { value: 'nodeside', label: 'Build it on the node side', icon: 'i-lucide-braces', description: 'Describe the UI as data instead of shipping a bundle' },
    ],
  },
  {
    key: 'agent',
    title: 'Agent support',
    hint: 'Should it also work with a coding agent?',
    items: [
      { value: 'agent', label: 'Yes, expose it to a coding agent', icon: 'i-lucide-bot', description: 'Same RPC functions, resources, and state, over MCP' },
    ],
  },
  {
    key: 'requirements',
    title: 'Other requirements',
    hint: 'Any specific requirements?',
    items: [
      { value: 'streaming', label: 'Streaming data', icon: 'i-lucide-radio' },
      { value: 'overlay', label: 'An overlay on the user\'s web app', icon: 'i-lucide-layers' },
      { value: 'hub', label: 'Composing with other devtools', icon: 'i-lucide-layout-dashboard', description: 'One UI, many devframes' },
      { value: 'security', label: 'Authentication', icon: 'i-lucide-shield-check' },
      { value: 'deep-linking', label: 'Deep linking', icon: 'i-lucide-link', description: 'Shareable URLs into a specific view' },
      { value: 'terminal', label: 'Terminal / process access', icon: 'i-lucide-square-terminal' },
    ],
  },
]

/** Every doc a recommendation can point at, keyed by its route. */
const DOC_CATALOG: Record<string, DocEntry> = {
  '/guide': { title: 'Introduction', description: 'What devframe is and who it\'s for.', icon: 'i-lucide-book-open' },
  '/guide/devframe-definition': { title: 'Devframe Definition', description: 'One defineDevframe() call returns a portable definition every adapter consumes.', icon: 'i-lucide-package' },
  '/guide/tutorial-server-data-inspector': { title: 'Tutorial: Build a Server Data Inspector', description: 'Build a devtool end to end, then ship it as a hub dock, a static build, a dev server, and a CLI.', icon: 'i-lucide-graduation-cap' },
  '/guide/rpc': { title: 'RPC', description: 'Type-safe, bidirectional calls between the node side and the browser side.', icon: 'i-lucide-cable' },
  '/guide/shared-state': { title: 'Shared State', description: 'Observable state synced between the node side and every RPC client.', icon: 'i-lucide-refresh-cw' },
  '/guide/streaming': { title: 'Streaming', description: 'Push chunk-style data from the node side to the browser side.', icon: 'i-lucide-radio' },
  '/guide/client-assets': { title: 'Client Assets', description: 'Where a devframe\'s built SPA lives — a local directory or an npm package.', icon: 'i-lucide-folder-tree' },
  '/guide/client': { title: 'Client', description: 'Connects any surface to a devframe\'s node side with RPC and shared state.', icon: 'i-lucide-plug' },
  '/guide/transports': { title: 'Transports', description: 'Live RPC over WebSocket or SSE, transparent to your RPC code.', icon: 'i-lucide-waypoints' },
  '/guide/security': { title: 'Security', description: 'Localhost binding and a trust handshake before a browser can call RPC.', icon: 'i-lucide-shield-check' },
  '/guide/agent-native': { title: 'Agent-Native Devframe', description: 'Expose RPC functions, resources, and shared state to coding agents over MCP.', icon: 'i-lucide-bot' },
  '/guide/hub': { title: 'Hub', description: 'Orchestrate many devtools sharing one UI — docks, terminals, messages, commands.', icon: 'i-lucide-layout-dashboard' },
  '/guide/client-context': { title: 'Client Scripts & Client Context', description: 'How a dock client script runs a devframe\'s code inside the host page.', icon: 'i-lucide-code' },
  '/guide/hub-initiate': { title: 'Serve a Hub Anywhere', description: 'initHub() serves a whole multi-devframe install from one handler.', icon: 'i-lucide-server-cog' },
  '/guide/services': { title: 'Cross-Devframe Services', description: 'Expose a typed, namespaced capability to every devframe in a hub.', icon: 'i-lucide-share-2' },
  '/guide/deep-linking': { title: 'Deep Linking', description: 'Send a user to a specific view inside a devframe from a URL or an agent.', icon: 'i-lucide-link' },
  '/guide/json-render': { title: 'JSON-Render', description: 'Describe a UI as data — a serializable component spec any frontend renders.', icon: 'i-lucide-braces' },
  '/guide/build-your-own-json-render-frontend': { title: 'Build Your Own JSON-Render Frontend', description: 'Implement the renderer contract in your own framework instead of the reference one.', icon: 'i-lucide-component' },
  '/guide/build-your-own-hub-ui': { title: 'Build Your Own Hub UI', description: 'The two contracts a hub UI provider implements — node side and browser side.', icon: 'i-lucide-layout-panel-left' },
  '/guide/standalone-cli': { title: 'Standalone CLI with Devframe', description: 'npx my-tool starts a dev server serving your SPA over type-safe RPC.', icon: 'i-lucide-terminal' },
  '/helpers/interactive-auth': { title: 'Interactive Auth', description: 'An OTP auth layer over devframe\'s node-side primitives.', icon: 'i-lucide-key-round' },
  '/helpers/utilities': { title: 'Utilities', description: 'Small, stable helpers bundled into devframe — no npm install.', icon: 'i-lucide-wrench' },
  '/adapters': { title: 'Adapters', description: 'Every path from a DevframeDefinition to a running devframe.', icon: 'i-lucide-shuffle' },
  '/adapters/initiate': { title: 'The Standard Handler', description: 'initDevframe() turns a definition into a Web Standard Request → Response handler.', icon: 'i-lucide-server' },
  '/adapters/cac': { title: 'CLI (cac)', description: 'A cac CLI around a DevframeDefinition with dev, build, and mcp commands.', icon: 'i-lucide-square-terminal' },
  '/adapters/build': { title: 'Build', description: 'Produces a static deploy of a devframe.', icon: 'i-lucide-hammer' },
  '/adapters/vite': { title: 'Vite (adapter)', description: 'Wraps a definition so Vite DevTools\' plugin-scan picks it up.', icon: 'i-lucide-zap' },
  '/adapters/embedded': { title: 'Embedded', description: 'Register a devframe into an already-running context at runtime.', icon: 'i-lucide-plug-zap' },
  '/adapters/mcp': { title: 'MCP', description: 'Exposes a devframe\'s agent-facing API as a Model Context Protocol server.', icon: 'i-lucide-bot' },
  '/frameworks': { title: 'Frameworks', description: 'Framework kits that integrate devframe with a meta-framework\'s dev server.', icon: 'i-lucide-blocks' },
  '/frameworks/vite': { title: 'Vite', description: 'Author one devframe\'s SPA, or mount a whole hub, from a Vite plugin.', icon: 'i-simple-icons-vite' },
  '/frameworks/next': { title: 'Next', description: 'Host devframes from a Next.js App Router app via a route handler.', icon: 'i-simple-icons-nextdotjs' },
  '/frameworks/nuxt': { title: 'Nuxt', description: 'A Nuxt module split into authoring one devframe or mounting a hub.', icon: 'i-simple-icons-nuxtdotjs' },
  '/plugins/a11y': { title: 'Accessibility Inspector', description: 'Runs axe-core against the user app and highlights violations in the page.', icon: 'i-lucide-accessibility' },
  '/plugins/terminals': { title: 'Terminals', description: 'A terminal panel built on xterm.js.', icon: 'i-lucide-square-terminal' },
}

/** Always worth reading, regardless of what's checked above. */
const BASE_DOCS = ['/guide', '/guide/devframe-definition', '/guide/tutorial-server-data-inspector']

/** `${section.key}:${item.value}` -> doc routes that answer is worth reading. */
const RECOMMENDATIONS: Record<string, string[]> = {
  'dataSource:node': ['/guide/rpc', '/guide/shared-state', '/helpers/utilities'],
  'dataSource:browser': ['/guide/client-context', '/guide/deep-linking', '/plugins/a11y'],

  'environments:standalone': ['/guide/standalone-cli', '/adapters/cac', '/adapters/build'],
  'environments:vite': ['/frameworks/vite', '/adapters/vite'],
  'environments:next': ['/frameworks/next'],
  'environments:framework': ['/frameworks/nuxt', '/adapters/embedded'],
  'environments:all': ['/adapters/initiate', '/adapters', '/guide/devframe-definition'],

  'availability:dev': ['/guide/rpc', '/guide/transports'],
  'availability:build': ['/adapters/build', '/guide/client-assets'],
  'availability:static': ['/adapters/build', '/helpers/utilities'],
  'availability:remote': ['/guide/transports', '/guide/security'],

  'frontend:framework': ['/guide/client-assets', '/guide/client'],
  'frontend:webcomponents': ['/guide/hub', '/guide/build-your-own-hub-ui'],
  'frontend:nodeside': ['/guide/json-render', '/guide/build-your-own-json-render-frontend'],

  'agent:agent': ['/guide/agent-native', '/adapters/mcp'],

  'requirements:streaming': ['/guide/streaming'],
  'requirements:overlay': ['/guide/client-context', '/plugins/a11y'],
  'requirements:hub': ['/guide/hub', '/guide/hub-initiate', '/guide/services'],
  'requirements:security': ['/guide/security', '/helpers/interactive-auth'],
  'requirements:deep-linking': ['/guide/deep-linking'],
  'requirements:terminal': ['/plugins/terminals'],
}

const selections = reactive<Record<string, string[]>>(
  Object.fromEntries(sections.map(section => [section.key, [] as string[]])),
)

onMounted(() => {
  if (!import.meta.client)
    return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return
    const saved = JSON.parse(raw) as Record<string, unknown>
    for (const section of sections) {
      const values = saved[section.key]
      if (!Array.isArray(values))
        continue
      const known = new Set(section.items.map(item => item.value))
      selections[section.key] = values.filter((value): value is string => typeof value === 'string' && known.has(value))
    }
  }
  catch {
    // Corrupt or inaccessible storage - fall back to a clean slate.
  }
})

watch(selections, (value) => {
  if (!import.meta.client)
    return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}, { deep: true })

function isChecked(sectionKey: string, value: string): boolean {
  return selections[sectionKey]!.includes(value)
}

function toggle(sectionKey: string, value: string): void {
  const current = selections[sectionKey]!
  const index = current.indexOf(value)
  if (index === -1)
    current.push(value)
  else
    current.splice(index, 1)
}

const hasSelections = computed(() => sections.some(section => selections[section.key]!.length > 0))

const recommendedDocs = computed(() => {
  const paths = new Set(BASE_DOCS)
  for (const section of sections) {
    for (const value of selections[section.key]!) {
      for (const path of RECOMMENDATIONS[`${section.key}:${value}`] ?? [])
        paths.add(path)
    }
  }
  return [...paths]
    .filter(path => path in DOC_CATALOG)
    .map(path => ({ path, ...DOC_CATALOG[path]! }))
})

function reset(): void {
  for (const section of sections) selections[section.key] = []
}
</script>

<template>
  <div class="not-prose rounded-xl border border-default divide-y divide-default overflow-hidden">
    <div class="flex items-center justify-between gap-4 px-5 py-4 sm:px-6 bg-muted">
      <div>
        <p class="font-medium text-highlighted">
          What kind of devtool do you want to build?
        </p>
        <p class="text-sm text-muted mt-0.5">
          Check whatever applies — answers save in your browser.
        </p>
      </div>
      <UButton
        label="Reset"
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="!hasSelections"
        class="cursor-pointer shrink-0"
        @click="reset"
      />
    </div>

    <div
      v-for="section in sections"
      :key="section.key"
      class="p-5 sm:p-6"
    >
      <p class="font-medium text-highlighted">
        {{ section.title }}
      </p>
      <p class="text-sm text-muted mt-0.5 mb-4">
        {{ section.hint }}
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          v-for="item in section.items"
          :key="item.value"
          type="button"
          role="checkbox"
          :aria-checked="isChecked(section.key, item.value)"
          class="relative flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors cursor-pointer"
          :class="isChecked(section.key, item.value)
            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
            : 'border-default hover:border-accented hover:bg-elevated/50'"
          @click="toggle(section.key, item.value)"
        >
          <UIcon
            v-if="isChecked(section.key, item.value)"
            name="i-lucide-circle-check"
            class="absolute top-3 right-3 size-4 text-primary"
          />
          <span
            class="inline-flex items-center justify-center size-9 rounded-full transition-colors"
            :class="isChecked(section.key, item.value) ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
          >
            <UIcon :name="item.icon" class="size-4.5" />
          </span>
          <span>
            <span class="block text-sm font-medium text-highlighted pe-4">{{ item.label }}</span>
            <span
              v-if="item.description"
              class="block text-xs text-muted mt-0.5"
            >{{ item.description }}</span>
          </span>
        </button>
      </div>
    </div>

    <div class="p-5 sm:p-6 bg-muted">
      <p class="font-medium text-highlighted mb-3">
        {{ hasSelections ? 'Recommended docs, based on your answers' : 'Start here' }}
      </p>
      <UPageList divide>
        <UPageCard
          v-for="doc in recommendedDocs"
          :key="doc.path"
          :to="doc.path"
          :icon="doc.icon"
          :title="doc.title"
          :description="doc.description"
          orientation="horizontal"
          variant="ghost"
          :ui="{ container: 'p-3 sm:p-3', leadingIcon: 'size-5' }"
        />
      </UPageList>
    </div>
  </div>
</template>
