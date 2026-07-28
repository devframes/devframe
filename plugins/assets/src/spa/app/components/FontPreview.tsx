import type { AssetInfo } from '../../../types'
import { useEffect, useId } from 'preact/hooks'

export interface FontPreviewProps {
  asset: AssetInfo
  class?: string
}

/** Loads the font via a scoped `@font-face` and renders a pangram-ish sample. */
export function FontPreview({ asset, class: extra }: FontPreviewProps) {
  const family = `devframe-assets-${useId().replace(/[^a-z0-9]/gi, '')}`

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@font-face { font-family: '${family}'; src: url('${asset.publicPath}'); }`
    document.head.append(style)
    return () => style.remove()
  }, [family, asset.publicPath])

  return (
    <div class={['overflow-hidden', extra].filter(Boolean).join(' ')} style={{ fontFamily: `'${family}'` }}>
      Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz
    </div>
  )
}
