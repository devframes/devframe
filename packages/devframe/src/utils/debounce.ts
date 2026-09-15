/**
 * Promise-aware debounce, bundled in so any integration can reuse it through
 * `devframe/utils/debounce` without adding its own `perfect-debounce`
 * dependency. Thin re-export of `perfect-debounce`'s `debounce`; the bytes
 * live once in devframe's dist.
 */
export type { DebouncedReturn, DebounceOptions } from 'perfect-debounce'
export { debounce } from 'perfect-debounce'
