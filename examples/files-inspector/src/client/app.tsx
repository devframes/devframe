import type { DevframeScopedClientContext } from 'devframe/client'
import { connectDevframe } from 'devframe/client'
import { useEffect, useState } from 'preact/hooks'
import { nav, navBrand, tab as tabClass, tabsList } from './design'
import { About } from './routes/about'
import { Home } from './routes/home'

const NAMESPACE = 'devframe-files-inspector'
export type InspectorCtx = DevframeScopedClientContext<typeof NAMESPACE>

const NAV_ITEMS = [
  { route: '/', label: 'Home', icon: 'i-ph-house-duotone' },
  { route: '/about', label: 'About', icon: 'i-ph-info-duotone' },
] as const

function getBasePath(): string {
  return new URL(document.baseURI).pathname
}

function getRoute(basePath: string): string {
  const path = location.pathname
  if (!path.startsWith(basePath))
    return '/'
  const sub = path.slice(basePath.length)
  return sub.startsWith('/') ? sub : `/${sub}`
}

export function App() {
  const basePath = getBasePath()
  const [route, setRoute] = useState(getRoute(basePath))
  const [ctx, setCtx] = useState<InspectorCtx | null>(null)

  useEffect(() => {
    let cancelled = false
    connectDevframe().then((r) => {
      if (!cancelled)
        setCtx(r.scope(NAMESPACE))
    })
    const onPop = () => setRoute(getRoute(basePath))
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [basePath])

  function navigate(to: string) {
    const target = `${basePath}${to.replace(/^\//, '')}`
    history.pushState(null, '', target)
    setRoute(to)
  }

  if (!ctx) {
    return (
      <div class="grid min-h-screen place-items-center bg-base color-muted font-sans text-sm">
        Connecting to devframe…
      </div>
    )
  }

  // Any non-/about route resolves to Home, mirroring the route switch below.
  const active = route === '/about' ? '/about' : '/'

  return (
    <div class="flex flex-col min-h-screen bg-base color-base font-sans">
      <header class={nav()}>
        <span class={navBrand()}>
          <span class="i-ph-folder-duotone text-base color-active" />
          <span>Files Inspector</span>
        </span>

        <nav class={tabsList()} role="tablist" aria-label="Views">
          {NAV_ITEMS.map(({ route: r, label, icon }) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={active === r}
              data-state={active === r ? 'active' : 'inactive'}
              class={tabClass()}
              onClick={() => navigate(r)}
            >
              <span class={icon} />
              {label}
            </button>
          ))}
        </nav>

        <span class="flex-1" />

        <small class="flex items-center gap-1.5 color-muted text-xs font-mono">
          <span>base</span>
          <code class="color-base">{basePath}</code>
          <span class="op-mute">·</span>
          <span>backend</span>
          <code class="color-base">{ctx.base.connectionMeta.backend}</code>
        </small>
      </header>

      <main class="min-h-0 flex-1 overflow-auto">
        {active === '/about'
          ? <About ctx={ctx} basePath={basePath} />
          : <Home ctx={ctx} />}
      </main>
    </div>
  )
}
