// backend/validator.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidImageFile } from './validator.js';

describe('isValidImageFile', () => {
    it('should return true for valid image files', () => {
        assert.equal(isValidImageFile('shirt.jpg'), true);
        assert.equal(isValidImageFile('jacket.png'), true);
    });

    it('should return false for invalid formats', () => {
        assert.equal(isValidImageFile('document.pdf'), false);
        assert.equal(isValidImageFile(''), false);
    });
});