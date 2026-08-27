/**
 * A prompt queued for the Ask AI assistant to send.
 *
 * The assistant's chat state lives inside `AssistantChat.vue`, so other
 * surfaces (e.g. the Getting Started wizard) can't call its `sendMessage`
 * directly. They instead set this shared value and open the panel; the
 * shadowed `AssistantChat.vue` watches it, sends the prompt, and clears it.
 */
export function useAssistantPrompt() {
  return useState<string | null>('assistant-pending-prompt', () => null)
}
