import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const pkgRoot = fileURLToPath(new URL('../', import.meta.url))

/**
 * `devframe/types` is imported by config-surface packages (e.g.
 * `@vitejs/devtools/config`), so its declaration graph must typecheck in a
 * plain Node compilation: ES lib + `@types/node`, no DOM/Bun/Cloudflare libs,
 * with `skipLibCheck: false` (how vitejs/vite's CI checks it). A `crossws`
 * type import anywhere in the graph breaks that, since crossws's
 * declarations require all three.
 */
describe('devframe/types lib-neutrality', () => {
  it('typechecks with lib ES2022 + @types/node only, skipLibCheck: false', () => {
    const options: ts.CompilerOptions = {
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      lib: ['lib.es2022.d.ts'],
      types: ['node'],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    }
    const host = ts.createCompilerHost(options)
    host.getCurrentDirectory = () => pkgRoot
    const program = ts.createProgram(
      [resolve(pkgRoot, 'dist/types/index.d.mts')],
      options,
      host,
    )
    const diagnostics = ts.getPreEmitDiagnostics(program)
    expect(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: f => f,
      getCurrentDirectory: () => pkgRoot,
      getNewLine: () => '\n',
    })).toBe('')
  })
})
