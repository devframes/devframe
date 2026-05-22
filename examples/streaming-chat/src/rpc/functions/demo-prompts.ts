import { defineRpcFunction } from 'devframe'
import { DEMO_PROMPTS } from '../../constants.ts'

export const demoPrompts = defineRpcFunction({
  name: 'devframe-streaming-chat:demo-prompts',
  type: 'static',
  jsonSerializable: true,
  handler: () => ({ prompts: [...DEMO_PROMPTS] }),
})
