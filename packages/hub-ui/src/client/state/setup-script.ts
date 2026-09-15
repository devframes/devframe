import type { ClientScriptEntry, DevframeDockUserEntry } from '@devframes/hub'
import type { DevframeRpcClient, DockClientScriptContext } from '@devframes/hub/client'
import { clientScriptFailureHint, resolveClientModuleSpecifier } from '@devframes/hub/client'

/** Resolve the existing script field for this dock kind. */
export function clientScriptOf(entry: DevframeDockUserEntry): ClientScriptEntry | undefined {
  if (entry.type === 'iframe')
    return entry.clientScript
  if (entry.type === 'action')
    return entry.action
  if (entry.type === 'custom-render')
    return entry.renderer
}

async function _executeSetupScript(
  entry: DevframeDockUserEntry,
  context: DockClientScriptContext,
  script: ClientScriptEntry | undefined,
): Promise<void> {
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
    /** Trust may change while the module is loading; rejection keeps setup retryable. */
    if (!context.rpc.isTrusted)
      throw new Error('[@devframes/hub-ui] RPC client is no longer trusted')
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
const setupPromisesByRpc = new WeakMap<DevframeRpcClient, Map<string, Promise<void>>>()

/** Cache setup per RPC connection and dock; explicit action clicks always run again. */
export function executeSetupScript(
  entry: DevframeDockUserEntry,
  context: DockClientScriptContext,
  cache = entry.type !== 'action',
): Promise<void> {
  const script = clientScriptOf(entry)
  let setupPromises = setupPromisesByRpc.get(context.rpc)
  if (!setupPromises) {
    setupPromises = new Map()
    setupPromisesByRpc.set(context.rpc, setupPromises)
  }
  const key = JSON.stringify([entry.id, script?.importFrom, script?.importName ?? 'default'])
  const existing = setupPromises.get(key)
  if (cache && existing)
    return existing
  const promise = _executeSetupScript(entry, context, script)
  if (!cache)
    return promise
  setupPromises.set(key, promise)
  void promise.catch(() => {
    /** Failed setup can retry on activation or a later dock publication. */
    if (setupPromises.get(key) === promise)
      setupPromises.delete(key)
  })
  return promise
}
