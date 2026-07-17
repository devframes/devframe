<script lang="ts">
  import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
  import type { TerminalPreset, TerminalSessionInfo } from '../types'
  import type { DotState } from './design'
  import { button, dot, iconButton, nav, navBrand, navTab, tag, toolbar } from './design'
  import { onMount } from 'svelte'
  import { DOCKS_ACTIVE_STATE_KEY, PLUGIN_ID, PRESETS_STATE_KEY, SESSIONS_STATE_KEY } from '../constants'
  import TerminalView from './TerminalView.svelte'

  const { rpc, autostart } = $props<{
    rpc: DevframeRpcClient
    autostart: boolean
  }>()

  let connectionStatus = $state<DevframeConnectionStatus>(rpc.status)

  // Terminals ride live PTY streams, so a dropped socket or refused auth makes
  // the whole surface useless — swap it for a clear state instead of a frozen
  // terminal. The client doesn't auto-reconnect; a reload re-runs the handshake.
  const CONNECTION_COPY: Record<Exclude<DevframeConnectionStatus, 'connected'>, { icon: string, title: string, body: string }> = {
    connecting: { icon: 'i-ph-plugs-connected-duotone', title: 'Connecting…', body: 'Establishing a connection to the devframe server.' },
    disconnected: { icon: 'i-ph-plugs-duotone', title: 'Disconnected', body: 'Lost the connection to the devframe server. Reload once it is back up.' },
    unauthorized: { icon: 'i-ph-lock-key-duotone', title: 'Not authorized', body: 'Reopen the link printed by your dev server, then reload.' },
    error: { icon: 'i-ph-warning-octagon-duotone', title: 'Connection failed', body: 'Could not reach the devframe server.' },
  }

  let isDark = $state(true)
  let sessions = $state<TerminalSessionInfo[]>([])
  let presets = $state<TerminalPreset[]>([])
  let activeId = $state<string | null>(null)
  let renamingId = $state<string | null>(null)
  let presetsOpen = $state(false)

  const activeSession = $derived(sessions.find(s => s.id === activeId) ?? null)

  // A focus request that arrived (via the hub's dock-activation slot) before
  // its session showed up in the list. Applied one-shot the moment a matching
  // session appears, then cleared so the user's own tab clicks stay honored.
  let pendingFocusId: string | null = null

  /**
   * Focus a session by id, on request from the hub's cross-iframe dock
   * activation (e.g. Vite DevTools navigating to the build it just spawned).
   * Focuses immediately when the session is already known; otherwise waits for
   * it to arrive. An unknown/ended id is a no-op — the default selection
   * (most-recent session) stands.
   */
  function requestFocus(id: string): void {
    if (sessions.some(s => s.id === id)) {
      activeId = id
      pendingFocusId = null
    }
    else {
      pendingFocusId = id
    }
  }

  function readHashId(): string | null {
    if (typeof location === 'undefined')
      return null
    return new URLSearchParams(location.hash.replace(/^#/, '')).get('id')
  }

  function writeHashId(id: string): void {
    if (typeof location === 'undefined' || typeof history === 'undefined')
      return
    const target = `#id=${id}`
    if (location.hash !== target)
      history.replaceState(history.state, '', target)
  }

  function displayName(info: TerminalSessionInfo): string {
    return info.customTitle || info.termTitle || info.processName || info.title
  }

  /**
   * Sessions aggregated from other devframes via the hub (they carry a
   * `channel`) are surfaced read-only — this plugin doesn't own their process,
   * so it offers no rename / restart / kill controls for them.
   */
  function isExternal(info: TerminalSessionInfo): boolean {
    return Boolean(info.channel)
  }

  function pickActive(list: TerminalSessionInfo[]): void {
    // A queued focus request (from the hub's dock activation) wins over the
    // default pick the moment its session lands, then clears so it fires
    // exactly once and the user's own tab clicks stay honored.
    if (pendingFocusId && list.some(x => x.id === pendingFocusId)) {
      activeId = pendingFocusId
      pendingFocusId = null
      return
    }
    if (activeId && !list.some(x => x.id === activeId))
      activeId = null
    if (!activeId && list.length) {
      const hashId = readHashId()
      activeId = (hashId && list.some(x => x.id === hashId)) ? hashId : list[list.length - 1].id
    }
  }

  onMount(() => rpc.events.on('connection:status', (status: DevframeConnectionStatus) => {
    connectionStatus = status
  }))

  onMount(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applyScheme = (dark: boolean): void => {
      isDark = dark
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
    }
    applyScheme(mq.matches)
    const onMq = (e: MediaQueryListEvent): void => applyScheme(e.matches)
    mq.addEventListener('change', onMq)

    const onHashChange = (): void => {
      const id = readHashId()
      if (id && sessions.some(s => s.id === id))
        activeId = id
    }
    window.addEventListener('hashchange', onHashChange)

    return () => {
      mq.removeEventListener('change', onMq)
      window.removeEventListener('hashchange', onHashChange)
    }
  })

  onMount(() => {
    let offSessions: (() => void) | undefined
    let offPresets: (() => void) | undefined

    rpc.sharedState.get(PRESETS_STATE_KEY, { initialValue: { presets: [] } }).then((state: any) => {
      presets = state.value().presets || []
      offPresets = state.on('updated', (full: any) => { presets = full.presets || [] })
    })

    rpc.sharedState.get(SESSIONS_STATE_KEY, { initialValue: { sessions: [] } }).then((state: any) => {
      const sync = (list: TerminalSessionInfo[]): void => {
        sessions = list
        pickActive(list)
      }
      sync(state.value().sessions || [])
      offSessions = state.on('updated', (full: any) => sync(full.sessions || []))
    })

    return () => {
      offSessions?.()
      offPresets?.()
    }
  })

  // The hub mirrors the most recent dock activation here. When it targets this
  // dock and carries a session id, focus that session — this is how a mounted
  // devframe (e.g. Vite DevTools) navigates the user straight to a spawned
  // build's terminal, whether the dock was already open or mounts in response.
  let offActivation: (() => void) | undefined

  function applyActivation(activation: unknown): void {
    if (!activation || typeof activation !== 'object')
      return
    const { dockId, params } = activation as { dockId?: string, params?: Record<string, unknown> }
    if (dockId !== PLUGIN_ID)
      return
    const sessionId = params?.sessionId
    if (typeof sessionId === 'string')
      requestFocus(sessionId)
  }

  onMount(() => {
    rpc.sharedState.get(DOCKS_ACTIVE_STATE_KEY, { initialValue: { activation: null } }).then((state: any) => {
      applyActivation(state.value().activation)
      offActivation = state.on('updated', (full: any) => applyActivation(full.activation))
    })
    return () => offActivation?.()
  })

  onMount(async () => {
    let existing: TerminalSessionInfo[] | null = null
    try {
      existing = await rpc.call('devframes:plugin:terminals:list') as TerminalSessionInfo[]
    }
    catch {
      existing = null
    }
    if (existing) {
      sessions = existing
      pickActive(existing)
    }
    const hasSessions = existing ? existing.length > 0 : sessions.length > 0
    if (autostart && !hasSessions)
      spawn({ mode: 'interactive' })
  })

  $effect(() => {
    if (activeId)
      writeHashId(activeId)
  })

  async function spawn(req: any): Promise<void> {
    try {
      const info = await rpc.call('devframes:plugin:terminals:spawn', req) as any
      if (info?.id)
        activeId = info.id
    }
    catch {}
  }

  function runPreset(id: string): void {
    presetsOpen = false
    spawn({ presetId: id })
  }

  function commitRename(id: string, title: string): void {
    renamingId = null
    rpc.call('devframes:plugin:terminals:rename', { id, title: title.trim() }).catch(() => {})
  }

  function focusSelect(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  function statusDot(status: string): DotState {
    if (status === 'running')
      return 'running'
    return status === 'exited' ? 'idle' : 'error'
  }
</script>

{#if connectionStatus !== 'connected'}
  {@const copy = CONNECTION_COPY[connectionStatus]}
  <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base color-base font-sans p-8 text-center">
    <div class="{copy.icon} text-4xl color-active"></div>
    <div class="flex flex-col gap-1">
      <p class="text-lg font-medium">{copy.title}</p>
      <p class="text-sm op-mute max-w-sm">{copy.body}</p>
    </div>
    {#if connectionStatus !== 'connecting'}
      <button type="button" class={button({ variant: 'primary', size: 'sm' })} onclick={() => location.reload()}>
        <div class="i-ph-arrow-clockwise"></div>
        Reload
      </button>
    {/if}
  </div>
{:else}
<div class="absolute inset-0 flex flex-col bg-base color-base font-sans of-hidden">
  <!-- Top navigation: brand + session tabs + actions -->
  <nav class={nav()}>
    <div class={navBrand('pr-2 mr-1 border-r border-base')}>
      <div class="i-ph-terminal-window-duotone text-base color-active"></div>
      <span class="hidden sm:inline">Terminals</span>
    </div>

    <div class="flex-1 flex items-center gap-1 of-x-auto of-y-hidden py-1">
      {#each sessions as s (s.id)}
        {#if renamingId === s.id}
          <input
            class="text-sm w-44 px2 py1 rounded border border-active bg-secondary color-base outline-none font-mono"
            value={displayName(s)}
            spellcheck={false}
            use:focusSelect
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(s.id, e.currentTarget.value) }
              else if (e.key === 'Escape') { e.preventDefault(); renamingId = null }
            }}
            onblur={e => commitRename(s.id, e.currentTarget.value)}
            onclick={e => e.stopPropagation()}
          />
        {:else}
          <button
            type="button"
            class={navTab({ active: activeId === s.id, class: 'group' })}
            title={isExternal(s) ? displayName(s) : `${displayName(s)} — double-click to rename`}
            onclick={() => (activeId = s.id)}
            ondblclick={(e) => { if (isExternal(s)) return; e.preventDefault(); e.stopPropagation(); renamingId = s.id }}
          >
            <span class={dot(statusDot(s.status))}></span>
            {#if s.icon}
              <div class="{s.icon} shrink-0"></div>
            {/if}
            <span class="truncate">{displayName(s)}</span>
            {#if !isExternal(s)}
              <span
                role="button"
                tabindex="-1"
                aria-label="Close terminal"
                class="i-ph-x op0 group-hover:op60 hover:op100! transition-opacity shrink-0"
                onclick={(e) => { e.stopPropagation(); rpc.call('devframes:plugin:terminals:remove', { id: s.id }).catch(() => {}) }}
                onkeydown={() => {}}
              ></span>
            {/if}
          </button>
        {/if}
      {/each}

      <button
        type="button"
        class={iconButton({ variant: 'ghost', size: 'sm', class: 'shrink-0' })}
        title="New terminal"
        onclick={() => spawn({ mode: 'interactive' })}
      >
        <div class="i-ph-plus"></div>
      </button>
    </div>

    {#if presets.length}
      <div class="relative shrink-0">
        <button
          type="button"
          class={button({ variant: 'outline', size: 'sm', class: presetsOpen ? 'bg-active! color-active border-active!' : '' })}
          title="Run a preset command"
          onclick={() => (presetsOpen = !presetsOpen)}
        >
          <div class="i-ph-play-duotone"></div>
          <span class="hidden sm:inline">Presets</span>
          <div class="i-ph-caret-down text-xs op-fade"></div>
        </button>
        {#if presetsOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="fixed inset-0 z-nav"
            onclick={() => (presetsOpen = false)}
            onkeydown={() => {}}
          ></div>
          <div class="absolute right-0 mt-1 min-w-52 z-nav flex flex-col gap-0.5 p-1 rounded-lg border border-base bg-base shadow-lg">
            {#each presets as p (p.id)}
              <button
                type="button"
                class="flex items-center gap-2 px2 py1.5 rounded text-sm text-left op-fade hover:(op100 bg-active) transition-colors"
                onclick={() => runPreset(p.id)}
              >
                <div class="{p.icon || 'i-ph-terminal-duotone'} shrink-0 op-fade"></div>
                <span class="truncate flex-1">{p.title}</span>
                <span class="font-mono text-xs op-mute">{p.mode === 'interactive' ? 'tty' : 'log'}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </nav>

  <!-- Toolbar: details of the active session -->
  {#if activeSession}
    {@const s = activeSession}
    <div class={toolbar()}>
      <span class={tag(s.mode === 'interactive' ? 'blue' : 'amber')}>
        {s.mode === 'interactive' ? 'interactive' : 'readonly'}
      </span>
      <span class="font-mono truncate op-fade flex items-center gap-1.5" title={`${s.command} ${s.args.join(' ')}`}>
        {#if s.icon}
          <div class="{s.icon} shrink-0 text-base"></div>
        {/if}
        {s.command}{s.args.length ? ` ${s.args.join(' ')}` : ''}
      </span>
      {#if s.termCwd}
        <span class="flex items-center gap-1 font-mono text-xs op-mute truncate" title={s.termCwd}>
          <div class="i-ph-folder-duotone shrink-0"></div>
          <span class="truncate">{s.termCwd}</span>
        </span>
      {/if}
      <span class="flex items-center gap-1.5 op-mute font-mono text-xs tabular-nums shrink-0">
        {#if s.status === 'running'}
          <span class={dot('running')}></span>
          {s.backend}{s.pid ? ` · ${s.pid}` : ''}
        {:else}
          {s.status}{s.exitCode != null ? ` (${s.exitCode})` : ''}
        {/if}
      </span>

      <div class="flex-1"></div>

      {#if !isExternal(s)}
        <button type="button" class={iconButton({ variant: 'ghost', size: 'sm' })} title="Restart" onclick={() => rpc.call('devframes:plugin:terminals:restart', { id: s.id }).catch(() => {})}>
          <div class="i-ph-arrow-clockwise-duotone"></div>
        </button>
        <button type="button" class={iconButton({ variant: 'ghost', size: 'sm' })} title="Kill" onclick={() => rpc.call('devframes:plugin:terminals:remove', { id: s.id }).catch(() => {})}>
          <div class="i-ph-trash-duotone"></div>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Terminal surface -->
  <div class="relative flex-1 min-h-0 bg-base">
    {#if sessions.length === 0}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 op-mute select-none">
        <div class="i-ph-terminal-window-duotone text-5xl"></div>
        <div class="flex items-center gap-1.5 text-sm">
          <span>No sessions.</span>
          <button type="button" class={button({ variant: 'outline', size: 'sm' })} onclick={() => spawn({ mode: 'interactive' })}>
            <div class="i-ph-plus"></div>
            New terminal
          </button>
        </div>
      </div>
    {/if}
    {#each sessions as s (s.id)}
      <TerminalView {rpc} info={s} active={activeId === s.id} {isDark} />
    {/each}
  </div>
</div>
{/if}
