import { describe, expect, it } from 'vitest'
import { coerceAgentPositionalArgs } from '../agent-args'

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
