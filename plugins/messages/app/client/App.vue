<script setup lang="ts">
import type { DevframeMessageAction, DevframeMessageEntry } from '@devframes/hub/types'
// Types-only: loads service-open's RPC/scope augmentations so the scoped
// `open.rpc.call('open-in-editor', …)` below is fully typed.
import type {} from '@devframes/service-open'
import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FormSearchField from '@antfu/design/components/Form/FormSearchField.vue'
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
import MessageToolbarActions from './components/MessageToolbarActions.vue'
import { useMessageFilters } from './composables/useMessageFilters'
import { useMessages } from './state/messages'

const props = defineProps<{
  rpc: DevframeRpcClient
}>()

const state = useMessages(props.rpc)

// Search / sort / filter state lives here (not in the view) so the nav bar's
// search field + actions and the view's filter bar share one source of truth.
const filters = useMessageFilters(() => state.entries)

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

// The "open file" affordance delegates to the `@devframes/service-open`
// wire service; hide it until the service is advertised (and always on
// static builds, which have no live server to open an editor with).
const openServiceAvailable = ref(props.rpc.services.has('@devframes/service-open'))
onMounted(() => {
  props.rpc.services.state()
    .then((state) => {
      openServiceAvailable.value = props.rpc.services.has('@devframes/service-open')
      state.on('updated', () => (openServiceAvailable.value = props.rpc.services.has('@devframes/service-open')))
    })
    .catch(() => {})
})
const canOpenFile = computed(() => props.rpc.connectionMeta.backend !== 'static' && openServiceAvailable.value)

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
  const callOptional = props.rpc.callOptional as (name: string, ...args: unknown[]) => Promise<unknown>
  if (action.kind === 'activate') {
    await callOptional('hub:docks:activate', action.activate)
    return
  }
  if (action.kind === 'command')
    await callOptional('hub:commands:execute', action.command.id, ...(action.command.params ?? []))
}

async function onDismiss(id: string): Promise<void> {
  await props.rpc.call('devframes:plugin:messages:remove', id)
}

async function onDismissFiltered(): Promise<void> {
  for (const entry of filters.filteredEntries)
    await props.rpc.call('devframes:plugin:messages:remove', entry.id)
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
  // Call the open wire service directly; it resolves the workspace-relative
  // path itself. `file` may be relative or absolute.
  const open = props.rpc.services.get('@devframes/service-open')
  await open?.rpc.call('open-in-editor', { path: file, line, column })
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
        <div class="flex gap-2 items-center">
          <FormSearchField
            v-if="!connState"
            v-model="filters.search"
            size="sm"
            placeholder="Search messages…"
            class="max-w-64"
          />
          <DisplayBadge v-if="filters.totalCount > 0" :color="false" class="text-xs font-mono">
            <template v-if="filters.filteredCount !== filters.totalCount">
              {{ filters.filteredCount }}/{{ filters.totalCount }}
            </template>
            <template v-else>
              {{ filters.totalCount }}
            </template>
          </DisplayBadge>
        </div>
      </template>

      <template #end>
        <MessageToolbarActions
          v-if="!connState"
          :filters
          @dismiss-filtered="onDismissFiltered"
          @clear="onClear"
        />
        <span v-if="conn" :class="conn.class">
          <span :class="conn.dot" />
          {{ conn.label }}
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
        :filters
        :can-open-file="canOpenFile"
        :can-activate="canActivate"
        @dismiss="onDismiss"
        @persist="onPersist"
        @open-file="onOpenFile"
        @activate="onActivate"
      />
    </div>
  </div>
</template>
