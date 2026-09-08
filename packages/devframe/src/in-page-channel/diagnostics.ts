import { defineDiagnostics } from 'devframe/utils/nostics'

export const diagnostics = /* #__PURE__ */ defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DF0077: {
      why: (p: { name: string }) => `In-page channel event "${p.name}" is not registered on this endpoint.`,
      fix: 'Declare the event in this endpoint\'s `events` option before subscribing with `on()`.',
    },
  },
})
