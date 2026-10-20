# BUG-001: Concurrent saves lose wardrobe records and can return 500

**Status:** Fixed (2026-10-20) · **Found:** 2026-10-16 · **Area:** `backend/wardrobeStore.js` (Task 1) · **Severity:** High for data integrity; low likelihood for a single user today

## Summary
`store.add()` reads all of `wardrobe.json`, appends the new item and writes the whole file back, with no locking. When two or more saves overlap:
- **Lost update:** one save overwrites the record another save just wrote. The client still got `201`, but the record is gone.
- **Torn read:** a save reads the file while another save is halfway through writing it. `JSON.parse` throws `SyntaxError: Unexpected end of JSON input`, and the client gets `500`.

In both cases the image is already in `uploads/`, so the image file stays on disk with no record pointing to it.

## Reproduction
A throwaway probe calls `createApp` + `createWardrobeStore` on a temp directory and sends N concurrent `POST /api/wardrobe` requests, each with a 1×1 PNG. Three runs per N gave identical results:

| Concurrent POSTs | Responses | Records in JSON | Image files | Lost |
|---|---|---|---|---|
| 2 | 2× 201 | 2 | 2 | 0 |
| 5 | 4× 201, 1× 500 | 2 | 5 | 3 |
| 10 | 7× 201, 3× 500 | 3 | 10 | 7 |

## Expected
- Every request that gets `201` has its record in `wardrobe.json`.
- Concurrent saves never produce a `500` from reading a half-written file.
- `wardrobe.json` is always valid JSON.

## Fix (implemented)
1. Serialize writes inside `createWardrobeStore`, e.g. a promise-chain mutex around the read-modify-write in `add()` (and any future `update()`).
2. Write atomically: write to `wardrobe.json.tmp`, then `rename()` it over `wardrobe.json`, so a reader never sees a half-written file.

Both changes stay inside `wardrobeStore.js`. The API contract doesn't change.

## Acceptance criteria
- [x] New test in `backend/wardrobeStore.test.js`: 10 concurrent `add()` calls give 10 records, and `list()` returns all of them.
- [x] New test in `backend/app.test.js`: 10 concurrent POSTs all return 201 and `GET /api/wardrobe` returns 10 items.
- [x] Existing tests still pass.

## Verification (2026-10-20)
The same probe, run 3 times at each N, after the fix:

| Concurrent POSTs | Responses | Records in JSON | Image files | Lost |
|---|---|---|---|---|
| 2 | 2× 201 | 2 | 2 | 0 |
| 5 | 5× 201 | 5 | 5 | 0 |
| 10 | 10× 201 | 10 | 10 | 0 |
| 25 | 25× 201 | 25 | 25 | 0 |

`npm test`: 29/29 pass. Both new tests fail against the pre-fix `wardrobeStore.js`.

## Out of scope
- Cleaning up the image files left over from earlier failures.
- The separate partial-write gap (the image is written before the record) listed in `docs/boundary-upload.md` "Gaps" #3.
- Moving to SQLite or another store.

## Notes
- Relevant to ADR-001: Option B (background tagging) would add `update()` writes and make this worse. Option A doesn't add writes.
