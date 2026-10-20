// backend/wardrobeStore.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createWardrobeStore } from './wardrobeStore.js';

describe('createWardrobeStore', () => {
    let dataFile;
    let uploadDir;
    let store;

    beforeEach(async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'wardrobe-'));
        dataFile = path.join(dir, 'data', 'wardrobe.json');
        uploadDir = path.join(dir, 'uploads');
        store = createWardrobeStore({ dataFile, uploadDir });
    });

    it('should return an empty list when no data file exists yet', async () => {
        assert.deepEqual(await store.list(), []);
    });

    it('should write the image file and persist the metadata record', async () => {
        const item = await store.add({
            buffer: Buffer.from('fake-image'),
            originalname: 'shirt.JPG',
            title: 'Blue Linen Shirt',
            note: 'Bought in Lisbon',
            tags: ['summer', 'linen'],
        });

        assert.equal(item.filename, `${item.id}.jpg`);
        assert.equal(item.filepath, `/uploads/${item.filename}`);
        assert.equal(item.title, 'Blue Linen Shirt');
        assert.equal(item.note, 'Bought in Lisbon');
        assert.deepEqual(item.tags, ['summer', 'linen']);
        assert.ok(!Number.isNaN(Date.parse(item.createdAt)));

        const saved = await readFile(path.join(uploadDir, item.filename), 'utf8');
        assert.equal(saved, 'fake-image');

        const records = JSON.parse(await readFile(dataFile, 'utf8'));
        assert.deepEqual(records, [item]);
    });

    it('should normalize comma-separated tags and default optional fields', async () => {
        const item = await store.add({
            buffer: Buffer.from('x'),
            originalname: 'pants.png',
            tags: ' denim, ,blue ',
        });

        assert.deepEqual(item.tags, ['denim', 'blue']);
        assert.equal(item.title, '');
        assert.equal(item.note, '');
    });

    it('should persist aiTags and default them to null', async () => {
        const aiTags = { category: 'top', subType: 'button-down shirt', color: 'light blue' };
        const tagged = await store.add({ buffer: Buffer.from('1'), originalname: 'a.jpg', aiTags });
        const untagged = await store.add({ buffer: Buffer.from('2'), originalname: 'b.jpg' });

        assert.deepEqual(tagged.aiTags, aiTags);
        assert.equal(untagged.aiTags, null);
        const records = JSON.parse(await readFile(dataFile, 'utf8'));
        assert.deepEqual(records.map((record) => record.aiTags), [aiTags, null]);
    });

    it('should list items newest first', async () => {
        const first = await store.add({ buffer: Buffer.from('1'), originalname: 'a.jpg' });
        const second = await store.add({ buffer: Buffer.from('2'), originalname: 'b.jpg' });

        const ids = (await store.list()).map((item) => item.id);
        assert.deepEqual(ids, [second.id, first.id]);
    });

    it('should keep every record when add() is called concurrently (BUG-001)', async () => {
        const added = await Promise.all(
            Array.from({ length: 10 }, (_, i) => store.add({ buffer: Buffer.from(String(i)), originalname: `${i}.png` })),
        );

        const records = JSON.parse(await readFile(dataFile, 'utf8'));
        assert.equal(records.length, 10);
        const listedIds = (await store.list()).map((item) => item.id).sort();
        assert.deepEqual(listedIds, added.map((item) => item.id).sort());
    });
});
