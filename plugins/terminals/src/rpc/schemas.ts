import * as v from 'valibot'

export const terminalModeSchema = v.picklist(['interactive', 'readonly'])

export const spawnRequestSchema = v.object({
  presetId: v.optional(v.string()),
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  cwd: v.optional(v.string()),
  mode: v.optional(terminalModeSchema),
  title: v.optional(v.string()),
  cols: v.optional(v.number()),
  rows: v.optional(v.number()),
  env: v.optional(v.record(v.string(), v.string())),
})

export const sessionInfoSchema = v.object({
  id: v.string(),
  title: v.string(),
  processName: v.optional(v.string()),
  customTitle: v.optional(v.string()),
  mode: terminalModeSchema,
  status: v.picklist(['running', 'exited', 'error']),
  backend: v.picklist(['pty', 'pipe']),
  command: v.string(),
  args: v.array(v.string()),
  cwd: v.string(),
  cols: v.number(),
  rows: v.number(),
  pid: v.optional(v.number()),
  exitCode: v.optional(v.number()),
  presetId: v.optional(v.string()),
  createdAt: v.number(),
})

export const presetSchema = v.object({
  id: v.string(),
  title: v.string(),
  command: v.string(),
  args: v.array(v.string()),
  mode: terminalModeSchema,
  icon: v.optional(v.string()),
})
