import { describe, expect, it } from 'vitest'
import { iframe } from '../src/client/stories/fixtures'
import { createMockDocksContext } from '../src/client/stories/mock-context'

/**
 * `selectedId` lives on the same `panelStore` ref as `open`/mode/geometry
 * (`state/docks.ts`'s `HubDockPanelStorage`) — restored from localStorage in
 * the real embedded client, seeded here via `createMockDocksContext`'s
 * `panel`/`selectedId` options instead of a separate session store.
 */
describe('restored dock panel state (selectedId on the shared panelStore)', () => {
  it('keeps a restored selectedId that resolves to a real leaf entry', async () => {
    const context = await createMockDocksContext({
      entries: [iframe('a', 'A', 'ph:cube-duotone')],
      panel: { selectedId: 'a', open: true },
    })

    expect(context.docks.selectedId).toBe('a')
    expect(context.panel.store.open).toBe(true)
  })

  it('keeps a restored selectedId of a `~builtin` pseudo-entry (e.g. Settings)', async () => {
    const context = await createMockDocksContext({
      entries: [],
      panel: { selectedId: '~settings', open: true },
    })

    expect(context.docks.selectedId).toBe('~settings')
  })

  it('clears a restored selectedId pointing at a group (not a selectable leaf)', async () => {
    const context = await createMockDocksContext({
      entries: [{ id: 'nuxt', type: 'group', title: 'Nuxt', icon: 'ph:cube-duotone' } as any],
      panel: { selectedId: 'nuxt' },
    })

    expect(context.docks.selectedId).toBeNull()
  })

  it('clears a restored selectedId pointing at a subTabs anchor (not a selectable leaf)', async () => {
    const context = await createMockDocksContext({
      entries: [iframe('nuxt', 'Nuxt', 'ph:cube-duotone', { subTabs: { protocol: 'postmessage' } } as any)],
      panel: { selectedId: 'nuxt' },
    })

    expect(context.docks.selectedId).toBeNull()
  })

  it('clears a restored selectedId that no longer resolves to any entry, without forcing the panel open', async () => {
    const context = await createMockDocksContext({
      entries: [iframe('a', 'A', 'ph:cube-duotone')],
      panel: { selectedId: 'gone', open: false },
    })

    expect(context.docks.selectedId).toBeNull()
    // Clearing an invalid restored id must not route through `switchEntry`
    // (which would force `open = true`) — the panel stays exactly as restored.
    expect(context.panel.store.open).toBe(false)
  })

  it('does not clear an id `switchEntry` itself legitimately selects later (a subTabs anchor with no live member yet)', async () => {
    const context = await createMockDocksContext({
      entries: [iframe('nuxt', 'Nuxt', 'ph:cube-duotone', { subTabs: { protocol: 'postmessage' } } as any)],
    })

    await context.docks.switchEntry('nuxt')

    expect(context.docks.selectedId).toBe('nuxt')
  })

  it('sets selectedId and open on the same panel store that carries geometry (mode)', async () => {
    const context = await createMockDocksContext({
      entries: [],
      panel: { mode: 'float' },
    })

    context.panel.store.open = true
    context.docks.selectedId = null

    expect(context.panel.store.open).toBe(true)
    expect(context.panel.store.mode).toBe('float')
  })
})
