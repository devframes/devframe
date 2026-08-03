import { describe, expect, it } from 'vitest'
import { coerceAgentPositionalArgs } from '../agent-args'
import { toAgentToolName } from '../agent-tool-name'

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

describe('coerceAgentPositionalArgs', () => {
  const schema = {} as unknown

  it('passes arrays through and maps argN keys onto declared schemas', () => {
    expect(coerceAgentPositionalArgs([1, 2], [schema, schema])).toEqual([1, 2])
    expect(coerceAgentPositionalArgs({ arg0: 'a', arg1: 'b' }, [schema, schema])).toEqual(['a', 'b'])
  })

  it('collects argN keys even without schemas', () => {
    expect(coerceAgentPositionalArgs({ arg0: 1, arg1: 2 }, undefined)).toEqual([1, 2])
  })

  it('treats null/undefined and empty objects as zero-argument calls', () => {
    expect(coerceAgentPositionalArgs(undefined, undefined)).toEqual([])
    expect(coerceAgentPositionalArgs(null, [schema])).toEqual([])
    expect(coerceAgentPositionalArgs({}, undefined)).toEqual([])
  })

  it('follows the fallback for undeclared object payload', () => {
    const payload = { name: 'devframe' }
    // RPC-backed tools: an untyped RPC may take one raw object.
    expect(coerceAgentPositionalArgs(payload, undefined, 'wrap')).toEqual([payload])
    // Command-backed tools: positional params come solely from declared schemas.
    expect(coerceAgentPositionalArgs(payload, undefined, 'drop')).toEqual([])
  })
})
