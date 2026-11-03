// backend/geminiMatcher.js
import { Type } from '@google/genai'
import { z } from 'zod'

const SIMILARITIES = ['high', 'medium', 'low']

const PROMPT =
  'You help a shopper avoid buying clothes they already own. ' +
  'The first image is a NEW ITEM seen in a store. The following images are items already in their closet, ' +
  'each preceded by its id and title. Compare the new item with each closet item by cut, material and color. ' +
  'Only list closet items that are genuinely similar. For each one, give its exact id, a similarity of ' +
  'high, medium or low, and a short reason for cut, material and color. ' +
  'Set hasMatch to true only if matches is not empty.'

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hasMatch: { type: Type.BOOLEAN },
    matches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          similarity: { type: Type.STRING, enum: SIMILARITIES },
          reason: {
            type: Type.OBJECT,
            properties: {
              cut: { type: Type.STRING },
              material: { type: Type.STRING },
              color: { type: Type.STRING },
            },
            required: ['cut', 'material', 'color'],
          },
        },
        required: ['id', 'similarity', 'reason'],
      },
    },
  },
  required: ['hasMatch', 'matches'],
}

const ComparisonSchema = z.object({
  hasMatch: z.boolean(),
  matches: z.array(
    z.object({
      id: z.string(),
      similarity: z.enum(SIMILARITIES),
      reason: z.object({ cut: z.string(), material: z.string(), color: z.string() }),
    }),
  ),
})

function imagePart({ buffer, mimeType }) {
  return { inlineData: { mimeType, data: buffer.toString('base64') } }
}

function parseComparison(text, candidateIds) {
  let parsed
  try {
    parsed = ComparisonSchema.parse(JSON.parse(text))
  } catch (err) {
    throw new Error(`Gemini returned an invalid comparison: ${err.message}`, { cause: err })
  }
  // Ignore ids the model invented, and derive hasMatch so it always agrees with matches.
  const matches = parsed.matches.filter((match) => candidateIds.has(match.id))
  return { hasMatch: matches.length > 0, matches }
}

export function createGeminiMatcher({ client, model = 'gemini-3.8-flash', timeoutMs = 10000 }) {
  async function compareItem({ newItem, closetItems }) {
    if (!closetItems?.length) {
      return { hasMatch: false, matches: [] }
    }

    const parts = [{ text: PROMPT }, { text: 'NEW ITEM:' }, imagePart(newItem)]
    for (const item of closetItems) {
      parts.push({ text: `Closet item id="${item.id}" title="${item.title}"` }, imagePart(item))
    }

    const request = client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    })

    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Gemini comparison timed out after ${timeoutMs} ms`)),
        timeoutMs,
      )
    })

    let response
    try {
      response = await Promise.race([
        request.catch((err) => {
          throw new Error(`Gemini comparison failed: ${err.message}`, { cause: err })
        }),
        timeout,
      ])
    } finally {
      clearTimeout(timer)
    }

    return parseComparison(response.text, new Set(closetItems.map((item) => String(item.id))))
  }

  return { compareItem }
}
