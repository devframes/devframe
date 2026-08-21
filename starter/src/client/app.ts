import type { DevframeScopedClientContext } from 'devframe/client'
import type { StarterItem, StarterState } from '../rpc/functions/get-state.ts'
import { connectDevframe } from 'devframe/client'

const NAMESPACE = 'devframe-starter'
type StarterCtx = DevframeScopedClientContext<typeof NAMESPACE>

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null)
      el.setAttribute(k, v)
  }
  for (const c of children)
    el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return el
}

export interface MountOptions {
  /**
   * Override where `connectDevframe` looks for `__connection.json`, instead
   * of deriving it from `document.baseURI`. The CLI dev server and the
   * static build serve this SPA *at* the devframe's own base path, so
   * `document.baseURI` already resolves there and this can stay unset; the
   * single playground serves it from Vite's own root instead (Vite's SPA
   * serving and the RPC bridge can't share one base - see
   * `playground/single/vite.config.ts`), so its entry passes this explicitly.
   */
  baseURL?: string
}

/** Boot the SPA into `root`: connect to devframe, then render its state. */
export async function mount(root: HTMLElement, options: MountOptions = {}): Promise<void> {
  root.replaceChildren(h('div', { class: 'connecting' }, ['Connecting to devframe…']))

  const client = await connectDevframe(options.baseURL ? { baseURL: options.baseURL } : undefined)
  const ctx = client.scope(NAMESPACE) as StarterCtx

  const listCard = h('div', { class: 'card' })
  const count = h('span', { class: 'count' }, ['0'])
  const nodeCode = h('code', {}, ['…'])
  const cwdCode = h('code', {}, ['…'])
  const refreshBtn = h('button', { type: 'button' }, ['Refresh'])

  async function refresh(): Promise<void> {
    refreshBtn.disabled = true
    refreshBtn.textContent = 'Loading…'
    try {
      // The one RPC round trip this SPA makes.
      const state = await ctx.rpc.call('get-state') as StarterState
      count.textContent = String(state.items.length)
      nodeCode.textContent = state.node
      cwdCode.textContent = state.cwd
      renderList(listCard, state.items)
    }
    finally {
      refreshBtn.disabled = false
      refreshBtn.textContent = 'Refresh'
    }
  }
  refreshBtn.addEventListener('click', () => void refresh())

  root.replaceChildren(
    h('div', { class: 'app' }, [
      h('header', { class: 'nav' }, [
        h('span', { class: 'brand' }, [h('span', { class: 'dot' }), 'Devframe Starter']),
        h('span', { class: 'spacer' }),
        h('small', { class: 'meta' }, [
          'node ',
          nodeCode,
          ' · backend ',
          h('code', {}, [ctx.base.connectionMeta.backend]),
        ]),
      ]),
      h('main', {}, [
        h('div', { class: 'row' }, [
          h('h2', {}, ['Items']),
          count,
          h('span', { class: 'spacer' }),
          refreshBtn,
        ]),
        listCard,
        h('p', { class: 'meta' }, ['cwd: ', cwdCode]),
      ]),
    ]),
  )

  await refresh()
}

function renderList(card: HTMLElement, items: StarterItem[]): void {
  if (items.length === 0) {
    card.replaceChildren(h('p', { class: 'empty' }, ['Nothing in the working directory.']))
    return
  }
  card.replaceChildren(
    h('ul', {}, items.map(it =>
      h('li', {}, [
        it.name,
        h('span', { class: 'spacer' }),
        h('span', { class: 'kind' }, [it.kind]),
      ]))),
  )
}
