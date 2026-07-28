// Deprecated compatibility shim for the open helpers recipe.
//
// Prefer the canonical `devframe/recipes/common-rpc-functions` entry. This
// module re-exports the same implementation under the historical name so
// existing imports keep working. It will be removed in a future major
// release.
import { commonRpcFunctions } from './common-rpc-functions'

export { openInEditor, openInFinder } from './common-rpc-functions'

/** @deprecated Use `commonRpcFunctions` from `devframe/recipes/common-rpc-functions` instead. */
export const openHelpers: typeof commonRpcFunctions = commonRpcFunctions
