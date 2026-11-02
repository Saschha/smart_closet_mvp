// backend/app.test.js
import { describe, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { createWardrobeStore } from './wardrobeStore.js';

describe('wardrobe API', () => {
    let server;
    let baseUrl;
    let dir;
    let uploadDir;

    beforeAll(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'wardrobe-api-'));
        uploadDir = path.join(dir, 'uploads');
        const store = createWardrobeStore({ dataFile: path.join(dir, 'data', 'wardrobe.json'), uploadDir });
        const app = createApp({ store, uploadDir });

        await new Promise((resolve) => {
            server = app.listen(0, resolve);
        });
        baseUrl = `http://localhost:${server.address().port}`;
    });

    afterAll(() => {
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
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
        const setSpy = vi.spyOn(globalThis, 'setTimeout');
        const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
        const { upload } = await start({ tagger: spyTagger(async () => shirtTags), tagTimeoutMs: 60_000 });

        await (await upload()).json();
        // Only look at the tagging timer, so other timers (runner, sockets) can't affect the result.
        const tagTimers = setSpy.mock.calls
            .map((args, i) => (args[1] === 60_000 ? setSpy.mock.results[i].value : null))
            .filter(Boolean);
        assert.equal(tagTimers.length, 1);
        assert.ok(clearSpy.mock.calls.some(([timer]) => timer === tagTimers[0]), 'tagging timer should be cleared');
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

describe('error handling', () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        const store = {
            list: async () => {
                throw new Error('boom');
            },
        };
        const app = createApp({ store, uploadDir: tmpdir() });
        await new Promise((resolve) => {
            server = app.listen(0, resolve);
        });
        baseUrl = `http://localhost:${server.address().port}`;
    });

    afterAll(() => {
        server.close();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a JSON 500 without internal details when a route throws', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await fetch(`${baseUrl}/api/wardrobe`);
        const text = await res.text();

        assert.equal(res.status, 500);
        assert.match(res.headers.get('content-type'), /json/);
        assert.deepEqual(JSON.parse(text), { error: 'Internal server error' });
        assert.doesNotMatch(text, /boom|at /);
        assert.equal(logged.mock.calls.length, 1);
    });

    it('returns a JSON 4xx with its message for a malformed JSON body', async () => {
        const res = await fetch(`${baseUrl}/api/wardrobe`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{bad',
        });

        assert.equal(res.status, 400);
        assert.match(res.headers.get('content-type'), /json/);
        const body = await res.json();
        assert.equal(typeof body.error, 'string');
    });
});

describe('POST /api/check', () => {
    const matches = [
        {
            id: 'placeholder',
            similarity: 'high',
            reason: { cut: 'same slim fit', material: 'both cotton', color: 'both light blue' },
        },
    ];
    let servers = [];
    let dir;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'wardrobe-check-'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        for (const server of servers) server.close();
        servers = [];
    });

    function fakeMatcher(impl) {
        const calls = [];
        return {
            calls,
            compareItem: async (args) => {
                calls.push(args);
                return impl(args);
            },
        };
    }

    async function start(options) {
        const uploadDir = path.join(dir, 'uploads');
        const store = createWardrobeStore({ dataFile: path.join(dir, 'data', 'wardrobe.json'), uploadDir });
        const app = createApp({ store, uploadDir, ...options });
        const server = await new Promise((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        servers.push(server);
        const baseUrl = `http://localhost:${server.address().port}`;
        const check = (filename = 'store.jpg', content = 'store-bytes', type = 'image/jpeg') => {
            const form = new FormData();
            if (filename) {
                form.append('image', new Blob([content], { type }), filename);
            }
            return fetch(`${baseUrl}/api/check`, { method: 'POST', body: form });
        };
        return { check, store, uploadDir };
    }

    it('returns 200 with the comparison and sends only readable closet photos', async () => {
        const matcher = fakeMatcher(() => ({ hasMatch: true, matches }));
        const { check, store, uploadDir } = await start({ matcher });
        const shirt = await store.add({ buffer: Buffer.from('shirt'), originalname: 'shirt.jpg', title: 'Blue shirt' });
        const jeans = await store.add({ buffer: Buffer.from('jeans'), originalname: 'jeans.PNG', title: 'Jeans' });
        await store.add({ buffer: Buffer.from('raw'), originalname: 'coat.dng', title: 'RAW coat' });
        const gone = await store.add({ buffer: Buffer.from('gone'), originalname: 'gone.webp', title: 'Deleted' });
        await rm(path.join(uploadDir, gone.filename));

        const res = await check('store.jpg', 'store-bytes', 'image/jpeg');

        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { hasMatch: true, matches });
        assert.equal(matcher.calls.length, 1);
        const { newItem, closetItems } = matcher.calls[0];
        assert.deepEqual(newItem, { buffer: Buffer.from('store-bytes'), mimeType: 'image/jpeg' });
        // store.list() is newest first.
        assert.deepEqual(closetItems, [
            { id: jeans.id, buffer: Buffer.from('jeans'), mimeType: 'image/png', title: 'Jeans' },
            { id: shirt.id, buffer: Buffer.from('shirt'), mimeType: 'image/jpeg', title: 'Blue shirt' },
        ]);
    });

    it('returns 400 for a missing or empty image without calling the matcher', async () => {
        const matcher = fakeMatcher(() => ({ hasMatch: false, matches: [] }));
        const { check } = await start({ matcher });

        const missing = await check(null);
        assert.equal(missing.status, 400);
        assert.deepEqual(await missing.json(), { error: 'No image provided' });

        const empty = await check('store.jpg', '', 'image/jpeg');
        assert.equal(empty.status, 400);
        assert.equal(matcher.calls.length, 0);
    });

    it('returns 415 for unsupported formats, including camera RAW, without calling the matcher', async () => {
        const matcher = fakeMatcher(() => ({ hasMatch: false, matches: [] }));
        const { check } = await start({ matcher });

        for (const [filename, type] of [
            ['notes.pdf', 'application/pdf'],
            ['store.jpg', 'text/plain'],
            ['store.dng', 'application/octet-stream'],
        ]) {
            const res = await check(filename, 'bytes', type);
            assert.equal(res.status, 415, filename);
            assert.match(res.headers.get('content-type'), /json/);
        }
        assert.equal(matcher.calls.length, 0);
    });

    it('returns 503 when no matcher is configured', async () => {
        const { check } = await start({});
        const res = await check();
        assert.equal(res.status, 503);
        assert.deepEqual(await res.json(), { error: 'Visual comparison service is not configured' });
    });

    it('returns 502 with a JSON error when the matcher fails or times out', async () => {
        for (const message of ['quota exceeded', 'Gemini comparison timed out after 10000 ms']) {
            const matcher = fakeMatcher(() => {
                throw new Error(message);
            });
            const { check } = await start({ matcher });
            const res = await check();
            assert.equal(res.status, 502);
            assert.deepEqual(await res.json(), { error: 'Visual comparison failed, please try again' });
        }
        assert.equal(console.warn.mock.calls.length, 2);
    });

    it('returns a JSON 500 when a closet photo exists but cannot be read', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const matcher = fakeMatcher(() => ({ hasMatch: false, matches: [] }));
        const { check, store, uploadDir } = await start({ matcher });
        const item = await store.add({ buffer: Buffer.from('x'), originalname: 'shirt.jpg' });
        await rm(path.join(uploadDir, item.filename));
        await mkdir(path.join(uploadDir, item.filename)); // reading a directory fails with EISDIR

        const res = await check();
        assert.equal(res.status, 500);
        assert.deepEqual(await res.json(), { error: 'Internal server error' });
        assert.equal(matcher.calls.length, 0);
    });
});
