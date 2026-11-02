import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { createApp } from './app.js'
import { createGeminiMatcher } from './geminiMatcher.js'
import { createTagger } from './tagger.js'
import { createWardrobeStore } from './wardrobeStore.js'

const PORT = process.env.PORT || 3000
const dataFile = path.join(import.meta.dirname, 'data', 'wardrobe.json')
const uploadDir = path.join(import.meta.dirname, 'uploads')

const store = createWardrobeStore({ dataFile, uploadDir })

let tagger
if (process.env.ANTHROPIC_API_KEY) {
  tagger = createTagger({ client: new Anthropic() })
} else {
  console.log('AI tagging disabled (ANTHROPIC_API_KEY is not set)')
}

let matcher
if (process.env.GEMINI_API_KEY) {
  matcher = createGeminiMatcher({ client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) })
} else {
  console.log('Visual comparison disabled (GEMINI_API_KEY is not set)')
}

const app = createApp({ store, uploadDir, tagger, matcher })

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
