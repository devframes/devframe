import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import '@internal/design/theme.css'

export const metadata: Metadata = {
  title: 'Minimal Next Devframe Hub',
  description: 'A Next.js host for the @devframes/hub protocol.',
}

// Follow the OS theme before paint (@internal/design dark: is class-based).
const themeScript = `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}})();`

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
