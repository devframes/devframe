<script setup lang="ts">
import { computed, onMounted } from 'vue'
import ConnectionOverlay from './components/ConnectionOverlay.vue'
import EditorFrame from './components/EditorFrame.vue'
import LauncherView from './components/LauncherView.vue'
import { useCodeServer } from './composables/code-server'
import { connection, connect as connectRpc } from './composables/rpc'

const { detection, server, connect, busy, phase, launch, stop, recheck, bootstrap } = useCodeServer()

// Keep the editor iframe mounted for as long as we hold a connect descriptor,
// so a transient restart (running → starting → running) hides it via `v-show`
// rather than tearing it down and losing open files / cursor / terminals.
const editorMounted = computed(() => !!connect.value)

onMounted(async () => {
  await connectRpc()
  // Fetch status + subscribe as soon as the client is available; calls succeed
  // on the single-user standalone server even while the socket finishes its
  // trust handshake, and a hard connection failure leaves `rpc` null so
  // `bootstrap` returns early and the connection overlay takes over.
  await bootstrap()
})

// Expose stop for potential host wiring; unused by the full-bleed editor chrome.
defineExpose({ stop })
</script>

<template>
  <div class="relative h-full w-full of-hidden bg-base color-base">
    <EditorFrame
      v-if="editorMounted"
      v-show="phase === 'running'"
      :connect="connect!"
      :port="server.port"
    />

    <LauncherView
      v-if="phase !== 'running'"
      :phase="phase"
      :detection="detection"
      :server="server"
      :busy="busy"
      @launch="launch"
      @recheck="recheck"
    />

    <ConnectionOverlay :status="connection.status" :error="connection.error" />
  </div>
</template>
