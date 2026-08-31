export interface ViewerBackgroundElement {
  style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

/** Apply a validated branding background to the standalone viewer document. */
export function applyViewerBackground(
  documentElement: ViewerBackgroundElement,
  background: string | undefined,
  supports = (property: string, value: string): boolean => CSS.supports(property, value),
): void {
  if (background === undefined || !supports('background', background)) {
    documentElement.style.removeProperty('--devframes-viewer-background')
    return
  }

  documentElement.style.setProperty('--devframes-viewer-background', background)
}
