import type { Meta, StoryObj } from '@storybook/html-vite'

interface Section {
  icon: string
  title: string
  framework: string
  blurb: string
}

const sections: Section[] = [
  { icon: 'i-ph:git-branch-duotone', title: 'Git', framework: 'React', blurb: 'Read-only repository dashboard — status, log, branches, diff.' },
  { icon: 'i-ph:magnifying-glass-duotone', title: 'Inspect', framework: 'Vue', blurb: 'Self-inspector for the RPC registry, shared state and agent surface.' },
  { icon: 'i-ph:code-duotone', title: 'Code Server', framework: 'vanilla', blurb: 'Launch code-server and embed the editor in an authenticated iframe.' },
  { icon: 'i-ph:terminal-window-duotone', title: 'Terminals', framework: 'Svelte', blurb: 'Readonly output streams and fully interactive PTY shells.' },
  { icon: 'i-ph:person-arms-spread-duotone', title: 'A11y', framework: 'Solid', blurb: 'Runs axe-core against the host app and surfaces the violations.' },
]

function card({ icon, title, framework, blurb }: Section): string {
  return `
    <div class="flex flex-col gap-2 rounded-xl border border-base bg-base p-4 shadow-sm">
      <div class="flex items-center gap-2">
        <div class="${icon} text-xl color-active"></div>
        <span class="font-semibold">${title}</span>
        <span class="badge-muted ml-auto font-mono text-xs">${framework}</span>
      </div>
      <p class="text-sm color-muted leading-relaxed">${blurb}</p>
    </div>`
}

function render(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'min-h-svh p-8 md:p-12'
  el.innerHTML = `
    <div class="mx-auto max-w-3xl flex flex-col gap-8">
      <header class="flex flex-col gap-3">
        <div class="flex items-center gap-2 font-semibold">
          <div class="i-ph:cube-duotone text-2xl color-active"></div>
          <span class="text-lg">devframe</span>
          <span class="badge-muted font-mono text-xs">Storybook</span>
        </div>
        <h1 class="text-2xl font-semibold tracking-tight">One Storybook, every surface.</h1>
        <p class="color-muted leading-relaxed max-w-2xl">
          Each devframe plugin owns a framework-specific Storybook. This host composes
          them into a single UI — pick a plugin in the sidebar to browse its stories.
          Every surface shares the same <span class="color-base font-medium">@antfu/design</span>
          system, so they look and feel like one product across frameworks.
        </p>
      </header>
      <section class="grid gap-3 sm:grid-cols-2">
        ${sections.map(card).join('')}
      </section>
      <footer class="text-sm color-faint">
        Use the theme toggle in the toolbar to switch light / dark.
      </footer>
    </div>`
  return el
}

const meta = {
  title: 'Overview/Introduction',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

export const Introduction: Story = {
  render,
}
