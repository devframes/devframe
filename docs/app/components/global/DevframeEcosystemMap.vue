<script setup lang="ts">
import { curveBumpX, curveBumpY, line } from 'd3-shape'

type NodeColor = 'core' | 'framework' | 'neutral' | 'protocol' | 'surface' | 'vite'
type NodeShape = 'card' | 'pill'
type EdgeDirection = 'auto' | 'horizontal' | 'vertical'

interface Point {
  x: number
  y: number
}

interface EcosystemEdge {
  dashed?: boolean
  direction?: EdgeDirection
  emphasis?: boolean
  label?: string
  labelOffset?: number
  source: string
  target: string
  waypoints?: Point[]
}

interface EcosystemNode {
  color: NodeColor
  height: number
  href?: string
  icon?: string
  id: string
  image?: string
  label: string
  linksFrom?: string | Omit<EcosystemEdge, 'target'> | Array<Omit<EcosystemEdge, 'target'> | string>
  note?: string
  position: Point
  shape: NodeShape
  style?: 'dashed' | 'solid'
  width: number
}

type LayoutNode = Omit<EcosystemNode, 'position'> & Point
type LayoutEdge = EcosystemEdge & { d: string, labelPosition?: Point }

const HEIGHT = 45
const diagramPadding = { x: 24, y: 24 }

const colorClasses: Record<NodeColor, string> = {
  core: 'border-primary/45 bg-primary/10 text-primary',
  surface: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  protocol: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  vite: 'border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  framework: 'border-green-500/35 bg-green-500/10 text-green-700 dark:text-green-300',
  neutral: 'border-gray-400/50 bg-gray-500/10 text-gray-600 dark:text-gray-300',
}

const nodes: EcosystemNode[] = [
  {
    id: 'embedded',
    linksFrom: 'devframe',
    label: 'Embedded adapter',
    note: 'In-app mount',
    icon: 'i-ph-code-duotone',
    href: '/adapters/embedded',
    color: 'surface',
    shape: 'card',
    position: { x: 0, y: 80 },
    width: 160,
    height: HEIGHT,
  },
  {
    id: 'cli',
    linksFrom: [
      'dev-server',
      'mcp',
      'static-build',
    ],
    label: 'Standalone CLI',
    icon: 'i-ph-terminal-window-duotone',
    href: '/guide/standalone-cli',
    color: 'surface',
    shape: 'card',
    position: { x: 350, y: -10 },
    width: 160,
    height: HEIGHT,
  },
  {
    id: 'dev-server',
    linksFrom: 'devframe',
    label: 'Dev server',
    icon: 'i-ph-browser-duotone',
    href: '/adapters/dev',
    color: 'surface',
    shape: 'card',
    position: { x: 100, y: -10 },
    width: 150,
    height: HEIGHT,
  },
  {
    id: 'static-build',
    linksFrom: 'devframe',
    label: 'Static build',
    note: 'Snapshot to a SPA',
    icon: 'i-ph-package-duotone',
    href: '/adapters/build',
    color: 'surface',
    shape: 'card',
    position: { x: 200, y: 80 },
    width: 150,
    height: HEIGHT,
  },
  {
    id: 'mcp',
    linksFrom: 'devframe',
    label: 'MCP server',
    icon: 'i-octicon-mcp-24',
    href: '/adapters/mcp',
    color: 'surface',
    shape: 'card',
    position: { x: 400, y: 80 },
    width: 150,
    height: HEIGHT,
  },
  {
    id: 'devframe',
    label: 'A devframe',
    note: 'One devtool definition',
    image: '/images/devframe/devframe.svg',
    href: '/guide/devframe-definition',
    color: 'core',
    shape: 'card',
    position: { x: 100, y: 180 },
    width: 180,
    height: HEIGHT,
  },
  {
    id: 'other-devframes',
    label: 'Other devframes…',
    note: 'Several mounted devframes',
    icon: 'i-ph-stack-duotone',
    color: 'neutral',
    shape: 'card',
    style: 'dashed',
    position: { x: 350, y: 180 },
    width: 180,
    height: HEIGHT,
  },
  {
    id: 'hub',
    linksFrom: [
      { source: 'devframe', direction: 'vertical' },
      { source: 'other-devframes', dashed: true },
    ],
    label: 'Hub',
    note: 'Optional composition',
    icon: 'i-ph-circles-four-duotone',
    href: '/guide/hub',
    color: 'core',
    shape: 'card',
    position: { x: 250, y: 300 },
    width: 180,
    height: HEIGHT,
  },
  {
    id: 'handler',
    linksFrom: [
      {
        source: 'devframe',
        emphasis: true,
        label: 'initDevframe()',
        waypoints: [{ x: 70, y: 320 }],
      },
      { source: 'hub', emphasis: true, label: 'initHub()' },
    ],
    label: 'Standard handler',
    note: 'Request → Response · middleware',
    icon: 'i-ph-arrows-left-right-duotone',
    href: '/adapters/initiate',
    color: 'protocol',
    shape: 'card',
    position: { x: 250, y: 420 },
    width: 250,
    height: HEIGHT,
  },
  {
    id: 'nitro',
    linksFrom: 'handler',
    label: 'Nitro',
    icon: 'i-unjs-nitro',
    href: 'https://github.com/devframes/devframe/tree/main/examples/hub-nitro',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 10, y: 480 },
    width: 100,
    height: HEIGHT,
  },
  {
    id: 'hono',
    linksFrom: { source: 'handler', direction: 'vertical' },
    label: 'Hono',
    icon: 'i-logos-hono',
    href: 'https://github.com/devframes/devframe/tree/main/examples/hub-hono',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 110, y: 530 },
    width: 100,
    height: HEIGHT,
  },
  {
    id: 'next',
    linksFrom: { source: 'handler', dashed: true, direction: 'vertical' },
    label: 'Next.js',
    icon: 'i-logos-nextjs-icon',
    href: 'https://github.com/devframes/devframe/tree/main/examples/hub-next',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 400, y: 530 },
    width: 100,
    height: HEIGHT,
  },
  {
    id: 'any-framework',
    linksFrom: 'handler',
    label: 'Any host framework',
    note: 'Handler-compatible',
    icon: 'i-ph-infinity-duotone',
    href: '/adapters/initiate',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 520, y: 460 },
    width: 160,
    height: HEIGHT,
  },
  {
    id: 'vite-devtools',
    linksFrom: { source: 'handler', emphasis: true },
    label: 'Vite DevTools',
    note: 'First flagship DevTools host',
    image: '/images/devframe/vite.svg',
    href: 'https://devtools.vite.dev/guide/',
    color: 'vite',
    shape: 'pill',
    position: { x: 250, y: 570 },
    width: 160,
    height: HEIGHT,
  },
  {
    id: 'astro-devtools',
    linksFrom: { source: 'vite-devtools', dashed: true },
    label: 'Astro',
    icon: 'i-logos-astro-icon',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 0, y: 640 },
    width: 90,
    height: HEIGHT,
  },
  {
    id: 'sveltekit-devtools',
    linksFrom: { source: 'vite-devtools', dashed: true, direction: 'vertical' },
    label: 'SvelteKit',
    icon: 'i-logos-svelte-icon',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 120, y: 660 },
    width: 100,
    height: HEIGHT,
  },
  {
    id: 'solidjs-devtools',
    linksFrom: { source: 'vite-devtools', dashed: true, direction: 'vertical' },
    label: 'Solid',
    icon: 'i-logos-solidjs-icon',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 390, y: 660 },
    width: 100,
    height: HEIGHT,
  },
  {
    id: 'more-vite-devtools',
    linksFrom: { source: 'vite-devtools', dashed: true },
    label: 'Frameworks on Vite',
    note: 'Framework-specific layers',
    icon: 'i-ph-dots-three-circle-duotone',
    color: 'neutral',
    shape: 'pill',
    style: 'dashed',
    position: { x: 500, y: 600 },
    width: 190,
    height: HEIGHT,
  },
  {
    id: 'vue-devtools',
    linksFrom: 'vite-devtools',
    label: 'Vue DevTools',
    icon: 'i-logos-vue',
    href: 'https://devtools.vuejs.org/guide/vite-plugin',
    color: 'framework',
    shape: 'pill',
    position: { x: 160, y: 730 },
    width: 130,
    height: HEIGHT,
  },
  {
    id: 'nuxt-devtools',
    linksFrom: [{ source: 'vite-devtools', emphasis: true }, 'vue-devtools'],
    label: 'Nuxt DevTools',
    icon: 'i-logos-nuxt-icon',
    href: 'https://devtools.nuxt.com/guide/getting-started',
    color: 'framework',
    shape: 'pill',
    position: { x: 340, y: 730 },
    width: 130,
    height: HEIGHT,
  },
]

const edges: EcosystemEdge[] = nodes.flatMap((node) => {
  if (!node.linksFrom)
    return []

  const links = Array.isArray(node.linksFrom) ? node.linksFrom : [node.linksFrom]
  return links.map(link => ({
    ...(typeof link === 'string' ? { source: link } : link),
    target: node.id,
  }))
})

const rawLayoutNodes: LayoutNode[] = nodes.map(({ position, ...node }) => ({ ...node, ...position }))
const bounds = layoutBounds(rawLayoutNodes)
const diagramWidth = bounds.width + diagramPadding.x * 2
const diagramHeight = bounds.height + diagramPadding.y * 2
const layoutNodes: LayoutNode[] = rawLayoutNodes.map(node => ({
  ...node,
  x: node.x - bounds.left + diagramPadding.x,
  y: node.y - bounds.top + diagramPadding.y,
}))
const layoutNodesById = Object.fromEntries(layoutNodes.map(node => [node.id, node])) as Record<string, LayoutNode>

const verticalEdgeLine = line<Point>()
  .x(point => point.x)
  .y(point => point.y)
  .curve(curveBumpY)

const horizontalEdgeLine = line<Point>()
  .x(point => point.x)
  .y(point => point.y)
  .curve(curveBumpX)

const layoutEdges: LayoutEdge[] = edges.map((edge) => {
  const source = layoutNodesById[edge.source]!
  const target = layoutNodesById[edge.target]!
  const waypoints = edge.waypoints?.map(point => ({
    x: point.x - bounds.left + diagramPadding.x,
    y: point.y - bounds.top + diagramPadding.y,
  })) ?? []
  const routedPoints = clipEdge([source, ...waypoints, target], source, target)
  const direction = edge.direction ?? 'auto'
  const lineGenerator = direction === 'horizontal'
    ? horizontalEdgeLine
    : direction === 'vertical'
      ? verticalEdgeLine
      : Math.abs(target.x - source.x) > Math.abs(target.y - source.y) * 1.2
        ? horizontalEdgeLine
        : verticalEdgeLine

  return {
    ...edge,
    d: lineGenerator(routedPoints) ?? '',
    labelPosition: edge.label
      ? pointAlongPolyline(routedPoints, 0.5, edge.labelOffset ?? 0)
      : undefined,
  }
})

function layoutBounds(layout: LayoutNode[]) {
  const left = Math.min(...layout.map(node => node.x - node.width / 2))
  const right = Math.max(...layout.map(node => node.x + node.width / 2))
  const top = Math.min(...layout.map(node => node.y - node.height / 2))
  const bottom = Math.max(...layout.map(node => node.y + node.height / 2))
  return { left, top, width: right - left, height: bottom - top }
}

function clipEdge(points: Point[], source: LayoutNode, target: LayoutNode): Point[] {
  if (points.length < 2)
    return points

  const routed = points.map(point => ({ x: point.x, y: point.y }))
  routed[0] = pointOnNodeBoundary(routed[0]!, routed[1]!, source)
  routed[routed.length - 1] = pointOnNodeBoundary(routed.at(-1)!, routed.at(-2)!, target)
  return routed
}

function pointOnNodeBoundary(center: Point, toward: Point, node: LayoutNode): Point {
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(dx)
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)
  return { x: center.x + dx * scale, y: center.y + dy * scale }
}

function pointAlongPolyline(points: Point[], ratio: number, offset = 0): Point {
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index]!
    return {
      dx: point.x - previous.x,
      dy: point.y - previous.y,
      length: Math.hypot(point.x - previous.x, point.y - previous.y),
      previous,
    }
  })
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  let distance = totalLength * ratio

  for (const segment of segments) {
    if (distance > segment.length) {
      distance -= segment.length
      continue
    }

    const progress = segment.length === 0 ? 0 : distance / segment.length
    const normalX = segment.length === 0 ? 0 : -segment.dy / segment.length
    const normalY = segment.length === 0 ? 0 : segment.dx / segment.length
    return {
      x: segment.previous.x + segment.dx * progress + normalX * offset,
      y: segment.previous.y + segment.dy * progress + normalY * offset,
    }
  }

  return points.at(-1) ?? { x: 0, y: 0 }
}

function nodeStyle(node: LayoutNode) {
  return {
    height: `${node.height}px`,
    left: `${node.x - node.width / 2}px`,
    top: `${node.y - node.height / 2}px`,
    width: `${node.width}px`,
  }
}

function isExternal(href?: string) {
  return href?.startsWith('http')
}
</script>

<template>
  <PostDiagramFrame
    title-id="devframe-ecosystem-map-title"
    title="One devframe, many destinations"
    subtitle="Run with a standalone adapter, compose into a hub, or mount into any host framework"
  >
    <template #actions>
      <div class="hidden shrink-0 items-center gap-3 text-[0.65rem] text-muted sm:flex">
        <span class="flex items-center gap-1.5">
          <span class="w-4 border-t border-gray-400/60" />
          Available path
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-4 border-t border-dashed border-gray-400/60" />
          Ecosystem extension
        </span>
      </div>
    </template>

    <div class="overflow-x-auto px-4 py-6 sm:px-6">
      <div
        class="relative mx-auto"
        :style="{ height: `${diagramHeight}px`, width: `${diagramWidth}px` }"
      >
        <svg
          aria-hidden="true"
          class="absolute inset-0 size-full overflow-visible"
          :viewBox="`0 0 ${diagramWidth} ${diagramHeight}`"
        >
          <defs>
            <marker
              id="devframe-ecosystem-arrow"
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              markerWidth="8"
              orient="auto"
              refX="8"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path
                class="fill-gray-400 dark:fill-gray-500"
                d="M 0 0 L 8 4 L 0 8 Z"
              />
            </marker>
            <marker
              id="devframe-ecosystem-arrow-emphasis"
              markerHeight="8"
              markerUnits="userSpaceOnUse"
              markerWidth="8"
              orient="auto"
              refX="8"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path
                class="fill-primary"
                d="M 0 0 L 8 4 L 0 8 Z"
              />
            </marker>
          </defs>

          <g
            v-for="edge of layoutEdges"
            :key="`${edge.source}-${edge.target}`"
            :class="edge.emphasis ? 'opacity-60 dark:opacity-55' : 'opacity-55'"
          >
            <path
              :d="edge.d"
              fill="none"
              :marker-end="`url(#devframe-ecosystem-arrow${edge.emphasis ? '-emphasis' : ''})`"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              :stroke-width="edge.emphasis ? 2.5 : 1.5"
              :stroke-dasharray="edge.dashed ? '4 4' : undefined"
              :class="edge.emphasis ? 'text-primary' : 'text-gray-400 dark:text-gray-500'"
            />
          </g>

          <text
            v-for="edge of layoutEdges.filter(edge => edge.labelPosition)"
            :key="`${edge.source}-${edge.target}-label`"
            :x="edge.labelPosition!.x"
            :y="edge.labelPosition!.y"
            class="fill-gray-500 stroke-white dark:fill-gray-400 dark:stroke-gray-950"
            font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            paint-order="stroke"
            stroke-linejoin="round"
            stroke-width="6"
            style="font-size: 12px"
            text-anchor="middle"
          >
            {{ edge.label }}
          </text>
        </svg>

        <component
          :is="node.href ? 'a' : 'div'"
          v-for="node of layoutNodes"
          :key="node.id"
          :href="node.href"
          :target="isExternal(node.href) ? '_blank' : undefined"
          :rel="isExternal(node.href) ? 'noreferrer' : undefined"
          class="group absolute flex items-center gap-1.5 overflow-hidden border px-3 text-current no-underline outline-none transition-transform duration-200 ease-out"
          :class="[
            colorClasses[node.color],
            node.shape === 'pill' ? 'justify-center rounded-full' : 'rounded-xl',
            node.style === 'dashed' && 'border-dashed',
            node.href && 'hover:z-10 hover:scale-[1.025] focus-visible:z-10 focus-visible:scale-[1.025] focus-visible:ring-2 focus-visible:ring-current/40',
          ]"
          :style="nodeStyle(node)"
          :aria-label="node.href ? `Open ${node.label}` : node.label"
        >
          <img
            v-if="node.image"
            :src="node.image"
            alt=""
            class="size-4.5 shrink-0 object-contain"
          >
          <UIcon
            v-else
            :name="node.icon!"
            class="size-4.5 shrink-0"
          />
          <span class="min-w-0 flex-1 overflow-hidden leading-tight">
            <span class="block truncate text-[0.7rem] font-semibold">{{ node.label }}</span>
            <span
              v-if="node.note"
              class="block truncate text-[0.56rem] opacity-60"
            >{{ node.note }}</span>
          </span>
          <UIcon
            v-if="node.href"
            name="i-ph-arrow-up-right-bold"
            class="absolute top-1.5 right-1.5 size-2.5 opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50"
          />
        </component>
      </div>
    </div>

    <template #caption>
      A devframe can run alone, join a hub, or mount directly through the same standard handler. Vite DevTools is one DevTools host; framework-specific DevTools hosts can inherit and extend it.
    </template>
  </PostDiagramFrame>
</template>
