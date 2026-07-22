<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal, type ITheme } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import type { DevframeRpcClient } from 'devframe/client'
  import type { TerminalSessionInfo } from '../types'
  import { TERMINAL_STREAM_CHANNEL } from '../constants'
  import '@xterm/xterm/css/xterm.css'

  let { rpc, info, active, isDark } = $props<{
    rpc: DevframeRpcClient
    info: TerminalSessionInfo
    active: boolean
    isDark: boolean
  }>()

  const DARK_THEME: ITheme = {
    background: '#111111',
    foreground: '#c9d1d9',
    cursor: '#7cbc71',
    cursorAccent: '#111111',
    selectionBackground: '#ffffff20',
  }

  const LIGHT_THEME: ITheme = {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#396831',
    cursorAccent: '#ffffff',
    selectionBackground: '#00000018',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#7d4e00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#218bff',
    brightMagenta: '#a475f9',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  }

  let container: HTMLDivElement
  let term: Terminal
  let fitAddon: FitAddon
  let reader: any

  onMount(() => {
    term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      scrollback: 10000,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      disableStdin: info.mode !== 'interactive',
      // Readonly sessions are line-oriented log streams. Own pipe sessions get
      // their bare `\n` normalized to `\r\n` server-side, but sessions
      // aggregated from other devframes via the hub stream their raw output
      // here unfiltered — a lone `\n` would then leave the cursor's column
      // untouched and render a staircase. `convertEol` makes xterm treat `\n`
      // as `\r\n`, fixing both (a no-op where CRLF already arrived). Interactive
      // PTY sessions keep it off so full-screen TUIs control the cursor exactly.
      convertEol: info.mode !== 'interactive',
      allowProposedApi: false,
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    // Aggregated hub sessions carry a `channel`; this plugin doesn't own their
    // process, so input/resize route to the hub's terminal RPC (positional
    // args) instead of the plugin's own (object args).
    const isForeign = !!info.channel

    if (info.mode === 'interactive') {
      term.onData((data) => {
        if (isForeign)
          rpc.call('hub:terminals:write', info.id, data).catch(() => {})
        else
          rpc.call('devframes:plugin:terminals:write', { id: info.id, data }).catch(() => {})
      })
    }

    // Own sessions always resize; foreign sessions only when interactive
    // (a read-only aggregated session has no controllable TTY).
    if (!isForeign) {
      term.onResize(({ cols, rows }) => {
        rpc.call('devframes:plugin:terminals:resize', { id: info.id, cols, rows }).catch(() => {})
      })
    }
    else if (info.mode === 'interactive') {
      term.onResize(({ cols, rows }) => {
        rpc.call('hub:terminals:resize', info.id, cols, rows).catch(() => {})
      })
    }

    reader = rpc.streaming.subscribe(info.channel || TERMINAL_STREAM_CHANNEL, info.id)
    ;(async () => {
      try {
        for await (const chunk of reader) {
          term.write(chunk as string)
        }
      }
      catch {}
    })()

    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch {}
    })

    const ro = new ResizeObserver(() => {
      if (active) {
        try { fitAddon.fit() } catch {}
      }
    })
    ro.observe(container)

    return () => {
      reader?.cancel()
      ro.disconnect()
      term.dispose()
    }
  })

  $effect(() => {
    if (term) {
      term.options.theme = isDark ? DARK_THEME : LIGHT_THEME
    }
  })

  $effect(() => {
    if (active && term && fitAddon) {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
          term.focus()
        } catch {}
      })
    }
  })
</script>

<div class="absolute inset-0 px-2 py-1 {active ? 'block' : 'hidden'}" bind:this={container}></div>
