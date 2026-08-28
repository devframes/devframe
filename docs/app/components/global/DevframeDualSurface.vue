<script setup lang="ts">
const capabilities = [
  {
    id: 'build',
    label: 'Build graph',
    icon: 'i-ph-graph-duotone',
    rpc: 'inspectBuild()',
    visualTitle: 'Explore the graph',
    visualDetail: 'Navigate modules, compare chunks, and spot outliers.',
    agentTitle: 'Investigate the cause',
    agentDetail: 'Query slow modules, correlate them with code, and propose changes.',
  },
  {
    id: 'a11y',
    label: 'Accessibility findings',
    icon: 'i-ph-person-simple-circle-duotone',
    rpc: 'scanAccessibility()',
    visualTitle: 'See violations in context',
    visualDetail: 'Browse findings and highlight the matching elements on the page.',
    agentTitle: 'Prepare a fix',
    agentDetail: 'Read structured findings and generate a focused implementation prompt.',
  },
  {
    id: 'state',
    label: 'Runtime state',
    icon: 'i-ph-database-duotone',
    rpc: 'inspectRuntime()',
    visualTitle: 'Browse and compare',
    visualDetail: 'Inspect the tree, filter values, and watch updates over time.',
    agentTitle: 'Retrieve precise context',
    agentDetail: 'Ask for only the relevant fields before reasoning across the codebase.',
  },
] as const

const selected = ref<(typeof capabilities)[number]['id']>('build')
const current = computed(() => capabilities.find(capability => capability.id === selected.value)!)
</script>

<template>
  <PostDiagramFrame
    title-id="devframe-dual-surface-title"
    title="One capability, two interfaces"
    subtitle="People and coding agents share the same source of truth"
  >
    <div
      role="tablist"
      aria-label="Devframe capability"
      class="flex flex-wrap gap-1.5 border-b border-default px-4 py-3 sm:px-6"
    >
      <button
        v-for="capability of capabilities"
        :key="capability.id"
        type="button"
        role="tab"
        :aria-selected="selected === capability.id"
        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40"
        :class="selected === capability.id
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-transparent text-muted hover:border-default hover:text-highlighted'"
        @click="selected = capability.id"
      >
        <UIcon
          :name="capability.icon"
          class="size-3.5"
        />
        {{ capability.label }}
      </button>
    </div>

    <div class="grid items-stretch gap-3 px-4 py-6 md:grid-cols-[1fr_auto_0.8fr_auto_1fr] sm:px-6">
      <section class="flex flex-col gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 text-sky-700 dark:text-sky-300">
        <div class="flex items-center gap-1 text-sm opacity-75">
          <UIcon
            name="i-ph-desktop-duotone"
            class="size-4"
          />
          Visual interface
        </div>
        <div class="font-semibold text-sky-800 dark:text-sky-200">
          {{ current.visualTitle }}
        </div>
        <div class="text-xs leading-relaxed opacity-70">
          {{ current.visualDetail }}
        </div>
      </section>

      <UIcon
        name="i-ph-arrow-left-bold"
        class="m-auto size-4 rotate-90 text-dimmed md:rotate-0"
      />

      <section class="m-auto flex size-40 flex-col items-center justify-center rounded-full border border-dashed border-primary/40 bg-primary/10 p-4 text-center">
        <UIcon
          :name="current.icon"
          class="size-7 text-primary"
        />
        <div class="mt-2 font-mono text-xs font-semibold text-primary">
          {{ current.rpc }}
        </div>
        <div class="mt-1 text-[0.65rem] tracking-wide text-dimmed uppercase">
          Devframe RPC
        </div>
      </section>

      <UIcon
        name="i-ph-arrow-right-bold"
        class="m-auto size-4 rotate-90 text-dimmed md:rotate-0"
      />

      <section class="flex flex-col gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 text-violet-700 dark:text-violet-300">
        <div class="flex items-center gap-1 text-sm opacity-75">
          <UIcon
            name="i-ph-head-circuit-duotone"
            class="size-4"
          />
          Coding-agent interface
        </div>
        <div class="font-semibold text-violet-800 dark:text-violet-200">
          {{ current.agentTitle }}
        </div>
        <div class="text-xs leading-relaxed opacity-70">
          {{ current.agentDetail }}
        </div>
      </section>
    </div>
  </PostDiagramFrame>
</template>
