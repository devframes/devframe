import type { DocksContext } from '@devframes/hub/client'
import type { VueElementConstructor } from 'vue'
import { defineCustomElement } from 'vue'
import css from '../.generated/css'
import Component from './dock/DockStandalone.vue'

export const DockStandalone = defineCustomElement(
  Component,
  {
    shadowRoot: true,
    styles: [css],
  },
) as VueElementConstructor<{
  context: DocksContext
}>

if (!customElements.get('devframes-dock-standalone'))
  customElements.define('devframes-dock-standalone', DockStandalone)
