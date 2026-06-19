// Minimum SPA client that talks to a devframe-hosted RPC.
import { connectDevframe } from 'devframe/client'

async function main() {
  // Scope the client to your devframe id — calls are namespaced for you.
  const my = (await connectDevframe()).scope('my-inspector')
  // The method names below are just examples — replace with your own.
  const data = await my.rpc.call('getStats' as any)
  document.getElementById('root')!.textContent = JSON.stringify(data)
}

main().catch(console.error)
