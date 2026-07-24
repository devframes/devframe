<script setup lang="ts">
import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import type { DevframeMessageAction, DevframeMessageEntry } from '../types'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  button,
  connectionBody,
  connectionGlyph,
  connectionIndicator,
  connectionPanel,
  connectionState,
  connectionTitle,
} from '../../../../design/design'
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

// The shared top-nav connection indicator (dot + label), shown only while the
// connection is not live.
const conn = computed(() => connectionIndicator(status.value))

// The shared full-panel connection state takes over the body until connected.
const connState = computed(() => connectionState(status.value))

function reload(): void {
  location.reload()
}

// The "open file" affordance rides on devframe's prebuilt recipe, which the
// plugin registers server-side; static builds have no live server to open
// an editor with.
const canOpenFile = computed(() => props.rpc.connectionMeta.backend !== 'static')

// Message actions that navigate to another dock only work under a hub host
// (the `hub:docks:activate` RPC + `devframe:docks` registry). Probe the docks
// shared state so the affordance is hidden when there's no hub.
const canActivate = ref(false)
onMounted(() => {
  props.rpc.sharedState
    .get('devframe:docks', { initialValue: null })
    .then((state: { value: () => unknown, on: (e: string, cb: (v: unknown) => void) => void }) => {
      canActivate.value = state.value() != null
      state.on('updated', v => (canActivate.value = v != null))
    })
    .catch(() => {})
})

async function onActivate(action: DevframeMessageAction): Promise<void> {
  if (action.kind !== 'activate')
    return
  await (props.rpc.callOptional as (name: string, ...args: unknown[]) => Promise<unknown>)(
    'hub:docks:activate',
    action.activate,
  )
}

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
        <span v-if="conn" :class="conn.class">
          <span :class="conn.dot" />
          {{ conn.label }}
        </span>
        <span v-if="state.entries.length > 0" class="badge-muted font-mono">
          {{ state.entries.length }}
        </span>
      </template>
    </LayoutToolbar>

    <div class="min-h-0">
      <div v-if="connState" :class="connectionPanel('h-full')">
        <span :class="[connState.icon, connectionGlyph(connState.spin)]" />
        <div class="flex flex-col gap-1">
          <p :class="connectionTitle()">
            {{ connState.title }}
          </p>
          <p :class="connectionBody()">
            {{ connState.body }}
          </p>
        </div>
        <button
          v-if="connState.reloadable"
          type="button"
          :class="button({ variant: 'primary', size: 'sm' })"
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
        :can-activate="canActivate"
        @dismiss="onDismiss"
        @dismiss-many="onDismissMany"
        @clear="onClear"
        @persist="onPersist"
        @open-file="onOpenFile"
        @activate="onActivate"
      />
    </div>
  </div>
</template>
