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
