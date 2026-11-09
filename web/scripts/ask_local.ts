// Local data loader + model list for scripts that run the Ask core outside Vercel.
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FALLBACK_MODELS } from '../api/_lib/core.js'

const here = dirname(fileURLToPath(import.meta.url))
export const DATA = resolve(here, '../public/data/v1')
export const load = async (p: string) => JSON.parse(await readFile(resolve(DATA, p), 'utf-8'))
export const models = [...new Set([process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean) as string[])]
export const apiKey = () => {
  const k = process.env.GEMINI_API_KEY
  if (!k) throw new Error('GEMINI_API_KEY missing (run with --env-file=../.env)')
  return k
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
