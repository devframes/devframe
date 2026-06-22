import { cpSync, rmSync } from 'node:fs'

rmSync('dist/client', { recursive: true, force: true })
cpSync('src/client/out', 'dist/client', { recursive: true })
