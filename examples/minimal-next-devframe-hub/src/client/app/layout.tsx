import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import '@antfu/design/styles.css'

export const metadata: Metadata = {
  title: 'Minimal Next Devframe Hub',
  description: 'A Next.js host for the @devframes/hub protocol.',
}

// Follow the OS theme before paint (@antfu/design dark: is class-based).
const themeScript = `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {/*
          Load the a11y inspector agent into the hub's own page so its docked
          panel scans the host live. The hub serves this bundle same-origin
          (see the agent mount in `devframe/minimal-next-devframe-hub.ts`); the
          path mirrors the plugin's `A11Y_AGENT_PATH` constant.
        */}
        <script type="module" src="/__df-inject/inject.js" async />
      </body>
    </html>
  )
}
