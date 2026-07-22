import type { JrComponent } from './_shared'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import { h } from 'vue'

interface TextProps {
  text?: string
  variant?: 'heading' | 'subheading' | 'body' | 'caption' | 'code'
  weight?: 'normal' | 'medium' | 'bold'
  color?: 'base' | 'muted' | 'faint' | 'primary' | 'success' | 'warning' | 'danger'
}

const textVariant: Record<string, { tag: string, class: string }> = {
  heading: { tag: 'h2', class: 'text-lg font-semibold' },
  subheading: { tag: 'h3', class: 'text-base font-medium' },
  body: { tag: 'p', class: 'text-sm' },
  caption: { tag: 'span', class: 'text-xs color-faint' },
  code: { tag: 'code', class: 'text-sm font-mono bg-secondary rounded px1 py0.5' },
}

const colorClass: Record<string, string> = {
  base: 'color-base',
  muted: 'color-muted',
  faint: 'color-faint',
  primary: 'color-primary',
  success: 'color-green',
  warning: 'color-amber',
  danger: 'color-red',
}

export const Text: JrComponent<TextProps> = ({ props, children }) => {
  const variant = textVariant[props.variant ?? 'body'] ?? textVariant.body
  const classes = [variant.class]
  if (props.weight === 'bold')
    classes.push('font-bold')
  else if (props.weight === 'medium')
    classes.push('font-medium')
  if (props.color)
    classes.push(colorClass[props.color] ?? 'color-base')
  else classes.push('color-base')
  return h(variant.tag, { class: classes.join(' ') }, props.text ?? (children as any))
}

interface BadgeProps {
  text?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  minWidth?: number
}

// Map the catalog's semantic variants onto `@antfu/design` `DisplayBadge`
// palette color names (`false` = neutral/muted). The resulting
// `badge-color-<name>` classes are safelisted (see the package uno.config and
// the JSON-Render docs) since a spec picks the variant at runtime.
const badgeColor: Record<string, boolean | string> = {
  default: false,
  success: 'green',
  warning: 'amber',
  danger: 'red',
  info: 'blue',
}

export const Badge: JrComponent<BadgeProps> = ({ props, children }) => {
  const style = props.minWidth != null ? { minWidth: `${props.minWidth}px` } : undefined
  return h(
    DisplayBadge,
    { text: props.text, color: badgeColor[props.variant ?? 'default'], style },
    props.text ? undefined : () => children,
  )
}

interface CodeBlockProps {
  code?: string
  language?: string
  filename?: string
  height?: number
}

export const CodeBlock: JrComponent<CodeBlockProps> = ({ props }) => {
  const header = props.filename || props.language
    ? h('div', { class: 'flex items-center justify-between px2 py1 border-b border-base bg-secondary text-xs color-faint' }, [
        h('span', props.filename ?? ''),
        props.language ? h('span', { class: 'font-mono uppercase' }, props.language) : null,
      ])
    : null
  const preStyle = props.height != null ? { maxHeight: `${props.height}px` } : undefined
  return h('div', { 'class': 'rounded border border-base overflow-hidden bg-base', 'data-language': props.language }, [
    header,
    h(
      'pre',
      { class: 'p2 text-sm font-mono overflow-auto color-base', style: preStyle },
      h('code', props.code ?? ''),
    ),
  ])
}
