export const NAMESPACE = 'devframe-streaming-chat'

// Bare ids — pass these to the scoped context, which namespaces them.
export const CHANNEL = 'tokens'
export const HISTORY = 'history'

// Fully-qualified shared-state key, used by the `DevframeRpcSharedStates`
// registry augmentation in `types.ts` (the registry is keyed by the
// runtime id the scope produces).
export const HISTORY_KEY = `${NAMESPACE}:${HISTORY}`

export const MAX_HISTORY = 200

export const DEMO_PROMPTS = [
  'Tell me about devframe.',
  'How does streaming work?',
  'Write a haiku about RPC.',
] as const
