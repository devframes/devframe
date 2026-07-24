import { Show } from 'solid-js'

interface MetaLineProps {
  url?: string
  engine?: string
  backend: () => string | null
  status?: () => string | null
}

/** The mono meta strip under the nav: scanned URL, backend tag, axe version. */
export function MetaLine(props: MetaLineProps) {
  // The backend is optional here, so a degraded connection is shown as a quiet
  // tag rather than taking over the panel.
  const degraded = () => {
    const s = props.status?.()
    return s === 'disconnected' || s === 'unauthorized' || s === 'error' ? s : null
  }
  return (
    <Show when={props.url}>
      <div class="flex items-center gap-2 px-4 py-1.5 font-mono text-[11.5px] color-faint border-b border-base bg-base">
        <span class="flex-1 truncate color-muted" title={props.url}>{props.url}</span>
        <Show
          when={degraded()}
          fallback={<Show when={props.backend()}>{b => <span class="shrink-0 px-1.5 py-px border border-base rounded">{b()}</span>}</Show>}
        >
          {s => <span class="shrink-0 px-1.5 py-px border border-amber-500/60 rounded text-amber-500 capitalize" title="devframe backend connection">{s()}</span>}
        </Show>
        <Show when={props.engine}>
          <span class="shrink-0 px-1.5 py-px border border-base rounded">
            axe
            {' '}
            {props.engine}
          </span>
        </Show>
      </div>
    </Show>
  )
}
