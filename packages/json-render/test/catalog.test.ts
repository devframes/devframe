import type { CatalogUIElement, DevframeJsonRenderSpec, InferComponentProps } from '../src/index'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { baseCatalog, baseComponentNames, basePropSchemas } from '../src/index'

describe('base catalog', () => {
  it('exposes the seventeen catalog-v1 components', () => {
    expect(baseComponentNames).toHaveLength(17)
    expect(baseComponentNames).toEqual([
      'Stack',
      'Card',
      'Text',
      'Badge',
      'Button',
      'Icon',
      'Divider',
      'TextInput',
      'Switch',
      'KeyValueTable',
      'DataTable',
      'CodeBlock',
      'Progress',
      'Tree',
      'Tabs',
      'Link',
      'Select',
    ])
  })

  it('registers the same component names on the upstream catalog', () => {
    expect([...baseCatalog.componentNames].sort()).toEqual([...baseComponentNames].sort())
  })

  it('declares no base actions (dispatched dynamically via the bridge)', () => {
    expect(baseCatalog.actionNames).toEqual([])
  })
})

describe('per-component prop validation', () => {
  it('accepts valid props', () => {
    expect(basePropSchemas.Button.safeParse({ label: 'Save', variant: 'primary' }).success).toBe(true)
    expect(basePropSchemas.Progress.safeParse({ value: 40, max: 100 }).success).toBe(true)
  })

  it('accepts Select.native alongside the rest of its props', () => {
    expect(basePropSchemas.Select.safeParse({ options: ['a', 'b'], native: true }).success).toBe(true)
  })

  it('rejects an out-of-set enum value', () => {
    expect(basePropSchemas.Button.safeParse({ variant: 'nope' }).success).toBe(false)
    expect(basePropSchemas.Badge.safeParse({ variant: 'purple' }).success).toBe(false)
  })

  it('tolerates dynamic `$bindState` expressions where a scalar is expected', () => {
    expect(basePropSchemas.TextInput.safeParse({ value: { $bindState: '/name' } }).success).toBe(true)
    expect(basePropSchemas.Switch.safeParse({ value: { $state: '/enabled' } }).success).toBe(true)
  })
})

describe('catalog-derived element typing', () => {
  it('narrows props when the element type is checked', () => {
    type BaseCatalogElement = CatalogUIElement<typeof baseCatalog>
    const assertNarrowing = (element: BaseCatalogElement): void => {
      if (element.type === 'Button')
        expectTypeOf(element.props).toEqualTypeOf<InferComponentProps<typeof baseCatalog, 'Button'>>()
      if (element.type === 'Text')
        expectTypeOf(element.props).toEqualTypeOf<InferComponentProps<typeof baseCatalog, 'Text'>>()
    }

    expectTypeOf<DevframeJsonRenderSpec<BaseCatalogElement>['elements'][string]>().toEqualTypeOf<BaseCatalogElement>()
    expectTypeOf(assertNarrowing).toBeFunction()
  })
})
