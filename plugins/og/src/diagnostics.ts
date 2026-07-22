import { defineDiagnostics } from 'nostics'

export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  codes: {
    DP_OG_0001: {
      why: (p: { url: string }) => `Cannot inspect "${p.url}" because it is not a valid HTTP or HTTPS URL.`,
      fix: 'Enter an absolute URL, such as `http://localhost:3000/about`.',
    },
    DP_OG_0002: {
      why: (p: { url: string, reason: string }) => `Could not fetch Open Graph metadata from "${p.url}": ${p.reason}`,
      fix: 'Check that the target server is running and reachable from the devframe process.',
    },
    DP_OG_0003: {
      why: (p: { url: string, status: number }) => `The target "${p.url}" returned HTTP ${p.status}.`,
      fix: 'Inspect a route that returns a successful HTML response.',
    },
    DP_OG_0004: {
      why: (p: { url: string, size: number }) => `The HTML response from "${p.url}" is ${p.size} bytes, which exceeds the 2 MB inspection limit.`,
      fix: 'Inspect a smaller HTML document or reduce the response payload.',
    },
    DP_OG_0005: {
      why: 'A static Open Graph report requires a default URL to inspect.',
      fix: 'Pass `defaultUrl` to `createOgDevframe()` before running the build adapter.',
    },
  },
})
