import type { DevToolsNodeContext, DevToolsViewHost as DevToolsViewHostType } from 'devframe/types'
import { existsSync } from 'node:fs'
import { diagnostics } from './diagnostics'

export class DevToolsViewHost implements DevToolsViewHostType {
  /**
   * @internal
   */
  public buildStaticDirs: { baseUrl: string, distDir: string }[] = []

  constructor(
    public readonly context: DevToolsNodeContext,
  ) {
  }

  hostStatic(baseUrl: string, distDir: string) {
    if (!existsSync(distDir)) {
      throw diagnostics.DF0008.throw({ distDir })
    }

    this.buildStaticDirs.push({ baseUrl, distDir })
    this.context.host.mountStatic(baseUrl, distDir)
  }
}
