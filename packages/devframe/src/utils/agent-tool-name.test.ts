import { describe, expect, it } from 'vitest'
import { toAgentToolName } from './agent-tool-name'

describe('toAgentToolName', () => {
  it('replaces runs of unsafe characters with a single underscore', () => {
    expect(toAgentToolName('devframe:state:read')).toBe('devframe_state_read')
    expect(toAgentToolName('devframes:plugin:git:status')).toBe('devframes_plugin_git_status')
    expect(toAgentToolName('devframe:connect:list-instances')).toBe('devframe_connect_list-instances')
    expect(toAgentToolName('a::b//c d')).toBe('a_b_c_d')
  })

  it('keeps already-safe names unchanged', () => {
    expect(toAgentToolName('greet')).toBe('greet')
    expect(toAgentToolName('my-tool_2')).toBe('my-tool_2')
  })

  it('caps the result at 128 characters (the strictest client pattern)', () => {
    const long = `ns:${'x'.repeat(200)}`
    const name = toAgentToolName(long)
    expect(name).toHaveLength(128)
    expect(name).toMatch(/^[\w-]{1,128}$/)
  })
})
