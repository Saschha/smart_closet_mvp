// backend/validator.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidImageFile } from './validator.js';

describe('isValidImageFile', () => {
    it('should return true for standard image formats and RAW files', () => {
        assert.equal(isValidImageFile('shirt.jpg'), true);
        assert.equal(isValidImageFile('jacket.jpeg'), true);
        assert.equal(isValidImageFile('pants.png'), true);
        assert.equal(isValidImageFile('coat.webp'), true);
        assert.equal(isValidImageFile('raw_camera.dng'), true);
        assert.equal(isValidImageFile('canon.cr2'), true);
        assert.equal(isValidImageFile('nikon.nef'), true);
    });

    it('should return false for document and unsupported design formats', () => {
        assert.equal(isValidImageFile('invoice.pdf'), false);
        assert.equal(isValidImageFile('notes.doc'), false);
        assert.equal(isValidImageFile('design.ai'), false);
        assert.equal(isValidImageFile('layer.psd'), false);
        assert.equal(isValidImageFile('scan.tif'), false);
        assert.equal(isValidImageFile('readme.md'), false);
        assert.equal(isValidImageFile(''), false);
        assert.equal(isValidImageFile(null), false);
    });
});