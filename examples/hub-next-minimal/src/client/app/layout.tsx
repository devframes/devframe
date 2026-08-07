import type { ReactNode } from 'react'

export const metadata = {
  title: 'Hub Next (minimal)',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', padding: '2rem' }}>
        {children}
        {/* The floating-dock bootstrap — one dev-only module script, the
            whole embedded integration. */}
        <script type="module" src="/__devframes/embedded.js" />
      </body>
    </html>
  )
}
