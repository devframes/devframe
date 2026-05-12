// only to resolve runtime plugin types on local, not shipped
declare module '#imports' {
  export { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'
}
