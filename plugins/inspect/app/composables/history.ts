import { ref } from 'vue'

export type HistoryRecord
  = | { type: 'call', method: string, args: any[], result?: any, error?: any, duration: number, time: number, id: number }
    | { type: 'state', key: string, value?: any, patches?: any, syncId: string, time: number, id: number }

export const historyRecords = ref<HistoryRecord[]>([])
export const isRecording = ref(true)

let nextId = 1

export function addHistoryRecord(record: Omit<HistoryRecord, 'id'>) {
  if (!isRecording.value)
    return
  historyRecords.value.push({ ...record, id: nextId++ })
}

export function clearHistory() {
  historyRecords.value = []
}
