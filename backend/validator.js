// backend/validator.js
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  // Common camera RAW formats
  '.raw', '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2'
]);

export function isValidImageFile(filename) {
  if (typeof filename !== 'string') {
    return false;
  }

  const name = filename.trim();
  const dotIndex = name.lastIndexOf('.');
  // dotIndex 0 is an extension-only name like ".jpg", which path.extname treats as having no extension.
  if (dotIndex <= 0) {
    return false;
  }

  const ext = name.slice(dotIndex).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

// Browsers usually report camera RAW files as application/octet-stream.
export function isValidImageMime(mimetype) {
  if (typeof mimetype !== 'string') {
    return false;
  }

  const type = mimetype.toLowerCase();
  return type.startsWith('image/') || type === 'application/octet-stream';
}
