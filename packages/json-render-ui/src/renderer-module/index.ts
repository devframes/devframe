import type { JsonRenderDockRenderer } from '@devframes/json-render/hub'
import css from '../.generated/css'
import { createJsonRenderDockRenderer } from '../dock-renderer'

// The prebuilt renderer module the hub serves at
// `<base>__renderers/json-render.mjs` (registered via `jsonRenderUiRenderer()`
// from `@devframes/json-render-ui/hub`). Self-contained by design: Vue, the
// upstream renderer, the `@antfu/design` component ports, and the compiled
// stylesheet all ride inside this one file, so any viewer can import it
// natively at runtime with no build step.

const STYLE_MARKER = 'data-devframes-json-render'

/**
 * The theme contract: the viewer mirrors a live `dark` class onto the mount
 * container (or an ancestor in the same tree). Falls back to the page root's
 * class for hand-rolled hosts that only theme `<html>`.
 */
function isDarkFor(container: HTMLElement): boolean {
  if (container.closest('.dark'))
    return true
  if (container.closest('.light'))
    return false
  return document.documentElement.classList.contains('dark')
}

const inner = createJsonRenderDockRenderer()

/**
 * The self-styling `'json-render'` dock renderer. It attaches its own shadow
 * root inside the viewer's container and adopts the compiled stylesheet
 * there - fully styled in a light-DOM host page and inside a viewer's shadow
 * root alike, without leaking the reset or any global rule into the page.
 */
const jsonRenderDockRenderer: JsonRenderDockRenderer = async ({ entry, container, context }) => {
  const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
  if (!shadow.querySelector(`style[${STYLE_MARKER}]`)) {
    const style = document.createElement('style')
    style.setAttribute(STYLE_MARKER, '')
    // The bundled `.vue` components' own `<style>` blocks are extracted by
    // Vite into a CSS asset a self-contained module can't load - the build
    // folds them back in through this namespaced global (see
    // `vite.config.ts`'s `inline-sfc-css` plugin).
    const sfcCss = (globalThis as { __DEVFRAMES_JSON_RENDER_SFC_CSS__?: string }).__DEVFRAMES_JSON_RENDER_SFC_CSS__ ?? ''
    style.textContent = `${css}\n${sfcCss}`
    shadow.append(style)
  }

  // Keep the scheme class on an ancestor. Wind3 emits descendant selectors
  // such as `.dark .bg-base`, which do not match an element carrying both
  // classes itself.
  const colorSchemeRoot = document.createElement('div')
  colorSchemeRoot.style.display = 'contents'
  const root = document.createElement('div')
  root.className = 'devframes-json-render-scroll-root w-full h-full of-auto p4 color-base font-sans text-sm'
  const syncScheme = (): void => {
    const dark = isDarkFor(container)
    colorSchemeRoot.classList.toggle('dark', dark)
    colorSchemeRoot.classList.toggle('light', !dark)
    colorSchemeRoot.style.colorScheme = dark ? 'dark' : 'light'
  }
  syncScheme()
  const observer = new MutationObserver(syncScheme)
  observer.observe(container, { attributes: true, attributeFilter: ['class'] })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  colorSchemeRoot.append(root)
  shadow.append(colorSchemeRoot)

  const instance = await inner({ entry, container: root, context })
  return {
    dispose() {
      observer.disconnect()
      instance.dispose?.()
      colorSchemeRoot.remove()
    },
  }
}

export default jsonRenderDockRenderer
