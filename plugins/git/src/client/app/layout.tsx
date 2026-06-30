import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import '@antfu/design/styles.css'

export const metadata: Metadata = {
  title: 'Git Dashboard',
  description: 'A devframe Git integration with a Next.js App Router + shadcn/ui SPA.',
}

// Set the theme class before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var k='devframe-git-theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`

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
