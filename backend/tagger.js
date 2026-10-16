// backend/tagger.js
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

export const CATEGORIES = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory', 'other']
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const FIELDS = ['category', 'subType', 'color']

const TagSchema = z.object({
  category: z.enum(CATEGORIES),
  subType: z.string(),
  color: z.string(),
})

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

export function createTagger({ client, model = 'claude-haiku-5-5', timeoutMs = 8000 }) {
  async function tag(buffer, mimetype) {
    if (!SUPPORTED_MIME.has(mimetype)) {
      throw new Error(`Tagging not supported for ${mimetype}`)
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Image is too large to tag')
    }

    const response = await client.messages.parse(
      {
        model,
        max_tokens: 1024,
        output_config: { effort: 'low', format: zodOutputFormat(TagSchema) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimetype, data: buffer.toString('base64') } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      },
      // The SDK aborts the HTTP request itself, and never retries: one tag() = at most one request.
      { timeout: timeoutMs, maxRetries: 0 },
    )

    if (response.stop_reason === 'refusal') {
      throw new Error('Tagger refused the image')
    }
    return normalizeTags(response.parsed_output)
  }

  return { tag }
}
