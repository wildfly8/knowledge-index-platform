import { loadEnvFiles } from '@/lib/env/load-env'

loadEnvFiles()

async function main(): Promise<void> {
  const key = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!key) {
    console.error('GEMINI_API_KEY not set')
    process.exit(1)
  }

  const model = (process.env.GEMINI_MODEL ?? 'gemini-2.0-flash').trim()
  console.log('key_format:', key.startsWith('AQ.') ? 'AQ auth key (new AI Studio)' : key.startsWith('AIza') ? 'AIza standard key' : 'unknown prefix')
  console.log('key_length:', key.length)
  console.log('model:', model)

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: ok' }] }]
    })
  })

  const text = await res.text()
  console.log('http_status:', res.status)

  try {
    const json = JSON.parse(text) as {
      error?: {
        code?: number
        message?: string
        status?: string
        details?: unknown[]
      }
    }
    if (json.error) {
      console.log('error_code:', json.error.code)
      console.log('error_status:', json.error.status)
      console.log('error_message:', json.error.message)
      const violations = JSON.stringify(json.error.details ?? [], null, 2)
      console.log('error_details:', violations.slice(0, 2000))
    } else {
      console.log('response_ok:', text.slice(0, 300))
    }
  } catch {
    console.log('raw_body:', text.slice(0, 500))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
