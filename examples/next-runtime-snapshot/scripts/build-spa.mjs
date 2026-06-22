import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist/client', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })
cpSync('src/client/out', 'dist/client', { recursive: true })
