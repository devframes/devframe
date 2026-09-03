<script setup lang="ts">
/**
 * Interactive "what should I read" wizard for the Getting Started guide.
 *
 * Every question is a grid of selectable cards (multiple answers allowed per
 * question, since a real devtool usually spans more than one answer: for
 * example, it reads from both the node side and the user's web app). Selections
 * persist to `localStorage` so a reader can leave the page and pick up where
 * they left off; the recommended reading list at the bottom recomputes from
 * whatever is currently checked.
 */

interface WizardItem {
  value: string
  label: string
  icon: string
  /** Accent color key from `ITEM_COLORS`, applied once the item is selected. */
  color: keyof typeof ITEM_COLORS
  description?: string
}

/**
 * Per-item accent colors, applied only to a *selected* card (its badge, plus
 * the card's border/background/ring); unselected cards stay neutral gray.
 * Spelled out as full class strings (not interpolated) so Tailwind's scanner
 * keeps them in the build.
 */
const ITEM_COLORS = {
  sky: { badge: 'bg-sky-500/10 text-sky-500', card: 'border-sky-500/60 bg-sky-500/5 ring-1 ring-sky-500/20' },
  indigo: { badge: 'bg-indigo-500/10 text-indigo-500', card: 'border-indigo-500/60 bg-indigo-500/5 ring-1 ring-indigo-500/20' },
  violet: { badge: 'bg-violet-500/10 text-violet-500', card: 'border-violet-500/60 bg-violet-500/5 ring-1 ring-violet-500/20' },
  purple: { badge: 'bg-purple-500/10 text-purple-500', card: 'border-purple-500/60 bg-purple-500/5 ring-1 ring-purple-500/20' },
  fuchsia: { badge: 'bg-fuchsia-500/10 text-fuchsia-500', card: 'border-fuchsia-500/60 bg-fuchsia-500/5 ring-1 ring-fuchsia-500/20' },
  pink: { badge: 'bg-pink-500/10 text-pink-500', card: 'border-pink-500/60 bg-pink-500/5 ring-1 ring-pink-500/20' },
  rose: { badge: 'bg-rose-500/10 text-rose-500', card: 'border-rose-500/60 bg-rose-500/5 ring-1 ring-rose-500/20' },
  amber: { badge: 'bg-amber-500/10 text-amber-500', card: 'border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20' },
  orange: { badge: 'bg-orange-500/10 text-orange-500', card: 'border-orange-500/60 bg-orange-500/5 ring-1 ring-orange-500/20' },
  emerald: { badge: 'bg-emerald-500/10 text-emerald-500', card: 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/20' },
  teal: { badge: 'bg-teal-500/10 text-teal-500', card: 'border-teal-500/60 bg-teal-500/5 ring-1 ring-teal-500/20' },
  cyan: { badge: 'bg-cyan-500/10 text-cyan-500', card: 'border-cyan-500/60 bg-cyan-500/5 ring-1 ring-cyan-500/20' },
  blue: { badge: 'bg-blue-500/10 text-blue-500', card: 'border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/20' },
  green: { badge: 'bg-green-500/10 text-green-500', card: 'border-green-500/60 bg-green-500/5 ring-1 ring-green-500/20' },
} as const

interface WizardSection {
  key: string
  title: string
  hint: string
  icon: string
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
    key: 'environments',
    title: 'Target environments',
    hint: 'What do you expect your tool to work with?',
    icon: 'i-lucide-target',
    items: [
      { value: 'standalone', label: 'Standalone', icon: 'i-lucide-terminal', color: 'sky', description: 'A CLI or dev server with no host framework' },
      { value: 'framework', label: 'Specific framework', icon: 'i-lucide-shapes', color: 'violet', description: 'Specifically for frameworks like Vite, Next.js, Nuxt, etc.' },
      { value: 'all', label: 'All frameworks', icon: 'i-lucide-infinity', color: 'emerald', description: 'I want to support as many frameworks as possible' },
    ],
  },
  {
    key: 'dataSource',
    title: 'Data source',
    hint: 'Where do you want to visualize data from?',
    icon: 'i-lucide-database',
    items: [
      { value: 'node', label: 'The node side', icon: 'i-lucide-server', color: 'indigo', description: 'Server state, build output, the filesystem, child processes' },
      { value: 'browser', label: 'The user\'s web app', icon: 'i-lucide-app-window', color: 'cyan', description: 'State living in the page you\'re developing' },
    ],
  },
  {
    key: 'availability',
    title: 'Data availability',
    hint: 'When is the data available?',
    icon: 'i-lucide-clock',
    items: [
      { value: 'dev', label: 'Development time', icon: 'i-lucide-code', color: 'blue', description: 'Live, over a running dev server' },
      { value: 'build', label: 'Production build time', icon: 'i-lucide-hammer', color: 'amber', description: 'Data from the production build' },
      { value: 'static', label: 'Statically available', icon: 'i-lucide-hard-drive', color: 'teal', description: 'Local filesystem, uploaded files, etc.' },
      { value: 'remote', label: 'Remotely', icon: 'i-lucide-cloud', color: 'sky', description: 'Over the web' },
    ],
  },
  {
    key: 'frontend',
    title: 'Frontend approach',
    hint: 'How do you want to build the frontend view?',
    icon: 'i-lucide-palette',
    items: [
      { value: 'framework', label: 'A preferred framework', icon: 'i-lucide-component', color: 'green', description: 'Vue, React, Svelte, Solid...' },
      { value: 'webcomponents', label: 'Web Components', icon: 'i-lucide-box', color: 'orange', description: 'Use Web Components for renderering' },
      { value: 'nodeside', label: 'Build it on the node side', icon: 'i-lucide-braces', color: 'purple', description: 'Describe the UI as data instead of shipping a bundle' },
    ],
  },
  {
    key: 'requirements',
    title: 'Other requirements',
    hint: 'Any specific requirements?',
    icon: 'i-lucide-list-checks',
    items: [
      { value: 'agent', label: 'Exposed to coding agents', icon: 'i-lucide-bot', color: 'pink', description: 'Some functionality should be available to coding agents.' },
      { value: 'terminal', label: 'Sub process access', icon: 'i-lucide-square-terminal', color: 'amber', description: 'Need to spawn other child process from the node side' },
      { value: 'streaming', label: 'Streaming data', icon: 'i-lucide-radio', color: 'rose', description: 'Push chunk-style data from the node side to the browser side' },
      { value: 'deep-linking', label: 'Deep linking', icon: 'i-lucide-link', color: 'cyan', description: 'Shareable URLs into a specific view' },
      { value: 'overlay', label: 'User app overlay', icon: 'i-lucide-layers', color: 'fuchsia', description: 'I want to overlay a UI on top of the user\'s web app' },
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
  '/guide/client-assets': { title: 'Client Assets', description: 'Where a devframe\'s built SPA lives: a local directory or an npm package.', icon: 'i-lucide-folder-tree' },
  '/guide/client': { title: 'Client', description: 'Connects any surface to a devframe\'s node side with RPC and shared state.', icon: 'i-lucide-plug' },
  '/guide/transports': { title: 'Transports', description: 'Live RPC over WebSocket or SSE, transparent to your RPC code.', icon: 'i-lucide-waypoints' },
  '/guide/security': { title: 'Security', description: 'Localhost binding and a trust handshake before a browser can call RPC.', icon: 'i-lucide-shield-check' },
  '/guide/agent-native': { title: 'Agent-Native Devframe', description: 'Expose RPC functions, resources, and shared state to coding agents over MCP.', icon: 'i-lucide-bot' },
  '/guide/hub': { title: 'Hub', description: 'Orchestrate many devtools sharing one UI: docks, terminals, messages, commands.', icon: 'i-lucide-layout-dashboard' },
  '/guide/client-context': { title: 'Client Scripts & Client Context', description: 'How a dock client script runs a devframe\'s code inside the host page.', icon: 'i-lucide-code' },
  '/guide/hub-initiate': { title: 'Serve a Hub Anywhere', description: 'initHub() serves a whole multi-devframe install from one handler.', icon: 'i-lucide-server-cog' },
  '/guide/services': { title: 'Cross-Devframe Services', description: 'Expose a typed, namespaced capability to every devframe in a hub.', icon: 'i-lucide-share-2' },
  '/guide/deep-linking': { title: 'Deep Linking', description: 'Send a user to a specific view inside a devframe from a URL or an agent.', icon: 'i-lucide-link' },
  '/guide/json-render': { title: 'JSON-Render', description: 'Describe a UI as data: a serializable component spec any frontend renders.', icon: 'i-lucide-braces' },
  '/guide/build-your-own-json-render-frontend': { title: 'Build Your Own JSON-Render Frontend', description: 'Implement the renderer contract in your own framework instead of the reference one.', icon: 'i-lucide-component' },
  '/guide/build-your-own-hub-ui': { title: 'Build Your Own Hub UI', description: 'The two contracts a hub UI provider implements: node side and browser side.', icon: 'i-lucide-layout-panel-left' },
  '/guide/standalone-cli': { title: 'Standalone CLI with Devframe', description: 'npx my-tool starts a dev server serving your SPA over type-safe RPC.', icon: 'i-lucide-terminal' },
  '/references/interactive-auth': { title: 'Interactive Auth', description: 'An OTP auth layer over devframe\'s node-side primitives.', icon: 'i-lucide-key-round' },
  '/references/utilities': { title: 'Utilities', description: 'Small, stable helpers bundled into devframe, no npm install.', icon: 'i-lucide-wrench' },
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
  '/add-ons/devframes/a11y': { title: 'Accessibility Inspector', description: 'Runs axe-core against the user app and highlights violations in the page.', icon: 'i-lucide-accessibility' },
  '/add-ons/devframes/terminals': { title: 'Terminals', description: 'A terminal panel built on xterm.js.', icon: 'i-lucide-square-terminal' },
}

/** Always worth reading, regardless of what's checked above. */
const BASE_DOCS = ['/guide', '/guide/devframe-definition', '/guide/tutorial-server-data-inspector']

/** `${section.key}:${item.value}` -> doc routes that answer is worth reading. */
const RECOMMENDATIONS: Record<string, string[]> = {
  'dataSource:node': ['/guide/rpc', '/guide/shared-state', '/references/utilities'],
  'dataSource:browser': ['/guide/client-context', '/guide/deep-linking', '/add-ons/devframes/a11y'],

  'environments:standalone': ['/guide/standalone-cli', '/adapters/cac', '/adapters/build'],
  'environments:framework': ['/adapters'],
  'environments:all': ['/adapters/initiate', '/adapters', '/guide/devframe-definition'],

  'availability:dev': ['/guide/rpc', '/guide/transports'],
  'availability:build': ['/adapters/build', '/guide/client-assets'],
  'availability:static': ['/adapters/build', '/references/utilities'],
  'availability:remote': ['/guide/transports', '/guide/security'],

  'frontend:framework': ['/guide/client-assets', '/guide/client'],
  'frontend:webcomponents': ['/guide/hub', '/guide/build-your-own-hub-ui'],
  'frontend:nodeside': ['/guide/json-render', '/guide/build-your-own-json-render-frontend'],

  'requirements:agent': ['/guide/agent-native', '/adapters/mcp'],
  'requirements:terminal': ['/add-ons/devframes/terminals'],
  'requirements:streaming': ['/guide/streaming'],
  'requirements:deep-linking': ['/guide/deep-linking'],
  'requirements:overlay': ['/guide/client-context', '/add-ons/devframes/a11y'],
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

// --- Prompt composition -----------------------------------------------------

const appConfig = useAppConfig()
const assistantEnabled = computed(() => Boolean((appConfig as { assistant?: { enabled?: boolean } }).assistant?.enabled))

const site = useSiteConfig()
/** Absolute base for doc links in the copyable prompt (external LLMs need full URLs). */
const siteOrigin = computed(() => (site.url || 'https://devfra.me').replace(/\/$/, ''))

/** One "Section: label, label" line per answered question. */
function selectionLines(): string[] {
  const lines: string[] = []
  for (const section of sections) {
    const chosen = section.items.filter(item => selections[section.key]!.includes(item.value))
    if (chosen.length)
      lines.push(`- ${section.title}: ${chosen.map(item => item.label).join(', ')}`)
  }
  return lines
}

/**
 * Prompt for the in-docs Ask AI assistant. It already has the docs as tools
 * (search/read), so this stays concise and leans on those.
 */
function buildAssistantPrompt(): string {
  const lines = selectionLines()
  const intro = lines.length
    ? `I want to build a devtool with Devframe. Here's what I have in mind:\n${lines.join('\n')}`
    : `I want to get started building a devtool with Devframe.`
  return `${intro}\n\nWhich Devframe features fit this, and what should I know to build it? Point me to the docs worth reading.`
}

/**
 * Prompt for pasting into any external LLM. It has no Devframe context, so this
 * bundles a short description, the intent, and absolute links to every
 * recommended doc.
 */
function buildCopyPrompt(): string {
  const origin = siteOrigin.value
  const lines = selectionLines()
  const docs = recommendedDocs.value.map(doc => `- ${doc.title} (${origin}${doc.path}): ${doc.description}`)
  return [
    `I'm building a developer tool with Devframe (${origin}).`,
    '',
    'Devframe is a framework-neutral foundation for building a devtool once and running it anywhere: mounted inside any host framework (Vite, Nuxt, Next.js, …), as a standalone CLI or a static build, or exposed to coding agents over MCP. A devframe pairs a node side with a browser side over type-safe RPC and shared state, and ships its UI as a built SPA.',
    '',
    lines.length ? `What I want to build:\n${lines.join('\n')}` : 'I am just getting started and want a solid foundation.',
    '',
    'Please help me design and implement this with Devframe. Relevant documentation:',
    ...docs,
    '',
    'Which Devframe primitives fit this, and what should I know to build it?',
  ].join('\n')
}

const assistantPrompt = useAssistantPrompt()
const assistantOpen = useAssistant()

function askAI(): void {
  assistantPrompt.value = buildAssistantPrompt()
  assistantOpen.value = true
}

const promptCopied = ref(false)
async function copyPrompt(): Promise<void> {
  try {
    await navigator.clipboard.writeText(buildCopyPrompt())
    promptCopied.value = true
    setTimeout(() => (promptCopied.value = false), 1500)
  }
  catch {
    // Clipboard unavailable (e.g. insecure context) - ignore.
  }
}
</script>

<template>
  <div class="not-prose rounded-xl border border-default divide-y divide-default overflow-hidden">
    <div class="flex items-center justify-between gap-4 px-5 py-3 sm:px-6 bg-muted">
      <div>
        <p class="font-medium text-highlighted">
          What kind of devtool do you want to build?
        </p>
        <p class="text-sm text-muted mt-0.5">
          Multi-select, check whatever applies (selection persists in localStorage)
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
      class="px-5 py-4 sm:px-6"
    >
      <div class="flex flex-wrap items-baseline gap-x-2 mb-3">
        <p class="flex items-center gap-2 font-medium text-highlighted">
          <UIcon :name="section.icon" class="size-4 text-muted" />
          {{ section.hint }}
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        <button
          v-for="item in section.items"
          :key="item.value"
          type="button"
          role="checkbox"
          :aria-checked="isChecked(section.key, item.value)"
          class="relative flex items-center gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer"
          :class="isChecked(section.key, item.value)
            ? ITEM_COLORS[item.color].card
            : 'border-default hover:border-accented hover:bg-elevated/50'"
          @click="toggle(section.key, item.value)"
        >
          <span
            class="inline-flex items-center justify-center size-8 shrink-0 rounded-full transition-colors"
            :class="isChecked(section.key, item.value) ? ITEM_COLORS[item.color].badge : 'bg-elevated text-muted'"
          >
            <UIcon :name="item.icon" class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-highlighted">{{ item.label }}</span>
            <span
              v-if="item.description"
              class="block text-xs text-muted mt-0.5"
            >{{ item.description }}</span>
          </span>
        </button>
      </div>
    </div>

    <div class="px-5 py-4 sm:px-6 bg-muted">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p class="font-medium text-highlighted">
          {{ hasSelections ? 'Recommended docs, based on your answers' : 'Start here' }}
        </p>
        <div class="flex items-center gap-2">
          <UButton
            v-if="assistantEnabled"
            label="Ask AI"
            icon="i-lucide-sparkles"
            color="primary"
            size="sm"
            class="cursor-pointer"
            @click="askAI"
          />
          <UButton
            :label="promptCopied ? 'Copied!' : 'Copy prompt'"
            :icon="promptCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="outline"
            size="sm"
            class="cursor-pointer"
            @click="copyPrompt"
          />
        </div>
      </div>
      <div class="flex flex-col divide-y divide-default rounded-lg border border-default overflow-hidden bg-default">
        <NuxtLink
          v-for="doc in recommendedDocs"
          :key="doc.path"
          :to="doc.path"
          class="group flex items-center gap-3 p-3 transition-colors hover:bg-elevated/50"
        >
          <span class="inline-flex items-center justify-center size-8 shrink-0 rounded-full bg-elevated text-muted">
            <UIcon :name="doc.icon" class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-highlighted">{{ doc.title }}</span>
            <span class="block text-xs text-muted mt-0.5">{{ doc.description }}</span>
          </span>
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4 shrink-0 text-dimmed transition-transform group-hover:translate-x-0.5 group-hover:text-muted"
          />
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
