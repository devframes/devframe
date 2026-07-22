import type { JrComponent } from './_shared'
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

// Generic typography — `@antfu/design` has no single equivalent, so it stays a
// thin custom component over the shared semantic tokens.
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
