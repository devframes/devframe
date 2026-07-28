import type { AssetInfo } from '../../../types'
import { FontPreview } from './FontPreview'
import { Icon } from './ui/Icon'

export interface AssetPreviewProps {
  asset: AssetInfo
  textContent?: string | null
  /** Larger, interactive preview (autoplay/controls) for the details panel. */
  detail?: boolean
  class?: string
}

export function AssetPreview({ asset, textContent, detail, class: extra }: AssetPreviewProps) {
  const base = ['flex items-center justify-center overflow-hidden bg-active p-1', extra].filter(Boolean).join(' ')

  if (asset.type === 'image') {
    return (
      <div class={base}>
        <img src={asset.publicPath} alt={asset.path} class="max-h-full max-w-full object-contain select-none" draggable={false} />
      </div>
    )
  }

  if (asset.type === 'font') {
    return (
      <div class={base}>
        <FontPreview asset={asset} class="self-stretch p-2 text-2xl" />
      </div>
    )
  }

  if (asset.type === 'text') {
    if (!textContent) {
      return (
        <div class={base}>
          <Icon name="i-ph-file-text-duotone" class="text-3xl op-mute" />
        </div>
      )
    }
    return (
      <div class={[base, 'w-full items-start p-4'].join(' ')}>
        <pre class="max-h-40 w-full overflow-hidden font-mono text-xs">{textContent}</pre>
      </div>
    )
  }

  if (asset.type === 'video') {
    return (
      <div class={base}>
        <video src={asset.publicPath} autoPlay={detail} controls={detail} class="max-h-full max-w-full" />
      </div>
    )
  }

  if (asset.type === 'audio') {
    if (!detail) {
      return (
        <div class={base}>
          <Icon name="i-ph-speaker-high-duotone" class="text-3xl op-mute" />
        </div>
      )
    }
    return (
      <div class={base}>
        <audio src={asset.publicPath} controls />
      </div>
    )
  }

  return (
    <div class={base}>
      <Icon name="i-ph-file-duotone" class="text-3xl op-mute" />
    </div>
  )
}
