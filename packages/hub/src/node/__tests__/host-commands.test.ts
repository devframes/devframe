import type { HubNodeContext } from '../context'
import { describe, expect, it } from 'vitest'
import { DevframeCommandsHost } from '../host-commands'

describe('devToolsCommandsHost command id validation', () => {
  it('rejects duplicate ids inside one command tree', () => {
    const host = new DevframeCommandsHost({} as HubNodeContext)

    expect(() => host.register({
      id: 'tool:parent',
      title: 'Parent',
      children: [
        { id: 'tool:child', title: 'Child' },
        { id: 'tool:child', title: 'Duplicate child' },
      ],
    })).toThrow('Command id "tool:child" is already used')
  })

  it('rejects child ids that collide with existing command trees', () => {
    const host = new DevframeCommandsHost({} as HubNodeContext)
    host.register({
      id: 'tool:parent',
      title: 'Parent',
      children: [
        { id: 'tool:child', title: 'Child' },
      ],
    })

    expect(() => host.register({
      id: 'other:parent',
      title: 'Other parent',
      children: [
        { id: 'tool:child', title: 'Duplicate child' },
      ],
    })).toThrow('Command id "tool:child" is already used')

    expect(() => host.register({
      id: 'tool:child',
      title: 'Top-level collision',
    })).toThrow('Command id "tool:child" is already used')
  })

  it('validates updated children against other command trees', () => {
    const host = new DevframeCommandsHost({} as HubNodeContext)
    host.register({
      id: 'other:parent',
      title: 'Other parent',
      children: [
        { id: 'other:child', title: 'Other child' },
      ],
    })
    const handle = host.register({
      id: 'tool:parent',
      title: 'Parent',
    })

    expect(() => handle.update({
      children: [
        { id: 'other:child', title: 'Duplicate child' },
      ],
    })).toThrow('Command id "other:child" is already used')
  })
})
