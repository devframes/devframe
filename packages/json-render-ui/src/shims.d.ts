// `@antfu/design` ships its components as raw `.vue` source (consumed and
// compiled by the consumer's Vite / @vitejs/plugin-vue). This ambient shim
// lets `tsc` / the dts build resolve those imports to a Vue component type.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<any, any, any>
  export default component
}
