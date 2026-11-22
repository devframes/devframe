import type { DevframeClientCommand, DevframeCommandEntry, DevframeCommandKeybinding, DevframeDocksUserSettings, DevframeServerCommandEntry } from '@devframes/hub'
import type { CommandsContext, DevframeRpcClient } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import type { WhenContext } from 'devframe/utils/when'
import type { ShallowRef } from 'vue'
import { evaluateWhen } from 'devframe/utils/when'
import { computed, markRaw, reactive, ref, watch } from 'vue'
import { TOGGLE_PALETTE_COMMAND_ID } from '../constants'
import { sharedStateToRef } from './docks'
import { collectAllKeybindings, filterCommandsByWhen, findCommandDeep, normalizeKeyEvent } from './keybindings'
import { localizeCommand } from './locale'
import { useDockPopupWindow, useIsDockPopupOpen } from './popup'

const commandsContextByRpc = new WeakMap<DevframeRpcClient, CommandsContext>()

export async function createCommandsContext(
  clientType: 'embedded' | 'standalone',
  rpc: DevframeRpcClient,
  settingsState: SharedState<DevframeDocksUserSettings>,
  whenContextProvider?: () => WhenContext,
): Promise<CommandsContext> {
  if (commandsContextByRpc.has(rpc)) {
    return commandsContextByRpc.get(rpc)!
  }

  // Server commands from shared state
  const serverCommandsState = await rpc.sharedState.get('devframe:commands', { initialValue: [] })
  const serverCommands: ShallowRef<DevframeServerCommandEntry[]> = sharedStateToRef(serverCommandsState)

  // Client commands (local registry)
  const clientCommands = reactive(new Map<string, DevframeClientCommand>())

  // Shortcut overrides from user settings
  const settings = sharedStateToRef(settingsState)
  const shortcutOverrides = computed(() => settings.value.commandShortcuts ?? {})

  const paletteOpen = ref(false)
  // See `CommandsContext.paletteScopeId` for the contract; the palette owns
  // clearing it.
  const paletteScopeId = ref<string | null>(null)
  const isDockPopupOpen = useIsDockPopupOpen()

  const getWhenContext = (): WhenContext => {
    if (whenContextProvider)
      return whenContextProvider()
    return {
      clientType,
      dockOpen: false,
      paletteOpen: paletteOpen.value,
      dockSelectedId: '',
      popupOpen: isDockPopupOpen.value,
    }
  }

  // Merged commands
  const commands = computed<DevframeCommandEntry[]>(() => [
    ...serverCommands.value,
    ...Array.from(clientCommands.values()),
  ].map(command => localizeCommand(command)))

  const paletteCommands = computed<DevframeCommandEntry[]>(() => {
    const ctx = getWhenContext()
    const available = filterCommandsByWhen(commands.value, ctx)
    return available.filter(cmd => cmd.showInPalette !== false)
  })

  function register(cmd: DevframeClientCommand | DevframeClientCommand[]): () => void {
    const cmds = Array.isArray(cmd)
      ? cmd
      : [cmd]
    for (const c of cmds) {
      clientCommands.set(c.id, c)
    }
    return () => {
      for (const c of cmds) {
        clientCommands.delete(c.id)
      }
    }
  }

  function openPalette(atCommandId?: string): void {
    paletteScopeId.value = atCommandId ?? null
    paletteOpen.value = true
  }

  async function execute(id: string, ...args: any[]): Promise<unknown> {
    const cmd = findCommandDeep(commands.value, id)
    if (!cmd) {
      throw new Error(`Command "${id}" not found`)
    }

    // Check command-level when clause
    if (cmd.when) {
      const ctx = getWhenContext()
      if (!evaluateWhen(cmd.when, ctx)) {
        throw new Error(`Command "${id}" is not available in the current context`)
      }
    }

    if (cmd.source === 'server') {
      return rpc.call('hub:commands:execute', id, ...args)
    }

    // Client command
    if (cmd.action) {
      return cmd.action(...args)
    }

    throw new Error(`Command "${id}" has no action`)
  }

  function getKeybindings(id: string): DevframeCommandKeybinding[] {
    const cmd = findCommandDeep(commands.value, id)
    if (cmd?.allowShortcuts === false)
      return []

    const overrides = shortcutOverrides.value[id]
    if (overrides !== undefined)
      return overrides

    return cmd?.keybindings ?? []
  }

  // Keyboard shortcut listener
  if (typeof window !== 'undefined') {
    setupShortcutListener(getWhenContext, commands, getKeybindings, execute)
  }

  const commandsContext: CommandsContext = reactive({
    commands,
    paletteCommands,
    register,
    execute,
    getKeybindings,
    settings: markRaw(settingsState),
    paletteOpen,
    paletteScopeId,
    openPalette,
  })

  commandsContextByRpc.set(rpc, commandsContext)
  return commandsContext
}

// The key that opened the palette can keep repeating after focus moves out of Messages.
const heldMessagesKey = new WeakMap<EventTarget, string>()

// A release or a fresh press can reach either Messages or the viewer.
function updateHeldMessagesKey(host: EventTarget, event: KeyboardEvent): boolean {
  if (heldMessagesKey.get(host) !== (event.code || event.key))
    return false
  if (event.type === 'keydown' && event.repeat)
    return true
  heldMessagesKey.delete(host)
  return false
}

export function handleMessagesPaletteShortcut(event: KeyboardEvent, commands: CommandsContext) {
  const host = event.view?.parent
  if (!event.isTrusted || !host)
    return
  if (updateHeldMessagesKey(host, event) || event.type !== 'keydown' || event.defaultPrevented || event.isComposing || event.repeat || event.target !== event.currentTarget)
    return
  const pressed = normalizeKeyEvent(event)
  if (!commands.getKeybindings(TOGGLE_PALETTE_COMMAND_ID).some(binding => binding.key === pressed))
    return

  event.preventDefault()
  heldMessagesKey.set(host, event.code || event.key)
  commands.execute(TOGGLE_PALETTE_COMMAND_ID).catch(console.error)
}

function setupShortcutListener(
  getWhenContext: () => WhenContext,
  commands: { value: DevframeCommandEntry[] },
  getKeybindings: (id: string) => DevframeCommandKeybinding[],
  execute: (id: string, ...args: any[]) => Promise<unknown>,
) {
  const handler = (e: KeyboardEvent) => {
    const host = e.currentTarget
    if (host && updateHeldMessagesKey(host, e)) {
      e.preventDefault()
      // The embedded dock visibility shortcut also listens on this window.
      e.stopImmediatePropagation()
      return
    }
    if (e.type === 'keyup')
      return

    // Let the shortcut editor record keys without executing their commands.
    // composedPath reaches the input through shadow DOM; structural checks also
    // work for elements belonging to the popup window's realm.
    if (e.composedPath().some(target => (target as Element).classList?.contains('shortcut-key-input')))
      return
    // An open dock context menu owns its keys (Escape closes the menu, not
    // the panel; arrows move between items).
    if (e.composedPath().some(target => (target as Element).classList?.contains('devframes-dock-menu')))
      return

    const pressed = normalizeKeyEvent(e)
    if (!pressed || pressed === 'Mod' || pressed === 'Shift' || pressed === 'Alt')
      return

    const whenCtx = getWhenContext()
    const allBindings = collectAllKeybindings(commands, getKeybindings)

    for (const { id, keybinding } of allBindings) {
      if (keybinding.key !== pressed)
        continue
      // Check command-level when clause
      const cmd = findCommandDeep(commands.value, id)
      if (cmd?.when && !evaluateWhen(cmd.when, whenCtx))
        continue

      e.preventDefault()
      e.stopPropagation()
      execute(id).catch(console.error)
      return
    }
  }

  // Attach to the host window. This covers embedded (shadow DOM) mode and the
  // host page while a popup is open.
  function listen(host: Window) {
    // Another document can receive both the release and the next press.
    const onBlur = () => heldMessagesKey.delete(host)
    host.addEventListener('blur', onBlur)
    host.addEventListener('keydown', handler, true)
    host.addEventListener('keyup', handler, true)
    return () => {
      onBlur()
      host.removeEventListener('blur', onBlur)
      host.removeEventListener('keydown', handler, true)
      host.removeEventListener('keyup', handler, true)
    }
  }
  listen(window)
  watch(useDockPopupWindow(), (popup, _, onCleanup) => {
    if (popup)
      onCleanup(listen(popup))
  })
}
