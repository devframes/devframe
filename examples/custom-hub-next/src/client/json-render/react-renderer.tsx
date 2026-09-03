'use client'

import type { JsonRenderViewRef, Spec } from '@devframes/json-render'
import type { JsonRenderDockRenderer } from '@devframes/json-render/hub'
import type { BaseComponentProps, ComponentRegistry } from '@json-render/react'
import type { ReactNode } from 'react'
import { baseCatalog } from '@devframes/json-render'
import { defineRegistry, JSONUIProvider, Renderer, useBoundProp } from '@json-render/react'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// A small **React** implementation of the base catalog, the "registry
// replacement" seam: this Next host renders a server-authored json-render spec
// with its own React components instead of the reference Vue frontend, styled
// with the same @antfu/design tokens. `createReactJsonRenderDockRenderer()`
// below is what `app/page.tsx` registers on the client host.

// ── component helpers ───────────────────────────────────────────────────────

type Jr<P = Record<string, unknown>> = (ctx: BaseComponentProps<P>) => ReactNode

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

function formatValue(value: unknown): string {
  if (value == null)
    return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const justifyMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' }
const colorClass: Record<string, string> = { base: 'color-base', muted: 'color-muted', faint: 'color-faint', primary: 'color-primary', success: 'color-green', warning: 'color-amber', danger: 'color-red' }

// ── components ──────────────────────────────────────────────────────────────

const Stack: Jr<{ direction?: string, gap?: number, align?: string, justify?: string }> = ({ props, children }) => (
  <div style={{
    display: 'flex',
    flexDirection: props.direction === 'row' ? 'row' : 'column',
    gap: `${toNumber(props.gap, 8)}px`,
    alignItems: props.align ? alignMap[props.align] ?? props.align : undefined,
    justifyContent: props.justify ? justifyMap[props.justify] ?? props.justify : undefined,
  }}
  >
    {children}
  </div>
)

const Card: Jr<{ title?: string, collapsible?: boolean, defaultCollapsed?: boolean }> = ({ props, children }) => {
  const header = 'px4 py2.5 border-b border-base color-base font-medium text-sm'
  const body = <div className="p4">{children}</div>
  if (props.collapsible) {
    return (
      <details className="rounded-xl border border-base bg-base overflow-hidden" open={!props.defaultCollapsed}>
        <summary className={`${header} cursor-pointer select-none`}>{props.title}</summary>
        {body}
      </details>
    )
  }
  return (
    <div className="rounded-xl border border-base bg-base overflow-hidden">
      {props.title ? <div className={header}>{props.title}</div> : null}
      {body}
    </div>
  )
}

const textVariant: Record<string, { tag: keyof React.JSX.IntrinsicElements, class: string }> = {
  heading: { tag: 'h2', class: 'text-lg font-semibold' },
  subheading: { tag: 'h3', class: 'text-base font-medium' },
  body: { tag: 'p', class: 'text-sm' },
  caption: { tag: 'span', class: 'text-xs color-faint' },
}
const Text: Jr<{ text?: string, variant?: string, color?: string }> = ({ props, children }) => {
  const v = textVariant[props.variant ?? 'body'] ?? textVariant.body
  const Tag = v.tag
  return <Tag className={`${v.class} ${props.color ? colorClass[props.color] ?? 'color-base' : 'color-base'}`}>{props.text ?? children}</Tag>
}

const badgeClass: Record<string, string> = {
  default: 'bg-secondary color-muted',
  success: 'badge-color-green',
  warning: 'badge-color-amber',
  danger: 'badge-color-red',
  info: 'badge-color-blue',
}
const Badge: Jr<{ text?: string, variant?: string }> = ({ props, children }) => (
  <span className={`inline-flex items-center rounded px1.5 py0.5 text-xs font-medium ${badgeClass[props.variant ?? 'default'] ?? badgeClass.default}`}>
    {props.text ?? children}
  </span>
)

// Spec icon names (`ph:cube-duotone`) are dynamic, so they can't be UnoCSS
// `i-*` classes (those are extracted statically); fetch the SVG from Iconify
// at runtime, cached per name.
const iconCache = new Map<string, Promise<string | null>>()
function fetchIcon(name: string): Promise<string | null> {
  if (!/^[a-z0-9]+:[a-z0-9-]+$/.test(name))
    return Promise.resolve(null)
  let p = iconCache.get(name)
  if (!p) {
    const [prefix, icon] = name.split(':')
    p = fetch(`https://api.iconify.design/${prefix}/${icon}.svg?color=currentColor&width=100%`)
      .then(r => (r.ok ? r.text() : null))
      .catch(() => null)
    iconCache.set(name, p)
  }
  return p
}
const Icon: Jr<{ name?: string, size?: number }> = ({ props }) => {
  const size = props.size ?? 16
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (props.name)
      void fetchIcon(props.name).then(s => alive && setSvg(s))
    return () => {
      alive = false
    }
  }, [props.name])
  return <span className="inline-flex shrink-0 items-center justify-center" style={{ width: `${size}px`, height: `${size}px` }} aria-hidden dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
}

const Divider: Jr<{ label?: string }> = ({ props }) => (
  props.label
    ? (
        <div className="flex items-center gap-2 my-2 color-faint text-xs">
          <div className="flex-1 border-t border-base" />
          <span>{props.label}</span>
          <div className="flex-1 border-t border-base" />
        </div>
      )
    : <div className="my-2 border-t border-base" />
)

const buttonVariant: Record<string, string> = {
  primary: 'bg-primary color-white hover:bg-primary/90',
  secondary: 'bg-secondary color-base border border-base hover:bg-active',
  ghost: 'color-base hover:bg-secondary',
  danger: 'bg-red color-white hover:bg-red/90',
}
const Button: Jr<{ label?: string, variant?: string, icon?: string }> = ({ props, on }) => (
  <button
    type="button"
    onClick={() => on('press').emit()}
    className={`inline-flex items-center gap-1.5 rounded px2.5 py1 text-sm font-medium transition ${buttonVariant[props.variant ?? 'secondary'] ?? buttonVariant.secondary}`}
  >
    {props.icon ? <Icon props={{ name: props.icon, size: 16 }} emit={() => {}} on={() => ({ emit: () => {}, shouldPreventDefault: false, bound: false })} /> : null}
    {props.label ? <span>{props.label}</span> : null}
  </button>
)

const TextInput: Jr<{ value?: string, placeholder?: string, label?: string }> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  const input = (
    <input
      className="w-full rounded border border-base bg-base color-base px2 py1 text-sm outline-none focus:border-primary"
      value={value ?? ''}
      placeholder={props.placeholder}
      onChange={(e) => {
        setValue(e.target.value)
        on('change').emit()
      }}
    />
  )
  return props.label
    ? (
        <label className="flex flex-col gap-1 text-sm color-muted">
          <span>{props.label}</span>
          {input}
        </label>
      )
    : input
}

const Switch: Jr<{ value?: boolean, label?: string }> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  const checked = !!value
  return (
    <label className="inline-flex items-center gap-2 text-sm color-base cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          setValue(!checked)
          on('change').emit()
        }}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${checked ? 'bg-primary' : 'bg-active'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-base shadow transition ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      {props.label ? <span>{props.label}</span> : null}
    </label>
  )
}

const KeyValueTable: Jr<{ data?: Record<string, unknown> }> = ({ props }) => (
  <table className="w-full text-sm border-collapse">
    <tbody>
      {Object.entries(props.data ?? {}).map(([k, v]) => (
        <tr key={k} className="border-b border-base">
          <td className="py1 pr3 color-muted font-medium align-top">{k}</td>
          <td className="py1 color-base font-mono break-all">{formatValue(v)}</td>
        </tr>
      ))}
    </tbody>
  </table>
)

interface Col { key: string, label?: string }
const DataTable: Jr<{ columns?: (string | Col)[], rows?: Record<string, unknown>[], height?: number }> = ({ props, on, bindings }) => {
  const [, setSelected] = useBoundProp<unknown>(undefined, bindings?.value)
  const rows = props.rows ?? []
  const columns: Col[] = props.columns?.length
    ? props.columns.map(c => (typeof c === 'string' ? { key: c } : c))
    : rows[0]
      ? Object.keys(rows[0]).map(key => ({ key }))
      : []
  return (
    <div className="rounded border border-base overflow-auto" style={props.height != null ? { maxHeight: `${props.height}px` } : undefined}>
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-secondary">
          <tr>{columns.map(c => <th key={c.key} className="text-left px2 py1.5 color-muted font-medium border-b border-base">{c.label ?? c.key}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-base hover:bg-secondary cursor-pointer"
              onClick={() => {
                setSelected({ row, index })
                on('rowClick').emit()
              }}
            >
              {columns.map(c => <td key={c.key} className="px2 py1 color-base font-mono">{formatValue(row[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CodeBlock: Jr<{ code?: string, height?: number }> = ({ props }) => (
  <pre className="rounded border border-base bg-base p2 text-sm font-mono overflow-auto color-base" style={props.height != null ? { maxHeight: `${props.height}px` } : undefined}><code>{props.code}</code></pre>
)

const Progress: Jr<{ value?: number, max?: number, label?: string }> = ({ props }) => {
  const max = toNumber(props.max, 100)
  const pct = max > 0 ? Math.min(100, Math.max(0, (toNumber(props.value, 0) / max) * 100)) : 0
  return (
    <div className="flex flex-col gap-1">
      {props.label
        ? (
            <div className="flex justify-between text-xs color-muted">
              <span>{props.label}</span>
              <span>{`${Math.round(pct)}%`}</span>
            </div>
          )
        : null}
      <div className="h-2 w-full rounded-full bg-active overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

// The reference Vue frontend renders a rich collapsible tree; a JSON dump is
// enough to witness the same spec rendering through a different frontend.
const Tree: Jr<{ data?: unknown }> = ({ props }) => (
  <pre className="rounded border border-base bg-base p2 text-sm font-mono overflow-auto color-base">{JSON.stringify(props.data ?? null, null, 2)}</pre>
)

const baseReactRegistry: ComponentRegistry = defineRegistry(baseCatalog as never, {
  components: {
    Stack,
    Card,
    Text,
    Badge,
    Button,
    Icon,
    Divider,
    TextInput,
    Switch,
    KeyValueTable,
    DataTable,
    CodeBlock,
    Progress,
    Tree,
  } as never,
}).registry

// ── the dock renderer ───────────────────────────────────────────────────────

interface ViewRpc {
  call: (method: string, ...args: unknown[]) => Promise<unknown>
}

// A spec action name is dispatched as an RPC call of the same name. The
// built-ins the upstream provider handles itself (`setState`/`pushState`/…)
// and promise-probe keys are never bridged.
const RESERVED = new Set(['setState', 'pushState', 'removeState', 'validateForm', 'then', 'catch', 'finally'])
function createActionBridge(rpc: ViewRpc): Record<string, (params?: Record<string, unknown>) => Promise<unknown>> {
  return new Proxy({} as Record<string, (params?: Record<string, unknown>) => Promise<unknown>>, {
    has: (_t, p) => typeof p === 'string' && !RESERVED.has(p),
    get: (_t, prop) => (typeof prop !== 'string' || RESERVED.has(prop)
      ? undefined
      : (params?: Record<string, unknown>) => rpc.call(prop, params)),
  })
}

// The `key={viewId}` remounts the provider (reseeding state) only when the
// view identity changes, not on every live spec update.
function JsonRenderView({ spec, rpc, viewId }: { spec: Spec | null, rpc: ViewRpc, viewId: string }): ReactNode {
  if (!spec)
    return <div className="p4 color-faint text-sm">No view to render.</div>
  return (
    <JSONUIProvider key={viewId} registry={baseReactRegistry} handlers={createActionBridge(rpc)} initialState={spec.state ?? {}}>
      <Renderer spec={spec} registry={baseReactRegistry} />
    </JSONUIProvider>
  )
}

/**
 * A dock renderer implementing the `JsonRenderDockRenderer` contract from
 * `@devframes/json-render/hub`, this example's React frontend replacing the
 * reference Vue one. For a shared-state view it subscribes to the live spec;
 * for an inline view (`entry.view.spec`) it renders the embedded spec
 * directly. Disposes cleanly either way.
 */
export function createReactJsonRenderDockRenderer(): JsonRenderDockRenderer {
  return async ({ entry, container, context }) => {
    const view: JsonRenderViewRef = entry.view
    // The action bridge only needs a loose `call(method, …)`; the client's
    // typed rpc narrows `method` to known keys, so widen that method here.
    const rpc: ViewRpc = { call: context.rpc.call as ViewRpc['call'] }
    const viewId = 'stateKey' in view ? view.stateKey : entry.id
    const root = createRoot(container)

    if ('spec' in view) {
      root.render(<JsonRenderView spec={view.spec} rpc={rpc} viewId={viewId} />)
      return { dispose: () => root.unmount() }
    }

    const state = await context.rpc.sharedState.get<Spec>(view.stateKey)
    const render = () => root.render(<JsonRenderView spec={state.value() as Spec | null} rpc={rpc} viewId={viewId} />)
    render()
    const off = state.on('updated', render)
    return {
      dispose() {
        off()
        root.unmount()
      },
    }
  }
}
