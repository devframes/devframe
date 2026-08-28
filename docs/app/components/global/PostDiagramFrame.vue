<script setup lang="ts">
withDefaults(defineProps<{
  dashed?: boolean
  title: string
  titleId: string
  subtitle?: string
}>(), {
  dashed: false,
  subtitle: undefined,
})
</script>

<template>
  <figure
    :aria-labelledby="titleId"
    class="post-diagram-frame not-prose my-11 box-border overflow-hidden rounded-2xl border border-default text-highlighted"
    :class="{ 'border-dashed': dashed }"
  >
    <header class="flex items-end justify-between gap-4 px-4 pb-3 pt-5 sm:px-6">
      <div>
        <div
          :id="titleId"
          class="text-lg font-semibold"
        >
          {{ title }}
        </div>
        <div
          v-if="subtitle"
          class="mt-1 text-sm text-muted"
        >
          {{ subtitle }}
        </div>
      </div>
      <slot name="actions" />
    </header>

    <slot />

    <figcaption
      v-if="$slots.caption"
      class="border-t border-default bg-elevated/50 px-4 py-3 text-xs text-muted sm:px-6"
    >
      <slot name="caption" />
    </figcaption>
  </figure>
</template>
