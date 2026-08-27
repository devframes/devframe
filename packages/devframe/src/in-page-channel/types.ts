import type { EventEmitter } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { RpcArgsSchema, RpcReturnSchema, Thenable } from '../rpc/types'
import type { InferArgsType, InferReturnType } from '../rpc/utils'

/**
 * The in-page channel is the browser-only communication path between a
 * devframe's **page script** (running in the user app's page) and its
 * **panels** (the SPA rendered in a dock iframe, popup, or Document
 * picture-in-picture window). It needs no server — the two sides find each
 * other with a same-origin `postMessage` handshake and talk over a dedicated
 * `MessageChannel` port per panel.
 */

/**
 * The shared contract of one in-page channel, declared once (usually in a
 * `shared/protocol.ts` the page script and the panel both import) and passed
 * to both endpoints as a type parameter. Purely a type — it has no runtime
 * representation beyond the channel name constant declared next to it.
 */
export interface InPageChannelProtocol {
  /** Functions implemented by the page script, callable by panels. */
  pageScript?: Record<string, (...args: any[]) => any>
  /** Functions implemented by panels, callable by the page script. */
  panel?: Record<string, (...args: any[]) => any>
  /**
   * Shared-state slots, keyed by name. The page script is the authority:
   * it owns the canonical value; panels receive replays on connect and
   * converge through syncId-deduplicated patches.
   */
  sharedStates?: Record<string, object>
}

type SideFunctions<S> = S extends Record<string, (...args: any[]) => any> ? S : Record<string, never>

/** The page-script side's functions of a protocol. */
export type InPagePageScriptFunctions<P extends InPageChannelProtocol> = SideFunctions<NonNullable<P['pageScript']>>
/** The panel side's functions of a protocol. */
export type InPagePanelFunctions<P extends InPageChannelProtocol> = SideFunctions<NonNullable<P['panel']>>
/** The shared-state slots of a protocol. */
export type InPageSharedStates<P extends InPageChannelProtocol>
  = P['sharedStates'] extends Record<string, object> ? P['sharedStates'] : Record<string, never>

type FnArgs<F> = F extends (...args: infer A) => any ? A : never
type FnReturn<F> = F extends (...args: any[]) => infer R ? Awaited<R> : never

/**
 * Types of an in-page channel function — the narrowed subset of
 * `RpcFunctionType` that makes sense in-browser (`static` is a server dump
 * concept):
 * - `event` — fire-and-forget, no response; the only type valid for fan-out
 * - `action` — performs an action, awaits completion
 * - `query` — requests data (the default)
 */
export type InPageFunctionType = 'action' | 'event' | 'query'

/** Result returned by an in-page function's `setup`. */
export interface InPageFunctionSetupResult<ARGS extends any[], RETURN = void> {
  /** Function handler. */
  handler?: (...args: ARGS) => RETURN
}

/**
 * An in-page channel function definition — the same generic machinery as
 * `RpcFunctionDefinition` (`name`, `type`, Standard-Schema `args`/`returns`,
 * `jsonSerializable`, `handler`/`setup`), narrowed to what exists in the
 * browser: there is no `dump`/`snapshot` (no static build), no `cacheable`,
 * and no `agent` exposure. `setup` receives the endpoint the definition is
 * registered on.
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
        /** Function name (unique within its side of the protocol). */
        name: NAME
        /** Function type (action, event, or query). */
        type?: TYPE
        /** Standard Schema array validating (and typing) the arguments. */
        args?: AS
        /** Standard Schema validating (and typing) the return value. */
        returns?: RS
        /**
         * Declares whether this function's args/return are JSON-serializable
         * (no Map/Set/Date/BigInt/cycles/class instances/undefined/Symbol/
         * Function). When `true`, payloads are strictly validated at the
         * receiving endpoint and misshapen values reject the call with a
         * descriptive `InPageChannelError` instead of a cryptic
         * `DataCloneError` in the port.
         */
        jsonSerializable?: boolean
        /** Setup function called once with the endpoint to initialize the handler. */
        setup?: (context: InPageChannelEndpoint) => Thenable<InPageFunctionSetupResult<ARGS, RETURN>>
        /** Function implementation (required if `setup` doesn't provide one). */
        handler?: (...args: ARGS) => RETURN
      }
    : {
        /** Function name (unique within its side of the protocol). */
        name: NAME
        /** Function type (action, event, or query). */
        type?: TYPE
        /** Standard Schema array validating (and typing) the arguments. */
        args: AS
        /** Standard Schema validating (and typing) the return value. */
        returns: RS
        /**
         * Declares whether this function's args/return are JSON-serializable.
         * See the schemaless branch for details.
         */
        jsonSerializable?: boolean
        /** Setup function called once with the endpoint to initialize the handler. */
        setup?: (context: InPageChannelEndpoint) => Thenable<InPageFunctionSetupResult<InferArgsType<AS>, Thenable<InferReturnType<RS>>>>
        /**
         * Function implementation (required if `setup` doesn't provide one).
         * The declared `returns` schema describes the *resolved* value.
         */
        handler?: (...args: InferArgsType<AS>) => Thenable<InferReturnType<RS>>
      }

/** Loosely-typed definition, the registration unit both endpoints accept. */
export type InPageFunctionDefinitionAny = InPageFunctionDefinition<string, any, any, any, any, any>

/** Either endpoint of an in-page channel, as seen by a definition's `setup`. */
export type InPageChannelEndpoint
  = | PageScriptChannel<any>
    | PanelChannel<any>

/**
 * Connection lifecycle of a panel endpoint:
 * - `connecting` — searching for a page script (hello retry loop running),
 *   or re-searching after the port died. Calls/events are buffered.
 * - `connected` — a live port to the page script is attached.
 * - `closed` — `close()` was called; the endpoint is permanently down.
 */
export type InPageChannelStatus = 'connecting' | 'connected' | 'closed'

/** Serialization hooks applied to every argument and return value. */
export interface InPageChannelSerializationOptions {
  /**
   * Applied to each outgoing argument and each outgoing handler result
   * before it is posted — the place to unwrap framework reactivity (e.g.
   * Vue `toRaw`, Solid `unwrap`) into plain structured-cloneable values.
   */
  serialize?: (value: unknown) => unknown
  /** Applied to each incoming argument and each incoming call result. */
  deserialize?: (value: unknown) => unknown
}

/** Heartbeat configuration guarding against silently dead ports. */
export interface InPageChannelHeartbeatOptions {
  /**
   * How often the panel pings the page script.
   * @default 5000
   */
  intervalMs?: number
  /**
   * Silence window after which the peer is considered gone: the panel
   * returns to `connecting` and resumes the handshake; the page script
   * drops the panel. Keep it comfortably above `intervalMs`.
   * @default 12000
   */
  timeoutMs?: number
}

/** Options shared by both endpoints. */
export interface InPageChannelCommonOptions extends InPageChannelSerializationOptions {
  /**
   * Channel name, namespaced with the devframe id by convention
   * (e.g. `devframes:plugin:a11y`). Both endpoints must use the same name.
   */
  name: string
  /** Implementations of this endpoint's side of the protocol. */
  functions?: readonly InPageFunctionDefinitionAny[]
  /**
   * Origins accepted during the handshake, and used as `targetOrigin` when
   * posting handshake messages. The in-page channel is same-origin by
   * definition, so this defaults to `[location.origin]`; widen it only for
   * unusual dev setups.
   */
  allowedOrigins?: string[]
  /**
   * Timeout for request/response calls, in milliseconds. `-1` disables.
   * The rejection is an `InPageChannelError` with code `timeout` carrying
   * the endpoint status, so a hanging call explains itself.
   * @default 15000
   */
  callTimeoutMs?: number
  /**
   * Liveness heartbeat. Enabled by default; pass `false` to disable —
   * disable it on both endpoints together.
   */
  heartbeat?: InPageChannelHeartbeatOptions | false
}

/** Options for {@link createPageScriptChannel}. */
export interface CreatePageScriptChannelOptions extends InPageChannelCommonOptions {
  /**
   * Window whose `message` events carry panel hellos. Defaults to the
   * global `window`; pass `false` to skip the handshake listener entirely
   * (bring-your-own ports only).
   */
  window?: Window | false
  /**
   * Pre-established port(s) to adopt as panel peers, bypassing the
   * handshake — for custom topologies and tests.
   */
  transport?: MessagePort | MessagePort[]
}

/** Options for {@link connectPanelChannel}. */
export interface ConnectPanelChannelOptions extends InPageChannelCommonOptions {
  /**
   * The panel's own window (listens for the handshake grant). Defaults to
   * the global `window`; pass `false` together with `transport` to skip
   * the handshake entirely.
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
   * auto-pairs with the most recent page script that answers (last grant
   * wins), which is almost always "my own tab's page script".
   */
  instanceId?: string
  /**
   * Base interval between handshake hello retries, in milliseconds. Each
   * retry backs off ×1.5 up to a 3000ms cap; the loop runs until a page
   * script answers (it may load later than the panel).
   * @default 300
   */
  helloIntervalMs?: number
  /**
   * Maximum number of `callEvent` payloads buffered while `connecting`,
   * flushed on connect. When full, the oldest is dropped with a console
   * warning.
   * @default 64
   */
  eventBufferLimit?: number
}

/** Get-accessor options of the channel shared-state layer. */
export interface InPageSharedStateGetOptions<T extends object> {
  /**
   * Initial value. Required on the page-script endpoint's first access to
   * a key (it is the authority). Optional on panels: with it, `get`
   * resolves immediately and the authority's replay merges in; without
   * it, `get` resolves once the first replay arrives.
   */
  initialValue?: T
}

/**
 * The channel shared-state accessor — mirrors `rpc.sharedState`, with the
 * page script playing the server's role as rendezvous and authority.
 */
export interface InPageSharedStateHost<P extends InPageChannelProtocol> {
  get: <K extends keyof InPageSharedStates<P> & string>(
    key: K,
    options?: InPageSharedStateGetOptions<InPageSharedStates<P>[K]>,
  ) => Promise<SharedState<InPageSharedStates<P>[K]>>
}

/** Emitter events of a page-script endpoint. */
export interface PageScriptChannelEvents<P extends InPageChannelProtocol> {
  /** A panel connected (handshake grant or adopted transport). */
  'panel:connected': (panel: PanelPeer<P>) => void
  /** A panel disconnected (graceful close, dead port, or heartbeat loss). */
  'panel:disconnected': (panel: PanelPeer<P>) => void
}

/** One connected panel, as seen from the page script. */
export interface PanelPeer<P extends InPageChannelProtocol> {
  /** Unique id of the panel endpoint (stable across its lifetime, not reloads). */
  readonly id: string
  /** Call one panel's function and await the result. */
  call: <K extends keyof InPagePanelFunctions<P> & string>(
    name: K,
    ...args: FnArgs<InPagePanelFunctions<P>[K]>
  ) => Promise<FnReturn<InPagePanelFunctions<P>[K]>>
  /** Fire-and-forget to this one panel. */
  callEvent: <K extends keyof InPagePanelFunctions<P> & string>(
    name: K,
    ...args: FnArgs<InPagePanelFunctions<P>[K]>
  ) => void
  /** Disconnect this panel. */
  close: () => void
}

/**
 * The page-script endpoint of an in-page channel: answers panel handshakes,
 * holds one dedicated port per connected panel, fans events out to all of
 * them, and is the authority for the channel's shared states.
 */
export interface PageScriptChannel<P extends InPageChannelProtocol> {
  /** The channel name. */
  readonly name: string
  /**
   * This page context's instance id (persisted per tab in sessionStorage),
   * carried in every handshake so panels can pin to one instance when the
   * same app is open in several tabs.
   */
  readonly instanceId: string
  /** Currently connected panels. */
  readonly panels: readonly PanelPeer<P>[]
  /** Lifecycle events (`panel:connected` / `panel:disconnected`). */
  readonly events: Pick<EventEmitter<PageScriptChannelEvents<P>>, 'on' | 'once'>
  /** Register an additional function after creation. */
  register: (fn: InPageFunctionDefinitionAny) => void
  /**
   * Fan a fire-and-forget event out to every connected panel. Panels that
   * don't implement the function ignore it.
   */
  callEvent: <K extends keyof InPagePanelFunctions<P> & string>(
    name: K,
    ...args: FnArgs<InPagePanelFunctions<P>[K]>
  ) => void
  /** Page-script-authoritative shared states, replayed to late-joining panels. */
  readonly sharedState: InPageSharedStateHost<P>
  /** Adopt a pre-established port as a panel peer (bring-your-own transport). */
  addPanelPort: (port: MessagePort) => PanelPeer<P>
  /** Tear the endpoint down: disconnect every panel, stop listening for hellos. */
  close: () => void
}

/** Emitter events of a panel endpoint. */
export interface PanelChannelEvents {
  /** Connection status transitions. */
  'status:updated': (status: InPageChannelStatus) => void
}

/**
 * The panel endpoint of an in-page channel: finds the page script with a
 * retrying same-origin handshake, survives reloads on either side by
 * re-handshaking, and buffers outgoing traffic while `connecting`.
 */
export interface PanelChannel<P extends InPageChannelProtocol> {
  /** The channel name. */
  readonly name: string
  /** Current connection status. */
  readonly status: InPageChannelStatus
  /** The paired page script's instance id, once connected. */
  readonly pageScript: { instanceId: string } | undefined
  /** Lifecycle events (`status:updated`). */
  readonly events: Pick<EventEmitter<PanelChannelEvents>, 'on' | 'once'>
  /**
   * Resolves once connected. With `timeoutMs`, rejects with an
   * `InPageChannelError` (code `timeout`) when no page script answered in
   * time — the hook for a "no page script found" fallback UI.
   */
  whenConnected: (timeoutMs?: number) => Promise<void>
  /** Register an additional function after creation. */
  register: (fn: InPageFunctionDefinitionAny) => void
  /**
   * Call a page-script function and await the result. While `connecting`
   * the call is buffered and sent on connect; it rejects with code
   * `timeout` when `callTimeoutMs` elapses first.
   */
  call: <K extends keyof InPagePageScriptFunctions<P> & string>(
    name: K,
    ...args: FnArgs<InPagePageScriptFunctions<P>[K]>
  ) => Promise<FnReturn<InPagePageScriptFunctions<P>[K]>>
  /**
   * Fire-and-forget to the page script. While `connecting` the event is
   * buffered (up to `eventBufferLimit`) and flushed on connect.
   */
  callEvent: <K extends keyof InPagePageScriptFunctions<P> & string>(
    name: K,
    ...args: FnArgs<InPagePageScriptFunctions<P>[K]>
  ) => void
  /** Shared states mirrored from the page-script authority. */
  readonly sharedState: InPageSharedStateHost<P>
  /** Tear the endpoint down permanently. */
  close: () => void
}
