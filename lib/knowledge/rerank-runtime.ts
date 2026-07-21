/** Xenova cross-encoder runtime — ONNX in-process only. */
import { rerankModelName } from './rerank-meta'
import { configureXenovaEnv } from './xenova-env'

type CrossEncoderTokenizer = (
  text: string | string[],
  options: {
    text_pair: string | string[]
    padding: boolean
    truncation: boolean
    max_length: number
  }
) => Promise<Record<string, unknown>>

type CrossEncoderModel = (inputs: Record<string, unknown>) => Promise<{
  logits: { data: Float32Array | number[] }
}>

let rerankTokenizer: CrossEncoderTokenizer | null = null
let rerankModel: CrossEncoderModel | null = null
/** Deduplicate concurrent cold loads (Fluid compute shares one instance). */
let rerankLoad: Promise<{
  tokenizer: CrossEncoderTokenizer
  model: CrossEncoderModel
}> | null = null

async function getReranker(): Promise<{
  tokenizer: CrossEncoderTokenizer
  model: CrossEncoderModel
}> {
  if (rerankTokenizer && rerankModel) {
    return { tokenizer: rerankTokenizer, model: rerankModel }
  }
  if (!rerankLoad) {
    rerankLoad = (async () => {
      const { AutoTokenizer, AutoModelForSequenceClassification, env } =
        await import('@xenova/transformers')
      configureXenovaEnv(env)
      const modelName = rerankModelName()
      const tokenizer = (await AutoTokenizer.from_pretrained(
        modelName
      )) as CrossEncoderTokenizer
      const model = (await AutoModelForSequenceClassification.from_pretrained(
        modelName
      )) as CrossEncoderModel
      rerankTokenizer = tokenizer
      rerankModel = model
      return { tokenizer, model }
    })().catch((err) => {
      rerankLoad = null
      throw err
    })
  }
  return rerankLoad
}

export async function warmRerankRuntime(): Promise<void> {
  await getReranker()
}

export async function scoreQueryPassagePairsRuntime(
  query: string,
  passages: string[]
): Promise<number[]> {
  if (passages.length === 0) return []
  const { tokenizer, model } = await getReranker()
  const queries = passages.map(() => query)
  const inputs = await tokenizer(queries, {
    text_pair: passages,
    padding: true,
    truncation: true,
    max_length: 512
  })
  const outputs = await model(inputs)
  const logits = outputs.logits.data
  const scores: number[] = []
  for (let i = 0; i < passages.length; i++) {
    scores.push(Number(logits[i]))
  }
  return scores
}
