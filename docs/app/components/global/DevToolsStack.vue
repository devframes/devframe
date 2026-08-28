<script setup lang="ts">
type PartId = 'devframe' | 'devframes' | 'nuxt-devtools' | 'nuxt-modules' | 'vite-devtools' | 'vite-plugins'
type PartGroup = 'devframe' | 'nuxt' | 'vite'

interface PluginExample {
  icon?: string
  image?: string
  label: string
}

interface Part {
  description: string
  group: PartGroup
  icon?: string
  id: PartId
  image?: string
  label: string
}

interface StackRow {
  bottomY: number
  connectorClass: string
  layer: Part
  layerClass: string
  pluginClass: string
  pluginExamples: PluginExample[]
  plugins: Part
  topY: number
}

const stackHeight = 54
const stackSlope = 0.4

const parts: Record<PartId, Part> = {
  'devframe': {
    id: 'devframe',
    group: 'devframe',
    label: 'Devframe Hub',
    image: '/images/devframe/devframe.svg',
    description: 'The framework-neutral composition layer. It brings mounted devframes together through docks, commands, messages, and terminals, then serves them through one standard handler.',
  },
  'devframes': {
    id: 'devframes',
    group: 'devframe',
    label: 'Devframes',
    icon: 'i-ph-fediverse-logo-duotone',
    description: 'Framework-neutral capabilities such as Data Inspector, Terminals, and Accessibility Inspector. Each can run with a standalone adapter or mount into a compatible DevTools host.',
  },
  'vite-devtools': {
    id: 'vite-devtools',
    group: 'vite',
    label: 'Vite DevTools',
    image: '/images/devframe/vite.svg',
    description: 'The first flagship DevTools host built around the hub. It provides the Vite-specific hub UI provider and native capabilities while inheriting portable devframes.',
  },
  'vite-plugins': {
    id: 'vite-plugins',
    group: 'vite',
    label: 'Vite plugins',
    icon: 'i-logos-vite-icon',
    description: 'Vite-specific capabilities contributed through devtools.setup(). They can use Vite internals directly and compose beside mounted devframes.',
  },
  'nuxt-devtools': {
    id: 'nuxt-devtools',
    group: 'nuxt',
    label: 'Nuxt DevTools',
    icon: 'i-logos-nuxt-icon',
    description: 'A framework-specific experience built on Vite DevTools. It inherits the shared DevTools host and capabilities, then adds knowledge about Nuxt projects and runtime conventions.',
  },
  'nuxt-modules': {
    id: 'nuxt-modules',
    group: 'nuxt',
    label: 'Nuxt modules',
    icon: 'i-ph-shapes-duotone',
    description: 'Nuxt-specific contributions such as pages, auto-imports, server APIs, and module capabilities enrich the inherited stack.',
  },
}

const rows: StackRow[] = [
  {
    layer: parts.devframe,
    plugins: parts.devframes,
    topY: 0,
    bottomY: 16,
    layerClass: 'text-primary',
    connectorClass: 'border-primary/40',
    pluginClass: 'border-primary/30 bg-primary/10 text-primary',
    pluginExamples: [
      { icon: 'i-ph-person-simple-circle-duotone', label: 'Accessibility Inspector' },
      { icon: 'i-ph-image-duotone', label: 'Open Graph Viewer' },
      { icon: 'i-ph-terminal-window-duotone', label: 'Terminals' },
    ],
  },
  {
    layer: parts['vite-devtools'],
    plugins: parts['vite-plugins'],
    topY: 19,
    bottomY: 35,
    layerClass: 'text-violet-600 dark:text-violet-300',
    connectorClass: 'border-violet-500/40',
    pluginClass: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    pluginExamples: [
      { image: '/images/devframe/vite.svg', label: 'Vite' },
      { image: '/images/devframe/vitest.svg', label: 'Vitest' },
      { image: '/images/devframe/rolldown.svg', label: 'Rolldown' },
      { image: '/images/devframe/oxc.svg', label: 'Oxc' },
    ],
  },
  {
    layer: parts['nuxt-devtools'],
    plugins: parts['nuxt-modules'],
    topY: 38,
    bottomY: 54,
    layerClass: 'text-green-600 dark:text-green-300',
    connectorClass: 'border-green-500/40',
    pluginClass: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
    pluginExamples: [
      { icon: 'i-logos-vue', label: 'Vue' },
      { icon: 'i-logos-pinia', label: 'Pinia' },
      { icon: 'i-ph-arrows-split-duotone', label: 'Router' },
      { icon: 'i-ph-shapes-duotone', label: 'Components' },
    ],
  },
]

const defaultPart: Omit<Part, 'group' | 'id'> = {
  label: 'The DevTools stack',
  icon: 'i-ph-stack-duotone',
  description: 'Portable devframes compose behind one standard handler. Framework-specific DevTools hosts inherit and extend that foundation. Hover, focus, or select a part to explore its role.',
}

const hoveredPart = ref<PartId>()
const focusedPart = ref<PartId>()
const selectedPart = ref<PartId>()
const activePartId = computed(() => hoveredPart.value ?? focusedPart.value ?? selectedPart.value)
const activePart = computed(() => activePartId.value ? parts[activePartId.value] : defaultPart)
const activeGroup = computed(() => activePartId.value ? parts[activePartId.value].group : undefined)

function togglePart(id: PartId) {
  selectedPart.value = selectedPart.value === id ? undefined : id
}

function partStateClass(id: PartId) {
  if (!activeGroup.value)
    return ''
  return activeGroup.value === parts[id].group
    ? 'z-10 scale-[1.015] drop-shadow-lg'
    : 'opacity-30 saturate-25'
}

function groupStateClass(group: PartGroup) {
  if (!activeGroup.value)
    return ''
  return activeGroup.value === group
    ? 'opacity-100 drop-shadow-md'
    : 'opacity-30 saturate-25'
}

function leftAt(y: number) {
  return 28 - y * stackSlope
}

function rightAt(y: number) {
  return 72 + y * stackSlope
}

function centerY(row: StackRow) {
  return (row.topY + row.bottomY) / 2
}

function layerPath(row: StackRow) {
  const topLeft = leftAt(row.topY)
  const topRight = rightAt(row.topY)
  const bottomLeft = leftAt(row.bottomY)
  const bottomRight = rightAt(row.bottomY)

  return [
    `M ${topLeft + 1} ${row.topY + 0.4}`,
    `H ${topRight - 1}`,
    `Q ${topRight - 0.15} ${row.topY + 0.4} ${topRight + 0.15} ${row.topY + 1.2}`,
    `L ${bottomRight - 0.15} ${row.bottomY - 1.2}`,
    `Q ${bottomRight} ${row.bottomY - 0.4} ${bottomRight - 1} ${row.bottomY - 0.4}`,
    `H ${bottomLeft + 1}`,
    `Q ${bottomLeft} ${row.bottomY - 0.4} ${bottomLeft + 0.15} ${row.bottomY - 1.2}`,
    `L ${topLeft - 0.15} ${row.topY + 1.2}`,
    `Q ${topLeft} ${row.topY + 0.4} ${topLeft + 1} ${row.topY + 0.4}`,
    'Z',
  ].join(' ')
}

function layerButtonStyle(row: StackRow) {
  const left = leftAt(row.bottomY)
  const right = rightAt(row.bottomY)
  const topInset = (leftAt(row.topY) - left) / (right - left) * 100

  return {
    clipPath: `polygon(${topInset}% 0, ${100 - topInset}% 0, 100% 100%, 0 100%)`,
    height: `${(row.bottomY - row.topY) / stackHeight * 100}%`,
    left: `${left}%`,
    top: `${row.topY / stackHeight * 100}%`,
    width: `${right - left}%`,
  }
}

function pluginStyle(row: StackRow) {
  return {
    top: `${centerY(row) / stackHeight * 100}%`,
  }
}
</script>

<template>
  <PostDiagramFrame
    title-id="devtools-stack-title"
    title="The Vite and Nuxt DevTools stack"
    subtitle="Shared foundations, specialized experiences"
    @mouseleave="hoveredPart = undefined"
  >
    <template #actions>
      <span class="hidden text-xs text-dimmed sm:inline">Hover to explore</span>
    </template>

    <div class="overflow-x-auto px-4 py-4 sm:px-6">
      <div class="grid min-w-[37.5rem] grid-cols-[minmax(0,1fr)_11.25rem] gap-6">
        <div class="relative aspect-[50/27] min-w-0">
          <svg
            aria-hidden="true"
            class="absolute inset-0 size-full"
            preserveAspectRatio="xMidYMid meet"
            :viewBox="`0 0 100 ${stackHeight}`"
          >
            <g
              v-for="(row, index) of rows"
              :key="`connectors-${row.layer.id}`"
            >
              <line
                v-if="index < rows.length - 1"
                x1="50"
                :y1="row.bottomY"
                x2="50"
                :y2="rows[index + 1].topY"
                class="text-dimmed"
                stroke="currentColor"
                stroke-opacity="0.5"
                stroke-width="0.16"
              />
              <line
                :x1="rightAt(centerY(row))"
                :y1="centerY(row)"
                x2="100"
                :y2="centerY(row)"
                :class="[row.layerClass, groupStateClass(row.layer.group)]"
                stroke="currentColor"
                stroke-opacity="0.55"
                stroke-width="0.16"
              />
            </g>

            <path
              v-for="row of rows"
              :key="`shape-${row.layer.id}`"
              :d="layerPath(row)"
              :class="[row.layerClass, groupStateClass(row.layer.group)]"
              fill="currentColor"
              fill-opacity="0.1"
              stroke="currentColor"
              stroke-opacity="0.55"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="0.18"
            />
          </svg>

          <button
            v-for="row of rows"
            :key="`layer-${row.layer.id}`"
            type="button"
            class="absolute outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-current/40"
            :class="[row.layerClass, groupStateClass(row.layer.group)]"
            :style="layerButtonStyle(row)"
            :aria-label="`Describe ${row.layer.label}`"
            :aria-pressed="selectedPart === row.layer.id"
            @mouseenter="hoveredPart = row.layer.id"
            @focus="focusedPart = row.layer.id"
            @blur="focusedPart = undefined"
            @click="togglePart(row.layer.id)"
          >
            <span class="relative flex h-full items-center justify-center gap-2 text-highlighted">
              <img
                v-if="row.layer.image"
                :src="row.layer.image"
                alt=""
                class="size-6 object-contain"
              >
              <UIcon
                v-else
                :name="row.layer.icon!"
                class="size-6"
              />
              <span class="text-sm font-semibold">{{ row.layer.label }}</span>
            </span>
          </button>

          <span
            v-for="row of rows"
            :key="`gap-${row.layer.id}`"
            aria-hidden="true"
            class="absolute left-full w-6 border-t transition-opacity"
            :class="[row.connectorClass, groupStateClass(row.layer.group)]"
            :style="pluginStyle(row)"
          />
        </div>

        <div class="relative">
          <button
            v-for="row of rows"
            :key="`plugins-${row.plugins.id}`"
            type="button"
            class="absolute left-0 flex w-full -translate-y-1/2 flex-col items-start gap-1 rounded-xl px-3 py-2 text-left outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-current/40"
            :class="[row.layerClass, partStateClass(row.plugins.id)]"
            :style="pluginStyle(row)"
            :aria-label="`Describe ${row.plugins.label}`"
            :aria-pressed="selectedPart === row.plugins.id"
            @mouseenter="hoveredPart = row.plugins.id"
            @focus="focusedPart = row.plugins.id"
            @blur="focusedPart = undefined"
            @click="togglePart(row.plugins.id)"
          >
            <span class="flex shrink-0 gap-1">
              <span
                v-for="example of row.pluginExamples"
                :key="example.label"
                :class="row.pluginClass"
                :title="example.label"
                class="flex size-7 items-center justify-center rounded-md border"
              >
                <img
                  v-if="example.image"
                  :src="example.image"
                  alt=""
                  class="size-4 object-contain"
                >
                <UIcon
                  v-else
                  :name="example.icon!"
                  class="size-4"
                />
              </span>
              <span class="flex size-7 items-center justify-center rounded-md border border-default bg-elevated text-dimmed">
                <UIcon
                  name="i-ri-more-line"
                  class="size-4"
                />
              </span>
            </span>
            <span class="text-xs font-semibold">{{ row.plugins.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <template #caption>
      <div
        class="flex min-h-20 items-start gap-3"
        aria-live="polite"
      >
        <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accented">
          <img
            v-if="activePart.image"
            :src="activePart.image"
            alt=""
            class="size-5 object-contain"
          >
          <UIcon
            v-else
            :name="activePart.icon!"
            class="size-5"
          />
        </span>
        <span>
          <span class="block text-sm font-semibold text-highlighted">{{ activePart.label }}</span>
          <span class="mt-1 block text-sm leading-relaxed">{{ activePart.description }}</span>
        </span>
      </div>
    </template>
  </PostDiagramFrame>
</template>
