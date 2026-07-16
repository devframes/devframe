<script setup lang="ts">
import type { SavedQuery, SavedQueryScope } from '../../rpc-contract'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import { ref } from 'vue'

const props = defineProps<{
  saved: SavedQuery[]
  /** A non-empty query is loaded in the editor and can be saved. */
  canSave: boolean
}>()

const emit = defineEmits<{
  load: [entry: SavedQuery]
  remove: [entry: SavedQuery]
  save: [input: { title: string, description?: string, scope: SavedQueryScope }]
}>()

const formOpen = ref(false)
const title = ref('')
const description = ref('')
const scope = ref<SavedQueryScope>('user')

const scopeOptions = [
  { value: 'user', label: 'User (node_modules, just me)' },
  { value: 'project', label: 'Project (.devframe, shared)' },
]

function submit(): void {
  if (!title.value.trim() || !props.canSave)
    return
  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    scope: scope.value,
  })
  title.value = ''
  description.value = ''
  formOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2 min-h-0">
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium color-muted uppercase tracking-wide select-none">Saved queries</span>
      <span v-if="saved.length" class="text-xs color-faint font-mono tabular-nums">{{ saved.length }}</span>
      <div class="flex-1" />
      <ActionButton
        size="sm"
        :icon="formOpen ? 'i-ph:x' : 'i-ph:bookmark-simple-duotone'"
        :disabled="!canSave && !formOpen"
        @click="formOpen = !formOpen"
      >
        {{ formOpen ? 'Cancel' : 'Save query' }}
      </ActionButton>
    </div>

    <form
      v-if="formOpen"
      class="flex flex-col gap-2 p-2.5 border border-base rounded-lg bg-secondary"
      @submit.prevent="submit"
    >
      <FormTextInput v-model="title" placeholder="Title (also the storage id)" size="sm" />
      <FormTextInput v-model="description" placeholder="Description (optional)" size="sm" />
      <div class="flex items-center gap-2">
        <FormSelect v-model="scope" :options="scopeOptions" class="text-sm" />
        <div class="flex-1" />
        <ActionButton size="sm" variant="primary" :disabled="!title.trim()" @click="submit">
          Save
        </ActionButton>
      </div>
    </form>

    <div v-if="saved.length" class="flex flex-col gap-1 overflow-auto min-h-0">
      <div
        v-for="entry in saved"
        :key="`${entry.scope}:${entry.id}`"
        class="group flex items-center gap-2 px-2 py-1.5 border border-base rounded-lg hover:bg-active cursor-pointer"
        :title="entry.description ?? entry.query"
        @click="emit('load', entry)"
      >
        <span class="i-ph:code-duotone color-active shrink-0" />
        <div class="flex flex-col min-w-0">
          <span class="text-sm truncate">{{ entry.title }}</span>
          <span class="font-mono text-11px color-faint truncate">{{ entry.query }}</span>
        </div>
        <div class="flex-1" />
        <DisplayBadge
          :text="entry.scope"
          :color="entry.scope === 'project' ? 150 : false"
          class="shrink-0"
        />
        <ActionIconButton
          size="sm"
          icon="i-ph:trash-duotone"
          label="Delete"
          tooltip="Delete"
          class="op0 group-hover:op100 transition-opacity"
          @click.stop="emit('remove', entry)"
        />
      </div>
    </div>
    <div v-else-if="!formOpen" class="text-xs color-faint px-1 select-none">
      No saved queries yet. Compose one and hit "Save query".
    </div>
  </div>
</template>
