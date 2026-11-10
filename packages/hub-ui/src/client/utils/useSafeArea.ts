import type { MaybeElementRef } from '@vueuse/core'
import type { DockMargins } from '../components/dock/dock-layout'
import { tryOnMounted, unrefElement, useDebounceFn, useEventListener } from '@vueuse/core'
import { shallowRef } from 'vue'

/**
 * Ported from VueUse's `useScreenSafeArea` for now: it always sets its CSS variables on
 * `<html>` and has no option for a custom element, which breaks hydration on SSR hosts.
 * Reads the `--devframes-safe-area-*` variables (see `style.css`) from `target`, in px.
 */
export function useSafeArea(target: MaybeElementRef) {
  const insets = shallowRef<DockMargins>({ top: 0, right: 0, bottom: 0, left: 0 })

  function read(style: CSSStyleDeclaration, side: keyof DockMargins) {
    // The computed value is a length such as `34px`, so parse it as a float.
    return Number.parseFloat(style.getPropertyValue(`--devframes-safe-area-${side}`)) || 0
  }

  function update() {
    const element = unrefElement(target)
    if (!element)
      return
    const style = getComputedStyle(element)
    insets.value = {
      top: read(style, 'top'),
      right: read(style, 'right'),
      bottom: read(style, 'bottom'),
      left: read(style, 'left'),
    }
  }

  tryOnMounted(update)
  useEventListener('resize', useDebounceFn(update), { passive: true })

  return insets
}
