# ADR 001: Tag wardrobe items during the save request

**Status:** Accepted · **Date:** 2026-10-15 · **Ticket:** Task 2 – Auto-tag wardrobe items

## Decision
When a wardrobe photo is uploaded and passes validation, the backend calls Claude Haiku 5.5 (`claude-haiku-5-5`) on the uploaded image inside the same request to get `{ category, subType, color }`. It then saves the image and record (with `aiTags`) in one write, and returns the item in the 201 response. The AI call has an ~8 s timeout. If tagging fails or times out, the item is still saved, with `aiTags: null`.

## Options considered
- **A: Synchronous tagging with a timeout (chosen).**
- **B: Save first, tag in the background.** Respond 201 immediately, then tag asynchronously and update the record later (`tagStatus: pending/done/failed`).

## The four questions
- **I chose A instead of B because** it meets all three acceptance criteria with the least code. The tags arrive in the save response, so the frontend needs no polling. There is no new `store.update()`, so there's no risk of two background writes to `wardrobe.json` overwriting each other. It is also easy to test with a fake tagger, and it respects the scope-discipline rule in CLAUDE.md. Haiku 5.5 is the fastest and cheapest model, and identifying category and color is a simple task.
- **The downside is** that every save waits for the AI call, typically a few seconds and up to the 8 s timeout, which is noticeable on a phone in a store. A failed or timed-out tag is never retried, so that item stays without `aiTags`. Camera RAW uploads are never tagged because the vision API doesn't accept that format.
- **I plan to check** that saving still works when tagging fails, using automated tests: a tagger that succeeds, one that throws, one that times out, and no tagger at all. I will also upload real photos to measure how long a save takes and whether the tags are correct.
- **I'll reconsider if** saving regularly takes longer than ~3 s, if many items end up with `aiTags: null` (timeouts or errors), or if we need retries or batch re-tagging. In any of those cases, switch to Option B. The `aiTags` format stays the same, so the switch only changes when tagging happens.
