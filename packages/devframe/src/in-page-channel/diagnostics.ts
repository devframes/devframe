import { defineDiagnostics } from 'devframe/utils/nostics'

export const diagnostics = /* #__PURE__ */ defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DF0077: {
      why: (p: { name: string }) => `In-page channel function "${p.name}" is not registered on this endpoint.`,
      fix: 'Declare the function in this endpoint\'s `functions` option.',
    },
    DF0080: {
      why: (p: { name: string }) =>
        `In-page channel function "${p.name}" has \`agent\` set but \`jsonSerializable\` is \`false\`; MCP requires JSON-serializable data.`,
      fix: 'Remove `jsonSerializable: false`, or remove `agent` to keep it channel-only.',
    },
  },
})
