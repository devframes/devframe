import type { SelectedItem } from '../lib/fix-prompt.ts'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { button } from '../design'
import { buildFixPrompt } from '../lib/fix-prompt.ts'

export type { SelectedItem } from '../lib/fix-prompt.ts'

interface FixPromptsDialogProps {
  items: SelectedItem[]
  onClose: () => void
}

/**
 * A modal listing the AI fix prompt for the selected violations, with a copy
 * button. Built to the same accessibility bar the tool enforces: labelled
 * dialog, Escape/backdrop to close, focus moved in on open.
 */
export function FixPromptsDialog(props: FixPromptsDialogProps) {
  const prompt = createMemo(() => buildFixPrompt(props.items))
  const ruleCount = () => props.items.length
  const [copied, setCopied] = createSignal(false)
  let closeBtn: HTMLButtonElement | undefined

  function copy() {
    void navigator.clipboard?.writeText(prompt()).then(() => {
      setCopied(true)
      setTimeout(setCopied, 1500, false)
    })
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape')
      props.onClose()
  }

  onMount(() => {
    addEventListener('keydown', onKeyDown)
    closeBtn?.focus()
  })
  onCleanup(() => removeEventListener('keydown', onKeyDown))

  return (
    <div class="fixed inset-0 z-modal-content flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm" onClick={() => props.onClose()}>
      <div
        class="flex flex-col gap-3 w-[min(680px,100%)] max-h-full p-4 bg-secondary border border-base rounded-xl shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-prompts-title"
        onClick={e => e.stopPropagation()}
      >
        <div class="flex items-start gap-2.5">
          <div>
            <h2 id="fix-prompts-title" class="m-0 text-[15px] font-semibold color-base">Fix prompts</h2>
            <p class="mt-0.5 text-xs color-muted">
              {ruleCount()}
              {' '}
              {ruleCount() === 1 ? 'violation' : 'violations'}
              {' '}
              selected — copy the prompt into your AI assistant.
            </p>
          </div>
          <button type="button" ref={closeBtn} class="ml-auto inline-flex p-1.5 rounded color-muted cursor-pointer transition hover:bg-active hover:color-base outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40" aria-label="Close" onClick={() => props.onClose()}>
            <span aria-hidden class="i-ph-x shrink-0" />
          </button>
        </div>

        <textarea class="flex-1 min-h-60 resize-none w-full p-3 bg-base border border-base rounded-lg font-mono text-[11.5px] leading-relaxed color-base whitespace-pre overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40" readonly aria-label="Generated fix prompt">{prompt()}</textarea>

        <div class="flex items-center gap-2.5">
          <span class="min-w-0 truncate text-[11px] color-faint">
            <For each={props.items}>
              {(item, i) => (
                <>
                  <Show when={i() > 0}>{', '}</Show>
                  <code class="font-mono">{item.violation.ruleId}</code>
                </>
              )}
            </For>
          </span>
          <span class="flex-1" />
          <button type="button" class={button({ variant: 'primary', size: 'sm' })} onClick={copy}>
            <span aria-hidden class={`shrink-0 ${copied() ? 'i-ph-check' : 'i-ph-copy'}`} />
            {copied() ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}
