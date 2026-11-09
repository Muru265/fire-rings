// Check GEMINI_MODEL works; list available Flash models. Never prints the API key.
// Usage: npx tsx --env-file=../.env scripts/gemini_probe.ts
import { GoogleGenAI } from '@google/genai'

const key = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_MODEL
if (!key) throw new Error('GEMINI_API_KEY missing')
const ai = new GoogleGenAI({ apiKey: key })
const names: string[] = []
const pager = await ai.models.list()
for await (const m of pager) {
  if (m.name && /flash/i.test(m.name) && (m.supportedActions ?? []).includes('generateContent')) names.push(m.name.replace('models/', ''))
}
console.log('flash models:', names.join(', '))
console.log('GEMINI_MODEL =', model)
try {
  const r = await ai.models.generateContent({ model: model!, contents: 'Reply with the single word: ok' })
  console.log('GEMINI_MODEL works:', JSON.stringify(r.text?.trim()))
} catch (e) {
  console.log('GEMINI_MODEL failed:', (e as Error).message.slice(0, 200))
}
