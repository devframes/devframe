// Allow side-effect CSS imports from the SPA entry and Storybook stories.
declare module '*.css' {}
declare module 'virtual:uno.css' {}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
