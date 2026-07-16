<script setup lang="ts">
/**
 * Jora query editor on CodeMirror 5, via the `Editor` class shipped by
 * @discoveryjs/discovery (which bundles CM5, registers the `jora` mode and
 * a show-hint fork with popup positioning + a per-item custom-apply hook).
 *
 * Integration choice — discovery's sync-hint plumbing over ad-hoc
 * `showHint(options)` calls: discovery's `Editor` re-invokes the
 * constructor-supplied hint callback on every `cursorActivity`/`focus`
 * while completion is enabled, so a one-shot completion source passed to a
 * raw `showHint(options)` would immediately be recycled into the
 * constructor one. Instead the constructor `hint` reads the latest
 * `suggestions` prop synchronously (our completions arrive async over
 * RPC), and a watcher re-triggers `cm.showHint()` when fresh items land
 * while the editor is focused — the same "sync callback + re-trigger"
 * pattern discovery's own query page uses. Every hint item carries a
 * custom `hint()` apply hook (the fork then skips its own
 * `replaceRange`), so accepting only emits `accept` and the workbench
 * stays the single owner of text mutation, exactly like the old textarea;
 * the editor syncs back through the model watcher. The fork never
 * auto-picks a fresh single-item list (the `completeSingle: false`
 * semantics of the stock addon).
 */
import type * as CM from 'codemirror'
import type { SuggestItem } from '../../engine'
import type { SyntaxState } from '../composables/workbench'
import { Editor as DiscoveryEditor } from '@discoveryjs/discovery/lib/views/editor/editors.js'
import { nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import '@discoveryjs/discovery/lib/views/editor/editors.css'

const props = defineProps<{
  syntax: SyntaxState
  suggestions: SuggestItem[]
}>()

const emit = defineEmits<{
  run: []
  suggest: [pos: number]
  accept: [item: SuggestItem]
  dismiss: []
}>()

const query = defineModel<string>({ default: '' })

const PLACEHOLDER = 'jora query, runs as you type. Ctrl+Space for suggestions, Ctrl+Enter to run now'

/** The runtime surface of discovery's CM5 instance that this file uses. */
type Cm = CM.Editor & {
  state: {
    completionEnabled?: boolean
    completionActive?: { close: () => void } | null
  }
  showHint: () => void
  /** Completion lifecycle event signalled by the show-hint fork. */
  on: (eventName: 'endCompletion', handler: (instance: CM.Editor) => void) => void
}

/** One entry of the hint result consumed by discovery's show-hint fork. */
interface HintItem {
  text: string
  from: CM.Position
  to: CM.Position
  render: (el: HTMLElement) => void
  /** Custom apply: the fork calls this instead of its own `replaceRange`. */
  hint: () => void
}

const hostEl = shallowRef<HTMLElement | null>(null)
let editor: DiscoveryEditor | null = null
let cm: Cm | null = null
let blurTimer: ReturnType<typeof setTimeout> | undefined

function caretIndex(): number {
  return cm ? cm.indexFromPos(cm.getCursor()) : query.value.length
}

function stripQuote(text: string): string {
  return text[0] === '"' || text[0] === '\'' ? text.slice(1) : text
}

/** Mirror of discovery's hint-item rendering: type badge + match highlight. */
function renderHintItem(el: HTMLElement, item: SuggestItem, typed: string): void {
  el.classList.add(`type-${item.type}`)
  const name = document.createElement('span')
  name.className = 'name'
  const pattern = stripQuote(typed).toLowerCase()
  const offset = pattern
    ? item.value.toLowerCase().indexOf(pattern, item.value[0] === '"' || item.value[0] === '\'' ? 1 : 0)
    : -1
  if (offset === -1) {
    name.textContent = item.value
  }
  else {
    const match = document.createElement('span')
    match.className = 'match'
    match.textContent = item.value.slice(offset, offset + pattern.length)
    name.append(item.value.slice(0, offset), match, item.value.slice(offset + pattern.length))
  }
  el.appendChild(name)
}

function accept(item: SuggestItem): void {
  // Suggestions are computed for the text as of the request; if the user
  // kept typing a matching prefix since, extend the replaced range up to
  // the caret so the completion swallows those characters instead of
  // duplicating them.
  const to = Math.max(item.to, caretIndex())
  emit('accept', to === item.to ? item : { ...item, to })
  // The workbench owns the replacement; place the caret after the model
  // round-trips back into the editor.
  void nextTick(() => {
    if (!cm)
      return
    cm.setCursor(cm.posFromIndex(item.from + item.value.length))
    cm.focus()
  })
}

/**
 * Synchronous completion source over the latest RPC `suggestions` prop.
 * Range/prefix guards drop entries the user has typed past between the
 * request and the response; fresh responses re-open the popup via the
 * watcher below.
 */
function currentHints(): { list: HintItem[] } | null {
  if (!cm)
    return null
  const items = props.suggestions
  if (!items.length)
    return null
  const value = cm.getValue()
  const caret = caretIndex()
  const list: HintItem[] = []
  for (const item of items.slice(0, 50)) {
    if (item.from > caret || item.to > value.length)
      continue // stale range from a superseded text state
    const typed = value.slice(item.from, caret)
    if (typed && !stripQuote(item.value).toLowerCase().startsWith(stripQuote(typed).toLowerCase()))
      continue // live narrowing while a fresh response is in flight
    list.push({
      text: item.value,
      from: cm.posFromIndex(item.from),
      to: cm.posFromIndex(item.to),
      render: el => renderHintItem(el, item, typed),
      hint: () => accept(item),
    })
  }
  return list.length ? { list } : null
}

onMounted(() => {
  const host = hostEl.value
  if (!host)
    return

  const ed = new DiscoveryEditor({
    mode: 'jora', // registered as a CM mode by the editors module import
    placeholder: PLACEHOLDER,
    // The fork only reads `text`/`from`/`to`/`render`/`hint` off each item
    // at runtime; the shipped type additionally demands discovery's own
    // `entry` payload (used by its default renderer), hence the one cast.
    hint: currentHints as never,
  })

  ed.on('change', (value, change) => {
    if (change.origin === 'setValue')
      return // external model sync (drafts, recipes, clear), not a user edit
    query.value = value
    emit('suggest', caretIndex())
  })

  // The shipped `cm` typing collapses to `any` (discovery types it against
  // an untyped codemirror import); pin it to the surface we rely on.
  cm = ed.cm as unknown as Cm

  cm.setOption('extraKeys', {
    'Cmd-Enter': () => emit('run'),
    'Ctrl-Enter': () => emit('run'),
    'Ctrl-Space': () => emit('suggest', caretIndex()),
    'Alt-Space': 'autocomplete', // discovery's stock binding, kept
  })

  // Esc in the popup disables completion before closing, so a close in
  // that state is an explicit dismissal (popup recycling keeps it enabled).
  cm.on('endCompletion', () => {
    if (cm?.state.completionEnabled === false)
      emit('dismiss')
  })
  cm.on('blur', () => {
    // Delayed so a mousedown-pick on the popup (which refocuses) lands first.
    blurTimer = setTimeout(emit, 150, 'dismiss')
  })
  cm.on('focus', () => clearTimeout(blurTimer))

  host.appendChild(ed.el)
  ed.setValue(query.value)
  editor = ed
})

onBeforeUnmount(() => {
  clearTimeout(blurTimer)
  cm?.state.completionActive?.close() // the popup lives on <body>; don't orphan it
  editor?.el.remove()
  editor = null
  cm = null
})

// External query changes (drafts restore, recipes, URL load, clear button):
// discovery's setValue no-ops when the text is already current, so user
// edits looping back through the model are absorbed.
watch(query, value => editor?.setValue(value ?? ''))

// Async suggestions landed: surface them through CM's hint UI.
watch(() => props.suggestions, (items) => {
  if (!cm)
    return
  if (!items.length) {
    cm.state.completionActive?.close() // list emptied: retract a stale popup
    return
  }
  if (cm.hasFocus()) {
    // Keep the Editor's cursor-activity re-trigger loop alive so the popup
    // follows further typing (live-narrowed until the next response).
    cm.state.completionEnabled = true
    cm.showHint()
  }
})
</script>

<template>
  <div class="flex flex-col gap-2 h-full min-h-0">
    <div
      ref="hostEl"
      class="di-query-editor relative flex flex-1 min-h-24 min-w-0"
      :class="{ 'di-query-editor-error': syntax.kind === 'error' }"
    />

    <pre
      v-if="syntax.kind === 'error'"
      class="m-0 px-3 py-2 font-mono text-11px leading-relaxed whitespace-pre-wrap break-all rounded-lg border border-red-600/40 bg-red-500:8 color-red-700 dark:(border-red-400/40 color-red-300)"
    >{{ syntax.message }}</pre>
    <div
      v-else-if="syntax.kind === 'pending'"
      class="px-3 py-1.5 font-mono text-11px rounded-lg border border-amber-600/40 bg-amber-500:8 color-amber-700 dark:(border-amber-400/40 color-amber-300)"
    >
      incomplete query, keep typing
    </div>
  </div>
</template>

<style>
/* ── CM5 editor chrome, reshaped to the design tokens ─────────────────
   discovery's editors.css (imported above) brings the CodeMirror base
   styles, the neo theme and the hint popup; everything below re-skins it
   with the app's semantic tokens and swaps discovery's auto-grow sizing
   for fill-the-pane + internal scrolling. */

.di-query-editor {
  --at-apply: 'font-mono text-13px leading-relaxed';
  /* jora token palette, fed into discovery's own .cm-* rules (light) */
  --discovery-fmt-comment-color: #8f8f8f;
  --discovery-fmt-keyword-color: #8a63d2;
  --discovery-fmt-property-color: #2f7fd0;
  --discovery-fmt-number-color: #c98a1f;
  --discovery-fmt-atom-color: #c98a1f;
  --discovery-fmt-string-color: #3f9c50;
  --discovery-fmt-type-color: #0f9b8e;
  --discovery-fmt-variable-color: #0f9b8e;
}
.dark .di-query-editor {
  /* lightened for dark surfaces */
  --discovery-fmt-comment-color: #757575;
  --discovery-fmt-keyword-color: #ab8ce0;
  --discovery-fmt-property-color: #67a9e6;
  --discovery-fmt-number-color: #d9a962;
  --discovery-fmt-atom-color: #d9a962;
  --discovery-fmt-string-color: #7dc98a;
  --discovery-fmt-type-color: #3db8a8;
  --discovery-fmt-variable-color: #3db8a8;
}

.di-query-editor > .discovery-view-editor {
  --at-apply: 'bg-secondary border border-base rounded-lg';
  /* Absolute inside the relative host: the editor tracks the pane's size
     while CM's content height stays out of the layout's min-content chain
     (a tall document must scroll internally, never inflate the pane —
     the old <textarea>'s height was content-independent the same way). */
  position: absolute;
  inset: 0;
  margin-bottom: 0;
  transition: border-color 0.15s ease;
}
.di-query-editor:focus-within > .discovery-view-editor {
  --at-apply: 'border-primary-600/50 dark:border-primary-400/50';
  box-shadow: none !important; /* discovery's focus glow, replaced by the border shift */
}
.di-query-editor.di-query-editor-error > .discovery-view-editor {
  --at-apply: 'border-red-600/60 dark:border-red-400/60';
}

/* Fill-and-scroll instead of discovery's auto-grow: the editor takes the
   pane's height and scrolls internally. discovery pins `overflow-y:
   hidden !important` on both nodes, hence the counter-importants at
   higher specificity. */
.di-query-editor .discovery-view-editor .CodeMirror {
  --at-apply: 'color-base';
  flex: 1 1 0%;
  height: auto;
  min-height: 0;
  overflow: hidden !important;
  padding: 6px 10px;
  background: transparent;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}
.di-query-editor .discovery-view-editor .CodeMirror-scroll {
  /* CM5's stock internal-scroll setup */
  overflow: scroll !important;
  height: 100%;
  min-height: 0;
}

.di-query-editor .discovery-view-editor .CodeMirror-cursor {
  width: 0;
  border: 0;
  border-left: 1px solid currentColor; /* over neo's block cursor */
  background: none;
}
.di-query-editor .CodeMirror-selected {
  --at-apply: 'bg-#8883';
}
.di-query-editor .CodeMirror-focused .CodeMirror-selected {
  --at-apply: 'bg-primary-600/15 dark:bg-primary-400/20';
}

/* Placeholder: discovery renders it from data-placeholder but hides it on
   focus; keep it visible whenever the editor is empty, like the textarea. */
.di-query-editor .discovery-view-editor.empty-value .CodeMirror .CodeMirror-lines > div[role='presentation']::before {
  --at-apply: 'color-faint';
  content: attr(data-placeholder);
  position: absolute;
  inset: 0;
  white-space: pre-wrap;
  pointer-events: none;
}

/* ── suggestion popup (appended to <body> by the show-hint fork) ────── */

ul.discovery-view-editor-hints-popup {
  /* plain 40 = the app's named `z-dropdown` layer (uno `z-[40]` shortcut);
     the popup element is created by CM outside Uno's class extraction */
  z-index: 40;
  --at-apply: 'font-mono text-xs color-base bg-white dark:bg-#1e1e1e border border-base rounded-lg shadow-xl';
  min-width: 16rem;
  padding: 2px 0;
  line-height: 1.5;
}
.discovery-view-editor-hint {
  padding: 3px 10px 3px 8px;
}
.discovery-view-editor-hint:hover {
  --at-apply: 'bg-#8881';
}
.discovery-view-editor-hint.active {
  --at-apply: 'bg-#8882 color-active';
}
.discovery-view-editor-hint .match {
  --at-apply: 'color-primary-700 dark:color-primary-300';
  font-weight: 600;
}
.discovery-view-editor-hint::before {
  --at-apply: 'color-faint';
}
</style>
