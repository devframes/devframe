<script setup lang="ts">
import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import type { DevframeMessageEntry } from '../types'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import MessagesView from './components/MessagesView.vue'
import { useMessages } from './state/messages'

const props = defineProps<{
  rpc: DevframeRpcClient
}>()

const state = useMessages(props.rpc)

// The live feed rides on shared-state over the socket, so a dropped socket or
// refused auth is surfaced instead of silently freezing the list. The client
// doesn't auto-reconnect; a reload re-runs the whole handshake.
const status = ref<DevframeConnectionStatus>(props.rpc.status)
const offStatus = props.rpc.events.on('connection:status', (next) => {
  status.value = next
})
onBeforeUnmount(offStatus)

const CONNECTION_COPY: Record<Exclude<DevframeConnectionStatus, 'connected'>, { icon: string, title: string, body: string }> = {
  connecting: { icon: 'i-ph-plugs-connected-duotone', title: 'Connecting…', body: 'Establishing a connection to the devframe server.' },
  disconnected: { icon: 'i-ph-plugs-duotone', title: 'Disconnected', body: 'Lost the connection to the devframe server. Reload once it is back up.' },
  unauthorized: { icon: 'i-ph-lock-key-duotone', title: 'Not authorized', body: 'Reopen the link printed by your dev server, then reload.' },
  error: { icon: 'i-ph-warning-octagon-duotone', title: 'Connection failed', body: 'Could not reach the devframe server.' },
}
const connectionCopy = computed(() => status.value === 'connected' ? null : CONNECTION_COPY[status.value])

function reload(): void {
  location.reload()
}

// The "open file" affordance rides on devframe's prebuilt recipe, which the
// plugin registers server-side; static builds have no live server to open
// an editor with.
const canOpenFile = computed(() => props.rpc.connectionMeta.backend !== 'static')

async function onDismiss(id: string): Promise<void> {
  await props.rpc.call('devframes:plugin:messages:remove', id)
}

async function onDismissMany(ids: string[]): Promise<void> {
  for (const id of ids)
    await props.rpc.call('devframes:plugin:messages:remove', id)
}

async function onClear(): Promise<void> {
  await props.rpc.call('devframes:plugin:messages:clear')
}

async function onPersist(id: string): Promise<void> {
  await props.rpc.call('devframes:plugin:messages:update', id, { autoDelete: 0 })
}

async function onOpenFile(entry: DevframeMessageEntry): Promise<void> {
  if (!entry.filePosition)
    return
  const { file, line, column } = entry.filePosition
  let path = file
  if (line)
    path += `:${line}`
  if (column)
    path += `:${column}`
  await props.rpc.call('devframe:open-in-editor', path)
}
</script>

<template>
  <div class="h-full w-full grid grid-rows-[max-content_1fr] bg-base color-base font-sans">
    <LayoutToolbar :glass="false" class="h-nav">
      <div class="flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none">
        <span class="i-ph-notification-duotone text-base color-active" />
        <span>Messages</span>
      </div>

      <template #search>
        <div />
      </template>

      <template #end>
        <span v-if="state.entries.length > 0" class="badge-muted font-mono">
          {{ state.entries.length }}
        </span>
      </template>
    </LayoutToolbar>

    <div class="min-h-0">
      <div
        v-if="connectionCopy"
        class="h-full flex flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <span :class="connectionCopy.icon" class="text-4xl color-active" />
        <div class="flex flex-col gap-1">
          <p class="text-lg font-medium">
            {{ connectionCopy.title }}
          </p>
          <p class="text-sm color-muted max-w-sm">
            {{ connectionCopy.body }}
          </p>
        </div>
        <button
          v-if="status !== 'connecting'"
          type="button"
          class="btn-primary text-sm px-2.5! py-1!"
          @click="reload"
        >
          <span class="i-ph-arrow-clockwise" />
          Reload
        </button>
      </div>
      <MessagesView
        v-else
        :entries="state.entries"
        :can-open-file="canOpenFile"
        @dismiss="onDismiss"
        @dismiss-many="onDismissMany"
        @clear="onClear"
        @persist="onPersist"
        @open-file="onOpenFile"
      />
    </div>
  </div>
</template>
