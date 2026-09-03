import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import '@antfu/design/styles.css'

export const metadata: Metadata = {
  title: 'Next Runtime Snapshot',
  description: 'A devframe demo with a Next.js App Router SPA.',
}

// Mirror the OS color scheme onto <html> before paint; the shared design tokens
// flip on the `.dark` class (the built-in devframe plugins do the same).
const themeScript = `(function(){try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d)}catch(e){document.documentElement.classList.add('dark')}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
