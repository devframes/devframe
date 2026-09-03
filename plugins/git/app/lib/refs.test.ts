import { describe, expect, it } from 'vitest'
import { parseRefs } from './refs'

describe('parseRefs', () => {
  it('parses the checked-out branch from a HEAD arrow', () => {
    expect(parseRefs(['HEAD -> main'])).toEqual([
      { kind: 'branch', name: 'main', current: true },
    ])
  })

  it('parses tags, remotes, and local branches', () => {
    expect(parseRefs(['tag: v1.0.0'])).toEqual([{ kind: 'tag', name: 'v1.0.0' }])
    expect(parseRefs(['origin/feature/x'])).toEqual([
      { kind: 'remote', remote: 'origin', name: 'feature/x' },
    ])
    expect(parseRefs(['develop'])).toEqual([
      { kind: 'branch', name: 'develop', current: false },
    ])
  })

  it('flags the current branch by name when no arrow is present', () => {
    expect(parseRefs(['main'], 'main')).toEqual([
      { kind: 'branch', name: 'main', current: true },
    ])
  })

  it('drops blanks and the symbolic origin/HEAD', () => {
    expect(parseRefs(['', '  ', 'origin/HEAD'])).toEqual([])
  })

  it('treats a bare HEAD as detached', () => {
    expect(parseRefs(['HEAD'])).toEqual([{ kind: 'head' }])
  })

  it('orders the current branch closest to the node (last)', () => {
    const refs = parseRefs(['HEAD -> main', 'origin/main', 'tag: v2'])
    expect(refs.map(r => r.kind)).toEqual(['remote', 'tag', 'branch'])
    expect(refs.at(-1)).toEqual({ kind: 'branch', name: 'main', current: true })
  })
})
