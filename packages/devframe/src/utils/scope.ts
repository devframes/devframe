// Namespacing helpers shared by the node and client scoped contexts.
// A "qualified" RPC id / shared-state key / channel name contains a `:`
// separator (e.g. `my-plugin:get-cwd`); a "bare" name does not. These
// are pure string helpers and stay runtime-agnostic.

/** Whether a name is already namespaced (contains a `:` separator). */
export function isQualifiedName(name: string): boolean {
  return name.includes(':')
}

/**
 * Prefix a bare name with `<namespace>:`. Names that already contain a
 * `:` are returned unchanged, so callers can reference another scope's
 * ids explicitly (e.g. `ctx.rpc.call('other-plugin:fn')`).
 */
export function qualifyName(namespace: string, name: string): string {
  return isQualifiedName(name) ? name : `${namespace}:${name}`
}
