<script setup lang="ts">
import type { HighlighterCore } from 'shiki/core'
import { ShikiMagicMove } from '@shikijs/magic-move/vue'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

interface Example {
  code: string
  icon?: string
  id: string
  image?: string
  label: string
}

const examples: Example[] = [
  {
    id: 'nitro',
    label: 'Nitro',
    icon: 'i-unjs-nitro',
    code: `// routes/__my-tool/[...path].ts
import { defineHandler } from 'nitro'
import { devtools } from '../devtools'

export default defineHandler(event =>
  devtools.handler(event.req),
)`,
  },
  {
    id: 'hono',
    label: 'Hono',
    icon: 'i-logos-hono',
    code: `// server.ts
import { Hono } from 'hono'
import { devtools } from './devtools'

const app = new Hono()

app.all(devtools.base + '*', c =>
  devtools.handler(c.req.raw),
)`,
  },
  {
    id: 'next',
    label: 'Next.js',
    icon: 'i-logos-nextjs-icon',
    code: `// app/%5F_my-tool/[[...path]]/route.ts
import { devtools } from '@/devtools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = devtools.handler
export const POST = devtools.handler`,
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    icon: 'i-logos-svelte-icon',
    code: `// src/routes/%5F_my-tool/[...path]/+server.ts
import { devtools } from '$lib/devtools'

export const GET = ({ request }) => devtools.handler(request)
export const POST = ({ request }) => devtools.handler(request)`,
  },
  {
    id: 'vite',
    label: 'Vite',
    image: '/images/devframe/vite.svg',
    code: `// my-plugin.ts
import { initDevframe } from 'devframe/initiate'
import devframe from './devframe'

export default {
  configureServer(server) {
    const devtools = initDevframe(devframe, {
      base: '/__my-tool/',
      server: server.httpServer,
    })
    server.middlewares.use(devtools.nodeMiddleware)
  },
}`,
  },
  {
    id: 'rsbuild',
    label: 'Rsbuild',
    image: '/images/devframe/rsbuild.svg',
    code: `// rsbuild.config.ts
import { initDevframe } from 'devframe/initiate'
import devframe from './devframe'

export default defineConfig({
  server: {
    setup({ server }) {
      const devtools = initDevframe(devframe, {
        base: '/__my-tool/',
        ws: { sidecar: true },
      })
      server.middlewares.use(devtools.nodeMiddleware)
    },
  },
})`,
  },
]

const selected = ref('hono')
const current = computed(() => examples.find(example => example.id === selected.value)!)
const colorMode = useColorMode()
const highlighter = shallowRef<HighlighterCore>()
const shikiTheme = computed(() => colorMode.value === 'dark' ? 'vitesse-dark' : 'vitesse-light')

let disposed = false

onMounted(async () => {
  const instance = await createHighlighterCore({
    themes: [
      import('shiki/themes/vitesse-dark.mjs'),
      import('shiki/themes/vitesse-light.mjs'),
    ],
    langs: [import('shiki/langs/typescript.mjs')],
    engine: createJavaScriptRegexEngine(),
  })

  if (disposed)
    instance.dispose()
  else
    highlighter.value = instance
})

onBeforeUnmount(() => {
  disposed = true
  highlighter.value?.dispose()
})
</script>

<template>
  <PostDiagramFrame
    title-id="devframe-mount-examples-title"
    title="The same handler, mounted natively"
    subtitle="Only the host-framework glue changes"
  >
    <div
      role="tablist"
      aria-label="Host framework examples"
      class="flex flex-wrap gap-1.5 border-b border-default px-4 py-3 sm:px-6"
    >
      <button
        v-for="example of examples"
        :id="`mount-tab-${example.id}`"
        :key="example.id"
        type="button"
        role="tab"
        :aria-selected="selected === example.id"
        :aria-controls="`mount-panel-${example.id}`"
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
        :class="selected === example.id
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-default text-muted hover:bg-elevated hover:text-highlighted'"
        @click="selected = example.id"
      >
        <img
          v-if="example.image"
          :src="example.image"
          alt=""
          class="size-3.5 object-contain"
        >
        <UIcon
          v-else
          :name="example.icon!"
          class="size-3.5"
        />
        {{ example.label }}
      </button>
    </div>

    <ShikiMagicMove
      v-if="highlighter"
      :id="`mount-panel-${current.id}`"
      role="tabpanel"
      :aria-labelledby="`mount-tab-${current.id}`"
      :highlighter="highlighter"
      :code="current.code"
      lang="typescript"
      :theme="shikiTheme"
      :options="{
        duration: 350,
        animateContainer: true,
        stagger: 1,
      }"
      class="!m-0 min-h-64 overflow-auto !rounded-none !border-0 !bg-elevated/40 !p-4 font-mono text-sm leading-relaxed sm:!p-6"
      style="scrollbar-gutter: stable"
    />
    <pre
      v-else
      :id="`mount-panel-${current.id}`"
      role="tabpanel"
      :aria-labelledby="`mount-tab-${current.id}`"
      class="m-0 min-h-64 overflow-auto bg-elevated/40 p-4 font-mono text-sm leading-relaxed text-highlighted sm:p-6"
    ><code>{{ current.code }}</code></pre>
  </PostDiagramFrame>
</template>
