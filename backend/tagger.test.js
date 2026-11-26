// backend/tagger.test.js
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { CATEGORIES, createTagger, normalizeTags } from './tagger.js';

function fakeClient(response) {
    const calls = [];
    return {
        calls,
        models: {
            async generateContent(params) {
                calls.push(params);
                return typeof response === 'function' ? response(params) : response;
            },
        },
    };
}

const ok = (body) => ({ text: JSON.stringify(body) });
const shirt = { category: 'top', subType: 'button-down shirt', color: 'light blue' };

describe('createTagger', () => {
    it('returns { category, subType, color } from a valid JSON response', async () => {
        const tagger = createTagger({ client: fakeClient(ok(shirt)) });
        assert.deepEqual(await tagger.tag(Buffer.from('img'), 'image/jpeg'), shirt);
    });

    it('sends the model, prompt, inline image, JSON schema config and timeout', async () => {
        const client = fakeClient(ok(shirt));
        await createTagger({ client }).tag(Buffer.from('img'), 'image/png');

        assert.equal(client.calls.length, 1);
        const params = client.calls[0];
        assert.equal(params.model, 'gemini-3.5-flash');

        const parts = params.contents[0].parts;
        assert.ok(parts.some((part) => typeof part.text === 'string' && part.text.includes('garment')));
        const image = parts.find((part) => part.inlineData);
        assert.deepEqual(image.inlineData, {
            mimeType: 'image/png',
            data: Buffer.from('img').toString('base64'),
        });

        const { config } = params;
        assert.equal(config.responseMimeType, 'application/json');
        assert.deepEqual(config.responseSchema.required, ['category', 'subType', 'color']);
        assert.deepEqual(config.responseSchema.properties.category.enum, CATEGORIES);
        assert.deepEqual(config.httpOptions, { timeout: 15000 });
    });

    it('normalizes whitespace and case', async () => {
        const raw = { category: ' Top ', subType: 'Button-Down Shirt', color: 'LIGHT BLUE ' };
        const tagger = createTagger({ client: fakeClient(ok(raw)) });
        assert.deepEqual(await tagger.tag(Buffer.from('img'), 'image/webp'), shirt);
    });

    it('throws on an unknown category, empty value, or missing/extra field', () => {
        assert.throws(() => normalizeTags({ ...shirt, category: 'hat' }), /unknown category/);
        assert.throws(() => normalizeTags({ ...shirt, subType: '  ' }), /empty subType/);
        assert.throws(() => normalizeTags({ ...shirt, color: '' }), /empty color/);
        assert.throws(() => normalizeTags({ category: 'top', subType: 'shirt' }), /unexpected fields/);
        assert.throws(() => normalizeTags({ ...shirt, brand: 'acme' }), /unexpected fields/);
    });

    it('throws on invalid JSON, a missing text (blocked response) and a null body', async () => {
        const garbage = createTagger({ client: fakeClient({ text: 'not json' }) });
        await assert.rejects(garbage.tag(Buffer.from('img'), 'image/jpeg'), /invalid JSON/);

        const blocked = createTagger({ client: fakeClient({}) });
        await assert.rejects(blocked.tag(Buffer.from('img'), 'image/jpeg'), /invalid JSON/);

        const empty = createTagger({ client: fakeClient(ok(null)) });
        await assert.rejects(empty.tag(Buffer.from('img'), 'image/jpeg'), /no tags/);
    });

    it('throws when the JSON does not match the expected tag shape', async () => {
        const extra = createTagger({ client: fakeClient(ok({ ...shirt, brand: 'acme' })) });
        await assert.rejects(extra.tag(Buffer.from('img'), 'image/jpeg'), /unexpected fields/);

        const badCategory = createTagger({ client: fakeClient(ok({ ...shirt, category: 'hat' })) });
        await assert.rejects(badCategory.tag(Buffer.from('img'), 'image/jpeg'), /unknown category/);
    });

    it('propagates a client error', async () => {
        const client = fakeClient(() => {
            throw new Error('network down');
        });
        await assert.rejects(createTagger({ client }).tag(Buffer.from('img'), 'image/jpeg'), /network down/);
    });

    it('throws on unsupported MIME types without calling the client', async () => {
        const client = fakeClient(ok(shirt));
        const tagger = createTagger({ client });
        for (const type of ['application/octet-stream', 'image/gif']) {
            await assert.rejects(tagger.tag(Buffer.from('img'), type), /not supported/);
        }
        assert.equal(client.calls.length, 0);
    });

    it('throws on an image over 5 MB without calling the client', async () => {
        const client = fakeClient(ok(shirt));
        const tagger = createTagger({ client });
        await assert.rejects(tagger.tag(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg'), /too large/);
        assert.equal(client.calls.length, 0);
    });
});
