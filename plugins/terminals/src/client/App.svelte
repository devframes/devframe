<script lang="ts">
  import { onMount } from 'svelte'
  import type { DevframeRpcClient } from 'devframe/client'
  import type { TerminalSessionInfo, TerminalPreset, TerminalsSharedState } from '../types'
  import { PRESETS_STATE_KEY, SESSIONS_STATE_KEY } from '../constants'
  import TerminalView from './TerminalView.svelte'

  let { rpc, autostart } = $props<{
    rpc: DevframeRpcClient
    autostart: boolean
  }>()

  let isDark = $state(true)
  let sessions = $state<TerminalSessionInfo[]>([])
  let presets = $state<TerminalPreset[]>([])
  let activeId = $state<string | null>(null)
  let renamingId = $state<string | null>(null)

  function readHashId() {
    if (typeof location === 'undefined') return null
    return new URLSearchParams(location.hash.replace(/^#/, '')).get('id')
  }

  function writeHashId(id: string) {
    if (typeof location === 'undefined' || typeof history === 'undefined') return
    const target = `#id=${id}`
    if (location.hash !== target) history.replaceState(history.state, '', target)
  }

  function displayName(info: TerminalSessionInfo) {
    return info.customTitle || info.processName || info.title
  }

  onMount(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    isDark = mq.matches
    document.documentElement.classList.toggle('dark', isDark)
    const onMq = (e: MediaQueryListEvent) => {
      isDark = e.matches
      document.documentElement.classList.toggle('dark', isDark)
    }
    mq.addEventListener('change', onMq)

    const onHashChange = () => {
      const id = readHashId()
      if (id && sessions.some(s => s.id === id) && id !== activeId) {
        activeId = id
      }
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
      offPresets = state.on('updated', (full: any) => {
        presets = full.presets || []
      })
    })

    rpc.sharedState.get(SESSIONS_STATE_KEY, { initialValue: { sessions: [] } }).then((state: any) => {
      const sync = (s: TerminalSessionInfo[]) => {
        sessions = s
        if (activeId && !s.some(x => x.id === activeId)) activeId = null
        if (!activeId && s.length) {
          const hashId = readHashId()
          activeId = (hashId && s.some(x => x.id === hashId)) ? hashId : s[s.length - 1].id
        }
      }
      
      sync(state.value().sessions || [])
      offSessions = state.on('updated', (full: any) => {
        sync(full.sessions || [])
      })
    })

    return () => {
      offSessions?.()
      offPresets?.()
    }
  })

  onMount(async () => {
    if (autostart) {
      let existing: TerminalSessionInfo[] | null = null
      try {
        existing = await rpc.call('devframes-plugin-terminals:list') as TerminalSessionInfo[]
      } catch {
        existing = null
      }
      if (existing) {
         sessions = existing
         if (activeId && !existing.some(x => x.id === activeId)) activeId = null
         if (!activeId && existing.length) {
           const hashId = readHashId()
           activeId = (hashId && existing.some(x => x.id === hashId)) ? hashId : existing[existing.length - 1].id
         }
      }
      
      const hasSessions = existing ? existing.length > 0 : sessions.length > 0
      if (!hasSessions) {
        spawn({ mode: 'interactive' })
      }
    }
  })

  $effect(() => {
    if (activeId) writeHashId(activeId)
  })

  async function spawn(req: any) {
    try {
      const info = await rpc.call('devframes-plugin-terminals:spawn', req) as any
      if (info?.id) {
        activeId = info.id // Will be reflected when session syncs
      }
    } catch {}
  }

  function handleSelectPreset(e: Event) {
    const id = (e.target as HTMLSelectElement).value
    ;(e.target as HTMLSelectElement).value = ''
    if (id) spawn({ presetId: id })
  }

  function handleRenameSubmit(id: string, newTitle: string) {
    renamingId = null
    rpc.call('devframes-plugin-terminals:rename', { id, title: newTitle.trim() }).catch(() => {})
  }

  function focusAndSelect(node: HTMLInputElement) {
    node.focus()
    node.select()
  }
</script>

<div class="absolute inset-0 flex flex-col font-sans bg-base color-base">
  <div class="flex items-stretch gap-1 p-1.5 border-b border-base bg-base">
    <div class="flex gap-1 overflow-x-auto flex-1 items-center">
      {#each sessions as s (s.id)}
        {#if renamingId === s.id}
          <input
            class="font-mono text-xs w-[10ch] min-w-[64px] px-1 py-0.5 border rounded outline-none border-active bg-base color-base"
            value={displayName(s)}
            spellcheck={false}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(s.id, e.currentTarget.value) }
              else if (e.key === 'Escape') { e.preventDefault(); renamingId = null }
            }}
            onblur={(e) => handleRenameSubmit(s.id, e.currentTarget.value)}
            onclick={(e) => e.stopPropagation()}
            use:focusAndSelect
          />
        {:else}
          <button
            class="tab-btn {activeId === s.id ? 'tab-btn-active' : ''}"
            title="Double-click to rename"
            onclick={() => activeId = s.id}
            ondblclick={(e) => { e.preventDefault(); e.stopPropagation(); renamingId = s.id }}
          >
            <span class="w-1.5 h-1.5 rounded-full shrink-0
              {s.status === 'running' ? 'bg-green-500' : s.status === 'exited' ? 'bg-gray-500' : 'bg-red-500'}">
            </span>
            <span>{displayName(s)}</span>
          </button>
        {/if}
      {/each}
      <button 
        class="tab-btn px-2 min-w-[28px] justify-center"
        title="New terminal"
        onclick={() => spawn({ mode: 'interactive' })}
      >
        <div class="i-ph:plus"></div>
      </button>
    </div>
    
    <div class="flex gap-1.5 items-center">
      <select 
        class="px-2 py-1 rounded-md border text-xs outline-none border-base bg-secondary color-base"
        disabled={presets.length === 0}
        onchange={handleSelectPreset}
      >
        <option value="">{presets.length ? 'Run preset…' : 'No presets'}</option>
        {#each presets as p}
          <option value={p.id}>{p.title}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="flex items-center gap-2 px-2.5 py-1 border-b text-xs min-h-[20px] border-base text-gray-500 dark:text-gray-400">
    {#if activeId}
      {@const activeSession = sessions.find(s => s.id === activeId)}
      {#if activeSession}
        <span class="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide border {activeSession.mode === 'interactive' ? 'color-active border-active bg-active' : 'text-amber-600 dark:text-amber-500 border-amber-500/25 bg-amber-500/10'}">
          {activeSession.mode}
        </span>
        <span class="font-mono color-base">
          {activeSession.command}{activeSession.args.length ? ` ${activeSession.args.join(' ')}` : ''}
        </span>
        <span>
          {activeSession.status === 'running' 
            ? `running · ${activeSession.backend}${activeSession.pid ? ` · pid ${activeSession.pid}` : ''}`
            : `${activeSession.status}${activeSession.exitCode != null ? ` (${activeSession.exitCode})` : ''}`}
        </span>
        <div class="flex-1"></div>
        <button class="btn-action" onclick={() => rpc.call('devframes-plugin-terminals:restart', { id: activeSession.id }).catch(() => {})}>
          <div class="i-ph:arrows-clockwise"></div> Restart
        </button>
        <button class="btn-action" onclick={() => rpc.call('devframes-plugin-terminals:remove', { id: activeSession.id }).catch(() => {})}>
          <div class="i-ph:trash"></div> Kill
        </button>
      {/if}
    {/if}
  </div>

  <div class="relative flex-1 overflow-hidden {isDark ? 'bg-black' : 'bg-white'}">
    {#if sessions.length === 0}
      <div class="absolute inset-0 flex items-center justify-center text-[13px] pointer-events-none text-gray-400 dark:text-gray-500">
        No terminal sessions — click + to start one.
      </div>
    {/if}
    {#each sessions as s (s.id)}
      <TerminalView 
        rpc={rpc} 
        info={s} 
        active={activeId === s.id} 
        isDark={isDark} 
      />
    {/each}
  </div>
</div>
