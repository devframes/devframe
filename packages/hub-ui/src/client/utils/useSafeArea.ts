import type { MaybeElementRef } from '@vueuse/core'
import { tryOnMounted, unrefElement, useDebounceFn, useEventListener } from '@vueuse/core'
import { shallowRef } from 'vue'

/**
 * Ported from VueUse's `useScreenSafeArea` for now: it always sets its CSS variables on
 * `<html>` and has no option for a custom element, which breaks hydration on SSR hosts.
 */
export function useSafeArea(target: MaybeElementRef) {
  const top = shallowRef('')
  const right = shallowRef('')
  const bottom = shallowRef('')
  const left = shallowRef('')

  function update() {
    const element = unrefElement(target)
    if (!element)
      return
    const style = getComputedStyle(element)
    top.value = style.getPropertyValue('--devframes-safe-area-top')
    right.value = style.getPropertyValue('--devframes-safe-area-right')
    bottom.value = style.getPropertyValue('--devframes-safe-area-bottom')
    left.value = style.getPropertyValue('--devframes-safe-area-left')
  }

  tryOnMounted(update)
  useEventListener('resize', useDebounceFn(update), { passive: true })

  return { top, right, bottom, left, update }
}
