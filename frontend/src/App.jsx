import { useEffect, useState } from 'react'

const ACCEPT = 'image/*,.dng,.cr2,.nef,.arw,.orf,.rw2,.raw'

// Used only when the server response has no JSON `error` field.
const FALLBACK_ERRORS = {
  400: 'Please choose a non-empty image to upload.',
  415: 'Unsupported format. Use JPG, PNG, WebP or a camera RAW file.',
}

const styles = {
  page: { maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: 10, fontSize: 16 },
  button: { padding: 12, fontSize: 16 },
  error: { color: '#b00020', margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: 0, listStyle: 'none' },
  thumb: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: '#eee' },
  tags: { fontSize: 12, color: '#555', margin: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 },
  safe: { color: '#1b5e20', fontWeight: 600, margin: 0 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, color: '#fff' },
  reason: { fontSize: 13, margin: '2px 0' },
}

const SIMILARITY_COLORS = { high: '#b00020', medium: '#e65100', low: '#757575' }

function App() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState(null)
  const [checkError, setCheckError] = useState('')

  async function loadItems() {
    const res = await fetch('/api/wardrobe')
    if (!res.ok) {
      throw new Error(`Could not load wardrobe (${res.status})`)
    }
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
    let res
    try {
      res = await fetch('/api/wardrobe', { method: 'POST', body: new FormData(form) })
    } catch {
      // Network failure: no response at all. Form contents stay as they are.
      setError('Could not reach the server. Check your connection and try again.')
      setSaving(false)
      return
    }

    try {
      const body = await res.json().catch(() => ({}))

      if (res.status === 201) {
        setItems((prev) => [body, ...prev])
        form.reset()
        return
      }

      // Failure branch: keep the form contents so the user can retry.
      setError(body.error || FALLBACK_ERRORS[res.status] || 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheck(event) {
    event.preventDefault()
    setCheckError('')
    setCheckResult(null)
    setChecking(true)
    try {
      let res
      try {
        res = await fetch('/api/check', { method: 'POST', body: new FormData(event.currentTarget) })
      } catch {
        setCheckError('Could not reach the server. Check your connection and try again.')
        return
      }
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setCheckResult(body)
      } else {
        setCheckError(body.error || 'Visual comparison failed')
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <main style={styles.page}>
      <h1>Smart Closet</h1>

      <section style={styles.section}>
        <h2 style={{ margin: 0 }}>Check an Item Before Buying</h2>
        <form style={styles.form} onSubmit={handleCheck}>
          <input
            style={styles.input}
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            required
          />
          <button style={styles.button} type="submit" disabled={checking}>
            {checking ? 'Comparing cut, material & color...' : 'Compare with my closet'}
          </button>
        </form>

        {checkError && <p style={styles.error}>{checkError}</p>}

        {checkResult && !checkResult.hasMatch && (
          <p style={styles.safe}>No similar items found in your closet! Safe to buy.</p>
        )}

        {checkResult?.hasMatch && (
          <ul style={styles.grid}>
            {checkResult.matches.map((match) => {
              const item = items.find((i) => i.id === match.id)
              return (
                <li key={match.id}>
                  {item && <img style={styles.thumb} src={item.filepath} alt={item.title || 'Closet item'} />}
                  <strong>{item?.title || 'Untitled'}</strong>{' '}
                  <span style={{ ...styles.badge, background: SIMILARITY_COLORS[match.similarity] }}>
                    {match.similarity}
                  </span>
                  <p style={styles.reason}><b>Cut:</b> {match.reason.cut}</p>
                  <p style={styles.reason}><b>Material:</b> {match.reason.material}</p>
                  <p style={styles.reason}><b>Color:</b> {match.reason.color}</p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <form style={styles.form} onSubmit={handleSubmit}>
        <input style={styles.input} type="file" name="image" accept={ACCEPT} required />
        <input style={styles.input} type="text" name="title" placeholder="Title (optional)" />
        <textarea style={styles.input} name="note" placeholder="Note (optional)" rows={2} />
        <input style={styles.input} type="text" name="tags" placeholder="Tags, comma-separated (optional)" />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={saving}>
          {saving ? 'Saving & tagging…' : 'Save to wardrobe'}
        </button>
      </form>

      <h2>My wardrobe ({items.length})</h2>
      <ul style={styles.grid}>
        {items.map((item) => (
          <li key={item.id}>
            <img style={styles.thumb} src={item.filepath} alt={item.title || 'Wardrobe item'} />
            <strong>{item.title || 'Untitled'}</strong>
            {item.tags.length > 0 && <p style={styles.tags}>{item.tags.join(', ')}</p>}
            {item.aiTags && (
              <p style={styles.tags}>
                {item.aiTags.category} · {item.aiTags.subType} · {item.aiTags.color}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
