import type { CSSProperties } from 'vue'

/**
 * A group's optional `DevframeViewGroup.accentColor` (an arbitrary CSS color
 * set by the owner) is applied by overriding `--devframe-primary` on the
 * group's chrome container. Because the primary ramp derives from that variable
 * and it inherits through the subtree, every `primary`-based class in the group
 * (selected member text/background, the anchor icon, …) re-tints to the accent
 * with no per-element inline colors. When `accentColor` is unset the group simply
 * inherits the global primary.
 */
export function accentVarStyle(color: string | undefined): CSSProperties | undefined {
  return color ? ({ '--devframe-primary': color } as CSSProperties) : undefined
}
