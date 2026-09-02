import type { InvokeResult } from '../../types'

/**
 * Run an async operation and normalize it into an {@link InvokeResult}
 * envelope: time the call, and capture a thrown error into a serializable
 * shape rather than propagating it, so the inspector UI can render failures
 * inline alongside successes.
 */
export async function toInvokeResult(run: () => Promise<unknown>): Promise<InvokeResult> {
  const start = Date.now()
  try {
    const result = await run()
    return { ok: true, result, durationMs: Date.now() - start }
  }
  catch (error) {
    const e = error as Error
    return {
      ok: false,
      error: {
        name: e?.name ?? 'Error',
        message: e?.message ?? String(error),
        stack: e?.stack,
      },
      durationMs: Date.now() - start,
    }
  }
}
