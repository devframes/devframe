<script setup lang="ts">
type Framework = 'astro' | 'hono' | 'next' | 'nitro' | 'nuxt' | 'react' | 'rsbuild' | 'solid' | 'svelte' | 'vue' | 'your'
type Theme = 'blue' | 'default' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'

interface ModuleItem {
  frameworks?: string
  icon?: string
  image?: string
  logo?: string
  logoImage?: string
  name: string
  theme?: Theme
}

const frameworkOptions: Array<{
  description: string
  icon?: string
  id: Framework
  image?: string
  label: string
}> = [
  { id: 'nuxt', icon: 'i-logos-nuxt-icon', label: 'Nuxt', description: 'Highlight capabilities for Nuxt DevTools' },
  { id: 'vue', icon: 'i-logos-vue', label: 'Vue', description: 'Highlight capabilities for Vue DevTools' },
  { id: 'next', icon: 'i-logos-nextjs-icon', label: 'Next.js', description: 'Highlight capabilities for Next.js DevTools' },
  { id: 'react', icon: 'i-logos-react', label: 'React', description: 'Highlight capabilities for React DevTools' },
  { id: 'hono', icon: 'i-logos-hono', label: 'Hono', description: 'Highlight capabilities for Hono DevTools' },
  { id: 'nitro', icon: 'i-unjs-nitro', label: 'Nitro', description: 'Highlight capabilities for Nitro DevTools' },
  { id: 'svelte', icon: 'i-logos-svelte-icon', label: 'Svelte', description: 'Highlight capabilities for Svelte DevTools' },
  { id: 'solid', icon: 'i-logos-solidjs-icon', label: 'Solid', description: 'Highlight capabilities for Solid DevTools' },
  { id: 'astro', icon: 'i-logos-astro-icon', label: 'Astro', description: 'Highlight capabilities for Astro DevTools' },
  { id: 'rsbuild', image: '/images/devframe/rsbuild.svg', label: 'Rsbuild', description: 'Highlight capabilities for Rsbuild DevTools' },
  { id: 'your', icon: 'i-twemoji-winking-face', label: 'Your DevTools?', description: 'Show every capability for your own DevTools' },
]

const moduleGroups: Array<{
  id: string
  modules: ModuleItem[]
  name: string
}> = [
  {
    id: 'general',
    name: 'General',
    modules: [
      { icon: 'i-ph-person-simple-circle-duotone', name: 'Accessibility' },
      { icon: 'i-octicon-mcp-24', name: 'MCP' },
      { icon: 'i-ph-image-duotone', name: 'SEO tools' },
      { icon: 'i-simple-icons-pwa', name: 'PWA' },
      { icon: 'i-ph-database-duotone', name: 'Data Inspector' },
      { icon: 'i-ph-terminal-window-duotone', name: 'Terminals' },
    ],
  },
  {
    id: 'build-tools',
    name: 'Build tools',
    modules: [
      { image: '/images/devframe/vitest.svg', name: 'Vitest', theme: 'green' },
      { image: '/images/devframe/oxc.svg', name: 'Oxlint', theme: 'blue' },
      { frameworks: 'nuxt vue astro svelte react solid', icon: 'i-ph-cube-duotone', name: 'Bundle analyzer', logoImage: '/images/devframe/vite.svg', theme: 'purple' },
      { frameworks: 'nuxt vue astro svelte react solid', icon: 'i-ph-magnifying-glass-duotone', name: 'Plugin analyzer', logoImage: '/images/devframe/vite.svg', theme: 'purple' },
      { frameworks: 'nuxt vue astro svelte react solid', icon: 'i-ph-sliders-horizontal-duotone', name: 'Vite config', logoImage: '/images/devframe/vite.svg', theme: 'purple' },
      { image: '/images/devframe/rolldown.svg', name: 'Rolldown', theme: 'orange' },
      { frameworks: 'rsbuild nuxt', image: '/images/devframe/rsdoctor.svg', name: 'Rsdoctor', theme: 'blue' },
      { frameworks: 'next', icon: 'i-logos-turbopack-icon', name: 'Turbopack' },
    ],
  },
  {
    id: 'frameworks',
    name: 'Framework-specific',
    modules: [
      { frameworks: 'nuxt vue astro', icon: 'i-carbon-assembly-cluster', name: 'Components', logo: 'i-logos-vue', theme: 'green' },
      { frameworks: 'nuxt vue astro', icon: 'i-carbon-network-4', name: 'Reactivity', logo: 'i-logos-vue', theme: 'green' },
      { frameworks: 'nuxt vue astro', icon: 'i-ph-signpost-duotone', name: 'Router', logo: 'i-logos-vue', theme: 'green' },
      { frameworks: 'nuxt vue astro', icon: 'i-icon-park-outline-pineapple', name: 'Pinia', logo: 'i-logos-vue', theme: 'green' },
      { frameworks: 'nuxt', icon: 'i-ph-shapes-duotone', name: 'Nuxt modules', logo: 'i-logos-nuxt-icon', theme: 'teal' },
      { frameworks: 'nuxt', icon: 'i-carbon-function', name: 'Auto imports', logo: 'i-logos-nuxt-icon', theme: 'teal' },
      { frameworks: 'nuxt', icon: 'i-carbon-volume-file-storage', name: 'File router', logo: 'i-logos-nuxt-icon', theme: 'teal' },
      { frameworks: 'nuxt nitro', icon: 'i-carbon-network-public', name: 'Server API', logo: 'i-unjs-nitro', theme: 'pink' },
      { frameworks: 'next', icon: 'i-logos-nextjs-icon', name: 'Next.js DevTools' },
      { frameworks: 'react astro next', icon: 'i-logos-react', name: 'React DevTools', theme: 'blue' },
      { frameworks: 'react astro next', icon: 'i-carbon-data-set', name: 'State management', logo: 'i-logos-react', theme: 'blue' },
      { frameworks: 'react astro next', icon: 'i-ph-signpost-duotone', name: 'Router', logo: 'i-logos-react', theme: 'blue' },
      { frameworks: 'svelte astro', icon: 'i-ph-signpost-duotone', name: 'File router', logo: 'i-logos-svelte-icon', theme: 'red' },
      { frameworks: 'svelte astro', icon: 'i-carbon-assembly-cluster', name: 'Components', logo: 'i-logos-svelte-icon', theme: 'red' },
      { frameworks: 'solid astro', icon: 'i-carbon-network-4', name: 'Reactivity', logo: 'i-logos-solidjs-icon', theme: 'blue' },
      { frameworks: 'astro', icon: 'i-carbon-page-scroll', name: 'Content', logo: 'i-logos-astro-icon', theme: 'orange' },
    ],
  },
  {
    id: 'ecosystem',
    name: 'Ecosystem',
    modules: [
      { icon: 'i-logos-unocss', name: 'UnoCSS' },
      { icon: 'i-logos-turborepo-icon', name: 'Turborepo' },
      { icon: 'i-logos-eslint', name: 'ESLint', theme: 'purple' },
      { image: '/images/devframe/tanstack.png', name: 'TanStack', theme: 'blue' },
      { icon: 'i-logos-storybook-icon', name: 'Storybook', theme: 'pink' },
      { image: '/images/devframe/histoire.svg', name: 'Histoire', theme: 'green' },
      { image: '/images/devframe/node-modules-inspector.svg', name: 'Node Modules', theme: 'green' },
      { icon: 'i-ph-dots-three-duotone', name: 'More…' },
    ],
  },
]

const hoveredFramework = ref<Framework>()
const focusedFramework = ref<Framework>()
const selectedFramework = ref<Framework>()
const activeFramework = computed(() => hoveredFramework.value ?? focusedFramework.value ?? selectedFramework.value)
const hoveredModule = ref<ModuleItem>()
const focusedModule = ref<ModuleItem>()
const activeModule = computed(() => hoveredModule.value ?? focusedModule.value)

function toggleFramework(framework: Framework) {
  selectedFramework.value = selectedFramework.value === framework ? undefined : framework
}

function moduleSupportsFramework(module: ModuleItem, framework: Framework) {
  return framework === 'your'
    || !module.frameworks
    || module.frameworks.split(' ').includes(framework)
}
</script>

<template>
  <PostDiagramFrame
    dashed
    title-id="universal-devtools-ecosystem-title"
    title="The Universal DevTools Ecosystem"
    subtitle="Modular, composable, collaborative"
  >
    <template #actions>
      <span class="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        The vision
      </span>
    </template>

    <div class="px-4 pt-4 text-xs text-muted sm:px-6">
      Hover over or select a host framework to preview how shared and framework-specific capabilities compose.
    </div>

    <div
      aria-label="Preview host framework compositions"
      class="flex flex-wrap items-center gap-1.5 border-b border-default px-4 py-4 sm:px-6"
      @mouseleave="hoveredFramework = undefined"
    >
      <button
        v-for="option of frameworkOptions"
        :key="option.id"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full border border-default bg-elevated/50 px-2.5 py-1.5 text-xs text-muted outline-none transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-elevated hover:text-highlighted focus-visible:ring-2 focus-visible:ring-primary/40"
        :class="[
          selectedFramework === option.id && 'bg-accented text-highlighted',
          activeModule && moduleSupportsFramework(activeModule, option.id) && '-translate-y-0.5 shadow-lg',
          activeModule && !moduleSupportsFramework(activeModule, option.id) && 'opacity-25',
        ]"
        :aria-label="option.description"
        :aria-pressed="selectedFramework === option.id"
        @pointerover="hoveredFramework = option.id"
        @pointercancel="hoveredFramework = undefined"
        @pointerleave="hoveredFramework = undefined"
        @focus="focusedFramework = option.id"
        @blur="focusedFramework = undefined"
        @click="toggleFramework(option.id)"
      >
        <img
          v-if="option.image"
          :src="option.image"
          alt=""
          class="size-3.5 object-contain"
        >
        <UIcon
          v-else
          :name="option.icon!"
          class="size-3.5"
        />
        {{ option.label }}
      </button>
    </div>

    <div class="overflow-x-auto px-4 py-5 sm:px-6">
      <section
        v-for="(group, index) of moduleGroups"
        :key="group.id"
        :aria-labelledby="`devtools-ecosystem-${group.id}`"
        :class="index ? 'mt-4' : ''"
      >
        <h3
          :id="`devtools-ecosystem-${group.id}`"
          class="m-0 mb-2 text-xs font-semibold tracking-[0.08em] text-muted uppercase"
        >
          {{ group.name }}
        </h3>
        <div class="flex flex-wrap gap-2.5">
          <DevToolsModule
            v-for="(module, moduleIndex) of group.modules"
            :key="`${group.id}-${moduleIndex}`"
            :active-framework="activeFramework"
            v-bind="module"
            @pointerover="hoveredModule = module"
            @pointercancel="hoveredModule = undefined"
            @pointerleave="hoveredModule = undefined"
            @focus="focusedModule = module"
            @blur="focusedModule = undefined"
          />
        </div>
      </section>
    </div>

    <template #caption>
      A vision sketch showing how shared and framework-specific capabilities could compose into each DevTools experience.
    </template>
  </PostDiagramFrame>
</template>
