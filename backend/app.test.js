// backend/app.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { createWardrobeStore } from './wardrobeStore.js';

describe('wardrobe API', () => {
    let server;
    let baseUrl;
    let dir;
    let uploadDir;

    before(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'wardrobe-api-'));
        uploadDir = path.join(dir, 'uploads');
        const store = createWardrobeStore({ dataFile: path.join(dir, 'data', 'wardrobe.json'), uploadDir });
        const app = createApp({ store, uploadDir });

        await new Promise((resolve) => {
            server = app.listen(0, resolve);
        });
        baseUrl = `http://localhost:${server.address().port}`;
    });

    after(() => {
        server.close();
    });

    beforeEach(async () => {
        await rm(path.join(dir, 'data'), { recursive: true, force: true });
        await rm(uploadDir, { recursive: true, force: true });
    });

    function upload(filename, content, type, fields = {}) {
        const form = new FormData();
        form.append('image', new Blob([content], { type }), filename);
        for (const [key, value] of Object.entries(fields)) {
            form.append(key, value);
        }
        return fetch(`${baseUrl}/api/wardrobe`, { method: 'POST', body: form });
    }

    async function assertNothingPersisted() {
        const items = await (await fetch(`${baseUrl}/api/wardrobe`)).json();
        assert.deepEqual(items, []);
        await assert.rejects(readdir(uploadDir), { code: 'ENOENT' });
    }

    it('Check 1: saves a valid image with metadata and lists it', async () => {
        const res = await upload('shirt.jpg', 'jpeg-bytes', 'image/jpeg', {
            title: 'Blue Linen Shirt',
            tags: 'summer, linen',
        });
        assert.equal(res.status, 201);
        const item = await res.json();
        assert.equal(item.title, 'Blue Linen Shirt');
        assert.deepEqual(item.tags, ['summer', 'linen']);

        const items = await (await fetch(`${baseUrl}/api/wardrobe`)).json();
        assert.deepEqual(items, [item]);

        const onDisk = await readFile(path.join(uploadDir, item.filename), 'utf8');
        assert.equal(onDisk, 'jpeg-bytes');

        const preview = await fetch(`${baseUrl}${item.filepath}`);
        assert.equal(preview.status, 200);
    });

    it('Check 2: rejects unsupported formats and persists nothing', async () => {
        for (const [name, type] of [['notes.pdf', 'application/pdf'], ['pattern.psd', 'image/vnd.adobe.photoshop']]) {
            const res = await upload(name, 'data', type);
            assert.equal(res.status, 415);
            assert.deepEqual(await res.json(), { error: 'Unsupported format' });
        }
        await assertNothingPersisted();
    });

    it('Check 2: rejects an allowed extension with a non-image MIME type', async () => {
        const res = await upload('shirt.jpg', 'data', 'application/pdf');
        assert.equal(res.status, 415);
        await assertNothingPersisted();
    });

    it('Check 3: rejects a 0-byte image and persists nothing', async () => {
        const res = await upload('shirt.jpg', '', 'image/jpeg');
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: 'Image is empty or unreadable' });
        await assertNothingPersisted();
    });

    it('rejects a request without an image', async () => {
        const form = new FormData();
        form.append('title', 'No file');
        const res = await fetch(`${baseUrl}/api/wardrobe`, { method: 'POST', body: form });
        assert.equal(res.status, 400);
        await assertNothingPersisted();
    });
});
