// backend/validator.js
export function isValidImageFile(filename) {
    if (!filename) return false;
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    return allowedExtensions.includes(ext);
}