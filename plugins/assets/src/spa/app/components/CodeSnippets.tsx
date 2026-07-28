import type { CodeSnippet } from '../../../types'
import { useState } from 'preact/hooks'
import { Icon } from './ui/Icon'

export interface CodeSnippetsProps {
  snippets: CodeSnippet[]
}

export function CodeSnippets({ snippets }: CodeSnippetsProps) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const current = snippets[Math.min(active, snippets.length - 1)]

  async function copy() {
    await navigator.clipboard.writeText(current.code)
    setCopied(true)
    setTimeout(setCopied, 1500, false)
  }

  return (
    <div class="-mx-4 -mb-4 border-t border-base px-4 pb-4 pt-3">
      <div class="mb-2 flex items-center gap-1 overflow-x-auto">
        {snippets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            class={`shrink-0 rounded px-2 py-1 text-xs ${i === active ? 'bg-active color-base' : 'op-fade hover:bg-active'}`}
            onClick={() => setActive(i)}
          >
            {s.name}
          </button>
        ))}
        <span class="flex-1" />
        <button type="button" class="shrink-0 rounded p-1 op-fade hover:bg-active hover:op-100" onClick={copy} title="Copy">
          <Icon name={copied ? 'i-ph-check' : 'i-ph-copy'} />
        </button>
      </div>
      <pre class="overflow-x-auto rounded-lg bg-secondary p-3 text-xs font-mono"><code>{current.code}</code></pre>
    </div>
  )
}
