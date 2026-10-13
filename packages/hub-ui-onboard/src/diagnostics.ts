import { createConsoleReporter, defineDiagnostics } from 'nostics'

/**
 * `DF90xx` is this package's range (see `.agents/08-diagnostics.md`). It
 * uses `nostics` directly: the package must stay free of `devframe` so a
 * host can ship it while devframe itself is not installed.
 */
export const diagnostics = defineDiagnostics({
  docsBase: 'https://devfra.me/errors',
  reporters: [createConsoleReporter()],
  codes: {
    DF9000: {
      why: '`createOnboarding()` received no packages to install.',
      fix: 'Pass at least one package spec in `packages`, for example `packages: [\'@nuxt/devtools\']`.',
    },
    DF9001: {
      why: (p: { command: string, exitCode: number | undefined, stderr: string }) => `\`${p.command}\` exited with code ${p.exitCode ?? 'unknown'}.${p.stderr ? `\n${p.stderr}` : ''}`,
      fix: 'Run the command in a terminal to see the package manager\'s full output, then click Install again.',
    },
    DF9002: {
      why: (p: { name: string, cwd: string }) => `The install finished, but "${p.name}" is not in ${p.cwd}/node_modules.`,
      fix: 'Make sure that `cwd` points at the project that should receive the dependency (in a workspace, the package that runs the dev server).',
    },
    DF9003: {
      why: (p: { reason: string }) => `\`onInstalled\` threw after the packages were installed: ${p.reason}`,
      fix: 'The packages are installed. Fix the error in your `onInstalled` callback, or restart the dev server to load them.',
    },
    DF9004: {
      why: (p: { file: string }) => `The onboarding state file ${p.file} could not be read or written.`,
      fix: 'Make sure that `stateDir` is writable, or point it at another directory.',
    },
  },
})
