<script setup lang="ts">
const hosts = [
  { label: 'Hono', icon: 'i-logos-hono' },
  { label: 'Nitro', icon: 'i-unjs-nitro' },
  { label: 'Next.js', icon: 'i-logos-nextjs-icon' },
  { label: 'SvelteKit', icon: 'i-logos-svelte-icon' },
  { label: 'Vite', image: '/images/devframe/vite.svg' },
  { label: 'Rsbuild', image: '/images/devframe/rsbuild.svg' },
  { label: 'Deno', icon: 'i-logos-deno' },
  { label: 'Bun', icon: 'i-logos-bun' },
  { label: 'Any host framework', icon: 'i-ph-question-duotone' },
]

const destinations = [
  { label: 'CLI', icon: 'i-ph-terminal-window-duotone' },
  { label: 'Dev server', icon: 'i-ph-browser-duotone' },
  { label: 'MCP server', icon: 'i-octicon-mcp-24' },
  { label: 'Static report', icon: 'i-ph-file-html-duotone' },
  { label: 'Vite DevTools', image: '/images/devframe/vite.svg' },
]

const steps = [
  {
    label: 'defineDevframe()',
    detail: 'Capabilities and SPA',
    icon: 'i-ph-selection-duotone',
    class: 'border-primary/35 bg-primary/10 text-primary',
  },
  {
    label: 'initDevframe()',
    detail: 'Live instance',
    icon: 'i-ph-circuitry-duotone',
    class: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  {
    label: 'Request → Response',
    detail: 'Standard handler',
    icon: 'i-ph-puzzle-piece-duotone',
    class: 'border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
]
</script>

<template>
  <PostDiagramFrame
    title-id="devframe-architecture-title"
    title="Define once, mount anywhere"
    subtitle="One stable boundary between a devframe and its environment"
  >
    <div class="p-4 sm:p-6">
      <div class="flex flex-col items-stretch justify-center gap-2 sm:flex-row">
        <template
          v-for="(step, index) of steps"
          :key="step.label"
        >
          <div
            class="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-lg"
            :class="step.class"
          >
            <UIcon
              :name="step.icon"
              class="size-8 shrink-0"
            />
            <div class="min-w-0">
              <div class="font-mono text-sm font-semibold">
                {{ step.label }}
              </div>
              <div class="mt-0.5 truncate text-xs opacity-60">
                {{ step.detail }}
              </div>
            </div>
          </div>
          <UIcon
            v-if="index < steps.length - 1"
            name="i-ph-arrow-right-bold"
            class="m-auto size-4 shrink-0 rotate-90 text-dimmed sm:rotate-0"
          />
        </template>
      </div>

      <div class="my-5 border-t border-default" />

      <div class="grid gap-4 sm:grid-cols-2">
        <section class="rounded-xl border border-default bg-elevated/40 p-4">
          <div class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted">
            <UIcon
              name="i-ph-plugs-connected-duotone"
              class="size-4"
            />
            MOUNT THE HANDLER
          </div>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="host of hosts"
              :key="host.label"
              class="flex items-center gap-1.5 rounded-lg border border-default bg-default px-2.5 py-1.5 text-xs transition hover:-translate-y-0.5 hover:bg-elevated"
            >
              <img
                v-if="host.image"
                :src="host.image"
                alt=""
                class="size-3.5 object-contain"
              >
              <UIcon
                v-else
                :name="host.icon!"
                class="size-3.5"
              />
              {{ host.label }}
            </div>
          </div>
        </section>

        <section class="rounded-xl border border-default bg-elevated/40 p-4">
          <div class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted">
            <UIcon
              name="i-ph-package-duotone"
              class="size-4"
            />
            PACKAGE WITH ADAPTERS
          </div>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="destination of destinations"
              :key="destination.label"
              class="flex items-center gap-1.5 rounded-lg border border-default bg-default px-2.5 py-1.5 text-xs transition hover:-translate-y-0.5 hover:bg-elevated"
            >
              <img
                v-if="destination.image"
                :src="destination.image"
                alt=""
                class="size-3.5 object-contain"
              >
              <UIcon
                v-else
                :name="destination.icon!"
                class="size-3.5"
              />
              {{ destination.label }}
            </div>
          </div>
        </section>
      </div>
    </div>
  </PostDiagramFrame>
</template>
