import { useKnowledgeInferenceWorker } from './inference-mode'
import {
  contentHash,
  estimateTokens,
  embedProvider,
  embedModelName,
  embedDimension,
  DEFAULT_EMBED_PROVIDER,
  XENOVA_MODEL,
  XENOVA_DIMENSION
} from './embed-meta'

export {
  contentHash,
  estimateTokens,
  embedProvider,
  embedModelName,
  embedDimension,
  DEFAULT_EMBED_PROVIDER,
  XENOVA_MODEL,
  XENOVA_DIMENSION
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  embedProvider()
  if (useKnowledgeInferenceWorker()) {
    const { workerEmbedTexts } = await import('./inference-bridge')
    return workerEmbedTexts(texts)
  }
  const { embedTextsRuntime } = await import('./embed-runtime')
  return embedTextsRuntime(texts)
}

export async function embedQuery(query: string): Promise<number[]> {
  if (useKnowledgeInferenceWorker()) {
    const { workerEmbedTexts } = await import('./inference-bridge')
    const [vector] = await workerEmbedTexts([query])
    return vector
  }
  const { embedQueryRuntime } = await import('./embed-runtime')
  return embedQueryRuntime(query)
}
