# Architecture Audit: smart-closet-mvp

**Date:** 2026-10-29 · **Audited state:** `main` at `b82c9c9`

**Status note:** at audit time the Vitest migration and 80% coverage gate were on the unmerged branch `chore/vitest-coverage`. That branch was cleaned up the same day so it only holds the migration. The lockfile and `.npmrc` update moved to `chore/deps-npmrc`. The scratch script and sample photos were moved off GitHub to a local-only branch.

**Corrections to common assumptions:**
- **BUG-001 is already fixed** (commit `b82c9c9`, ticket marked "Fixed 2026-10-20").
- **`main` has 29 tests**, and they all pass. They run on Node's built-in runner.

---

## 1. Executive overview

**Purpose.** Smart Closet helps you avoid buying clothes you already own. You photograph your wardrobe once; the app stores the photos and AI tags each one (category, garment type, color). Later, in a shop, you photograph a new item and the app tells you whether you already have something similar, with reasons about cut, material and color.

**Where it stands.** Task 1 (save wardrobe photos) and Task 2 (AI auto-tagging) are done. Tasks 3, 5 and 6 (the in-store check, the AI comparison and the results screen) aren't started. The app can fill your closet but can't yet answer "do I own this?".

| Layer | Choice | Why |
|---|---|---|
| Language | Plain JS with ES Modules, no TypeScript | CLAUDE.md rule: keep it simple and readable |
| Backend | Node 22 + Express 5, port 3000 | Small HTTP API. Express 5 passes async errors on by itself, so no try/catch is needed in routes |
| Upload parsing | Multer, in memory | Validation runs before anything touches the disk |
| Storage | Image files in `backend/uploads/` + a JSON file `backend/data/wardrobe.json` | Zero setup for a single-user MVP. `spec.md` leaves the door open to SQLite |
| AI | Anthropic SDK, `claude-haiku-5-5`, structured output via zod | Cheapest, fastest model for a simple tagging job (ADR-001) |
| Frontend | React 19 + Vite 8, port 5173; Vite forwards `/api` and `/uploads` to the backend | Fast development; mobile-first single page |
| Tests | `node --test` on `main` (Vitest on `chore/vitest-coverage`) | No dependency needed. Each module takes its dependencies as parameters, so tests pass in fakes |

---

## 2. File by file

**Root**
- `README.md`: product pitch, list of P0 tasks, folder layout. It lists Tasks 1, 3, 5 and 6 but leaves out Task 2, which is already done.
- `CLAUDE.md`: stack, commands, and the "Lesson 5" rules (you decide, keep scope tight, verify everything).
- `spec.md`: Task 1 spec: formats, metadata, quality checks, three Given/When/Then checks.
- `package.json`: only the `test` script, which runs the backend tests.
- `run.sh`: installs dependencies if missing, then starts both dev servers. One Ctrl+C stops both.
- `.gitignore`: also ignores `backend/data/`, `backend/uploads/` and `.env`, so user photos and API keys stay out of git.

**docs/**
- `boundary-upload.md`: the frontend⇄backend contract for `POST /api/wardrobe`. It has a sequence diagram and lists three known gaps (no 5 MB limit, HTML 500 page, half-written save).
- `adr-001-ai-tagging.md`: why tagging happens inside the save request with an 8-second timeout, instead of in the background. It also says when to reconsider.
- `spec-task2-ai-tagging.md`: Task 2 spec: tagger behavior, error table, acceptance criteria, test list.
- `backlog/bug-001-concurrent-wardrobe-writes.md`: the bug ticket for records lost during simultaneous saves, with reproduction and verification tables. Status: fixed.
- `architecture-audit.md`: this document.

**backend/**
- `index.js`: the composition root. It builds the store, creates the tagger only if `ANTHROPIC_API_KEY` is set, and starts the server. It's the only file that touches environment variables and real paths.
- `app.js`: `createApp({ store, uploadDir, tagger, tagTimeoutMs })`. It defines three routes, plus static serving of `/uploads`:
  - `GET /api/health`
  - `GET /api/wardrobe`
  - `POST /api/wardrobe`
  - `tagWithTimeout` races the tagger against a timer and never fails the save.
- `validator.js`: `isValidImageFile` checks the file extension against an allow-list; `isValidImageMime` accepts any `image/*` type or `application/octet-stream`.
- `wardrobeStore.js`: `createWardrobeStore({ dataFile, uploadDir })` returns `{ list, add }`. Saves are queued one at a time and written atomically (temp file, then rename). It cleans up user tags and returns the newest items first.
- `tagger.js`: `createTagger({ client, model, timeoutMs })` returns `{ tag(buffer, mimetype) }`. It only accepts jpeg, png and webp up to 5 MB. Each call makes one API request with no retries, uses zod structured output, and checks the reply strictly (seven allowed categories, lowercase, no missing or extra fields).
- `*.test.js`: 29 tests that use fakes and temp directories and never call the real API.

  | File | Tests |
  |---|---|
  | `app.test.js` | 12 |
  | `tagger.test.js` | 7 |
  | `wardrobeStore.test.js` | 6 |
  | `validator.test.js` | 4 |

- `data/` and `uploads/`: live local data, ignored by git.

**frontend/**
- `index.html`, `src/main.jsx`: page shell and React root (StrictMode).
- `src/App.jsx`: the whole UI in one component: upload form, error line, wardrobe grid with manual tags and AI tags. It handles 201, the 400/415 messages and network failure.
- `vite.config.js`: forwards `/api` and `/uploads` to port 3000, so there are no cross-origin issues in development.

---

## 3. The frontend⇄backend contract

**Load the page.** `App` loads and calls `GET /api/wardrobe`, which returns the saved items, newest first. On any failure the page shows "Could not load wardrobe".

**Save an item:**
1. The user picks a photo, optionally fills in title, note and tags, and submits. `App.jsx` sends the form as `multipart/form-data` to `POST /api/wardrobe`.
2. Multer reads the file into memory. Nothing is on disk yet.
3. The backend checks, in this order:
   - no file: **400** "No image provided"
   - bad extension or file type: **415** "Unsupported format"
   - 0 bytes: **400** "Image is empty or unreadable"

   On any of these, nothing is written and the tagger isn't called.
4. `tagWithTimeout` calls Claude with the image (8-second limit in both the SDK and the app). On success it gets `{category, subType, color}`. On error, timeout, refusal, unsupported type or a file over 5 MB, it gets `aiTags: null`, logs a warning, and **the save still goes ahead**.
5. `store.add` writes `uploads/<uuid>.<ext>`, then appends the record to `wardrobe.json` through the queued, atomic write.
6. **201** returns the item. `App` puts it at the top of the grid and clears the form.

**How each failure reaches the user:**

| Case | Backend | Frontend |
|---|---|---|
| Validation fails | 400/415 with `{error}` | Shows `body.error`, keeps the form |
| Tagging fails or times out | Still **201**, `aiTags: null` | Item shows without an AI-tag line, no error |
| Disk or JSON failure | **500 as an HTML page** (no error handler) | `res.json()` fails, so it shows "Upload failed" |
| Server down | — | "Could not reach the server…" |

One thing in the contract doc is out of date. `boundary-upload.md` still says the frontend reloads the list after a save (`GET /api/wardrobe`) and still marks `aiTags` as "(planned)". The code now just adds the returned item to the grid, and `aiTags` is live.

---

## 4. Strengths
- **Everything is passed in as a parameter.** `createApp`, `createWardrobeStore` and `createTagger` receive what they need, so tests use fakes and temp folders and never call the real API. Only `index.js` deals with real resources.
- **AI failure can't break a save.** Timeout in two places, no retries, `aiTags: null` as the fallback, and timers are cleaned up. Each of these has its own test.
- **Strict checking of the AI reply.** Fixed category list, empty values rejected, extra fields rejected. Bad model output becomes `null`, never junk in the data.
- **Concurrent saves are safe.** Queued writes plus temp-file-then-rename. Proven with 10 simultaneous saves at the store level and through the API.
- **Docs that show the decisions.** Spec, then ADR, then contract, then bug ticket, each with acceptance criteria and a "reconsider if" line. Rare for an MVP and very useful.
- **Tight scope.** Each task's "out of scope" list is respected in the code.
- **Upload flow safe from half-saves on bad input.** Invalid uploads never touch the disk, and the UI keeps the form for a retry.

---

## 5. Weaknesses, technical debt and gaps

**Reliability and correctness**
1. **A failed save can leave an orphan image** (contract gap #3). `add()` writes the image before the record. If the JSON write fails, the image stays with nothing pointing to it. This is now the most important remaining data-integrity gap.
2. **No upload size limit.** Multer has no `limits`, so a huge file is held entirely in memory. Photos over 5 MB are saved but silently never tagged, which is common with modern phone photos.
3. **A 500 returns an HTML page, not `{error}`.** This breaks the contract's promise that every error has the same shape.
4. **A corrupt `wardrobe.json` breaks everything.** `JSON.parse` throws, so every list and save returns 500 until someone fixes the file by hand.

**Validation (the "quick bytes check" vs real image check)**

5. **Spec Check 3 is only partly met.** The checks look at extension, declared type and size > 0. Nothing decodes the image. A text file named `shirt.jpg` is accepted; the test suite even saves `'jpeg-bytes'` as a photo. There's no minimum-resolution check either, though `spec.md` §4 requires one.
6. **Extension and file type are checked separately.** `shirt.jpg` declared as `image/gif` passes, and so does `x.dng` declared as `image/jpeg`. The file type comes from the client and isn't verified.
7. **No HEIC support.** iPhones save photos as HEIC by default, and a mobile-first app will see those. Today they get 415, unless the browser converts them first, which varies by browser.

**Testing and process**

8. **The frontend has no automated tests.** All UI branches were only checked by hand.
9. **Response time is only checked by hand.** The ADR says to "measure how long a save takes", but no measurement is written down anywhere. Nothing tracks the "reconsider if over ~3 s" trigger.
10. **Test runner not merged yet.** `main` uses `node --test`; Vitest plus the 80% coverage gate are waiting on the `chore/vitest-coverage` PR.

**Docs and style**

11. **Docs out of date:**
    - README is missing Task 2.
    - `boundary-upload.md` still says "(planned)" for `aiTags` and describes a reload that no longer happens.
    - `spec-task2` §8 names `node --test`.
12. **Small code inconsistencies:**
    - Semicolons in `wardrobeStore.js` and `validator.js`, none in `app.js` and `tagger.js`; test files use 4-space indent.
    - Two different functions named `normalizeTags`, in the store and in the tagger.
    - `express.json()` is mounted but no route uses it.

**Product and security (fine for a single local user, not beyond that)**

13. No login. Anyone who can reach the port can see all photos under `/uploads`.
14. Photos go to Anthropic. Sample photos were briefly pushed to GitHub on the Vitest branch. They have been removed from the branch, but GitHub may keep the old commit reachable by its SHA for some time.

---

## 6. Prioritized action plan

**a) Reliability fixes (BUG-001 is already done)**
1. **Merge the test setup.** Merge `chore/vitest-coverage`, which now holds only the migration. After that, everything else lands with the 80% coverage gate in place.
2. **Close the half-save gap (#3).** In `wardrobeStore.add`, if writing the record fails, delete the image (`unlink`). Test it with a JSON write that fails.
3. **Return JSON for server errors.** Add an Express error handler at the end of `createApp` that returns `{error: "Could not save item, please try again"}` with status 500. Test that a store which throws gives a JSON 500.
4. **Add a 5 MB upload limit.** `multer({ limits: { fileSize: 5 * 1024 * 1024 } })`, and return 413 "Image is too large (max 5 MB)" on overflow. This also lines up with the tagger's 5 MB cap.
5. Optional: if `wardrobe.json` is corrupt, keep a backup copy and start empty, or at least return a clear message.

**b) Next feature: Task 3 + 5 + 6, "Do I own this?"**

Follow the same pattern as before: spec, then ADR, then contract, then code with tests.
1. **Choose the AI provider (ADR-002).** Compare Claude, Gemini and OpenAI for the comparison call. A one-hour trial with real photos settles it.
2. **Spec the endpoint.** `POST /api/check` (multipart `image`). It **doesn't save** the shop photo. It returns:
   `200 { hasSimilar, matches: [{ id, similarity: "high|medium|low", reasons: { cut, material, color } }] }`.
   Unlike tagging, an AI failure here is a real error, because the comparison is the whole point. Return 502/504 with `{error}`.
3. **Narrow down the closet photos first.** Tag the shop photo with the existing `tagger.tag()`, then keep only closet items with the same `aiTags.category`, capped at about 5–8 images. This bounds cost, response time and request size. Items with `aiTags: null` need a rule (include them, or skip them).
4. **A new `comparator.js`**, built like `tagger.js`:
   - `createComparator({ client, ... })`
   - zod schema for the result
   - checks that every `id` it returns is one of the candidates
   - same timeout and no-retry settings
5. **Reuse:** `validator.js` for the shop photo, `store.list()` for the candidates, `tagWithTimeout`-style timeout handling, and the error contract from step a3.
6. **Frontend (Task 6):** a second screen or tab with "Check an item". Show the shop photo next to the matched closet thumbnails and the reasons for each. Show a clear "nothing similar, buy with confidence" state, and the error states.
7. **Known blocker:** closet photos over 5 MB can't be sent. Decide in the spec whether to resize them (`sharp`) or skip them.

**c) Cleanup and testing**
1. **Frontend tests.** Vitest + jsdom + React Testing Library for `App.jsx`: success, 415 message, network error, old items without `aiTags`. Then extend the coverage gate to `frontend/src`.
2. **Real image checks.** Use `sharp` or `image-size` to confirm the file decodes and meets a minimum resolution, and that its real format matches the extension. Fix the tests that save fake bytes. Decide on HEIC (accept and convert, or reject with a clear message).
3. **Turn the manual response-time check into data.** Log how long tagging takes, plus a small script that runs N real uploads and reports median and 95th percentile against the ADR's 3 s threshold.
4. **Bring the docs up to date:** README task list, `boundary-upload.md` (aiTags live, no list reload), test commands in `spec-task2`.
5. **Consistent formatting.** Add Prettier (or at least agree on semicolons and indent), and rename one of the two `normalizeTags` functions.

**Suggested order:** a1 → a2–a4 (one small ticket each) → b1 decision → b2 spec, then b3–b6 → c1 and c2 alongside → c3–c5 as quick wins.
