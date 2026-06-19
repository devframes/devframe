<script setup lang="ts">
import { historyRecords, isRecording, clearHistory } from '../composables/history'
import HistoryView from './HistoryView.vue'

function setRecording(value: boolean) {
  isRecording.value = value
}
</script>

<template>
  <HistoryView
    :history-records="historyRecords"
    :is-recording="isRecording"
    @update:is-recording="setRecording"
    @clear="clearHistory"
  />
</template>
