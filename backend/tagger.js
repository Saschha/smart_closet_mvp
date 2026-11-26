// backend/tagger.js
import { Type } from '@google/genai'

export const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'other']
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const FIELDS = ['category', 'subType', 'color']

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, enum: CATEGORIES },
    subType: { type: Type.STRING },
    color: { type: Type.STRING },
  },
  required: ['category', 'subType', 'color'],
}

const PROMPT =
  'Describe the main garment in this photo. ' +
  'category: the closest of ' + CATEGORIES.join(', ') + '. ' +
  'subType: a short garment type, e.g. "button-down shirt". ' +
  'color: its main color, e.g. "light blue".'

export function normalizeTags(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Tagger returned no tags')
  }
  const keys = Object.keys(raw).sort()
  if (keys.join(',') !== [...FIELDS].sort().join(',')) {
    throw new Error('Tagger returned unexpected fields')
  }
  const tags = {}
  for (const field of FIELDS) {
    const value = String(raw[field] ?? '').trim().toLowerCase()
    if (!value) {
      throw new Error(`Tagger returned an empty ${field}`)
    }
    tags[field] = value
  }
  if (!CATEGORIES.includes(tags.category)) {
    throw new Error(`Tagger returned an unknown category: ${tags.category}`)
  }
  return tags
}

export function createTagger({ client, model = 'gemini-3.5-flash', timeoutMs = 15000 }) {
  async function tag(buffer, mimetype) {
    if (!SUPPORTED_MIME.has(mimetype)) {
      throw new Error(`Tagging not supported for ${mimetype}`)
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Image is too large to tag')
    }

    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: mimetype, data: buffer.toString('base64') } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // The SDK aborts the HTTP request itself after timeoutMs.
        httpOptions: { timeout: timeoutMs },
      },
    })

    // A blocked or empty response has no text; JSON.parse then throws too.
    let raw
    try {
      raw = JSON.parse(response.text)
    } catch (err) {
      throw new Error(`Tagger returned invalid JSON: ${err.message}`, { cause: err })
    }
    return normalizeTags(raw)
  }

  return { tag }
}
