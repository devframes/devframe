import { describe, expect, it } from 'vitest'
import { commonRpcFunctions, openInEditor, openInFinder } from '../common-rpc-functions'
import { openHelpers } from '../open-helpers'

describe('recipes/common-rpc-functions', () => {
  it('exposes `openInEditor` as a devframe-namespaced action', () => {
    expect(openInEditor.name).toBe('devframe:open-in-editor')
    expect(openInEditor.type).toBe('action')
    expect(openInEditor.args).toHaveLength(1)
    expect(typeof openInEditor.handler).toBe('function')
  })

  it('exposes `openInFinder` as a devframe-namespaced action', () => {
    expect(openInFinder.name).toBe('devframe:open-in-finder')
    expect(openInFinder.type).toBe('action')
    expect(openInFinder.args).toHaveLength(1)
    expect(typeof openInFinder.handler).toBe('function')
  })

  it('bundles both helpers in `commonRpcFunctions`', () => {
    expect(commonRpcFunctions).toHaveLength(2)
    expect(commonRpcFunctions).toContain(openInEditor)
    expect(commonRpcFunctions).toContain(openInFinder)
  })

  it('keeps the deprecated `devframe/recipes/open-helpers` entry working as an alias', () => {
    expect(openHelpers).toBe(commonRpcFunctions)
  })
})
