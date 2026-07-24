import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// Compose the repo-shared design preset. `content.pipeline.include` opts the
// vanilla `.ts`/`.html` sources into extraction, since the dock rail and the
// app-under-test class strings live in plain TS/HTML rather than a framework
// file UnoCSS scans by default.
export default mergeConfigs([
  designConfig,
  {
    content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
  },
])
