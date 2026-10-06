/** A logo URL, or one per color scheme. Same shape as hub-ui's `BrandingLogo`. */
export type OnboardingLogo = string | { light: string, dark?: string }

/** The subset of hub-ui's `DevframeBranding` the two-button panel renders. */
export interface OnboardingBranding {
  /** Product name shown in the panel and used in the default strings. Default: `Devframes`. */
  productName?: string
  logo?: OnboardingLogo
  /** Primary accent as a CSS color; retints the pill glow and the primary button. */
  primaryColor?: string
}

/** Every string the panel renders. Defaults derive from `branding.productName`. */
export interface OnboardingMessages {
  /** Pill tooltip and panel heading. */
  title: string
  /** Short sentence under the heading. */
  description: string
  install: string
  /** Hides the button for this browser tab (`sessionStorage`). */
  hide: string
  /** Writes the state file; the host stops injecting the button. */
  disable: string
  installing: string
  /** Shown when the install finished and no hot swap happened. */
  restart: string
  retry: string
}

/** A web-standard request handler the hub exposes once installed. */
export type OnboardingHandler = (request: Request) => Response | Promise<Response>

export interface CreateOnboardingOptions {
  /** Packages to install when the user clicks Install. Package specs as the package manager accepts them. */
  packages: string[]
  /** Mount base. Default: the hub default `/__devframes/`. */
  base?: string
  /** Project directory the install runs in. Default: `process.cwd()`. */
  cwd?: string
  /** Directory of the `hub-ui-onboard.json` state file. Default: `<cwd>/node_modules/.devframe`. */
  stateDir?: string
  /** Install as a devDependency. Default: `true`. */
  dev?: boolean
  branding?: OnboardingBranding
  messages?: Partial<OnboardingMessages>
  /**
   * Called once the packages are installed and verified. Return a handler
   * to take over every request at `base` in this process; the floating
   * button then loads `<base>embedded.js` from it. Return nothing to ask the
   * user to restart the dev server.
   */
  onInstalled?: () => void | OnboardingHandler | Promise<void | OnboardingHandler>
}

export type OnboardingState = 'idle' | 'installing' | 'installed' | 'ready' | 'error' | 'disabled'

/** The `GET <base>__onboard/status` body. */
export interface OnboardingStatus {
  state: OnboardingState
  /** The exact command Install runs, for the panel's preview line. */
  command: string
  branding: OnboardingBranding
  messages: OnboardingMessages
  error?: { code: string, message: string }
}

export interface Onboarding {
  /** Web-standard handler for every request under `base`. */
  handler: OnboardingHandler
  /** Connect-style bridge for Node servers (Vite, Express, Fastify with middie). */
  nodeMiddleware: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: (err?: unknown) => void) => void
  /** `true` when the user disabled DevTools in an earlier session; skip injecting `scriptSrc`. */
  disabled: boolean
  /**
   * `true` when every named package was already in `node_modules` at
   * creation. `onInstalled` then runs on the first request, which already
   * reaches its handler; the button never shows.
   */
  installed: boolean
  /** `<base>embedded.js`: the `<script type="module">` URL to inject. */
  scriptSrc: string
}
