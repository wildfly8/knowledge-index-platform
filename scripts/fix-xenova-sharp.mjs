#!/usr/bin/env node
/**
 * @xenova/transformers pins sharp@0.32.x, which lacks win32-arm64 prebuilds.
 * Hoist to the root sharp@0.34.x by removing the nested copy after install.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const nested = path.join(
  'node_modules',
  '@xenova',
  'transformers',
  'node_modules',
  'sharp'
)

if (!existsSync(nested)) process.exit(0)

let version = '0.0.0'
try {
  version = JSON.parse(readFileSync(path.join(nested, 'package.json'), 'utf8')).version
} catch {
  process.exit(0)
}

// Nested sharp shadows root sharp@0.34 (win32-arm64). Remove any nested copy.
rmSync(nested, { recursive: true, force: true })
console.log(
  `[postinstall] Removed nested sharp@${version} from @xenova/transformers (use root sharp)`
)
