// The "app under test": an intentionally-inaccessible, client-side-routed mini
// app the a11y agent scans. Each route seeds a different family of axe
// violations, and navigating between them (History API pushState — which the
// a11y agent patches) exercises the inspector's per-route tracking.
//
// Keep the chrome (the route nav) accessible so the deliberate violations stay
// concentrated in each route's <main>, where they're easy to reason about.

interface Route {
  path: string
  label: string
  /** What the route is designed to make axe flag — shown as a hint. */
  hint: string
  render: () => string
}

const ROUTES: Route[] = [
  {
    path: '/',
    label: 'Home',
    hint: 'image-alt · button-name · link-name · heading-order',
    render: () => `
      <h1>Welcome to the broken shop</h1>
      <h4>Featured (heading level skips from 1 to 4)</h4>
      <img src="data:image/svg+xml;utf8,${banner('#6b7db3')}" width="240" height="90" />
      <p>An icon-only button with no accessible name:</p>
      <button type="button" style="font-size:20px;padding:6px 10px">🔔</button>
      <p>A link with no discernible text:</p>
      <a href="/images" style="display:inline-block;width:24px;height:24px;background:#c33"></a>
    `,
  },
  {
    path: '/images',
    label: 'Images',
    hint: 'image-alt (several)',
    render: () => `
      <h1>Gallery</h1>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${['#c0653a', '#3a8fc0', '#4aa06a', '#b04a9a']
          .map(c => `<img src="data:image/svg+xml;utf8,${banner(c)}" width="150" height="80" />`)
          .join('')}
      </div>
      <p>None of the images above carry an <code>alt</code> attribute.</p>
    `,
  },
  {
    path: '/forms',
    label: 'Forms',
    hint: 'label · select-name · placeholder-only',
    render: () => `
      <h1>Checkout</h1>
      <form style="display:flex;flex-direction:column;gap:10px;max-width:320px">
        <input type="text" placeholder="Full name" />
        <input type="email" placeholder="Email" />
        <select>
          <option>Standard shipping</option>
          <option>Express shipping</option>
        </select>
        <input type="checkbox" /> <span>I agree to the terms</span>
        <button type="submit">Pay now</button>
      </form>
      <p>The inputs and the select have no associated labels; the checkbox's
        text is not programmatically linked.</p>
    `,
  },
  {
    path: '/contrast',
    label: 'Contrast',
    hint: 'color-contrast · region (best-practice)',
    render: () => `
      <h1 style="color:#b8b8b8;background:#ffffff">Low-contrast heading</h1>
      <p style="color:#a9a9a9;background:#ffffff">
        This paragraph sets light grey text on a white background — well below
        the WCAG AA contrast ratio for body text.
      </p>
      <span style="color:#f0c419;background:#ffffff;padding:4px 8px">
        Yellow-on-white call to action
      </span>
      <div role="button" tabindex="0"
        style="margin-top:12px;width:40px;height:40px;background:#888"></div>
      <p>The grey square is a custom control with a role but no accessible name.</p>
    `,
  },
]

/** A tiny inline SVG banner used as decorative (alt-less) imagery. */
function banner(color: string): string {
  return encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" fill="${color}"/></svg>`,
  )
}

function currentRoute(): Route {
  return ROUTES.find(r => r.path === location.pathname) ?? ROUTES[0]!
}

/**
 * Mount the app-under-test into `container`. Renders a route nav plus the
 * current route's (deliberately broken) content, and navigates with
 * `history.pushState` so the a11y agent re-scans and buckets per route.
 */
export function mountAppUnderTest(container: HTMLElement): void {
  function render(): void {
    const active = currentRoute()
    container.innerHTML = `
      <nav aria-label="App under test" class="aut-nav">
        ${ROUTES.map(r =>
          `<button type="button" data-route="${r.path}" aria-current="${r.path === active.path ? 'page' : 'false'}"
             class="aut-tab${r.path === active.path ? ' aut-tab--active' : ''}">${r.label}</button>`,
        ).join('')}
      </nav>
      <p class="aut-hint">Route <code>${active.path}</code> · seeds: <strong>${active.hint}</strong></p>
      <main class="aut-main">${active.render()}</main>
    `
  }

  container.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-route]')
    if (!btn)
      return
    const path = btn.dataset.route!
    if (path === location.pathname)
      return
    history.pushState({}, '', path)
    render()
  })

  window.addEventListener('popstate', render)
  render()
}
