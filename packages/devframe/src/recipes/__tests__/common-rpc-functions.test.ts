import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { commonRpcFunctions, KNOWN_EDITORS, openInEditor, openInFinder } from '../common-rpc-functions'

/** Synchronously check whether a value satisfies a Standard Schema. */
function accepts(schema: StandardSchemaV1, value: unknown): boolean {
  const result = schema['~standard'].validate(value)
  if (result instanceof Promise)
    throw new TypeError('unexpected async validator')
  return !result.issues
}

describe('recipes/common-rpc-functions', () => {
  it('exposes `openInEditor` as a devframe-namespaced action', () => {
    expect(openInEditor.name).toBe('devframe:open-in-editor')
    expect(openInEditor.type).toBe('action')
    expect(openInEditor.args).toHaveLength(2)
    expect(typeof openInEditor.handler).toBe('function')
  })

  it('restricts `openInEditor`\'s optional second argument to `KNOWN_EDITORS`', () => {
    expect(KNOWN_EDITORS).toContain('code')
    expect(KNOWN_EDITORS).toContain('vim')

    const editorSchema = openInEditor.args[1]
    expect(accepts(editorSchema, undefined)).toBe(true)
    for (const editor of KNOWN_EDITORS)
      expect(accepts(editorSchema, editor)).toBe(true)
    expect(accepts(editorSchema, 'not-a-real-editor')).toBe(false)
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
})
