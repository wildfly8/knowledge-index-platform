#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const r = spawnSync(
  process.execPath,
  ['--import', 'tsx', path.join(dir, 'sync.ts'), ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: path.join(dir, '../..') }
)
process.exit(r.status ?? 1)
