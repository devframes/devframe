import { Show } from 'solid-js'
import { button, nav, navBrand } from '../design'

interface HeaderProps {
  agentReady: boolean
  scanning: boolean
  selectedCount: number
  onGenerate: () => void
  onRescan: () => void
}

/** The top nav bar: brand, connection status, generate-prompts, and rescan. */
export function Header(props: HeaderProps) {
  const statusLabel = () =>
    !props.agentReady ? 'No page connected' : props.scanning ? 'Scanning…' : 'Connected'
  const dotClass = () =>
    !props.agentReady ? 'bg-neutral-400' : props.scanning ? 'bg-primary-500 animate-pulse' : 'bg-success'

  return (
    <header class={nav()}>
      <span class={navBrand()}>
        <span aria-hidden class="i-ph-person-simple-circle-duotone text-base color-active" />
        <span>A11y Inspector</span>
      </span>
      <span class="flex-1" />
      <span class="inline-flex items-center gap-1.5 text-xs color-muted select-none">
        <span class={`size-2 rounded-full shrink-0 ${dotClass()}`} />
        {statusLabel()}
      </span>
      <button
        type="button"
        class={button({ variant: 'secondary', size: 'sm' })}
        onClick={() => props.onGenerate()}
        disabled={props.selectedCount === 0}
        title="Generate AI fix prompts for the selected violations"
      >
        <span aria-hidden class="i-ph-sparkle-duotone shrink-0" />
        Generate fix prompts
        <Show when={props.selectedCount > 0}>
          <span class="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-active text-[10px] font-bold tabular-nums">
            {props.selectedCount}
          </span>
        </Show>
      </button>
      <button
        type="button"
        class={button({ variant: 'primary', size: 'sm' })}
        onClick={() => props.onRescan()}
        disabled={!props.agentReady || props.scanning}
      >
        <span aria-hidden class="i-ph-arrows-clockwise shrink-0" classList={{ 'animate-spin': props.scanning }} />
        Rescan
      </button>
    </header>
  )
}
