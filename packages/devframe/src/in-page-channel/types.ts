import type { EventEmitter } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { RpcArgsSchema, RpcReturnSchema, Thenable } from '../rpc/types'
import type { InferArgsType, InferReturnType } from '../rpc/utils'

/**
 * The shared contract of one in-page channel, declared once (usually in a
 * `shared/protocol.ts` both sides import) and passed to both endpoints as a
 * type parameter. Purely a type — the only runtime companion is the
 * channel-name constant declared next to it.
 */
export interface InPageChannelProtocol {
  /** Functions implemented by the page script, callable by panels. */
  pageScript?: Record<string, (...args: any[]) => any>
  /** Functions implemented by panels, callable by the page script. */
  panel?: Record<string, (...args: any[]) => any>
  /**
   * Shared-state slots. The page script is the authority: it owns the
   * canonical value; panels are seeded on connect and converge through
   * syncId-deduplicated patches.
   */
  sharedStates?: Record<string, object>
}

type SideFunctions<S> = S extends Record<string, (...args: any[]) => any> ? S : Record<string, never>
type PageScriptFunctions<P extends InPageChannelProtocol> = SideFunctions<NonNullable<P['pageScript']>>
type PanelFunctions<P extends InPageChannelProtocol> = SideFunctions<NonNullable<P['panel']>>
type SharedStates<P extends InPageChannelProtocol>
  = P['sharedStates'] extends Record<string, object> ? P['sharedStates'] : Record<string, never>

type FnArgs<F> = F extends (...args: infer A) => any ? A : never
type FnReturn<F> = F extends (...args: any[]) => infer R ? Awaited<R> : never

/**
 * Converts a protocol function to its accepted endpoint handler.
 *
 * @internal
 */
type ProtocolHandler<F> = F extends (...args: any[]) => any
  ? (...args: FnArgs<F>) => Thenable<FnReturn<F>>
  : never

/**
 * Types of an in-page channel function — `RpcFunctionType` minus the
 * server-only `static`: `event` is fire-and-forget (the only type valid for
 * fan-out), `action` performs, `query` requests data (the default).
 */
export type InPageFunctionType = 'action' | 'event' | 'query'

/**
 * An in-page channel function definition — the `defineRpcFunction` authoring
 * shape (`name`, `type`, Standard-Schema `args`/`returns`,
 * `jsonSerializable`, `handler`) narrowed to the browser: there is no
 * `dump`/`snapshot`/`cacheable`/`agent`. When `jsonSerializable` is `true`,
 * payloads are strictly validated at the receiving endpoint and misshapen
 * values reject the call with a descriptive `InPageChannelError` instead of
 * a cryptic `DataCloneError` in the port.
 */
export type InPageFunctionDefinition<
  NAME extends string,
  TYPE extends InPageFunctionType = 'query',
  ARGS extends any[] = [],
  RETURN = void,
  AS extends RpcArgsSchema | undefined = undefined,
  RS extends RpcReturnSchema | undefined = undefined,
>
  = [AS, RS] extends [undefined, undefined]
    ? {
        name: NAME
        type?: TYPE
        args?: AS
        returns?: RS
        jsonSerializable?: boolean
        handler: (...args: ARGS) => RETURN
      }
    : {
        name: NAME
        type?: TYPE
        /** Standard Schema array validating (and typing) the arguments. */
        args: AS
        /** Standard Schema typing the resolved return value. */
        returns: RS
        jsonSerializable?: boolean
        handler: (...args: InferArgsType<AS>) => Thenable<InferReturnType<RS>>
      }

/**
 * Loosely-typed definition used by the internal function registry.
 *
 * @internal
 */
export type InPageFunctionDefinitionAny = InPageFunctionDefinition<string, any, any, any, any, any>

/**
 * Function metadata with its handler constrained by a protocol function.
 *
 * @internal
 */
interface InPageFunctionOption<F> {
  type?: InPageFunctionType
  /** Optional Standard Schema array validating the arguments. */
  args?: RpcArgsSchema
  /** Optional Standard Schema validating the resolved return value. */
  returns?: RpcReturnSchema
  jsonSerializable?: boolean
  handler: ProtocolHandler<F>
}

/**
 * Functions implemented by {@link createPageScriptChannel}.
 *
 * @internal
 */
type CreatePageScriptChannelOptionsFunctions<P extends InPageChannelProtocol> = {
  [NAME in keyof PageScriptFunctions<P> & string]: InPageFunctionOption<PageScriptFunctions<P>[NAME]>
}

/**
 * Functions implemented by {@link connectPanelChannel}.
 *
 * @internal
 */
type ConnectPanelChannelOptionsFunctions<P extends InPageChannelProtocol> = {
  [NAME in keyof PanelFunctions<P> & string]: InPageFunctionOption<PanelFunctions<P>[NAME]>
}

/**
 * Connection lifecycle of a panel endpoint: `connecting` (handshake retry
 * loop running, outgoing traffic buffered) → `connected` → back to
 * `connecting` on port loss, or `closed` after `close()` (permanent).
 */
export type InPageChannelStatus = 'connecting' | 'connected' | 'closed'

/**
 * Options shared by both in-page channel endpoints.
 *
 * @internal
 */
interface InPageChannelCommonOptions {
  /**
   * Channel name, namespaced with the devframe id by convention
   * (e.g. `devframes:plugin:a11y`). Both endpoints must use the same name.
   */
  name: string
  /**
   * Origins accepted during the handshake (and used as `targetOrigin` when
   * posting handshake messages). The in-page channel is same-origin by
   * definition, so this defaults to `[location.origin]`.
   */
  allowedOrigins?: string[]
  /**
   * Timeout for request/response calls, in milliseconds; `-1` disables.
   * Rejections are `InPageChannelError`s (code `timeout`) carrying the
   * endpoint status, so a hanging call explains itself.
   * @default 15000
   */
  callTimeoutMs?: number
  /**
   * Liveness heartbeat guarding against silently dead ports. Defaults to a
   * 5s ping / 12s silence window; pass `false` to disable — on both
   * endpoints together.
   */
  heartbeat?: { intervalMs?: number, timeoutMs?: number } | false
  /**
   * Applied to each outgoing argument and handler result before posting —
   * the place to unwrap framework reactivity (Vue `toRaw`, Solid `unwrap`)
   * into plain structured-cloneable values.
   */
  serialize?: (value: unknown) => unknown
  /** Applied to each incoming argument and call result. */
  deserialize?: (value: unknown) => unknown
}

/** Options for {@link createPageScriptChannel}. */
export interface CreatePageScriptChannelOptions<Protocol extends InPageChannelProtocol = InPageChannelProtocol> extends InPageChannelCommonOptions {
  /** Implementations of the protocol's page-script functions. */
  functions?: CreatePageScriptChannelOptionsFunctions<Protocol>
  /**
   * Window whose `message` events carry panel hellos. Defaults to the
   * global `window`; pass `false` to skip the handshake listener entirely
   * (bring-your-own ports via `addPanelPort` only).
   */
  window?: Window | false
}

/** Options for {@link connectPanelChannel}. */
export interface ConnectPanelChannelOptions<Protocol extends InPageChannelProtocol = InPageChannelProtocol> extends InPageChannelCommonOptions {
  /** Implementations of the protocol's panel functions. */
  functions?: ConnectPanelChannelOptionsFunctions<Protocol>
  /**
   * The panel's own window (listens for the handshake grant). Defaults to
   * the global `window`; pass `false` with `transport` to skip the handshake.
   */
  window?: Window | false
  /**
   * Windows the hello is posted to. Defaults to the panel's ancestor chain
   * plus its `opener` — the places a same-tab page script can live. When
   * empty and no `transport` is given, the endpoint stays `connecting` and
   * warns once.
   */
  targets?: Window[]
  /** Pre-established port to the page script, bypassing the handshake. */
  transport?: MessagePort
  /**
   * Pin this panel to one page-script instance id. By default the panel
   * auto-pairs with the most recent page script that answers — almost
   * always "my own tab's page script".
   */
  instanceId?: string
  /**
   * Base interval between handshake hello retries, in milliseconds; each
   * retry backs off ×1.5 up to a 3s cap, forever (the page script may load
   * later than the panel).
   * @default 300
   */
  helloIntervalMs?: number
  /**
   * Maximum `callEvent` payloads buffered while `connecting`, flushed on
   * connect; when full, the oldest is dropped with a console warning.
   * @default 64
   */
  eventBufferLimit?: number
}

/**
 * The channel shared-state accessor — mirrors `rpc.sharedState`, with the
 * page script playing the server's role as rendezvous and authority. The
 * page script's first `get` of a key must provide `initialValue`; a panel's
 * `get` without one resolves once the authority's first replay arrives.
 */
export interface InPageSharedStateHost<P extends InPageChannelProtocol> {
  get: <K extends keyof SharedStates<P> & string>(
    key: K,
    options?: { initialValue?: SharedStates<P>[K] },
  ) => Promise<SharedState<SharedStates<P>[K]>>
}

/** Emitter events of a page-script endpoint. */
export interface PageScriptChannelEvents<P extends InPageChannelProtocol> {
  'panel:connected': (panel: PanelPeer<P>) => void
  'panel:disconnected': (panel: PanelPeer<P>) => void
}

/** One connected panel, as seen from the page script. */
export interface PanelPeer<P extends InPageChannelProtocol> {
  /** Unique id of the panel endpoint (stable across its lifetime, not reloads). */
  readonly id: string
  /** Call one panel's function and await the result. */
  call: <K extends keyof PanelFunctions<P> & string>(
    name: K,
    ...args: FnArgs<PanelFunctions<P>[K]>
  ) => Promise<FnReturn<PanelFunctions<P>[K]>>
  /** Disconnect this panel. */
  close: () => void
}

/**
 * The page-script endpoint of an in-page channel: answers panel handshakes,
 * holds one dedicated port per connected panel, fans events out to all of
 * them, and is the authority for the channel's shared states.
 */
export interface PageScriptChannel<P extends InPageChannelProtocol> {
  readonly name: string
  /**
   * This page context's instance id (persisted per tab in sessionStorage),
   * carried in every handshake so panels can pin to one instance when the
   * same app is open in several tabs.
   */
  readonly instanceId: string
  /** Currently connected panels. */
  readonly panels: readonly PanelPeer<P>[]
  readonly events: Pick<EventEmitter<PageScriptChannelEvents<P>>, 'on' | 'once'>
  /**
   * Fan a fire-and-forget event out to every connected panel; panels that
   * don't implement the function ignore it.
   */
  callEvent: <K extends keyof PanelFunctions<P> & string>(
    name: K,
    ...args: FnArgs<PanelFunctions<P>[K]>
  ) => void
  /** Page-script-authoritative shared states, replayed to joining panels. */
  readonly sharedState: InPageSharedStateHost<P>
  /** Adopt a pre-established port as a panel peer (bring-your-own transport). */
  addPanelPort: (port: MessagePort) => PanelPeer<P>
  /** Tear the endpoint down: disconnect every panel, stop answering hellos. */
  close: () => void
}

/** Emitter events of a panel endpoint. */
export interface PanelChannelEvents {
  'status:updated': (status: InPageChannelStatus) => void
}

/**
 * The panel endpoint of an in-page channel: finds the page script with a
 * retrying same-origin handshake, survives reloads on either side by
 * re-handshaking, and buffers outgoing traffic while `connecting`.
 */
export interface PanelChannel<P extends InPageChannelProtocol> {
  readonly name: string
  readonly status: InPageChannelStatus
  /** The paired page script's instance id, once connected. */
  readonly pageScript: { instanceId: string } | undefined
  readonly events: Pick<EventEmitter<PanelChannelEvents>, 'on' | 'once'>
  /**
   * Resolves once connected. With `timeoutMs`, rejects with an
   * `InPageChannelError` (code `timeout`) when no page script answered in
   * time — the hook for a "no page script found" fallback UI.
   */
  whenConnected: (timeoutMs?: number) => Promise<void>
  /**
   * Call a page-script function and await the result. While `connecting`
   * the call is buffered and sent on connect; it rejects with code
   * `timeout` when `callTimeoutMs` elapses first.
   */
  call: <K extends keyof PageScriptFunctions<P> & string>(
    name: K,
    ...args: FnArgs<PageScriptFunctions<P>[K]>
  ) => Promise<FnReturn<PageScriptFunctions<P>[K]>>
  /**
   * Fire-and-forget to the page script. While `connecting` the event is
   * buffered (up to `eventBufferLimit`) and flushed on connect.
   */
  callEvent: <K extends keyof PageScriptFunctions<P> & string>(
    name: K,
    ...args: FnArgs<PageScriptFunctions<P>[K]>
  ) => void
  /** Shared states mirrored from the page-script authority. */
  readonly sharedState: InPageSharedStateHost<P>
  /** Tear the endpoint down permanently. */
  close: () => void
}
