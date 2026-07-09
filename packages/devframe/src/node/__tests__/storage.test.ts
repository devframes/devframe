import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createStorage } from '../storage'

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('createStorage', () => {
  it('falls back to initial value when persisted JSON is invalid', async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'devframe-storage-'))
    const filepath = join(dir, 'state.json')
    fs.writeFileSync(filepath, '{invalid json', 'utf-8')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const state = createStorage({
        filepath,
        initialValue: { count: 1 },
        debounce: 0,
      })

      expect(state.value()).toEqual({ count: 1 })
      expect(warnSpy).toHaveBeenCalled()

      state.mutate((draft) => {
        draft.count = 2
      })

      await wait(20)

      const saved = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
      expect(saved).toEqual({ count: 2 })
    }
    finally {
      warnSpy.mockRestore()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes atomically via temp file + rename', async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'devframe-storage-'))
    const filepath = join(dir, 'state.json')

    try {
      const state = createStorage({
        filepath,
        initialValue: { count: 1 },
        debounce: 0,
      })

      state.mutate((draft) => {
        draft.count = 2
      })

      await wait(20)

      // no leftover temp file
      const entries = fs.readdirSync(dir)
      expect(entries).toEqual(['state.json'])

      const saved = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
      expect(saved).toEqual({ count: 2 })
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a write failure instead of throwing', async () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), 'devframe-storage-'))
    const filepath = join(dir, 'state.json')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    try {
      const state = createStorage({
        filepath,
        initialValue: { count: 1 },
        debounce: 0,
      })

      expect(() => {
        state.mutate((draft) => {
          draft.count = 2
        })
      }).not.toThrow()

      await wait(20)

      expect(errorSpy).toHaveBeenCalled()
      expect(fs.existsSync(filepath)).toBe(false)
    }
    finally {
      renameSpy.mockRestore()
      errorSpy.mockRestore()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
