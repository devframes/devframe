import type { OnboardingBranding, OnboardingStatus } from '../types'
import css from './.generated/css'
import { DEVFRAME_LOGO } from './logo'

// @unocss-include

/**
 * The stand-in floating button, served at `<base>embedded.js`. It asks
 * `__onboard/status` what to show, offers Install / Disable, and once the
 * real hub answers at the same base it loads that `embedded.js` and removes
 * itself.
 */

// Read through a variable so Vite's lib build keeps the runtime URL.
const moduleUrl = import.meta.url
const base = new URL('./', moduleUrl)
const POLL_MS = 1000
const HIDDEN_KEY = 'devframes-onboard-hidden'

const api = (path: string, init?: RequestInit) => fetch(new URL(`__onboard/${path}`, base), init)

async function fetchStatus(): Promise<OnboardingStatus> {
  const response = await api('status')
  return response.json()
}

async function handOff(): Promise<void> {
  // A new query string so the browser does not return this module from its cache.
  await import(/* @vite-ignore */ new URL(`embedded.js?onboard=${Date.now()}`, base).href)
}

function isDark(): boolean {
  const stored = localStorage.getItem('devframes-color-scheme')
  if (stored === 'dark' || stored === 'light')
    return stored === 'dark'
  return matchMedia('(prefers-color-scheme: dark)').matches
}

function logoFor(branding: OnboardingBranding): string | undefined {
  const logo = branding.logo
  if (!logo || typeof logo === 'string')
    return logo
  return isDark() ? (logo.dark ?? logo.light) : logo.light
}

function mark(branding: OnboardingBranding, className: string): HTMLElement {
  const el = document.createElement('span')
  el.className = `${className} flex items-center justify-center`
  const src = logoFor(branding)
  if (src) {
    const img = document.createElement('img')
    img.src = src
    img.alt = ''
    img.draggable = false
    img.className = 'w-full h-full object-contain'
    el.append(img)
  }
  else {
    el.innerHTML = DEVFRAME_LOGO
  }
  return el
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = className
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

function mount(initial: OnboardingStatus): void {
  const host = document.createElement('devframes-onboard')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  const scheme = document.createElement('div')
  scheme.className = [
    isDark() ? 'dark' : 'light',
    'devframes-onboard-root',
  ].join(' ')
  scheme.style.display = 'contents'
  root.append(style, scheme)
  if (initial.branding.primaryColor)
    host.style.setProperty('--devframe-primary', initial.branding.primaryColor)

  const { messages, branding } = initial

  const pill = document.createElement('button')
  pill.type = 'button'
  pill.className = 'devframes-onboard-pill'
  pill.title = messages.title
  pill.setAttribute('aria-haspopup', 'dialog')
  pill.setAttribute('aria-expanded', 'false')
  const glow = document.createElement('span')
  glow.className = 'devframes-onboard-glow'
  pill.append(mark(branding, 'w-3 h-3'))

  const panel = document.createElement('div')
  panel.className = 'devframes-onboard-panel'
  panel.setAttribute('role', 'dialog')
  panel.hidden = true

  const heading = document.createElement('div')
  heading.className = 'flex items-center gap-2 font-medium'
  const title = document.createElement('span')
  title.textContent = messages.title
  heading.append(mark(branding, 'w-5 h-5'), title)

  const description = document.createElement('p')
  description.className = 'color-muted m-0'
  description.textContent = messages.description

  const command = document.createElement('code')
  command.className = 'devframes-onboard-command'
  command.textContent = initial.command

  const note = document.createElement('p')
  note.className = 'm-0 text-xs'
  note.hidden = true

  const install = button('btn-primary text-sm justify-center', messages.install, () => void startInstall())
  const hide = button('btn-action justify-center text-sm color-muted', messages.hide, () => {
    sessionStorage.setItem(HIDDEN_KEY, '1')
    host.remove()
  })
  const disable = button('btn-action justify-center text-sm color-muted', messages.disable, () => void disableDevtools())
  const secondary = document.createElement('div')
  secondary.className = 'grid grid-cols-2 gap-1'
  secondary.append(hide, disable)
  const actions = document.createElement('div')
  actions.className = 'flex flex-col gap-2'
  actions.append(secondary, install)

  panel.append(heading, description, command, note, actions)
  scheme.append(glow, pill, panel)

  let open = false
  const setOpen = (value: boolean) => {
    open = value
    panel.hidden = !open
    pill.setAttribute('aria-expanded', String(open))
  }
  pill.addEventListener('click', () => setOpen(!open))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open)
      setOpen(false)
  })
  document.addEventListener('pointerdown', (event) => {
    if (open && !event.composedPath().includes(host))
      setOpen(false)
  })

  function render(status: OnboardingStatus): void {
    const { state } = status
    install.disabled = state === 'installing'
    install.textContent = state === 'error' ? messages.retry : messages.install
    install.hidden = state === 'installed'
    note.hidden = !(state === 'installing' || state === 'installed' || state === 'error')
    note.className = `m-0 text-xs ${state === 'error' ? 'text-red-600 dark:text-red-400' : 'color-muted'}`
    note.textContent = state === 'installing'
      ? messages.installing
      : state === 'installed'
        ? messages.restart
        : state === 'error'
          ? `${status.error?.code}: ${status.error?.message}`
          : ''
  }

  async function poll(): Promise<void> {
    const status = await fetchStatus()
    if (status.state === 'ready') {
      host.remove()
      await handOff()
      return
    }
    render(status)
    if (status.state === 'installing')
      setTimeout(() => void poll(), POLL_MS)
  }

  async function startInstall(): Promise<void> {
    render({ ...initial, state: 'installing' })
    await api('install', { method: 'POST' })
    await poll()
  }

  async function disableDevtools(): Promise<void> {
    const response = await api('disable', { method: 'POST' })
    if (response.ok)
      host.remove()
  }

  render(initial)
  if (initial.state === 'installing')
    void poll()
  document.body.append(host)
}

async function main(): Promise<void> {
  // Never stack a second button inside an iframe of the same origin.
  if (window.parent !== window)
    return
  if (sessionStorage.getItem(HIDDEN_KEY))
    return
  const status = await fetchStatus()
  // Nothing to offer: disabled by the user, or already installed with no hub to hand off to.
  if (status.state === 'disabled' || status.state === 'installed')
    return
  if (status.state === 'ready') {
    await handOff()
    return
  }
  mount(status)
}

void main()
