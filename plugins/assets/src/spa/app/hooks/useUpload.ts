import type { DevframeRpcClient } from 'devframe/client'
import { useCallback, useState } from 'preact/hooks'

export interface QueuedFile {
  file: File
  /** Root-relative destination path (folder + possibly-renamed file name). */
  targetPath: string
}

export interface UseUploadResult {
  uploading: boolean
  /** Per-file error messages from the most recent `uploadFiles` call. */
  errors: string[]
  /** Resolves with per-file error messages — empty when every file succeeded. */
  uploadFiles: (files: QueuedFile[]) => Promise<string[]>
}

/**
 * Uploads files sequentially over the assets plugin's streaming channel:
 * one `upload` action call allocates the slot, then the file's own byte
 * stream pipes straight into the returned sink.
 */
export function useUpload(rpc: DevframeRpcClient | null, onDone: () => void): UseUploadResult {
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const uploadFiles = useCallback(async (files: QueuedFile[]): Promise<string[]> => {
    if (!rpc || files.length === 0)
      return []
    setUploading(true)
    const nextErrors: string[] = []
    try {
      for (const { file, targetPath } of files) {
        try {
          const { uploadId } = await rpc.call('devframes:plugin:assets:upload', { path: targetPath })
          const sink = rpc.streaming.upload<Uint8Array>('devframes:plugin:assets:upload', uploadId)
          await file.stream().pipeTo(sink.writable, { signal: sink.signal })
        }
        catch (cause) {
          nextErrors.push(`${targetPath}: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      setErrors(nextErrors)
      if (nextErrors.length < files.length)
        onDone()
      return nextErrors
    }
    finally {
      setUploading(false)
    }
  }, [rpc, onDone])

  return { uploading, errors, uploadFiles }
}
