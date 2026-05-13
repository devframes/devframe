// only to resolve runtime plugin types on local, not shipped
declare module '#imports' {
  export interface RuntimeConfig {
    public: {
      devframe: {
        baseURL: string
      }
    }
  }

  export { defineNuxtPlugin } from 'nuxt/app'
  export const useRuntimeConfig: () => RuntimeConfig
}
