import { describe, expect, it } from 'vitest'
import { toolInputToCommandArgs, toolInputToRpcArgs } from '../tool-input'

describe('tool input positional arguments', () => {
  it('passes arrays through and maps argN keys using the declared count', () => {
    expect(toolInputToRpcArgs([1, 2], 2)).toEqual([1, 2])
    expect(toolInputToRpcArgs({ arg0: 'a', arg1: 'b' }, 2)).toEqual(['a', 'b'])
  })

  it('collects contiguous argN keys without a declared count', () => {
    expect(toolInputToRpcArgs({ arg0: 1, arg1: 2 })).toEqual([1, 2])
  })

  it('treats null, undefined, and empty objects as zero-argument calls', () => {
    expect(toolInputToRpcArgs(undefined)).toEqual([])
    expect(toolInputToRpcArgs(null, 1)).toEqual([])
    expect(toolInputToRpcArgs({})).toEqual([])
  })

  it('preserves undeclared RPC input as one argument', () => {
    const input = { name: 'devframe' }
    expect(toolInputToRpcArgs(input)).toEqual([input])
  })

  it('drops undeclared command input', () => {
    expect(toolInputToCommandArgs({ name: 'devframe' })).toEqual([])
  })
})
