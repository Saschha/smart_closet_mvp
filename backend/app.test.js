// backend/app.test.js
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
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

    it('BUG-001: concurrent POSTs all return 201 and every item is listed', async () => {
        const responses = await Promise.all(
            Array.from({ length: 10 }, (_, i) => upload(`item-${i}.png`, `png-${i}`, 'image/png')),
        );
        assert.deepEqual(responses.map((res) => res.status), Array(10).fill(201));
        const created = await Promise.all(responses.map((res) => res.json()));

        const items = await (await fetch(`${baseUrl}/api/wardrobe`)).json();
        assert.equal(items.length, 10);
        assert.deepEqual(items.map((item) => item.id).sort(), created.map((item) => item.id).sort());
    });

    it('rejects a request without an image', async () => {
        const form = new FormData();
        form.append('title', 'No file');
        const res = await fetch(`${baseUrl}/api/wardrobe`, { method: 'POST', body: form });
        assert.equal(res.status, 400);
        await assertNothingPersisted();
    });
});

describe('wardrobe API with AI tagging', () => {
    const shirtTags = { category: 'top', subType: 'button-down shirt', color: 'light blue' };
    let servers = [];
    let dir;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'wardrobe-tag-'));
        mock.method(console, 'warn', () => {});
    });

    afterEach(() => {
        mock.restoreAll();
        for (const server of servers) server.close();
        servers = [];
    });

    async function start(options) {
        const uploadDir = path.join(dir, 'uploads');
        const store = createWardrobeStore({ dataFile: path.join(dir, 'data', 'wardrobe.json'), uploadDir });
        const app = createApp({ store, uploadDir, ...options });
        const server = await new Promise((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        servers.push(server);
        const baseUrl = `http://localhost:${server.address().port}`;
        const upload = (filename = 'shirt.jpg', content = 'jpeg-bytes', type = 'image/jpeg') => {
            const form = new FormData();
            form.append('image', new Blob([content], { type }), filename);
            return fetch(`${baseUrl}/api/wardrobe`, { method: 'POST', body: form });
        };
        const list = async () => (await fetch(`${baseUrl}/api/wardrobe`)).json();
        return { upload, list, uploadDir };
    }

    function spyTagger(impl) {
        const calls = [];
        return { calls, tag: (buffer, mimetype) => { calls.push({ buffer, mimetype }); return impl(); } };
    }

    it('stores aiTags and returns them in the 201 response and the list', async () => {
        const tagger = spyTagger(async () => shirtTags);
        const { upload, list } = await start({ tagger });

        const res = await upload();
        assert.equal(res.status, 201);
        const item = await res.json();
        assert.deepEqual(item.aiTags, shirtTags);
        assert.deepEqual((await list())[0].aiTags, shirtTags);
        assert.equal(tagger.calls.length, 1);
        assert.equal(tagger.calls[0].mimetype, 'image/jpeg');
        assert.equal(tagger.calls[0].buffer.toString(), 'jpeg-bytes');
    });

    it('still saves with aiTags: null when the tagger throws', async () => {
        const { upload, uploadDir } = await start({ tagger: spyTagger(async () => { throw new Error('boom'); }) });

        const res = await upload();
        assert.equal(res.status, 201);
        const item = await res.json();
        assert.equal(item.aiTags, null);
        assert.equal(await readFile(path.join(uploadDir, item.filename), 'utf8'), 'jpeg-bytes');
    });

    it('still saves with aiTags: null when the tagger never resolves', async () => {
        const { upload } = await start({ tagger: spyTagger(() => new Promise(() => {})), tagTimeoutMs: 50 });

        const started = Date.now();
        const res = await upload();
        assert.equal(res.status, 201);
        assert.equal((await res.json()).aiTags, null);
        assert.ok(Date.now() - started < 1000, 'response should arrive soon after the timeout');
    });

    it('clears the timeout timer once tagging settles', async () => {
        const countTimers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
        const { upload } = await start({ tagger: spyTagger(async () => shirtTags), tagTimeoutMs: 60_000 });

        await (await upload()).json(); // warm up any server-side timers
        const before = countTimers();
        await (await upload()).json();
        assert.equal(countTimers(), before);
    });

    it('saves with aiTags: null when no tagger is configured', async () => {
        const { upload } = await start({});
        const res = await upload();
        assert.equal(res.status, 201);
        assert.equal((await res.json()).aiTags, null);
    });

    it('never calls the tagger for an invalid upload', async () => {
        const tagger = spyTagger(async () => shirtTags);
        const { upload } = await start({ tagger });

        assert.equal((await upload('notes.pdf', 'data', 'application/pdf')).status, 415);
        assert.equal((await upload('shirt.jpg', '', 'image/jpeg')).status, 400);
        assert.equal(tagger.calls.length, 0);
    });
});
