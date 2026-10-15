# Specification: Auto-tag wardrobe items (Task 2)

## 1. Feature description
- **What it does:** when a wardrobe photo is saved, the backend asks a vision model (Claude Haiku 5.5) for the garment's `category`, `subType` and `color`. It stores these as `aiTags` on the item's record and returns them in the save response. The wardrobe grid shows them.
- **What it leaves alone:** the upload validation from Task 1, and the manual `title`/`note`/`tags` fields. No comparison logic, no tag editing.

## 2. User flow
1. The user picks or takes a photo, optionally fills in title, note and tags, and taps **Save to wardrobe** (same as Task 1).
2. The button shows **"Saving & tagging…"** and stays disabled. This normally takes a few seconds and at most about 8 s.
3. On success, the form resets and the new item appears at the top of the grid with its AI tags, e.g. *"top · button-down shirt · light blue"*, under the manual tags.
4. If tagging failed or timed out, the item still appears, with no AI tag line. No error message is shown, because the save itself succeeded.
5. Validation errors (415/400) and server errors (500) behave exactly as in Task 1.

## 3. Interface

### API: `POST /api/wardrobe` (request unchanged)
- Same multipart fields: `image` (required), plus optional `title`, `note`, `tags`.
- **201 response, one field added:**
  ```json
  { "id": "…", "filename": "…", "filepath": "/uploads/….jpg", "title": "…", "note": "…",
    "tags": ["summer"], "aiTags": { "category": "top", "subType": "button-down shirt", "color": "light blue" },
    "createdAt": "…" }
  ```
- `aiTags` is either an object with exactly three non-empty, trimmed, lowercase strings (`category`, `subType`, `color`), or `null` (tagging failed, timed out, was skipped, is disabled, or the model's reply didn't pass normalization; see §4 `tagger.js`).
- Error responses (400/415/500) are unchanged.

### API: `GET /api/wardrobe`
- Items include `aiTags`. Items saved before Task 2 have no `aiTags` field. Clients treat a missing field the same as `null`. No data migration.

### Data: `backend/data/wardrobe.json` record
- New field `aiTags: { category, subType, color } | null`, stored next to `filepath`. `tags` (manual) stays a separate field.
- `category` is one of a small flat set: `top`, `bottom`, `dress`, `outerwear`, `shoes`, `accessory`, `other`. `subType` and `color` are free text from the model.

## 4. Backend changes
| File | Change |
|---|---|
| `backend/tagger.js` (new) | `createTagger({ client, model = 'claude-haiku-5-5', timeoutMs = 8000 })` returns `{ tag(buffer, mimetype) }`. See the details below. |
| `backend/app.js` | `createApp({ store, uploadDir, tagger, tagTimeoutMs = 8000 })`. After the existing validation and before `store.add`, it runs `tagger.tag(file.buffer, file.mimetype)` raced against a `tagTimeoutMs` timer, inside `try/catch`. The timer is cleared (`clearTimeout`) as soon as tagging settles, success or failure, so no timer stays pending after the response. On any failure it logs `console.warn` (error message only, never request headers or the key) and uses `aiTags = null`. If no `tagger` is passed, tagging is skipped. |
| `backend/wardrobeStore.js` | `add({ …, aiTags = null })` and the record gets `aiTags`. |
| `backend/index.js` | If `ANTHROPIC_API_KEY` is set, build `new Anthropic()` and `createTagger({ client })`. Otherwise log "AI tagging disabled" and pass no tagger. |
| `backend/package.json` | Add dependencies `@anthropic-ai/sdk` and `zod`. Change the `dev` script to `node --env-file-if-exists=.env --watch index.js` so a local `backend/.env` file is loaded (Node ≥ 22.9; the project uses 22.22). `start` is unchanged. |
| Docs | `docs/boundary-upload.md`: add `aiTags` to the 201 response (done together with this spec). `spec.md` (Task 1): add `aiTags` to the stored item shape in §2 Output when Task 2 is implemented. |

**`tagger.js` details**
- **Supported MIME types:** only `image/jpeg`, `image/png` and `image/webp`. Anything else (camera RAW, `application/octet-stream`, other `image/*` types the validator lets through) makes `tag()` throw before any API call.
- **Size check:** if `buffer.length` is over 5 MB (5 × 1024 × 1024 bytes), `tag()` throws before any API call (the vision API's per-image limit).
- **Request:** one `client.messages.parse` call with `model`, `max_tokens: 1024`, `output_config: { effort: 'low', format: zodOutputFormat(schema) }`, and a user message holding a base64 image block (`media_type` = the upload's MIME type) plus a short instruction to describe the main garment. Request options: `{ timeout: timeoutMs, maxRetries: 0 }`, so the SDK itself gives up after 8 s and never retries. One `tag()` call therefore means at most one HTTP request.
- **Schema:** `category` is an enum of the seven values in §3; `subType` and `color` are strings.
- **Normalization (strict):** trim and lowercase all three values. If `category` isn't one of the seven values after this, or `subType`/`color` is empty, or the object has missing or extra fields, `tag()` throws, so the item gets `aiTags: null`.
- **Throws on:** `stop_reason === 'refusal'`, null `parsed_output`, failed normalization, unsupported MIME type, too-large image, or any SDK error (timeout, 4xx, 5xx, network).

The timeout exists in two places on purpose. The SDK `timeout` stops the real HTTP request, so nothing keeps running or costing money after the response is sent. The `app.js` timer guarantees the response time for any tagger, and lets tests prove it with a fake tagger that never resolves.

## 5. Frontend changes (`frontend/src/App.jsx`)
- Saving button label: `'Saving…'` becomes `'Saving & tagging…'`.
- Grid item: when `item.aiTags` is set, render one line `category · subType · color` (reusing `styles.tags`). Old items without `aiTags` don't crash; use `item.aiTags?.…`.
- No new state, no polling, and no change to the error handling in `handleSubmit`.

## 6. Error cases
| Case | Result |
|---|---|
| Validation fails (no file, wrong format, 0 bytes) | Unchanged: 400/415, nothing saved, **tagger not called**. |
| No API key configured | Item saved, `aiTags: null`, one startup log line. |
| AI API error (401, 429, 5xx, network) | Item saved, `aiTags: null`, `console.warn`. |
| AI call exceeds 8 s | The SDK aborts the HTTP request (no retry). Item saved, `aiTags: null`, the response is sent after about 8 s. |
| Model refuses, or returns output that fails parsing or normalization (unknown category, empty value, wrong fields) | Item saved, `aiTags: null`. |
| Camera RAW, `application/octet-stream`, or any type other than jpeg/png/webp | Tagging skipped, no API call. Item saved, `aiTags: null`. |
| Image larger than 5 MB | Tagging skipped, no API call. Item saved, `aiTags: null`. (Task 1 has no upload size limit, so this can happen with large phone photos.) |
| Photo isn't clothing | Model returns `category: "other"`, which is saved as-is. |
| Disk write fails | Unchanged from Task 1 (500). |

## 7. Acceptance criteria
- [ ] When tagging is enabled, each valid JPEG/PNG/WebP upload of 5 MB or less calls `tagger.tag()` exactly once, and that makes at most one API request (no retries).
- [ ] `aiTags` (`category`, `subType`, `color`) is saved in the item's record next to `filepath`, and returned in the 201 response and in `GET /api/wardrobe`.
- [ ] If tagging fails, times out, is skipped, or is disabled, the photo and record are still saved (201) with `aiTags: null`, and the user sees no error.
- [ ] Saving never waits longer than the tagging timeout (8 s) plus the normal save time.
- [ ] Invalid uploads never trigger a tagging call.
- [ ] The grid shows AI tags when present, and old items without `aiTags` still render.
- [ ] All existing Task 1 tests still pass.

## 8. Tests (`npm test`, `node --test`, no real API calls)
- **`backend/tagger.test.js` (new, fake `client` object):**
  - A valid parsed output returns `{ category, subType, color }`.
  - Sends `model: 'claude-haiku-5-5'` and a base64 image block with the right `media_type`.
  - Sends `max_tokens: 1024`, `output_config.effort: 'low'`, and request options `{ timeout: 8000, maxRetries: 0 }`.
  - Normalization: `{ category: ' Top ', subType: 'Button-Down Shirt', color: 'LIGHT BLUE ' }` becomes `{ category: 'top', subType: 'button-down shirt', color: 'light blue' }`.
  - Throws on an unknown category, an empty `subType`/`color`, or a missing or extra field.
  - `stop_reason: 'refusal'` throws, and `parsed_output: null` throws.
  - `application/octet-stream` and `image/gif` throw without calling the client.
  - A buffer over 5 MB throws without calling the client.
- **`backend/app.test.js` (new cases, fake tagger):**
  - Success: 201, `aiTags` in the response, and the same `aiTags` in `GET /api/wardrobe`.
  - Tagger throws: 201, `aiTags: null`, the image file exists on disk.
  - Tagger never resolves (`tagTimeoutMs: 50`): 201 with `aiTags: null` within ~1 s.
  - Tagger resolves quickly: the test run doesn't stay open waiting for the 8 s timer (the timer was cleared).
  - No tagger passed: 201, `aiTags: null` (the existing Check 1 keeps working).
  - Invalid upload: 415, and the tagger spy was called 0 times.
- **`backend/wardrobeStore.test.js`:** `aiTags` is persisted, and defaults to `null` when not given.
- **Manual check (real API):** put `ANTHROPIC_API_KEY=…` in `backend/.env` (or export it in the shell), run `./run.sh`, upload a real shirt photo, see tags in the grid and in `backend/data/wardrobe.json`, and note how long the save took (this feeds the ADR "I checked" line). Then restart without the key, upload again, and confirm the item is saved with no tags.

## 9. Assumptions
- The API key comes from the `ANTHROPIC_API_KEY` environment variable. For local dev it can live in `backend/.env`, which the `dev` script loads with `--env-file-if-exists` (the app starts without that file too). `.env` is already in `.gitignore` and is never committed. `npm start` doesn't load `.env`; there the variable must be exported.
- A single flat `category` list is good enough for later candidate filtering. Colors are free text (only trimmed and lowercased, not mapped to a fixed palette).
- Test photos are 5 MB or smaller. Larger photos are saved without tags; resizing them is out of scope.
- An 8 s worst-case wait on save is acceptable for the MVP (see ADR 001 "I'll reconsider if").
- Haiku 5.5 is accurate enough for category and color. This will be checked manually on real photos.
- Sending wardrobe photos to the Anthropic API is acceptable for this local MVP (it's a single user, with no other privacy requirements).
- Frontend tag display is a small addition so criterion 2 is visible. It can be dropped if you want a backend-only ticket.

## 10. Out of scope
- Manual tag editing UI, and any change to the manual `tags` field.
- Hierarchical taxonomy, mapping colors to a fixed palette, multiple garments per photo.
- Resizing or compressing photos so that images over 5 MB can be tagged.
- Background/async tagging, retries, re-tagging existing items, batch jobs (ADR Option B).
- Converting camera RAW files so they can be tagged.
- Using the tags for comparison or filtering (Tasks 3/5).
- The Task 1 gaps listed in `docs/boundary-upload.md` (5 MB limit, JSON 500 handler).

