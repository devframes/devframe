const DETECT_MARGIN = 100
const DEFAULT_GAP = 10
const VIEWPORT_MARGIN = 8

type FloatingAlign = 'top' | 'bottom' | 'left' | 'right'

interface FloatingAnchorRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ResolveFloatingPositionOptions {
  rect: FloatingAnchorRect
  viewportWidth: number
  viewportHeight: number
  panelWidth?: number
  panelHeight?: number
  gap?: number
  placement?: FloatingAlign
}

export interface ResolvedFloatingPosition {
  align: FloatingAlign
  style: Record<string, string>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(max, min))
}

interface PlacementGeometry {
  rect: FloatingAnchorRect
  anchorRight: number
  anchorBottom: number
  vw: number
  vh: number
  gap: number
  panelWidth: number
  panelHeight: number
}

function detectAlign({ rect, anchorRight, anchorBottom, vw, vh }: PlacementGeometry): FloatingAlign {
  if (rect.left < DETECT_MARGIN)
    return 'right'
  if (anchorRight > vw - DETECT_MARGIN)
    return 'left'
  if (rect.top < DETECT_MARGIN)
    return 'bottom'
  if (anchorBottom > vh - DETECT_MARGIN)
    return 'top'
  return 'bottom'
}

// Flip to the opposite side when the panel would overflow the viewport there but
// fits on the other side.
function flipForOverflow(align: FloatingAlign, g: PlacementGeometry): FloatingAlign {
  const { rect, anchorRight, anchorBottom, vw, vh, gap, panelWidth, panelHeight } = g
  if (align === 'bottom' && anchorBottom + gap + panelHeight > vh - VIEWPORT_MARGIN && rect.top - gap - panelHeight >= VIEWPORT_MARGIN)
    return 'top'
  if (align === 'top' && rect.top - gap - panelHeight < VIEWPORT_MARGIN && anchorBottom + gap + panelHeight <= vh - VIEWPORT_MARGIN)
    return 'bottom'
  if (align === 'right' && anchorRight + gap + panelWidth > vw - VIEWPORT_MARGIN && rect.left - gap - panelWidth >= VIEWPORT_MARGIN)
    return 'left'
  if (align === 'left' && rect.left - gap - panelWidth < VIEWPORT_MARGIN && anchorRight + gap + panelWidth <= vw - VIEWPORT_MARGIN)
    return 'right'
  return align
}

function buildPlacementStyle(align: FloatingAlign, g: PlacementGeometry): Record<string, string> {
  const { rect, anchorRight, anchorBottom, vw, vh, gap, panelWidth, panelHeight } = g
  const style: Record<string, string> = {}

  if (align === 'top' || align === 'bottom') {
    style[align === 'bottom' ? 'top' : 'bottom'] = align === 'bottom' ? `${anchorBottom + gap}px` : `${vh - rect.top + gap}px`
    if (panelWidth) {
      style.left = `${clamp(rect.left + rect.width / 2 - panelWidth / 2, VIEWPORT_MARGIN, vw - panelWidth - VIEWPORT_MARGIN)}px`
    }
    else {
      style.left = `${rect.left + rect.width / 2}px`
      style.transform = 'translateX(-50%)'
    }
    return style
  }

  style[align === 'right' ? 'left' : 'right'] = align === 'right' ? `${anchorRight + gap}px` : `${vw - rect.left + gap}px`
  if (panelHeight) {
    style.top = `${clamp(rect.top + rect.height / 2 - panelHeight / 2, VIEWPORT_MARGIN, vh - panelHeight - VIEWPORT_MARGIN)}px`
  }
  else {
    style.top = `${rect.top + rect.height / 2}px`
    style.transform = 'translateY(-50%)'
  }
  return style
}

export function resolveFloatingPosition(options: ResolveFloatingPositionOptions): ResolvedFloatingPosition {
  const {
    rect,
    viewportWidth: vw,
    viewportHeight: vh,
    panelWidth = 0,
    panelHeight = 0,
    gap = DEFAULT_GAP,
    placement,
  } = options

  const geometry: PlacementGeometry = {
    rect,
    anchorRight: rect.left + rect.width,
    anchorBottom: rect.top + rect.height,
    vw,
    vh,
    gap,
    panelWidth,
    panelHeight,
  }

  let align = placement ?? detectAlign(geometry)
  if (!placement && panelWidth && panelHeight)
    align = flipForOverflow(align, geometry)

  return { align, style: buildPlacementStyle(align, geometry) }
}

/** Properties whose computed value, when not `none`, makes an element a containing block for `position: fixed` descendants. */
const FIXED_CONTAINING_BLOCK_PROPERTIES = ['transform', 'translate', 'rotate', 'scale', 'perspective', 'filter', 'backdropFilter'] as const

/**
 * The element a fixed-position panel anchored to `anchor` must be `<Teleport>`ed into to
 * avoid being positioned relative to (and clipped by) a transformed ancestor, or
 * `undefined` when there is no such ancestor and the panel can stay in place.
 *
 * Returns the *outermost* offending ancestor's parent: escaping only the nearest one can
 * land inside another, leaving the panel just as mispositioned. Walking `parentElement`
 * (rather than `parentNode`) naturally stops at a shadow root's boundary, so a dock's popover
 * never escapes the shadow root that its stylesheet is scoped to.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/position#fixed
 */
export function resolveFixedEscapeTarget(anchor: Element): HTMLElement | undefined {
  let outermost: HTMLElement | undefined
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (FIXED_CONTAINING_BLOCK_PROPERTIES.some(property => style[property] !== 'none') || /paint|layout|strict|content/.test(style.contain))
      outermost = node
  }
  return outermost?.parentElement ?? undefined
}
