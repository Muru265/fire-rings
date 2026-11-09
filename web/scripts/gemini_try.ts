// Try a minimal function-calling request on several models. Usage: npx tsx --env-file=../.env scripts/gemini_try.ts
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 25000 } })
const models = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest']
for (const model of models) {
  const t0 = Date.now()
  try {
    const r = await ai.models.generateContent({
      model, contents: 'What regions are available?',
      config: { tools: [{ functionDeclarations: [{ name: 'list_regions', description: 'List regions', parameters: { type: 'object' as never, properties: {} } }] }] },
    })
    console.log(`${model}: OK ${((Date.now() - t0) / 1000).toFixed(1)}s calls=${JSON.stringify(r.functionCalls?.map((c) => c.name))}`)
  } catch (e) {
    console.log(`${model}: ${((Date.now() - t0) / 1000).toFixed(1)}s ${(e as Error).message.slice(0, 90)}`)
  }
}
