import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { loadEnvFiles } from '@/lib/env/load-env'
import { postgresUrl } from '@/lib/db/postgres-url'

neonConfig.webSocketConstructor = ws

loadEnvFiles()

async function main(): Promise<void> {
  const url = postgresUrl()
  if (!url) {
    console.error('Set POSTGRES_URL or DATABASE_URL before running migrations.')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: url })
  const dir = path.join(process.cwd(), 'db', 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  for (const file of files) {
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1 LIMIT 1',
      [file]
    )
    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`skip ${file}`)
      continue
    }

    const body = readFileSync(path.join(dir, file), 'utf8')
    await pool.query(body)
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    console.log(`applied ${file}`)
  }

  await pool.end()
  console.log('db:migrate OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
