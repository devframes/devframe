<script setup lang="ts">
import Button from '@antfu/design/components/Action/ActionButton.vue'
import { injectWorkbench } from '../composables/workbench'
import QueryEditor from './QueryEditor.vue'
import QuerySettings from './QuerySettings.vue'

const wb = injectWorkbench()
</script>

<template>
  <div class="border-b border-base flex-auto flex-col flex">
    <div class="flex px3 py2 items-center gap-2 select-none">
      <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
        Jora Query
      </div>
      <a
        href="https://discoveryjs.github.io/jora/#article:jora-syntax"
        target="_blank"
        title="Jora query language reference"
        class="flex items-center gap-1 color-muted hover:color-active"
      >
        <span class="i-ph:question-duotone" />
      </a>
      <div class="flex-auto" />
      <Button
        v-if="wb.query.value"
        class="text-sm"
        title="Clear query"
        icon="i-ph:trash-duotone"
        @click="wb.query.value = ''"
      >
        <span>Clear</span>
      </Button>
      <Button
        :disabled="wb.running.value"
        :loading="wb.running.value"
        class="text-sm"
        title="Run query"
        icon="i-ph:play-duotone"
        @click="wb.runNow()"
      >
        <span>Run</span>
      </Button>
    </div>
    <QueryEditor
      v-model="wb.query.value"
      :syntax="wb.syntax.value"
      :suggestions="wb.suggestions.value"
      class="flex-1 min-h-0 mx2"
      @run="wb.runNow()"
      @suggest="wb.scheduleSuggestions($event)"
      @accept="wb.acceptSuggestion($event)"
      @dismiss="wb.suggestions.value = []"
    />
    <QuerySettings v-model="wb.settings" class="py2 px4" />
  </div>
</template>
