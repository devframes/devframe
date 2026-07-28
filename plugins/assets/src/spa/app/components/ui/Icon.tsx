export interface IconProps {
  name: string
  class?: string
}

/** Renders a UnoCSS icon class (`i-ph-*`), matching the shared Phosphor set. */
export function Icon({ name, class: extra }: IconProps) {
  return <span aria-hidden class={[name, extra].filter(Boolean).join(' ')} />
}
