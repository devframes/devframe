'use client'

import type { BaseComponentProps, ComponentRegistry } from '@json-render/react'
import type { ReactNode } from 'react'
import { baseCatalog } from '@devframes/json-render'
import { defineRegistry, useBoundProp } from '@json-render/react'
import { useEffect, useState } from 'react'

// A deliberately small **React** implementation of the base catalog — the
// "registry replacement" path from the JSON-render plan: a React host renders a
// server-authored spec with its own components instead of the Vue reference
// frontend (@devframes/json-render-ui). Styling uses the same @antfu/design
// semantic tokens so it matches the rest of the hub.

type Jr<P = Record<string, unknown>> = (ctx: BaseComponentProps<P>) => ReactNode

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

function formatValue(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const justifyMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' }

const Stack: Jr<{ direction?: string, gap?: number, padding?: number, align?: string, justify?: string, wrap?: boolean, flex?: number | string }> = ({ props, children }) => {
  const style: Record<string, string> = { display: 'flex', flexDirection: props.direction === 'row' ? 'row' : 'column', gap: `${toNumber(props.gap, 8)}px` }
  if (props.padding != null)
    style.padding = `${toNumber(props.padding, 0)}px`
  if (props.align)
    style.alignItems = alignMap[props.align] ?? props.align
  if (props.justify)
    style.justifyContent = justifyMap[props.justify] ?? props.justify
  if (props.wrap)
    style.flexWrap = 'wrap'
  if (props.flex != null)
    style.flex = String(props.flex)
  return <div style={style}>{children}</div>
}

const Card: Jr<{ title?: string, collapsible?: boolean, defaultCollapsed?: boolean, loading?: boolean }> = ({ props, children, loading }) => {
  const body = <div className="p4">{loading || props.loading ? <div className="color-faint text-sm">Loading…</div> : children}</div>
  const header = 'flex items-center justify-between px4 py2.5 border-b border-base color-base font-medium text-sm'
  if (props.collapsible) {
    return (
      <details className="rounded-xl border border-base bg-base overflow-hidden" open={!props.defaultCollapsed}>
        <summary className={`${header} cursor-pointer select-none list-none`}>
          <span>{props.title}</span>
          <span className="color-faint text-xs">▾</span>
        </summary>
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
  code: { tag: 'code', class: 'text-sm font-mono bg-secondary rounded px1 py0.5' },
}
const colorClass: Record<string, string> = { base: 'color-base', muted: 'color-muted', faint: 'color-faint', primary: 'color-primary', success: 'color-green', warning: 'color-amber', danger: 'color-red' }

const Text: Jr<{ text?: string, variant?: string, weight?: string, color?: string }> = ({ props, children }) => {
  const v = textVariant[props.variant ?? 'body'] ?? textVariant.body
  const cls = [v.class, props.weight === 'bold' ? 'font-bold' : props.weight === 'medium' ? 'font-medium' : '', props.color ? colorClass[props.color] ?? 'color-base' : 'color-base'].join(' ')
  const Tag = v.tag
  return <Tag className={cls}>{props.text ?? children}</Tag>
}

const badgeClass: Record<string, string> = {
  default: 'bg-secondary color-muted',
  success: 'badge-color-green',
  warning: 'badge-color-amber',
  danger: 'badge-color-red',
  info: 'badge-color-blue',
}
const Badge: Jr<{ text?: string, variant?: string, minWidth?: number }> = ({ props, children }) => (
  <span
    className={`inline-flex items-center justify-center rounded px1.5 py0.5 text-xs font-medium ${badgeClass[props.variant ?? 'default'] ?? badgeClass.default}`}
    style={props.minWidth != null ? { minWidth: `${props.minWidth}px` } : undefined}
  >
    {props.text ?? children}
  </span>
)

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
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ fontSize: `${size}px`, width: `${size}px`, height: `${size}px` }}
      aria-label={props.name}
      role="img"
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  )
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
const Button: Jr<{ label?: string, variant?: string, icon?: string, disabled?: boolean, loading?: boolean }> = ({ props, on }) => (
  <button
    type="button"
    disabled={props.disabled || props.loading}
    onClick={() => on('press').emit()}
    className={`inline-flex items-center gap-1.5 rounded px2.5 py1 text-sm font-medium transition disabled:op-50 disabled:cursor-not-allowed ${buttonVariant[props.variant ?? 'secondary'] ?? buttonVariant.secondary}`}
  >
    {props.loading
      ? <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      : props.icon
        ? <Icon props={{ name: props.icon, size: 16 }} emit={() => {}} on={() => ({ emit: () => {}, shouldPreventDefault: false, bound: false })} />
        : null}
    {props.label ? <span>{props.label}</span> : null}
  </button>
)

const TextInput: Jr<{ value?: string, placeholder?: string, label?: string, disabled?: boolean, type?: string, loading?: boolean }> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  const input = (
    <input
      className="w-full rounded border border-base bg-base color-base px2 py1 text-sm outline-none focus:border-primary disabled:op-50"
      type={props.type ?? 'text'}
      value={value ?? ''}
      placeholder={props.placeholder}
      disabled={props.disabled || props.loading}
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

const Switch: Jr<{ value?: boolean, label?: string, disabled?: boolean }> = ({ props, on, bindings }) => {
  const [value, setValue] = useBoundProp(props.value, bindings?.value)
  const checked = !!value
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={props.disabled}
      onClick={() => {
        setValue(!checked)
        on('change').emit()
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:op-50 ${checked ? 'bg-primary' : 'bg-active'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-base shadow transition ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
  return props.label
    ? (
        <label className="inline-flex items-center gap-2 text-sm color-base cursor-pointer">
          {toggle}
          <span>{props.label}</span>
        </label>
      )
    : toggle
}

const KeyValueTable: Jr<{ data?: Record<string, unknown>, loading?: boolean }> = ({ props, loading }) => {
  if (loading || props.loading)
    return <div className="color-faint text-sm">Loading…</div>
  return (
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
}

interface Col { key: string, label?: string }
const DataTable: Jr<{ columns?: (string | Col)[], rows?: Record<string, unknown>[], height?: number, loading?: boolean }> = ({ props, on, bindings, loading }) => {
  const [, setSelected] = useBoundProp<unknown>(undefined, bindings?.value)
  if (loading || props.loading)
    return <div className="color-faint text-sm">Loading…</div>
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

const CodeBlock: Jr<{ code?: string, language?: string, filename?: string, height?: number }> = ({ props }) => (
  <div className="rounded border border-base overflow-hidden bg-base" data-language={props.language}>
    {props.filename || props.language
      ? (
          <div className="flex items-center justify-between px2 py1 border-b border-base bg-secondary text-xs color-faint">
            <span>{props.filename}</span>
            {props.language ? <span className="font-mono uppercase">{props.language}</span> : null}
          </div>
        )
      : null}
    <pre className="p2 text-sm font-mono overflow-auto color-base" style={props.height != null ? { maxHeight: `${props.height}px` } : undefined}><code>{props.code}</code></pre>
  </div>
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

function TreeNode({ value, keyLabel, expanded }: { value: unknown, keyLabel: string | null, expanded: boolean }): ReactNode {
  if (value === null || typeof value !== 'object') {
    const color = typeof value === 'number' ? 'color-primary' : typeof value === 'string' ? 'color-green' : 'color-muted'
    return (
      <div className="flex gap-1 font-mono text-sm">
        {keyLabel != null ? <span className="color-muted">{`${keyLabel}:`}</span> : null}
        <span className={color}>{typeof value === 'string' ? `"${value}"` : String(value)}</span>
      </div>
    )
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>)
  const label = `${keyLabel != null ? `${keyLabel}: ` : ''}${Array.isArray(value) ? `Array(${entries.length})` : 'Object'}`
  return (
    <details className="font-mono text-sm" open={expanded}>
      <summary className="cursor-pointer color-muted select-none">{label}</summary>
      <div className="pl3 border-l border-base ml1">{entries.map(([k, v]) => <TreeNode key={k} value={v} keyLabel={k} expanded={expanded} />)}</div>
    </details>
  )
}
const Tree: Jr<{ data?: unknown, defaultExpanded?: boolean }> = ({ props }) => (
  <div className="color-base"><TreeNode value={props.data} keyLabel={null} expanded={props.defaultExpanded !== false} /></div>
)

const JsonRenderError: Jr<{ message?: string }> = ({ props }) => (
  <div role="alert" className="rounded border border-red bg-red:10 color-red text-xs font-mono px2 py1">{props.message ?? 'Invalid element'}</div>
)

export const ERROR_COMPONENT_TYPE = '__jsonRenderError'

export const baseReactRegistry: ComponentRegistry = defineRegistry(baseCatalog as never, {
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
    [ERROR_COMPONENT_TYPE]: JsonRenderError,
  } as never,
}).registry
