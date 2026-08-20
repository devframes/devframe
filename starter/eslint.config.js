// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'app',
    pnpm: true,
  },
  {
    // This starter is a self-contained, copy-paste-ready template — it
    // intentionally pins real versions instead of pnpm catalog references
    // (see the root AGENTS.md's "starter/" note), so the pnpm plugin's own
    // catalog-enforcement rule doesn't apply to its `package.json`.
    files: ['package.json'],
    rules: {
      'pnpm/json-enforce-catalog': 'off',
    },
  },
)
