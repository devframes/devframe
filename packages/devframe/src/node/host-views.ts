import type { DevframeNodeContext, DevframeViewHost as DevframeViewHostType, StaticAssetsSource } from 'devframe/types'
import { existsSync } from 'node:fs'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { diagnostics } from './diagnostics'

export class DevframeViewHost implements DevframeViewHostType {
  /**
   * @internal
   */
  public buildStaticDirs: { baseUrl: string, source: StaticAssetsSource }[] = []

  constructor(
    public readonly context: DevframeNodeContext,
  ) {
  }

  hostStatic(baseUrl: string, source: StaticAssetsSource) {
    // Local directories must exist up front; remote declarations resolve to
    // a locally installed package when present, otherwise to a lazy CDN
    // back-proxy store — nothing to check on disk yet.
    const resolved = resolveStaticAssetsSource(source, this.context.host.getStorageDir('project'))
    if (typeof resolved === 'string' && !existsSync(resolved)) {
      throw diagnostics.DF0008({ distDir: resolved })
    }

    this.buildStaticDirs.push({ baseUrl, source })
    this.context.host.mountStatic(baseUrl, resolved)
  }
}
