import type { JrComponent } from './_shared'
import { h } from 'vue'
import { Icon } from './Icon'

interface LinkProps {
  href?: string
  label?: string
  /** Icon name resolved at runtime (e.g. `ph:arrow-square-out`), rendered before the label. */
  icon?: string
  /** Open in a new tab. Defaults to `true` for `http(s)` URLs. */
  external?: boolean
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * Specs can come from a streamed/model-generated source, so a `javascript:`
 * href here would execute in the host page. Only resolve to an anchor for
 * schemes that can't run script.
 */
function resolveHref(href: string | undefined): string | undefined {
  if (!href)
    return undefined
  try {
    const url = new URL(href, typeof location === 'undefined' ? 'http://localhost' : location.href)
    return ALLOWED_SCHEMES.has(url.protocol) ? href : undefined
  }
  catch {
    return undefined
  }
}

export const Link: JrComponent<LinkProps> = ({ props }) => {
  const href = resolveHref(props.href)
  const content = [
    props.icon ? Icon({ props: { name: props.icon, size: 14 } } as Parameters<typeof Icon>[0]) : null,
    h('span', props.label ?? href),
  ]
  if (!href)
    return h('span', { class: 'inline-flex items-center gap-1.5' }, content)

  const openInNewTab = props.external ?? href.startsWith('http')
  return h('a', {
    href,
    target: openInNewTab ? '_blank' : undefined,
    rel: openInNewTab ? 'noopener noreferrer' : undefined,
    class: 'inline-flex items-center gap-1.5 color-active hover:underline underline-offset-2',
  }, content)
}
