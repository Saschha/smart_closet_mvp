import express from 'express'
import multer from 'multer'
import { isValidImageFile, isValidImageMime } from './validator.js'

// Keep uploads in memory so nothing is written to disk before validation passes.
const upload = multer({ storage: multer.memoryStorage() })

// Resolves to normalized tags, or null if tagging is disabled, fails or exceeds timeoutMs.
// Never rejects, so a tagging problem can't fail the save.
async function tagWithTimeout(tagger, file, timeoutMs) {
  if (!tagger) {
    return null
  }
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tagging timed out after ${timeoutMs} ms`)), timeoutMs)
  })
  try {
    return await Promise.race([tagger.tag(file.buffer, file.mimetype), timeout])
  } catch (err) {
    console.warn(`AI tagging skipped: ${err.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function createApp({ store, uploadDir, tagger, tagTimeoutMs = 8000 }) {
  const app = express()

  app.use(express.json())
  app.use('/uploads', express.static(uploadDir))

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/api/wardrobe', async (req, res) => {
    res.json(await store.list())
  })

  app.post('/api/wardrobe', upload.single('image'), async (req, res) => {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'No image provided' })
    }
    if (!isValidImageFile(file.originalname) || !isValidImageMime(file.mimetype)) {
      return res.status(415).json({ error: 'Unsupported format' })
    }
    if (file.size === 0) {
      return res.status(400).json({ error: 'Image is empty or unreadable' })
    }

    const { title, note, tags } = req.body
    const aiTags = await tagWithTimeout(tagger, file, tagTimeoutMs)
    const item = await store.add({ buffer: file.buffer, originalname: file.originalname, title, note, tags, aiTags })
    res.status(201).json(item)
  })

  return app
}
