// Re-exports the shared devframe dock-icon resolver (see
// `design/dock-icon.ts`, a port of @antfu/design's `DisplayIconifyRemoteIcon`)
// so this surface stays in lockstep with every other hub shell instead of
// hand-maintaining its own icon table.
export { dockIconSvg } from '../../../../design/dock-icon'
