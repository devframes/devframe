<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import { useTemplateRef, watchPostEffect } from 'vue'
import { ConfirmPromise } from '../../state/confirm'

const confirmButton = useTemplateRef<InstanceType<typeof ActionButton>>('confirmButton')

watchPostEffect(() => {
  (confirmButton.value?.$el as HTMLElement | undefined)?.focus({ preventScroll: true })
})

function resolveConfirm(resolve: (value: boolean) => void, value: boolean) {
  resolve(value)
}
</script>

<template>
  <ConfirmPromise v-slot="{ resolve, args: [options] }">
    <div
      class="devframes-confirm fixed inset-0 z-dock-confirm flex items-center justify-center p-4 color-base"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="options.title ? 'devframes-confirm-title' : undefined"
      aria-describedby="devframes-confirm-message"
      @keydown.esc.prevent.stop="resolveConfirm(resolve, false)"
    >
      <div
        class="absolute inset-0 bg-black/30 dark:bg-black/45 backdrop-blur-1 cursor-default"
        aria-hidden="true"
        @click="resolveConfirm(resolve, false)"
      />

      <div class="relative w-full max-w-96 bg-base border border-base rounded-lg shadow-xl p-5">
        <h3 v-if="options.title" id="devframes-confirm-title" class="text-sm font-medium leading-5">
          {{ options.title }}
        </h3>
        <p
          id="devframes-confirm-message"
          class="text-xs op60 leading-5"
          :class="options.title ? 'mt-1.5' : ''"
        >
          {{ options.message }}
        </p>

        <div class="flex items-center justify-end gap-2 mt-6">
          <ActionButton variant="text" size="sm" @click="resolveConfirm(resolve, false)">
            {{ options.cancelText ?? 'Cancel' }}
          </ActionButton>
          <ActionButton ref="confirmButton" variant="primary" size="sm" @click="resolveConfirm(resolve, true)">
            {{ options.confirmText ?? 'OK' }}
          </ActionButton>
        </div>
      </div>
    </div>
  </ConfirmPromise>
</template>
