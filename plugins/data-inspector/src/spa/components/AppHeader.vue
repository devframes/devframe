<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import { connection } from '../composables/rpc'
import { isDark } from '../composables/scheme'
</script>

<template>
  <div class="flex items-center gap-1.5 shrink-0 select-none border-b border-base py1 px3">
    <span class="i-ph-crosshair-duotone text-base color-primary" />
    <span class="color-primary font-semibold">Data Inspector</span>
    <span class="op-fade text-xs">Inspect server side data/objects interactively</span>
    <DisplayBadge
      v-if="connection.mode === 'static'"
      class="flex items-center gap-1.5 py-1 text-xs select-none"
      text="static"
      :color="false"
    />
    <DisplayBadge
      v-else-if="connection.status !== 'connected'"
      class="flex items-center gap-1.5 py-1 text-xs select-none capitalize"
      :title="connection.error ?? undefined"
      :text="connection.status"
      :color="connection.connected ? 100 : 200"
    />
    <div class="flex-auto" />
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
  </div>
</template>
