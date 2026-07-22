// Side-effect style imports used by the SPA entry.
declare module '*.css' {}
declare module 'virtual:uno.css' {}

// @devframes/json-render-ui resolves to source in the workspace, and wraps
// `@antfu/design` `.vue` components — declare the module so `tsc` resolves them.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<any, any, any>
  export default component
}
