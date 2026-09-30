<script setup lang="ts">
import type { RemoteAssetsErrorMessage } from 'devframe/types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed, ref } from 'vue'
import { t, tAround } from '../../i18n'

// Shown in place of an iframe whose devframe could serve its client assets
// from neither a local install nor their CDN provider. The devframe answers
// such a request with its own fallback page, which reports itself to us over
// `postMessage` (see `ViewIframe`) so the failure lands in the hub's UI
// instead of a bare page inside the frame.

const props = defineProps<{
  error: RemoteAssetsErrorMessage
}>()

const emit = defineEmits<{
  retry: []
}>()

const installCommand = computed(() => `npm install ${props.error.package}@${props.error.version}`)
const hint = computed(() => tAround('assets.hint', 'pkg'))

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyInstallCommand() {
  try {
    await navigator.clipboard.writeText(installCommand.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1500)
  }
  catch {
    // Clipboard permission denied; the command is on screen to copy by hand.
  }
}
</script>

<template>
  <div class="devframes-view-assets-error absolute inset-0 flex items-center justify-center overflow-auto bg-base p6">
    <div class="w-full max-w-100 flex flex-col items-center gap-2 text-center">
      <div class="i-ph:cloud-warning-duotone text-3xl color-faint" />
      <div class="text-sm color-muted">
        {{ t('assets.failed') }}
      </div>
      <div class="text-xs color-faint">
        {{ hint[0] }}<span class="font-mono">{{ error.package }}@{{ error.version }}</span>{{ hint[1] }}
      </div>

      <div class="mt-2 w-full flex items-center gap-1 border border-base rounded bg-secondary py1 pl2.5 pr1">
        <code class="flex-1 truncate text-left text-xs font-mono color-base">{{ installCommand }}</code>
        <ActionIconButton
          class="text-sm"
          :icon="copied ? 'i-ph:check' : 'i-ph:copy'"
          :label="copied ? t('assets.copied') : t('assets.copy')"
          @click="copyInstallCommand()"
        />
      </div>

      <div class="w-full max-h-24 overflow-auto text-left text-xs font-mono color-faint break-words">
        {{ error.reason }}
      </div>

      <ActionButton class="mt-2" @click="emit('retry')">
        {{ t('common.retry') }}
      </ActionButton>
    </div>
  </div>
</template>
