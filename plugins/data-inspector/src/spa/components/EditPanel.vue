<script setup lang="ts">
/**
 * The edit side panel: one panel handling every write op for the node the
 * pencil was clicked on: set (with a type picker), rename key, add an
 * entry to a container, and delete. Values travel as discriminated
 * `WriteValue` payloads so `undefined` survives JSON transport.
 */
import type { NodePath, WriteRequest, WriteValue } from '../../engine'
import Button from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { formatNodePath, navigateNormalized } from '../composables/display-transform'
import { injectWorkbench } from '../composables/workbench'

const props = defineProps<{
  /** Source path of the node being edited (from the pencil affordance). */
  path: NodePath
}>()

const emit = defineEmits<{
  close: []
}>()

const wb = injectWorkbench()

type ValueType = 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'json'
const VALUE_TYPES: ValueType[] = ['string', 'number', 'boolean', 'null', 'undefined', 'json']

/** The normalized node currently on screen at the edited path. */
const node = computed(() => navigateNormalized(wb.result.value, props.path))

const breadcrumb = computed(() => formatNodePath(props.path))

/** Container kind of the node, deciding whether the "add" section shows. */
const containerKind = computed<'object' | 'array' | 'map' | 'set' | null>(() => {
  const value = node.value
  if (Array.isArray(value))
    return 'array'
  if (!value || typeof value !== 'object')
    return null
  const obj = value as Record<string, unknown>
  if (obj.$type === 'Map')
    return 'map'
  if (obj.$type === 'Set')
    return 'set'
  if (typeof obj.$type === 'string' || typeof obj.$ref === 'string' || obj.$truncated !== undefined)
    return null
  return 'object'
})

const lastSegment = computed(() => props.path[props.path.length - 1])
const canRename = computed(() => lastSegment.value?.[0] === 'k')
const canSet = computed(() => props.path.length > 0)
const canDelete = computed(() => props.path.length > 0)

// ── set section ──────────────────────────────────────────────────────
const valueType = ref<ValueType>('string')
const valueText = ref('')
const boolValue = ref(true)

/** Prefill the inputs from the node currently on screen. */
function prefill(): void {
  const value = node.value
  if (typeof value === 'string') {
    valueType.value = 'string'
    valueText.value = value
  }
  else if (typeof value === 'number') {
    valueType.value = 'number'
    valueText.value = String(value)
  }
  else if (typeof value === 'boolean') {
    valueType.value = 'boolean'
    boolValue.value = value
  }
  else if (value === null) {
    valueType.value = 'null'
    valueText.value = ''
  }
  else if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).$type === 'string'
    && typeof (value as Record<string, unknown>).value === 'string') {
    // Date / RegExp / URL / bigint / symbol stubs: edit the string form.
    valueType.value = 'string'
    valueText.value = (value as Record<string, unknown>).value as string
  }
  else {
    valueType.value = 'json'
    try {
      valueText.value = JSON.stringify(value, null, 2) ?? ''
    }
    catch {
      valueText.value = ''
    }
  }
}
watch(() => props.path, prefill, { immediate: true })

const error = shallowRef<string | null>(null)
const busy = shallowRef(false)

/** Encode the picked type + inputs into the discriminated wire value. */
function encodeValue(type: ValueType, text: string, bool: boolean): WriteValue {
  switch (type) {
    case 'string':
      return { kind: 'json', value: text }
    case 'number': {
      const n = Number(text)
      if (text.trim() === '' || Number.isNaN(n))
        throw new Error(`"${text}" is not a number`)
      return { kind: 'json', value: n }
    }
    case 'boolean':
      return { kind: 'json', value: bool }
    case 'null':
      return { kind: 'json', value: null }
    case 'undefined':
      return { kind: 'undefined' }
    case 'json':
      try {
        return { kind: 'json', value: JSON.parse(text) }
      }
      catch (e) {
        throw new Error(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
      }
  }
}

async function submit(request: WriteRequest, onOk?: () => void): Promise<void> {
  busy.value = true
  error.value = null
  const outcome = await wb.applyEdit(request)
  busy.value = false
  if (!outcome.ok) {
    error.value = `${outcome.error.name}: ${outcome.error.message}`
    return
  }
  onOk?.()
}

function applySet(): void {
  let value: WriteValue
  try {
    value = encodeValue(valueType.value, valueText.value, boolValue.value)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return
  }
  void submit({ op: 'set', path: props.path, value }, () => emit('close'))
}

// ── rename section ───────────────────────────────────────────────────
const renameText = ref('')
watch(lastSegment, (seg) => {
  renameText.value = seg?.[0] === 'k' ? String(seg[1]) : ''
}, { immediate: true })

function applyRename(): void {
  if (!renameText.value)
    return
  void submit({ op: 'rename', path: props.path, key: { kind: 'json', value: renameText.value } }, () => emit('close'))
}

// ── add section ──────────────────────────────────────────────────────
const addKeyText = ref('')
const addValueType = ref<ValueType>('string')
const addValueText = ref('')
const addBoolValue = ref(true)

const addKeyLabel = computed(() => {
  if (containerKind.value === 'array')
    return 'Index (blank appends)'
  if (containerKind.value === 'map')
    return 'Key (JSON or plain string)'
  return 'Key'
})

/** Map keys accept any JSON-expressible value; bare text stays a string. */
function encodeAddKey(): WriteValue | undefined {
  const text = addKeyText.value
  if (containerKind.value === 'set')
    return undefined
  if (containerKind.value === 'array') {
    if (text.trim() === '')
      return undefined
    const n = Number(text)
    if (!Number.isInteger(n))
      throw new Error('an array index must be an integer')
    return { kind: 'json', value: n }
  }
  if (containerKind.value === 'map') {
    try {
      return { kind: 'json', value: JSON.parse(text) }
    }
    catch {
      return { kind: 'json', value: text }
    }
  }
  if (!text)
    throw new Error('a property key is required')
  return { kind: 'json', value: text }
}

function applyAdd(): void {
  let key: WriteValue | undefined
  let value: WriteValue
  try {
    key = encodeAddKey()
    value = encodeValue(addValueType.value, addValueText.value, addBoolValue.value)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return
  }
  void submit({ op: 'add', path: props.path, key, value }, () => {
    addKeyText.value = ''
    addValueText.value = ''
  })
}

// ── delete section ───────────────────────────────────────────────────
const confirmingDelete = shallowRef(false)

function applyDelete(): void {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  confirmingDelete.value = false
  void submit({ op: 'delete', path: props.path }, () => emit('close'))
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 bg-base border-l border-base w-100">
    <div class="flex items-center gap-2 px3 py2 border-b border-base select-none">
      <span class="i-ph:pencil-simple-duotone color-active" />
      <div class="font-semibold text-xs op-fade uppercase tracking-wide">
        Edit
      </div>
      <code class="font-mono text-xs color-muted truncate" :title="breadcrumb">{{ breadcrumb }}</code>
      <div class="flex-auto" />
      <ActionIconButton
        class="text-sm"
        icon="i-ph:x"
        label="Close"
        tooltip="Close the edit panel"
        @click="emit('close')"
      />
    </div>

    <div class="flex-1 min-h-0 overflow-auto px3 py2 flex flex-col gap-4 text-sm">
      <div
        v-if="error"
        class="px-2.5 py-1.5 font-mono text-11px whitespace-pre-wrap rounded-lg border border-red-600/40 bg-red-500:8 color-red-700 dark:(border-red-400/40 color-red-300)"
      >
        {{ error }}
      </div>

      <!-- set -->
      <section v-if="canSet" class="flex flex-col gap-2">
        <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
          Set value
        </div>
        <div class="flex flex-wrap gap-1 p-0.5 bg-secondary rounded-lg self-start" role="tablist">
          <button
            v-for="t in VALUE_TYPES"
            :key="t"
            type="button"
            class="px-2 py-0.5 rounded-md text-xs cursor-pointer"
            :class="valueType === t ? 'bg-base color-base shadow-sm' : 'color-muted hover:color-base'"
            @click="valueType = t"
          >
            {{ t }}
          </button>
        </div>
        <input
          v-if="valueType === 'string' || valueType === 'number'"
          v-model="valueText"
          :placeholder="valueType === 'number' ? '42' : 'text'"
          class="font-mono text-xs px-2 py-1.5 rounded-lg border border-base bg-base color-base w-full"
          @keydown.enter="applySet"
        >
        <textarea
          v-else-if="valueType === 'json'"
          v-model="valueText"
          rows="6"
          placeholder="{ }"
          class="font-mono text-xs px-2 py-1.5 rounded-lg border border-base bg-base color-base w-full resize-y"
        />
        <label v-else-if="valueType === 'boolean'" class="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input v-model="boolValue" type="checkbox">
          <code class="font-mono">{{ boolValue }}</code>
        </label>
        <div v-else class="text-xs color-faint font-mono select-none">
          {{ valueType }}
        </div>
        <Button
          class="text-sm self-start"
          icon="i-ph:check"
          :disabled="busy"
          :loading="busy"
          title="Apply the new value"
          @click="applySet"
        >
          <span>Apply</span>
        </Button>
      </section>

      <!-- rename -->
      <section v-if="canRename" class="flex flex-col gap-2">
        <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
          Rename key
        </div>
        <div class="flex gap-2">
          <input
            v-model="renameText"
            class="font-mono text-xs px-2 py-1.5 rounded-lg border border-base bg-base color-base flex-1 min-w-0"
            @keydown.enter="applyRename"
          >
          <Button
            class="text-sm"
            icon="i-ph:textbox-duotone"
            :disabled="busy || !renameText"
            title="Rename the key (the renamed key lands last)"
            @click="applyRename"
          >
            <span>Rename</span>
          </Button>
        </div>
      </section>

      <!-- add -->
      <section v-if="containerKind" class="flex flex-col gap-2">
        <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
          Add to {{ containerKind }}
        </div>
        <input
          v-if="containerKind !== 'set'"
          v-model="addKeyText"
          :placeholder="addKeyLabel"
          class="font-mono text-xs px-2 py-1.5 rounded-lg border border-base bg-base color-base w-full"
        >
        <div class="flex flex-wrap gap-1 p-0.5 bg-secondary rounded-lg self-start" role="tablist">
          <button
            v-for="t in VALUE_TYPES"
            :key="t"
            type="button"
            class="px-2 py-0.5 rounded-md text-xs cursor-pointer"
            :class="addValueType === t ? 'bg-base color-base shadow-sm' : 'color-muted hover:color-base'"
            @click="addValueType = t"
          >
            {{ t }}
          </button>
        </div>
        <input
          v-if="addValueType === 'string' || addValueType === 'number'"
          v-model="addValueText"
          placeholder="value"
          class="font-mono text-xs px-2 py-1.5 rounded-lg border border-base bg-base color-base w-full"
          @keydown.enter="applyAdd"
        >
        <textarea
          v-else-if="addValueType === 'json'"
          v-model="addValueText"
          rows="4"
          placeholder="{ }"
          class="font-mono text-xs px-2 py-1.5 rounded-lg border border-base bg-base color-base w-full resize-y"
        />
        <label v-else-if="addValueType === 'boolean'" class="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input v-model="addBoolValue" type="checkbox">
          <code class="font-mono">{{ addBoolValue }}</code>
        </label>
        <div v-else class="text-xs color-faint font-mono select-none">
          {{ addValueType }}
        </div>
        <Button
          class="text-sm self-start"
          icon="i-ph:plus"
          :disabled="busy"
          title="Add the entry"
          @click="applyAdd"
        >
          <span>Add</span>
        </Button>
      </section>

      <!-- delete -->
      <section v-if="canDelete" class="flex flex-col gap-2">
        <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
          Danger
        </div>
        <Button
          class="text-sm self-start"
          icon="i-ph:trash-duotone"
          :disabled="busy"
          :title="confirmingDelete ? 'Click again to delete this node' : 'Delete this node from its container'"
          @click="applyDelete"
          @blur="confirmingDelete = false"
        >
          <span>{{ confirmingDelete ? 'Confirm Delete?' : 'Delete Key' }}</span>
        </Button>
      </section>
    </div>
  </div>
</template>
