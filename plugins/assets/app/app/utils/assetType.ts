import type { AssetType } from '../connect'

/** Canonical display order for the type filter. */
export const ASSET_TYPES: readonly AssetType[] = ['image', 'video', 'audio', 'font', 'text', 'other']

/** Shared label + Phosphor icon per asset type, used by the filter and the tree. */
export const TYPE_META: Record<AssetType, { label: string, icon: string }> = {
  image: { label: 'Images', icon: 'i-ph-image-duotone' },
  video: { label: 'Videos', icon: 'i-ph-video-duotone' },
  audio: { label: 'Audio', icon: 'i-ph-speaker-high-duotone' },
  font: { label: 'Fonts', icon: 'i-ph-text-aa-duotone' },
  text: { label: 'Text', icon: 'i-ph-file-text-duotone' },
  other: { label: 'Other', icon: 'i-ph-file-duotone' },
}
