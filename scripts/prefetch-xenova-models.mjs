/**
 * Ensure models/transformers-cache has embed + rerank ONNX for Vercel.
 *
 * Hugging Face Xet CDN currently 403s many automated downloads, so we:
 * 1) Prefer already-vendored files in models/transformers-cache
 * 2) Else copy from node_modules/@xenova/transformers/.cache (local prior downloads)
 * 3) Else try remote prefetch (may fail without HF_TOKEN / when Xet denies)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, 'models', 'transformers-cache')
const embedModel = process.env.EMBED_MODEL ?? 'Xenova/all-MiniLM-L6-v2'
const rerankModel = process.env.RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2'

function hasModel(modelId) {
  const onnx = path.join(cacheDir, modelId, 'onnx', 'model_quantized.onnx')
  return fs.existsSync(onnx)
}

function seedFromNodeModulesCache() {
  const srcRoot = path.join(
    root,
    'node_modules',
    '@xenova',
    'transformers',
    '.cache'
  )
  let copied = 0
  for (const modelId of [embedModel, rerankModel]) {
    if (hasModel(modelId)) continue
    const from = path.join(srcRoot, modelId)
    const to = path.join(cacheDir, modelId)
    if (!fs.existsSync(path.join(from, 'onnx', 'model_quantized.onnx'))) continue
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.cpSync(from, to, { recursive: true })
    copied++
    console.log(`[prefetch-xenova] seeded ${modelId} from node_modules cache`)
  }
  return copied
}

async function downloadViaTransformers() {
  const { pipeline, AutoTokenizer, AutoModelForSequenceClassification, env } =
    await import('@xenova/transformers')

  env.cacheDir = cacheDir
  env.allowLocalModels = false
  env.allowRemoteModels = true

  console.log(`[prefetch-xenova] downloading ${embedModel}`)
  const extractor = await pipeline('feature-extraction', embedModel)
  await extractor('warmup', { pooling: 'mean', normalize: true })

  console.log(`[prefetch-xenova] downloading ${rerankModel}`)
  const tokenizer = await AutoTokenizer.from_pretrained(rerankModel)
  const model = await AutoModelForSequenceClassification.from_pretrained(
    rerankModel
  )
  const inputs = await tokenizer(['warmup'], {
    text_pair: ['warmup passage'],
    padding: true,
    truncation: true,
    max_length: 64
  })
  await model(inputs)
}

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true })
  seedFromNodeModulesCache()

  if (hasModel(embedModel) && hasModel(rerankModel)) {
    console.log(`[prefetch-xenova] ready at ${cacheDir}`)
    return
  }

  console.log('[prefetch-xenova] missing models — attempting Hugging Face download')
  try {
    await downloadViaTransformers()
  } catch (err) {
    console.error('[prefetch-xenova] download failed:', err)
    if (process.env.VERCEL || process.env.PREFETCH_XENOVA_REQUIRED === '1') {
      process.exit(1)
    }
    console.warn(
      '[prefetch-xenova] continuing without full cache (non-Vercel). Chat needs local Xenova cache.'
    )
    process.exit(0)
  }

  if (!(hasModel(embedModel) && hasModel(rerankModel))) {
    console.error('[prefetch-xenova] models still missing after download')
    if (process.env.VERCEL || process.env.PREFETCH_XENOVA_REQUIRED === '1') {
      process.exit(1)
    }
  }
  console.log('[prefetch-xenova] done')
}

main().catch((err) => {
  console.error('[prefetch-xenova] failed:', err)
  process.exit(process.env.VERCEL ? 1 : 0)
})
