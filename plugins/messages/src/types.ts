// The plugin's data vocabulary is the hub's — re-exported so the SPA, the
// embeddable client, and consumers can type against the plugin package alone.
export type {
  DevframeMessageAction,
  DevframeMessageActivateAction,
  DevframeMessageEntry,
  DevframeMessageEntryFrom,
  DevframeMessageEntryInput,
  DevframeMessageLevel,
  DevframeMessagesListDelta,
} from '@devframes/hub/types'
