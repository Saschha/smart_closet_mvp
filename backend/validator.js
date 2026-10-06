// backend/validator.js
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  // Common camera RAW formats
  '.raw', '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2'
]);

export function isValidImageFile(filename) {
  if (typeof filename !== 'string' || !filename.trim()) {
    return false;
  }

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) {
    return false;
  }

  const ext = filename.slice(dotIndex).toLowerCase();
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
