import { describe, expect, it } from 'vitest'
import { getMcpContent, withMcpContent } from '../mcp-content'

describe('withMcpContent', () => {
  const blocks = [
    { type: 'text', text: 'A red pixel.' },
    { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
  ] as const

  it('attaches the blocks without changing the value', () => {
    const value = { markdown: 'A red pixel.' }
    const result = withMcpContent(value, blocks)
    expect(result).toBe(value)
    expect(getMcpContent(result)).toBe(blocks)
    expect(Object.keys(result)).toEqual(['markdown'])
    expect(JSON.stringify(result)).toBe('{"markdown":"A red pixel."}')
    expect(structuredClone(result)).toEqual({ markdown: 'A red pixel.' })
    expect(getMcpContent(structuredClone(result))).toBeUndefined()
  })

  it('reads nothing from values without blocks', () => {
    expect(getMcpContent({ markdown: 'x' })).toBeUndefined()
    expect(getMcpContent('text')).toBeUndefined()
    expect(getMcpContent(null)).toBeUndefined()
    expect(getMcpContent(undefined)).toBeUndefined()
  })
})
