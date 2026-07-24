import { loadEnvFiles } from '@/lib/env/load-env'
import { completeWithGemini } from '@/lib/chat/llm/gemini'

loadEnvFiles()

async function main(): Promise<void> {
  const key = (process.env.GEMINI_API_KEY ?? '').trim()
  if (!key) {
    console.error('FAIL: GEMINI_API_KEY not set')
    process.exit(1)
  }

  try {
    const result = await completeWithGemini(
      { messages: [{ role: 'user', content: 'Say hello in one word.' }] },
      { apiKey: key }
    )
    console.log(`OK provider=${result.provider} model=${result.model} text=${result.text}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`FAIL: ${message.slice(0, 500)}`)
    process.exit(1)
  }
}

main()
