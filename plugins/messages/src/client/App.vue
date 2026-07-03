<script setup lang="ts">
import type { DevframeRpcClient } from 'devframe/client'
import type { DevframeMessageEntry } from '../types'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { computed } from 'vue'
import MessagesView from './components/MessagesView.vue'
import { useMessages } from './state/messages'

const props = defineProps<{
  rpc: DevframeRpcClient
}>()

const state = useMessages(props.rpc)

// The "open file" affordance rides on devframe's prebuilt recipe, which the
// plugin registers server-side; static builds have no live server to open
// an editor with.
const canOpenFile = computed(() => props.rpc.connectionMeta.backend !== 'static')

async function onDismiss(id: string): Promise<void> {
  await props.rpc.call('devframes-plugin-messages:remove', id)
}

async function onDismissMany(ids: string[]): Promise<void> {
  for (const id of ids)
    await props.rpc.call('devframes-plugin-messages:remove', id)
}

async function onClear(): Promise<void> {
  await props.rpc.call('devframes-plugin-messages:clear')
}

async function onPersist(id: string): Promise<void> {
  await props.rpc.call('devframes-plugin-messages:update', id, { autoDelete: 0 })
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
    <LayoutToolbar :glass="false">
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
      <MessagesView
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
