import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** Load `.env.local` / `.env` for standalone CLI scripts (tsx). */
export function loadEnvFiles(root = process.cwd()): void {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(root, name)
    if (!existsSync(filePath)) continue
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

export function vectorRestUrl(): string | undefined {
  return (
    process.env.UPSTASH_VECTOR_REST_URL ??
    process.env.RAG_UPSTASH_VECTOR_REST_URL
  )
}

export function vectorRestToken(): string | undefined {
  return (
    process.env.UPSTASH_VECTOR_REST_TOKEN ??
    process.env.RAG_UPSTASH_VECTOR_REST_TOKEN
  )
}
