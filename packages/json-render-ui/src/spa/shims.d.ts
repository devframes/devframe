// Side-effect style imports used by the SPA entry.
declare module '*.css' {}
declare module 'virtual:uno.css' {}

// `@antfu/design` ships raw `.vue` components — declare the module so `tsc`
// resolves them when the SPA renders through the shared components.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<any, any, any>
  export default component
}
