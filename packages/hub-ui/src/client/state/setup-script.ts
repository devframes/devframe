import type { ClientScriptEntry, DevframeDockUserEntry } from '@devframes/hub'
import type { DockClientScriptContext } from '@devframes/hub/client'
import { clientScriptFailureHint, resolveClientModuleSpecifier } from '@devframes/hub/client'

/**
 * Resolve the {@link ClientScriptEntry} a dock entry carries: an `action`'s
 * `action`, a `custom-render`'s `renderer`, or an iframe's `clientScript`.
 */
function clientScriptOf(entry: DevframeDockUserEntry): ClientScriptEntry | undefined {
  switch (entry.type) {
    case 'action':
      return entry.action
    case 'custom-render':
      return entry.renderer
    case 'iframe':
      return entry.clientScript
    default:
      return undefined
  }
}

async function _executeSetupScript(
  entry: DevframeDockUserEntry,
  context: DockClientScriptContext,
): Promise<void> {
  const script = clientScriptOf(entry)
  if (!script?.importFrom)
    throw new Error(`[@devframes/hub-ui] Dock entry "${entry.id}" carries no client script to run`)
  // A bare specifier resolves through the host-advertised template; URL
  // specifiers pass through untouched. Mirrors `@devframes/hub`'s
  // `createDevframeClientRuntime` (rpc reads optional-chained for partial stubs).
  const specifier = resolveClientModuleSpecifier(script.importFrom, {
    template: context.rpc.connectionMeta?.configs?.dock?.clientModuleResolution,
    metaBaseUrl: context.rpc.connection?.metaBaseUrl,
  })
  try {
    // Keep this a *native* dynamic import in every bundler, because the specifier is
    // a runtime URL served by the hub, not a build-time module. Mirrors the
    // client-script loading of `@devframes/hub`'s `createDevframeClientRuntime`.
    const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)
    const fn = mod[script.importName ?? 'default']
    if (typeof fn !== 'function')
      throw new Error(`[@devframes/hub-ui] "${specifier}" exports no callable "${script.importName ?? 'default'}"`)
    await fn(context)
  }
  catch (error) {
    // TODO: maybe popup a error toast here?
    // TODO: A unified logger API
    console.error(
      `[@devframes/hub-ui] Error executing client script from ${specifier}${clientScriptFailureHint(script.importFrom, specifier)}`,
      error,
    )
    throw error
  }
}
const _setupPromises = new Map<string, Promise<void>>()
export function executeSetupScript(
  entry: DevframeDockUserEntry,
  context: DockClientScriptContext,
): Promise<void> {
  // Actions should re-execute on every click; only cache non-action scripts
  if (entry.type !== 'action' && _setupPromises.has(entry.id))
    return _setupPromises.get(entry.id)!
  const promise = _executeSetupScript(entry, context)
  if (entry.type !== 'action')
    _setupPromises.set(entry.id, promise)
  return promise
}
