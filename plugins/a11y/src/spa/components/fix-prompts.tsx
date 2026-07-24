import type { SelectedItem } from '../lib/fix-prompt.ts'
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { buildFixPrompt } from '../lib/fix-prompt.ts'

export type { SelectedItem } from '../lib/fix-prompt.ts'

interface DialogProps {
  items: SelectedItem[]
  onClose: () => void
}

/**
 * A modal listing the AI fix prompt for the selected violations, with a copy
 * button. Built to the same accessibility bar the tool enforces: labelled
 * dialog, Escape/backdrop to close, focus moved in on open.
 */
export function FixPromptsDialog(props: DialogProps) {
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
    <div class="modal" onClick={() => props.onClose()}>
      <div
        class="modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-prompts-title"
        onClick={e => e.stopPropagation()}
      >
        <div class="modal__head">
          <div>
            <h2 id="fix-prompts-title" class="modal__title">Fix prompts</h2>
            <p class="modal__sub">
              {ruleCount()}
              {' '}
              {ruleCount() === 1 ? 'violation' : 'violations'}
              {' '}
              selected — copy the prompt into your AI assistant.
            </p>
          </div>
          <button type="button" ref={closeBtn} class="modal__close" aria-label="Close" onClick={() => props.onClose()}>
            <span aria-hidden class="i-ph-x shrink-0" />
          </button>
        </div>

        <textarea class="modal__text" readonly aria-label="Generated fix prompt">{prompt()}</textarea>

        <div class="modal__actions">
          <span class="modal__hint">
            <For each={props.items}>
              {(item, i) => (
                <>
                  <Show when={i() > 0}>{', '}</Show>
                  <code>{item.violation.ruleId}</code>
                </>
              )}
            </For>
          </span>
          <span class="flex-1" />
          <button type="button" class="modal__btn" onClick={copy}>
            <span aria-hidden class={`shrink-0 ${copied() ? 'i-ph-check' : 'i-ph-copy'}`} />
            {copied() ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}
