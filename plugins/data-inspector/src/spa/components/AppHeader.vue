<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { computed } from 'vue'
import { connectionIndicator } from '../../../../../design/design'
import { connection } from '../composables/rpc'
import { isDark } from '../composables/scheme'

// The shared top-nav connection indicator (dot + label), shown only while the
// connection is not live. The `static` mode badge below is a separate concept.
const conn = computed(() => connectionIndicator(connection.status))
</script>

<template>
  <LayoutToolbar :glass="false" class="h-nav">
    <div class="min-w-0 flex items-center gap-1.5">
      <span class="flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none">
        <span class="i-ph-crosshair-duotone text-base color-active" />
        <span>Data Inspector</span>
      </span>
      <span class="truncate op-fade text-xs select-none">Inspect server side data/objects interactively</span>
      <DisplayBadge
        v-if="connection.mode === 'static'"
        class="flex items-center gap-1.5 py-1 text-xs select-none"
        text="static"
        :color="false"
      />
      <span v-else-if="conn" :class="conn.class" :title="connection.error ?? undefined">
        <span :class="conn.dot" />
        {{ conn.label }}
      </span>
    </div>

    <template #search>
      <div />
    </template>

    <template #end>
      <ActionIconButton
        icon="i-ph:book-open-duotone"
        as="a"
        href="https://devfra.me/plugins/data-inspector"
        target="_blank"
        title="Data Inspector docs — using the plugin and providing data sources"
      />
      <ActionIconButton
        icon="i-ph:sun-duotone dark:i-ph:moon-duotone"
        title="Toggle dark mode"
        @click="isDark = !isDark"
      />
    </template>
  </LayoutToolbar>
</template>
