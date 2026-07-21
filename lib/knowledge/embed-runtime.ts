/**
 * Xenova embed runtime — loads ONNX in-process.
 * Only dynamically imported when KNOWLEDGE_INFERENCE_WORKER is off.
 */
import { embedModelName, embedProvider } from './embed-meta'
import { configureXenovaEnv } from './xenova-env'

type FeaturePipeline = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: Float32Array | number[] }>

let xenovaPipeline: FeaturePipeline | null = null
/** Deduplicate concurrent cold loads (Fluid compute shares one instance). */
let xenovaPipelineLoad: Promise<FeaturePipeline> | null = null

async function getXenovaPipeline(): Promise<FeaturePipeline> {
  if (xenovaPipeline) return xenovaPipeline
  if (!xenovaPipelineLoad) {
    xenovaPipelineLoad = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      configureXenovaEnv(env)
      const pipe = (await pipeline(
        'feature-extraction',
        embedModelName()
      )) as FeaturePipeline
      xenovaPipeline = pipe
      return pipe
    })().catch((err) => {
      xenovaPipelineLoad = null
      throw err
    })
  }
  return xenovaPipelineLoad
}

export async function warmEmbedRuntime(): Promise<void> {
  await getXenovaPipeline()
}

export async function embedTextsRuntime(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  embedProvider()
  const extractor = await getXenovaPipeline()
  const vectors: number[][] = []
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true })
    vectors.push(Array.from(output.data as Float32Array))
  }
  return vectors
}

export async function embedQueryRuntime(query: string): Promise<number[]> {
  const [vector] = await embedTextsRuntime([query])
  return vector
}
