<script setup lang="ts">
import type { CodeServerDetection, CodeServerServerInfo } from '@devframes/plugin-code-server/client'
import type { CodeServerPhase } from '../composables/code-server'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  phase: CodeServerPhase
  detection: CodeServerDetection
  server: CodeServerServerInfo
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'launch'): void
  (e: 'recheck'): void
}>()

const DOCS_URL = 'https://coder.com/docs/code-server/latest/install'
const REPO_URL = 'https://github.com/coder/code-server'

const INSTALL_COMMANDS = [
  { label: 'Install script (Linux / macOS)', command: 'curl -fsSL https://code-server.dev/install.sh | sh' },
  { label: 'npm', command: 'npm install -g code-server' },
  { label: 'Homebrew', command: 'brew install code-server' },
]

const copied = ref<string | null>(null)
function copy(command: string): void {
  navigator.clipboard?.writeText(command).then(() => {
    copied.value = command
    setTimeout(() => {
      if (copied.value === command)
        copied.value = null
    }, 1200)
  }).catch(() => {})
}

const backendLabel = computed(() =>
  props.detection.mode === 'tunnel'
    ? 'tunnel'
    : props.detection.backend === 'ms-code-serve-web' ? 'code serve-web' : 'code-server',
)
const errorText = computed(() => (props.server.status === 'error' ? props.server.error : undefined))
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center p-6 bg-base color-base font-sans">
    <div class="w-full max-w-[560px]">
      <!-- Brand eyebrow -->
      <p class="flex items-center gap-1.5 mb-2.5 text-xs tracking-wider uppercase color-muted">
        <span class="i-ph-code-duotone text-sm" />
        <span>{{ backendLabel }}</span>
      </p>

      <!-- Connecting -->
      <div v-if="phase === 'connecting'" class="flex items-center gap-2.5">
        <FeedbackSpinner size="1rem" class="color-muted" />
        <span class="text-sm color-muted">Connecting to devframe…</span>
      </div>

      <!-- Starting -->
      <template v-else-if="phase === 'starting'">
        <div class="flex items-center gap-2.5">
          <FeedbackSpinner size="1rem" class="color-muted" />
          <span class="text-sm color-muted">
            {{ detection.mode === 'tunnel' ? 'Opening the tunnel…' : 'Starting the editor…' }}
          </span>
        </div>
        <div
          v-if="server.login"
          class="mt-4 px-3.5 py-3 rounded-md border border-base bg-secondary text-sm"
        >
          <p class="mb-2 color-muted">
            Authorize the tunnel to continue:
          </p>
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="color-muted">Open</span>
            <a
              :href="server.login.url"
              target="_blank"
              rel="noreferrer"
              class="color-active hover:underline underline-offset-2 inline-flex items-center gap-1"
            >
              {{ server.login.url }}
              <span class="i-ph-arrow-square-out size-3.5" />
            </a>
            <span class="color-muted">and enter code</span>
            <code class="font-mono color-base px-1.5 py-0.5 rounded bg-base border border-base tracking-wider">{{ server.login.code }}</code>
          </p>
        </div>
      </template>

      <!-- Not installed -->
      <template v-else-if="phase === 'not-installed'">
        <h1 class="mb-2 text-[1.35rem] font-semibold">
          No editor found
        </h1>
        <p class="mb-5 text-sm leading-relaxed color-muted">
          Install <code class="font-mono color-base">code-server</code> (VS Code in the browser), or the
          Microsoft <code class="font-mono color-base">code</code> CLI for <code class="font-mono color-base">code serve-web</code>.
          Pick whichever fits your setup, then re-check.
        </p>

        <div class="flex flex-col gap-3 mb-5">
          <div v-for="{ label, command } in INSTALL_COMMANDS" :key="label">
            <label class="block mb-1 text-xs color-muted">{{ label }}</label>
            <div class="flex items-center gap-2 px-2.5 py-2 rounded-md border border-base bg-secondary">
              <code class="flex-1 of-x-auto whitespace-nowrap font-mono text-xs color-base">{{ command }}</code>
              <ActionButton
                variant="action"
                size="sm"
                class="shrink-0 text-[11px]"
                @click="copy(command)"
              >
                {{ copied === command ? 'Copied' : 'Copy' }}
              </ActionButton>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <ActionButton
            variant="primary"
            :icon="busy ? undefined : 'i-ph-arrows-clockwise'"
            :loading="busy"
            :disabled="busy"
            @click="emit('recheck')"
          >
            {{ busy ? 'Checking…' : 'Re-check' }}
          </ActionButton>
          <ActionButton variant="text" size="sm" :href="DOCS_URL" icon="i-ph-arrow-square-out">
            Installation docs
          </ActionButton>
          <ActionButton variant="text" size="sm" :href="REPO_URL" icon="i-ph-github-logo">
            GitHub
          </ActionButton>
        </div>
      </template>

      <!-- Launch -->
      <template v-else>
        <h1 class="mb-2 text-[1.35rem] font-semibold">
          Launch the editor
        </h1>
        <p class="mb-5 text-sm leading-relaxed color-muted">
          {{ detection.mode === 'tunnel'
            ? 'Open a code tunnel and edit this workspace from the hosted vscode.dev editor, right here.'
            : 'Start an editor scoped to this workspace and open VS Code right here — signed in automatically.' }}
        </p>

        <div
          v-if="errorText"
          class="mb-4 px-3 py-2.5 rounded-md border border-error/35 bg-error/10 text-error text-sm whitespace-pre-wrap break-words"
        >
          {{ errorText }}
        </div>

        <div class="flex flex-wrap gap-x-4 gap-y-1.5 mb-5 text-xs color-muted">
          <span>mode <code class="font-mono color-base">{{ detection.mode }}</code></span>
          <span v-if="detection.mode === 'local'">backend <code class="font-mono color-base">{{ detection.backend }}</code></span>
          <span v-if="detection.version">version <code class="font-mono color-base">{{ detection.version }}</code></span>
          <span>binary <code class="font-mono color-base">{{ detection.bin }}</code></span>
        </div>

        <ActionButton
          variant="primary"
          :icon="busy ? undefined : 'i-ph-rocket-launch-duotone'"
          :loading="busy"
          :disabled="busy"
          @click="emit('launch')"
        >
          {{ busy ? 'Starting…' : detection.mode === 'tunnel' ? 'Open tunnel' : 'Launch editor' }}
        </ActionButton>
      </template>
    </div>
  </div>
</template>
