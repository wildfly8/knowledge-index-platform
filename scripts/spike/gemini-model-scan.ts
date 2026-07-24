import { loadEnvFiles } from '@/lib/env/load-env'

loadEnvFiles()

const models = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.5-flash-preview-05-20'
]

async function tryModel(model: string, key: string): Promise<void> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Say ok' }] }]
    })
  })
  const text = await res.text()
  const limits = [...text.matchAll(/limit: (\d+)/g)].map((m) => m[1])
  const preview = limits.length
    ? `limits=${limits.join(',')}`
    : res.ok
      ? 'OK'
      : text.slice(0, 120)
  console.log(`${model}: ${res.status} ${preview}`)
}

async function main(): Promise<void> {
  const key = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!key) throw new Error('GEMINI_API_KEY not set')
  for (const model of models) {
    await tryModel(model, key)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
