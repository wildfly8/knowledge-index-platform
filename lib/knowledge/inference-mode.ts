/**
 * When true, Xenova embed runs in a forked worker process so batch CLIs do not
 * share a V8 heap with ONNX models (avoids local OOM).
 *
 * Override:
 * - KNOWLEDGE_INFERENCE_WORKER=1 force worker
 * - KNOWLEDGE_INFERENCE_WORKER=0 force in-process (legacy / debugging)
 *
 * Default: worker for local Node; in-process on Vercel serverless.
 */
export function useKnowledgeInferenceWorker(): boolean {
  const flag = (process.env.KNOWLEDGE_INFERENCE_WORKER ?? '').toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off') return false
  if (flag === '1' || flag === 'true' || flag === 'on') return true
  if (process.env.VERCEL) return false
  if (process.env.NEXT_RUNTIME === 'edge') return false
  // Local Node CLI — isolate models from the parent heap.
  return true
}
