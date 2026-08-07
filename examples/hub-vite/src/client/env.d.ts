/// <reference types="vite/client" />

declare module 'virtual:uno.css'

// The JSON-render dock renderer (@devframes/json-render-ui, resolved to source
// in the workspace) wraps `@antfu/design` `.vue` components — declare the module
// so `tsc` resolves them.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<any, any, any>
  export default component
}
