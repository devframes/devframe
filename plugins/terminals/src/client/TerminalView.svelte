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
    background: '#000000',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    cursorAccent: '#000000',
    selectionBackground: '#234876',
  }

  const LIGHT_THEME: ITheme = {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: '#b6d7ff',
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
      allowProposedApi: false,
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    if (info.mode === 'interactive') {
      term.onData((data) => {
        rpc.call('devframes-plugin-terminals:write', { id: info.id, data }).catch(() => {})
      })
    }

    term.onResize(({ cols, rows }) => {
      rpc.call('devframes-plugin-terminals:resize', { id: info.id, cols, rows }).catch(() => {})
    })

    reader = rpc.streaming.subscribe<string>(TERMINAL_STREAM_CHANNEL, info.id)
    ;(async () => {
      try {
        for await (const chunk of reader) {
          term.write(chunk)
        }
      } catch {}
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

<div class="absolute inset-0 p-1 {active ? 'block' : 'hidden'}" bind:this={container}></div>
