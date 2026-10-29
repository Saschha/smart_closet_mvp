// backend/health.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from './app.js';

describe('GET /api/health', () => {
    let server;
    let baseUrl;

    beforeAll(async () => {
        const store = { list: async () => [], add: async () => ({}) };
        const app = createApp({ store, uploadDir: '.' });
        await new Promise((resolve) => {
            server = app.listen(0, resolve);
        });
        baseUrl = `http://localhost:${server.address().port}`;
    });

    afterAll(() => {
        server.close();
    });

    it('returns 200 with { status: "ok" }', async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
    });
});
