import type { JSX } from 'solid-js'
import { Show } from 'solid-js'

interface EmptyStateProps {
  /** Icon utility class (with its own size), e.g. `i-ph-plugs-duotone text-4xl`. */
  icon: string
  title: string
  body: JSX.Element
  /** Tints the glyph success-green for the "all clear" case. */
  clean?: boolean
  /** Optional code snippet shown below the body. */
  code?: string
}

/**
 * The centered full-height message shown when there's nothing to list: no page
 * connected, scanning, all-clear, or filtered-to-empty.
 */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center gap-3 h-full p-8 text-center color-muted">
      <span aria-hidden class={`${props.icon} ${props.clean ? 'text-success' : 'color-faint'}`} />
      <p class="text-[15px] font-semibold color-base">{props.title}</p>
      <p class="text-xs leading-relaxed max-w-[38ch]">{props.body}</p>
      <Show when={props.code}>
        <code class="font-mono text-[11.5px] color-muted bg-secondary border border-base rounded-lg px-3 py-2.5 whitespace-pre-wrap break-all text-left max-w-full">
          {props.code}
        </code>
      </Show>
    </div>
  )
}
