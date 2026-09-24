// validator.ts
export function isValidImageFile(filename: string): boolean {
  if (!filename) return false;
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const lower = filename.toLowerCase();
  return allowed.some(ext => lower.endsWith(ext));
}