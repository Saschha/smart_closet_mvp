import express from 'express'
import multer from 'multer'
import { isValidImageFile, isValidImageMime } from './validator.js'

// Keep uploads in memory so nothing is written to disk before validation passes.
const upload = multer({ storage: multer.memoryStorage() })

export function createApp({ store, uploadDir }) {
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
    const item = await store.add({ buffer: file.buffer, originalname: file.originalname, title, note, tags })
    res.status(201).json(item)
  })

  return app
}
