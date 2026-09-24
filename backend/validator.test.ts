import { describe, it, expect } from '@jest/globals';
import { isValidImageFile } from './validator.js';

describe('isValidImageFile', () => {
  it('should return true for valid image files', () => {
    expect(isValidImageFile('shirt.jpg')).toBe(true);
    expect(isValidImageFile('jacket.PNG')).toBe(true);
  });

  it('should return false for invalid formats', () => {
    expect(isValidImageFile('document.pdf')).toBe(false);
    expect(isValidImageFile('')).toBe(false);
  });
});