import { s } from 'devframe/utils/simple-schema'

const terminalModeSchema = s.picklist(['interactive', 'readonly'])

export const spawnRequestSchema = s.object({
  presetId: s.optional(s.string()),
  command: s.optional(s.string()),
  args: s.optional(s.array(s.string())),
  cwd: s.optional(s.string()),
  mode: s.optional(terminalModeSchema),
  title: s.optional(s.string()),
  cols: s.optional(s.number()),
  rows: s.optional(s.number()),
  env: s.optional(s.record(s.string(), s.string())),
})

export const sessionInfoSchema = s.object({
  id: s.string(),
  title: s.string(),
  processName: s.optional(s.string()),
  customTitle: s.optional(s.string()),
  mode: terminalModeSchema,
  status: s.picklist(['running', 'exited', 'error']),
  backend: s.picklist(['pty', 'pipe']),
  command: s.string(),
  args: s.array(s.string()),
  cwd: s.string(),
  cols: s.number(),
  rows: s.number(),
  pid: s.optional(s.number()),
  exitCode: s.optional(s.number()),
  icon: s.optional(s.string()),
  channel: s.optional(s.string()),
  presetId: s.optional(s.string()),
  createdAt: s.number(),
})

export const presetSchema = s.object({
  id: s.string(),
  title: s.string(),
  command: s.string(),
  args: s.array(s.string()),
  mode: terminalModeSchema,
  icon: s.optional(s.string()),
})
