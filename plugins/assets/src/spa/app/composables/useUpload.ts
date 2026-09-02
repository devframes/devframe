import type { DevframeRpcClient } from 'devframe/client'
import type { Ref } from 'vue'
import { ref } from 'vue'

interface QueuedFile {
  file: File
  /** Root-relative destination path (folder + possibly-renamed file name). */
  targetPath: string
}

export interface UseUploadResult {
  uploading: Ref<boolean>
  /** Per-file error messages from the most recent `uploadFiles` call. */
  errors: Ref<string[]>
  /** Resolves with per-file error messages - empty when every file succeeded. */
  uploadFiles: (files: QueuedFile[]) => Promise<string[]>
}

/**
 * Uploads files sequentially over the assets plugin's streaming channel:
 * one `upload` action call allocates the slot, then the file's own byte
 * stream pipes straight into the returned sink.
 */
export function useUpload(rpc: Ref<DevframeRpcClient | null>, onDone: () => void): UseUploadResult {
  const uploading = ref(false)
  const errors = ref<string[]>([])

  async function uploadFiles(files: QueuedFile[]): Promise<string[]> {
    const client = rpc.value
    if (!client || files.length === 0)
      return []
    uploading.value = true
    const nextErrors: string[] = []
    try {
      for (const { file, targetPath } of files) {
        try {
          const { uploadId } = await client.call('devframes:plugin:assets:upload', { path: targetPath })
          const sink = client.streaming.upload<Uint8Array>('devframes:plugin:assets:upload', uploadId)
          await file.stream().pipeTo(sink.writable, { signal: sink.signal })
        }
        catch (cause) {
          nextErrors.push(`${targetPath}: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      errors.value = nextErrors
      if (nextErrors.length < files.length)
        onDone()
      return nextErrors
    }
    finally {
      uploading.value = false
    }
  }

  return { uploading, errors, uploadFiles }
}
