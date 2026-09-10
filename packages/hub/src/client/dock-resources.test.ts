import type { DevframeConnection } from 'devframe/client'
import { describe, expect, it } from 'vitest'
import { resolveDockIcon, resolveDockUrl } from './dock-resources'

const connection: DevframeConnection = {
  connectionMeta: { backend: 'websocket' },
  metaBaseUrl: 'http://localhost:5173/__devtools/__connection.json',
}

describe('dock resource resolution', () => {
  it('resolves root and dot-relative iframe URLs from the connection source', () => {
    expect(resolveDockUrl('/__vite/', connection)).toBe('http://localhost:5173/__vite/')
    expect(resolveDockUrl('./viewer/', connection)).toBe('http://localhost:5173/__devtools/viewer/')
    expect(resolveDockUrl('../viewer/', connection)).toBe('http://localhost:5173/viewer/')
  })

  it('preserves absolute URLs and accepts host-like iframe URLs', () => {
    expect(resolveDockUrl('https://viewer.example/app', connection)).toBe('https://viewer.example/app')
    expect(resolveDockUrl('localhost:3000/app', connection)).toBe('http://localhost:3000/app')
    expect(resolveDockUrl('viewer.example/app', connection)).toBe('http://viewer.example/app')
  })

  it('resolves URL icons and preserves Iconify names and data URLs', () => {
    expect(resolveDockIcon('/icons/vite.svg', connection)).toBe('http://localhost:5173/icons/vite.svg')
    expect(resolveDockIcon('icons/vite.svg', connection)).toBe('http://localhost:5173/__devtools/icons/vite.svg')
    expect(resolveDockIcon('vite.svg', connection)).toBe('http://localhost:5173/__devtools/vite.svg')
    expect(resolveDockIcon('ph:gear-duotone', connection)).toBe('ph:gear-duotone')
    expect(resolveDockIcon('gear', connection)).toBe('gear')
    expect(resolveDockIcon('data:image/svg+xml;base64,abc', connection)).toBe('data:image/svg+xml;base64,abc')
  })

  it('resolves mask URLs and preserves mask data through JSON transport', () => {
    expect.assertions(4)
    const data = 'mask:data:image/svg+xml,%3Csvg%2F%3E'
    const icon = JSON.parse(JSON.stringify({ light: data, dark: 'mask:./dark.svg' }))
    expect(resolveDockIcon('mask:/icons/local.svg', connection)).toBe('mask:http://localhost:5173/icons/local.svg')
    expect(resolveDockIcon('mask:icon', connection)).toBe('mask:http://localhost:5173/__devtools/icon')
    expect(resolveDockIcon('mask:https://example.com/icon.svg', connection)).toBe('mask:https://example.com/icon.svg')
    expect(resolveDockIcon(icon, connection)).toEqual({ light: data, dark: 'mask:http://localhost:5173/__devtools/dark.svg' })
  })

  it('trims mask URLs and preserves empty masks without resolving the metadata URL', () => {
    expect.assertions(4)
    expect(resolveDockIcon('mask: ./icon.svg ', connection)).toBe('mask:http://localhost:5173/__devtools/icon.svg')
    expect(resolveDockIcon('mask: data:image/svg+xml,%3Csvg%2F%3E ', connection)).toBe('mask:data:image/svg+xml,%3Csvg%2F%3E')
    expect(resolveDockIcon('mask:', connection)).toBe('mask:')
    expect(resolveDockIcon('mask:   ', connection)).toBe('mask:')
  })

  it('resolves light and dark icon variants independently', () => {
    expect(resolveDockIcon({
      light: './icons/light.svg',
      dark: '/icons/dark.svg',
    }, connection)).toEqual({
      light: 'http://localhost:5173/__devtools/icons/light.svg',
      dark: 'http://localhost:5173/icons/dark.svg',
    })
  })
})
