import { connectDevframe } from 'devframe/client'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

const transportEl = document.querySelector<HTMLElement>('#transport')!
const clockEl = document.querySelector<HTMLElement>('#clock')!
const uptimeEl = document.querySelector<HTMLElement>('#uptime')!
const incrementBtn = document.querySelector<HTMLButtonElement>('#increment')!
const countEl = document.querySelector<HTMLElement>('#count')!

async function main() {
  // The server advertises `backend: 'sse'` (it binds no WebSocket), so the
  // default `transport: 'auto'` lands on SSE with no options needed here.
  const rpc = await connectDevframe({ baseURL: '/__sse-basic/' })
  transportEl.textContent = rpc.transport

  // Client → server: an ordinary RPC call, carried by an HTTP POST whose
  // response body brings the result back.
  uptimeEl.textContent = `${await (rpc.call as any)('sse-basic:uptime')}s`

  // Server → client: shared state synced over the SSE event stream - the
  // clock ticks without this page ever polling.
  const clock = await rpc.sharedState.get<{ now: string }>('sse-basic:clock')
  const renderClock = () => {
    clockEl.textContent = clock.value().now
  }
  renderClock()
  clock.on('updated', renderClock)

  incrementBtn.addEventListener('click', async () => {
    const count = await (rpc.call as any)('sse-basic:increment')
    countEl.textContent = `count = ${count}`
  })
}

main().catch((err) => {
  transportEl.textContent = `failed: ${(err as Error).message}`
  console.error(err)
})
