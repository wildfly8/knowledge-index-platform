import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { postgresUrl } from '@/lib/db/postgres-url'

let cached: NeonQueryFunction<false, false> | null = null

export function getSql(
  env: NodeJS.ProcessEnv = process.env
): NeonQueryFunction<false, false> {
  const url = postgresUrl(env)
  if (!url) {
    throw new Error('POSTGRES_URL (or DATABASE_URL) is required for persistence')
  }
  if (!cached) {
    cached = neon(url)
  }
  return cached
}

/** Test hook — reset cached client between tests. */
export function resetSqlCache(): void {
  cached = null
}
