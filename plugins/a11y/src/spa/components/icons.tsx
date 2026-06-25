import type { JSX } from 'solid-js'
import { splitProps } from 'solid-js'

type IconProps = JSX.HTMLAttributes<HTMLSpanElement>

/**
 * The inspector's icons come from the shared Phosphor set (`i-ph-*`, duotone
 * preferred) via UnoCSS, so they match the other devframe plugins. Each icon
 * carries its own size; callers pass `class` for color/transform.
 */
function makeIcon(iconClass: string) {
  return (props: IconProps) => {
    const [local, rest] = splitProps(props, ['class'])
    return <span aria-hidden {...rest} class={`${iconClass}${local.class ? ` ${local.class}` : ''}`} />
  }
}

/** Focus-reticle brand mark — echoes the highlight ring painted in the page. */
export const BrandGlyph = makeIcon('i-ph-scan-duotone size-5')

/** Disclosure chevron for a violation row. */
export const Chevron = makeIcon('i-ph-caret-right size-3.5')

/** Large "all clear" glyph for the empty/clean state. */
export const CheckCircle = makeIcon('i-ph-check-circle-duotone size-10')

/** Large "no page connected" glyph for the disconnected state. */
export const PlugIcon = makeIcon('i-ph-plugs-duotone size-10')
