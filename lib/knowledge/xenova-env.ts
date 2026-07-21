/**
 * Configure @xenova/transformers for Node/Vercel.
 *
 * Default package cache under node_modules is read-only on Vercel. Hugging Face
 * Xet CDN also 403s many serverless downloads. Vendored ONNX under
 * `models/transformers-cache` (committed + traced into the function) is the
 * production source of truth.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BUNDLED_CACHE = path.join(process.cwd(), 'models', 'transformers-cache')
const TMP_CACHE = path.join(os.tmpdir(), 'transformers-cache')

type XenovaEnv = {
  cacheDir: string | null
  allowLocalModels: boolean
  allowRemoteModels: boolean
}

let configured = false

function bundledReady(): boolean {
  return (
    fs.existsSync(
      path.join(
        BUNDLED_CACHE,
        'Xenova',
        'all-MiniLM-L6-v2',
        'onnx',
        'model_quantized.onnx'
      )
    ) &&
    fs.existsSync(
      path.join(
        BUNDLED_CACHE,
        'Xenova',
        'ms-marco-MiniLM-L-6-v2',
        'onnx',
        'model_quantized.onnx'
      )
    )
  )
}

export function transformersCacheDir(): string {
  if (bundledReady()) return BUNDLED_CACHE
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    fs.mkdirSync(TMP_CACHE, { recursive: true })
    return TMP_CACHE
  }
  fs.mkdirSync(BUNDLED_CACHE, { recursive: true })
  return BUNDLED_CACHE
}

export function configureXenovaEnv(env: XenovaEnv): void {
  env.cacheDir = transformersCacheDir()
  // FileCache keys are `Xenova/<model>/...` under cacheDir — do not also
  // scan package-local /models via allowLocalModels.
  env.allowLocalModels = false
  // Must stay true: hub-style from_pretrained() uses the remote path even
  // when files are already in cacheDir. Disabling both local+remote throws.
  env.allowRemoteModels = true
  configured = true
}

export function isXenovaEnvConfigured(): boolean {
  return configured
}
