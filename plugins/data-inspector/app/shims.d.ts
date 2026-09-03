declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module 'virtual:uno.css' {}
declare module '*.css' {}
declare module '*.css?inline' {
  const css: string
  export default css
}
