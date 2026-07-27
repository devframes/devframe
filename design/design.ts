// @unocss-include
// Shared devframe -> @antfu/design class helpers: framework-neutral builders
// returning @antfu/design's semantic shortcut classes, so every surface (Solid,
// Svelte, React, Preact, vanilla) looks identical to the antfu Vue components.
// The `@unocss-include` marker makes UnoCSS emit the runtime-assembled class
// chains below; `design/uno.config.ts` adds this file to every app's content so
// the chains are extracted regardless of framework.
// Tag palette kept literal for extraction: badge-color-blue badge-color-amber
// badge-color-green badge-color-red badge-color-sky badge-color-violet
// badge-color-rose badge-color-teal badge-color-orange badge-color-emerald

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
export type ButtonSize = 'md' | 'sm' | 'lg'
export interface ButtonProps { variant?: ButtonVariant, size?: ButtonSize, class?: string }

export function button({ variant = 'primary', size = 'md', class: extra }: ButtonProps = {}): string {
  const variantClass: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-action',
    outline: 'btn-action',
    ghost: 'inline-flex items-center justify-center gap-1.5 rounded px2 py1 op75 hover:op100 hover:bg-active transition disabled:pointer-events-none disabled:op30!',
    destructive: 'btn-action text-error border-error/30!',
    link: 'inline-flex items-center gap-1.5 color-active hover:underline underline-offset-2',
  }
  const sizeClass = size === 'sm'
    ? (variant === 'primary' ? 'text-sm px-2.5! py-1!' : 'text-sm')
    : size === 'lg' ? 'text-base px-4! py-2!' : ''
  return cx(variantClass[variant], sizeClass, extra)
}

export type IconButtonVariant = 'outline' | 'ghost'
export type IconButtonSize = 'md' | 'sm'
export interface IconButtonProps { variant?: IconButtonVariant, size?: IconButtonSize, class?: string }

export function iconButton({ variant = 'outline', size = 'md', class: extra }: IconButtonProps = {}): string {
  const base = variant === 'ghost' ? 'btn-icon' : 'btn-icon-square'
  const sizeClass = size === 'sm' ? 'w-7! h-7! text-sm' : ''
  return cx(base, sizeClass, extra)
}

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
export interface BadgeProps { variant?: BadgeVariant, class?: string }

export function badge({ variant = 'secondary', class: extra }: BadgeProps = {}): string {
  const variantClass: Record<BadgeVariant, string> = {
    primary: 'badge-active',
    secondary: 'badge-muted',
    success: 'badge badge-color-green',
    warning: 'badge badge-color-amber',
    destructive: 'badge badge-color-red',
    outline: 'badge border border-base',
  }
  return cx(variantClass[variant], extra)
}

export function tag(color: string, extra?: string): string {
  return cx('badge', `badge-color-${color}`, extra)
}

export function tabsList(extra?: string): string {
  return cx('inline-flex items-center gap-1 p-1 rounded-lg bg-secondary w-max', extra)
}

export function tab(extra?: string): string {
  return cx(
    'px-3 py-1 rounded-md text-sm color-muted inline-flex gap-1.5 items-center whitespace-nowrap select-none cursor-pointer transition outline-none hover:color-base focus-visible:ring-2 focus-visible:ring-primary-500/40 data-[state=active]:bg-base data-[state=active]:color-base data-[state=active]:shadow-sm',
    extra,
  )
}

export interface NavTabProps { active?: boolean, class?: string }
export function navTab({ active = false, class: extra }: NavTabProps = {}): string {
  return cx(
    'relative inline-flex items-center gap-1.5 max-w-52 px-2 py-1 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition hover:op100 hover:bg-active',
    active && 'op100! bg-active border-base! color-base',
    extra,
  )
}

export function nav(extra?: string): string {
  return cx('flex items-center gap-2 shrink-0 h-nav px-3 border-b border-base bg-base z-nav', extra)
}

export function navBrand(extra?: string): string {
  return cx('flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none', extra)
}

// Mirrors devframe's `DevframeConnectionStatus` (kept local so this class-helper
// module stays free of package imports); the two share the same string members.
export type ConnectionStatus = 'connecting' | 'connected' | 'unauthorized' | 'disconnected' | 'error'

export interface ConnectionIndicator {
  /** Short status label, e.g. `disconnected`. */
  label: string
  /** Class chain for the status dot. */
  dot: string
  /** Class chain for the pill wrapper. */
  class: string
}

const CONNECTION_TONE: Record<Exclude<ConnectionStatus, 'connected'>, { label: string, dot: string }> = {
  connecting: { label: 'connecting…', dot: 'bg-neutral-400 animate-pulse' },
  disconnected: { label: 'disconnected', dot: 'bg-error' },
  unauthorized: { label: 'unauthorized', dot: 'bg-warning' },
  error: { label: 'error', dot: 'bg-error' },
}

// The shared top-nav connection indicator: a small status dot + label. Returns
// `null` when the client is `connected`, so every surface renders the indicator
// only while the connection is not live.
export function connectionIndicator(status: ConnectionStatus, extra?: string): ConnectionIndicator | null {
  if (status === 'connected')
    return null
  const tone = CONNECTION_TONE[status]
  return {
    label: tone.label,
    dot: cx('inline-block size-1.5 rounded-full shrink-0', tone.dot),
    class: cx('flex items-center gap-1.5 shrink-0 text-xs color-muted select-none', extra),
  }
}

export interface ConnectionStateCopy {
  /** Phosphor icon for the state glyph. */
  icon: string
  /** Short heading, e.g. `Disconnected`. */
  title: string
  /** One-line explanation of the state and how to recover. */
  body: string
  /** Whether to offer the reload recovery button (every state but `connecting`). */
  reloadable: boolean
  /** Whether the glyph should animate while the handshake is in flight. */
  spin: boolean
}

const CONNECTION_STATE: Record<Exclude<ConnectionStatus, 'connected'>, ConnectionStateCopy> = {
  connecting: {
    icon: 'i-ph-plugs-connected-duotone',
    title: 'Connecting…',
    body: 'Establishing a connection to the devframe server.',
    reloadable: false,
    spin: true,
  },
  disconnected: {
    icon: 'i-ph-plugs-duotone',
    title: 'Disconnected',
    body: 'Lost the connection to the devframe server. Reload once it is back up.',
    reloadable: true,
    spin: false,
  },
  unauthorized: {
    icon: 'i-ph-lock-key-duotone',
    title: 'Not authorized',
    body: 'This client isn’t authorized. Reopen the link printed by your dev server, then reload.',
    reloadable: true,
    spin: false,
  },
  error: {
    icon: 'i-ph-warning-octagon-duotone',
    title: 'Connection failed',
    body: 'Could not reach the devframe server.',
    reloadable: true,
    spin: false,
  },
}

// The shared full-panel connection state copy: shown whenever the client isn't
// `connected`, so a surface never sits on an infinite spinner without saying
// why. Returns `null` when connected. Pair with the `connection*` class builders
// below so every surface renders the identical centered glyph + title + body.
export function connectionState(status: ConnectionStatus): ConnectionStateCopy | null {
  if (status === 'connected')
    return null
  return CONNECTION_STATE[status]
}

// Centered fill for the full-panel state; each surface adds its own fill
// strategy (`h-full`, `h-svh w-full`, `absolute inset-0`, …) via `extra`.
export function connectionPanel(extra?: string): string {
  return cx('flex flex-col items-center justify-center gap-4 bg-base p-8 text-center', extra)
}

export function connectionGlyph(spin = false, extra?: string): string {
  return cx('text-4xl color-active', spin && 'animate-pulse', extra)
}

export function connectionTitle(extra?: string): string {
  return cx('text-lg font-medium color-base', extra)
}

export function connectionBody(extra?: string): string {
  return cx('max-w-sm text-sm color-muted', extra)
}

export function connectionDetail(extra?: string): string {
  return cx('mt-1 max-w-sm break-words font-mono text-xs color-faint', extra)
}

export function toolbar(extra?: string): string {
  return cx('flex items-center gap-2 shrink-0 h-8 px-2.5 border-b border-base bg-secondary text-sm', extra)
}

export function card(extra?: string): string {
  return cx('flex flex-col rounded-xl border border-base bg-base shadow-sm', extra)
}

export function modalBackdrop(extra?: string): string {
  return cx('fixed inset-0 z-modal-backdrop grid place-items-center p-4 bg-black/40 backdrop-blur-sm', extra)
}

export function modalCard(extra?: string): string {
  return cx('z-modal-content w-full max-w-sm flex flex-col gap-3 p-4 rounded-xl border border-base bg-base shadow-lg', extra)
}

export function panel(extra?: string): string {
  return cx('rounded-lg border border-base bg-base', extra)
}

export function input(extra?: string): string {
  return cx('w-full min-w-0 rounded border border-base bg-base px-2.5 py-1 text-sm outline-none transition placeholder:color-faint focus-visible:border-active focus-visible:ring-2 focus-visible:ring-primary-500/40', extra)
}

export function link(extra?: string): string {
  return cx('color-active hover:underline underline-offset-2', extra)
}

export type DotState = 'running' | 'idle' | 'error'
export function dot(state: DotState, extra?: string): string {
  const stateClass: Record<DotState, string> = {
    running: 'bg-success',
    idle: 'bg-neutral-400',
    error: 'bg-error',
  }
  return cx('inline-block size-1.5 rounded-full shrink-0', stateClass[state], extra)
}

export function spinner(extra?: string): string {
  return cx('inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin', extra)
}
