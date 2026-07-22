// @unocss-include
// Co-located devframe -> @antfu/design class helpers: framework-neutral builders
// returning @antfu/design's semantic shortcut classes, so this Solid surface
// looks identical to the antfu Vue components. The `@unocss-include` marker makes
// UnoCSS emit the runtime-assembled class chains below.
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

export function toolbar(extra?: string): string {
  return cx('flex items-center gap-2 shrink-0 h-8 px-2.5 border-b border-base bg-secondary text-sm', extra)
}

export function card(extra?: string): string {
  return cx('flex flex-col rounded-xl border border-base bg-base shadow-sm', extra)
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
