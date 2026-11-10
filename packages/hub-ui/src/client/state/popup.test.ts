import type { DocksContext } from '@devframes/hub/client'
import { CLIENT_CONTEXT_KEY } from '@devframes/hub/client'
import { afterEach, expect, it, vi } from 'vitest'
import { isInsideHub } from '../embedded/is-inside-hub'
import { closeDockPopup, requestDockPopupOpen, useIsDockPopupOpen } from './popup'

vi.mock('./branding', () => ({
  applyDocumentHead: vi.fn(),
  applyPrimaryColor: vi.fn(),
  useBranding: () => ({ value: {} }),
}))
vi.mock('./color-mode', async () => {
  const { ref } = await import('vue')
  return {
    isDark: ref(false),
  }
})

const { onMount } = vi.hoisted(() => ({
  onMount: vi.fn(),
}))
vi.mock('../components/DockStandalone', () => ({
  DockStandalone: class {
    constructor() { onMount() }
    remove() {}
  },
}))

afterEach(() => {
  closeDockPopup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('identifies the popup as a Hub before mounting its iframe views', async () => {
  const element = () => ({
    appendChild: vi.fn(),
    style: {
      setProperty: vi.fn(),
    },
  })
  const popup = {
    document: {
      createElement: element,
      documentElement: element(),
      head: element(),
      body: {
        ...element(),
        textContent: '',
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  }
  // The fixture supplies only the context fields used by popup initialization.
  // eslint-disable-next-line slop/no-chained-type-assertions
  const context = {
    panel: {
      store: { width: 80, height: 80 },
    },
    rpc: { connectionMeta: {} },
    docks: {
      switchEntry: vi.fn(),
    },
  } as unknown as DocksContext
  vi.stubGlobal('window', {
    innerWidth: 1000,
    innerHeight: 800,
    documentPictureInPicture: {
      requestWindow: async () => popup,
    },
  })
  let insideHubAtMount: boolean | undefined
  onMount.mockImplementation(() => {
    insideHubAtMount = isInsideHub({ parent: popup })
  })

  requestDockPopupOpen(context)
  await vi.waitFor(() => expect(useIsDockPopupOpen().value).toBe(true))
  expect(insideHubAtMount).toBe(true)
  expect(Reflect.get(popup, CLIENT_CONTEXT_KEY)).toBe(context)
})
