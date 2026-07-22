<script setup lang="ts">
import type { CodeServerConnect } from '@devframes/plugin-code-server/client'
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  /** How to reach the editor (absolute URL, or path + optional cookie). */
  connect: CodeServerConnect
  /** The local server port, when `connect.url` is absent. */
  port?: number
}>()

const frame = ref<HTMLIFrameElement | null>(null)
let currentUrl: string | null = null

/**
 * Resolve the iframe URL. A tunnel hands back an absolute `vscode.dev` URL; a
 * local server hands back a path we join to the current page's host on the
 * server's own port (cookies are port-agnostic, so the launcher origin's
 * cookie reaches the editor).
 */
function resolveUrl(): string | null {
  if (props.connect.url)
    return props.connect.url
  if (props.port == null)
    return null
  return `${location.protocol}//${location.hostname}:${props.port}${props.connect.path ?? '/'}`
}

function navigate(): void {
  const url = resolveUrl()
  if (!url || !frame.value || url === currentUrl)
    return
  // Set the session cookie before the iframe loads, or code-server shows its
  // login page. Cookies ignore port, so this reaches the editor's origin.
  if (props.connect.cookie) {
    const { name, value } = props.connect.cookie
    document.cookie = `${name}=${value}; path=/; SameSite=Lax`
  }
  currentUrl = url
  frame.value.src = url
}

onMounted(navigate)
// Re-navigate only when the resolved target actually changes; the iframe is
// otherwise never recreated, so open files / cursor / terminals survive churn.
watch(() => [props.connect, props.port], navigate, { deep: true })
</script>

<template>
  <iframe
    ref="frame"
    class="h-full w-full border-0 bg-base"
    title="Editor"
    allow="clipboard-read; clipboard-write; cross-origin-isolated"
  />
</template>
