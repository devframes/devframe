import type { Meta, StoryObj } from '@storybook/vue3-vite'
import EditorFrame from './EditorFrame.vue'

// A stand-in for the real editor so the story renders without a live server.
const MOCK_EDITOR = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta name="color-scheme" content="dark light" /><style>
  html,body{height:100%;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#1e1e1e;color:#d4d4d4}
  .bar{height:35px;background:#333;display:flex;align-items:center;padding:0 12px;font-size:12px;color:#ccc}
  .body{display:flex;height:calc(100% - 35px)}
  .side{width:48px;background:#333}
  .main{flex:1;padding:16px;font-size:13px;line-height:1.6}
  .c{color:#569cd6}.s{color:#ce9178}.f{color:#dcdcaa}
</style></head><body>
  <div class="bar">code-server — mock editor (Storybook)</div>
  <div class="body"><div class="side"></div><div class="main">
    <div><span class="c">export function</span> <span class="f">createCodeServerDevframe</span>(<span class="c">options</span>) {</div>
    <div>&nbsp;&nbsp;<span class="c">return</span> <span class="f">defineDevframe</span>({ <span class="s">id</span>, <span class="s">name</span> })</div>
    <div>}</div>
  </div></div>
</body></html>`)}`

const meta = {
  title: 'Code Server/EditorFrame',
  component: EditorFrame,
  parameters: { layout: 'fullscreen' },
  render: args => ({
    components: { EditorFrame },
    setup: () => ({ args }),
    template: '<div class="relative h-100vh"><EditorFrame v-bind="args" /></div>',
  }),
} satisfies Meta<typeof EditorFrame>

export default meta
type Story = StoryObj<typeof meta>

/** Ready — the editor fills the panel, with no chrome over it. */
export const Running: Story = {
  args: {
    connect: { url: MOCK_EDITOR },
  },
}
