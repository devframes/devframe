import type { DocksContext } from '@devframes/hub/client'
import type { VueElementConstructor } from 'vue'
import { defineCustomElement } from 'vue'
import css from '../.generated/css'
import Component from './dock/DockEmbedded.vue'

export const DockEmbedded = defineCustomElement(
  Component,
  {
    shadowRoot: true,
    styles: [css],
  },
) as VueElementConstructor<{
  context: DocksContext
}>

customElements.define('devframes-dock-embedded', DockEmbedded)
