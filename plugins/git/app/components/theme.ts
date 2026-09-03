'use client'

import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'devframe-git-theme'

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  }
  catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme state synced to the `.dark` class on `<html>` and persisted to
 * localStorage. The initial class is set by an inline script in the document
 * head (see `layout.tsx`) to avoid a flash; this hook keeps React in step.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(readStored() ?? systemTheme())
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  function toggle() {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      }
      catch {}
      return next
    })
  }

  return { theme, toggle }
}
