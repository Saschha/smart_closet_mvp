import path from 'node:path'
import { createApp } from './app.js'
import { createWardrobeStore } from './wardrobeStore.js'

const PORT = process.env.PORT || 3000
const dataFile = path.join(import.meta.dirname, 'data', 'wardrobe.json')
const uploadDir = path.join(import.meta.dirname, 'uploads')

const store = createWardrobeStore({ dataFile, uploadDir })
const app = createApp({ store, uploadDir })

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`)
})
