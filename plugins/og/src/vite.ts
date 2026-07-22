import type { DevframeVitePlugin, ViteDevBridgeOptions } from 'devframe/helpers/vite'
import { viteDevBridge } from 'devframe/helpers/vite'
import ogDevframe, { createOgDevframe } from './index'

export type { ViteDevBridgeOptions }

export interface OgVitePluginOptions extends ViteDevBridgeOptions {
  /** Override standalone trust for the bridge; useful for local SPA development. */
  auth?: boolean
}

export function ogVitePlugin(options: OgVitePluginOptions = {}): DevframeVitePlugin {
  const { auth, ...bridgeOptions } = options
  const definition = auth === undefined ? ogDevframe : createOgDevframe({ auth })
  return viteDevBridge(definition, bridgeOptions)
}
