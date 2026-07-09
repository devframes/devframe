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

/**
 * The color scheme currently applied to the document, tracked by observing the
 * `.dark` class on `<html>`. Unlike {@link useTheme}, this reacts to toggles
 * made anywhere in the app (or by Storybook), so Shiki-themed surfaces like the
 * diff viewer stay in step with the rest of the UI regardless of who flipped it.
 */
export function useColorScheme(): Theme {
  const [scheme, setScheme] = useState<Theme>('dark')

  useEffect(() => {
    const root = document.documentElement
    const read = () => setScheme(root.classList.contains('dark') ? 'dark' : 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return scheme
}
