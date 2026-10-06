import { useEffect, useState } from 'react'

const ACCEPT = 'image/*,.dng,.cr2,.nef,.arw,.orf,.rw2,.raw'

const styles = {
  page: { maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: 10, fontSize: 16 },
  button: { padding: 12, fontSize: 16 },
  error: { color: '#b00020', margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: 0, listStyle: 'none' },
  thumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: '#eee' },
  tags: { fontSize: 12, color: '#555', margin: 0 },
}

function App() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadItems() {
    const res = await fetch('/api/wardrobe')
    setItems(await res.json())
  }

  useEffect(() => {
    loadItems().catch(() => setError('Could not load wardrobe'))
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/wardrobe', { method: 'POST', body: new FormData(form) })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'Upload failed')
        return
      }
      form.reset()
      await loadItems()
    } catch {
      setError('Upload failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={styles.page}>
      <h1>Smart Closet</h1>

      <form style={styles.form} onSubmit={handleSubmit}>
        <input style={styles.input} type="file" name="image" accept={ACCEPT} required />
        <input style={styles.input} type="text" name="title" placeholder="Title (optional)" />
        <textarea style={styles.input} name="note" placeholder="Note (optional)" rows={2} />
        <input style={styles.input} type="text" name="tags" placeholder="Tags, comma-separated (optional)" />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save to wardrobe'}
        </button>
      </form>

      <h2>My wardrobe ({items.length})</h2>
      <ul style={styles.grid}>
        {items.map((item) => (
          <li key={item.id}>
            <img style={styles.thumb} src={item.filepath} alt={item.title || 'Wardrobe item'} />
            <strong>{item.title || 'Untitled'}</strong>
            {item.tags.length > 0 && <p style={styles.tags}>{item.tags.join(', ')}</p>}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
