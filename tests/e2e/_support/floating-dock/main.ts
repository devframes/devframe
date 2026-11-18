import { setDevframeClientContext } from '@devframes/hub/client'
import { watchEffect } from 'vue'
import { DockEmbedded } from '../../../../packages/hub-ui/src/client/components/DockEmbedded'
import { createMockDocksContext } from '../../../../packages/hub-ui/src/client/stories/mock-context'

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const context = await createMockDocksContext({
    isTrusted: params.has('trusted'),
    panel: {
      position: params.has('vertical')
        ? 'left'
        : 'bottom',
      left: params.has('vertical')
        ? 0
        : 50,
      top: params.has('vertical')
        ? 50
        : 100,
      inactiveTimeout: 30_000,
    },
  })
  setDevframeClientContext(context)
  document.body.appendChild(new DockEmbedded({ context }))

  watchEffect(() => {
    document.body.dataset.selected = context.docks.selected?.id ?? ''
    document.body.dataset.open = String(context.panel.session.open)
  })

  const after = document.createElement('button')
  after.id = 'after'
  after.textContent = 'After dock'
  document.body.appendChild(after)
}

void main()
