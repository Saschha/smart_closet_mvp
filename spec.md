# Specification: Wardrobe Capture (Task 1)

## 1. Feature Description
- **What it does:** Allows the user to select an existing photo or take a picture with their smartphone camera, validates the image format and basic quality, accepts optional manual details (title, note, tags), and saves the file locally while persisting its metadata.
- **What it leaves alone:** No AI-based similarity comparison, no vector embeddings, and no cloud synchronization (S3/Supabase) or user authentication.

## 2. Interface
- **Input:**
  - File/Camera upload payload: Accepted image types (`.jpg`, `.jpeg`, `.png`, `.webp`, and standard camera RAW formats). Explicitly rejected: non-image or editing formats (`.pdf`, `.doc`, `.ai`, `.psd`, `.tif`, `.md`).
  - Metadata payload (optional): `title` (string), `note` (string), `tags` (array of strings or comma-separated string).
- **Output:**
  - Stored item object: `{ id, filename, filepath, title, note, tags, createdAt }`.
  - HTTP 201 Created response (API) with item details or informative error response (HTTP 400/415).

## 3. Preconditions & Guarantees
- **Precondition:** The destination directory on the local storage/disk exists and has write permissions.
- **Guaranteed after:**
  - The validated image is saved in the local filesystem.
  - The record with ID, timestamp, and manual tags/notes is stored in the local data store (JSON/SQLite).
  - The saved item is readable and viewable via thumbnail/preview in the UI.

## 4. Quality & Format Constraints
- **Format check:** The file extension and MIME type must belong to the allowed list (`.jpg`, `.jpeg`, `.png`, `.webp`, camera RAW).
- **Quality check:** The uploaded file must be readable as an image, not empty (file size > 0), and meet a minimum resolution threshold so a garment is clearly distinguishable.

## 5. Failure Cases
- File has an unapproved format (e.g. `.pdf`, `.psd`, `.doc`, `.tif`).
- File fails the quality/resolution check or is corrupted.
- System rejects the upload with a clear error message; no file is written to disk and no record is added to storage.

---

## Executable Checks (Given-When-Then)

### Check 1: Normal Path (Successful Save with Metadata)
- **Given:** The user provides a valid image (`shirt.jpg`) with sufficient resolution and optional details (`title: "Blue Linen Shirt"`, `tags: ["summer", "linen"]`).
- **When:** The user triggers the save/upload action.
- **Then:** The image is written to local storage, the metadata record is stored, and the item is immediately viewable in the local list.

### Check 2: Error Path (Unsupported File Format)
- **Given:** The user attempts to upload a non-supported file (e.g. `pattern.psd` or `notes.pdf`).
- **When:** The user triggers the save/upload action.
- **Then:** The system rejects the file, displays an "Unsupported format" error, and persists nothing.

### Check 3: Error Path (Corrupted or Insufficient Quality)
- **Given:** The user selects an unreadable, 0-byte, or sub-minimum resolution image.
- **When:** The validation check runs upon submission.
- **Then:** The system rejects the image, alerts the user that the clothing item cannot be identified due to resolution/corruption, and creates no new storage record.