import { CLIENT_CONTEXT_KEY } from '@devframes/hub/client'

/** Checks whether this window is inside a Hub panel. */
export function isInsideHub(win: { readonly parent: object }): boolean {
  if (win.parent === win)
    return false
  try {
    return !!(win.parent as Window & { [CLIENT_CONTEXT_KEY]?: unknown })[CLIENT_CONTEXT_KEY]
  }
  catch {
    // Cross-origin parents (e.g. StackBlitz) cannot be inspected.
    return false
  }
}
