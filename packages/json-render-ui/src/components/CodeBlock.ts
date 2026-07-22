import type { JrComponent } from './_shared'
import { h } from 'vue'

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
