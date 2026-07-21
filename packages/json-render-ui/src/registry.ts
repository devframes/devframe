import type { ComponentRegistry } from '@json-render/vue'
import { baseCatalog } from '@devframes/json-render'
import { defineRegistry } from '@json-render/vue'
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  DataTable,
  Divider,
  Icon,
  KeyValueTable,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
  Tree,
} from './components'
import { JsonRenderError } from './components/_error'

/** Reserved component type used to isolate an element that fails validation. */
export const ERROR_COMPONENT_TYPE = '__jsonRenderError'

/**
 * The base Vue registry: the fourteen catalog-v1 components ported onto
 * `@antfu/design` semantic tokens, wrapped as Vue components via upstream
 * `defineRegistry`. A third party replaces the whole registry (there is no
 * incremental extension in v1).
 */
export const baseRegistry: ComponentRegistry = defineRegistry(baseCatalog as any, {
  components: {
    Stack,
    Card,
    Text,
    Badge,
    Button,
    Icon,
    Divider,
    TextInput,
    Switch,
    KeyValueTable,
    DataTable,
    CodeBlock,
    Progress,
    Tree,
    [ERROR_COMPONENT_TYPE]: JsonRenderError,
  } as any,
}).registry
