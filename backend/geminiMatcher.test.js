// backend/geminiMatcher.test.js
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createGeminiMatcher } from './geminiMatcher.js';

function fakeClient(generate) {
    const calls = [];
    return {
        calls,
        models: {
            generateContent(params) {
                calls.push(params);
                return generate(params);
            },
        },
    };
}

const replyWith = (body) => async () => ({ text: JSON.stringify(body) });

const newItem = { buffer: Buffer.from('new'), mimeType: 'image/jpeg' };
const closetItems = [
    { id: 'a1', buffer: Buffer.from('shirt'), mimeType: 'image/png', title: 'Blue shirt' },
    { id: 'b2', buffer: Buffer.from('jeans'), mimeType: 'image/webp', title: 'Black jeans' },
];
const shirtMatch = {
    id: 'a1',
    similarity: 'high',
    reason: { cut: 'same slim fit', material: 'both cotton', color: 'both light blue' },
};

describe('createGeminiMatcher', () => {
    it('returns matches from a valid JSON response', async () => {
        const client = fakeClient(replyWith({ hasMatch: true, matches: [shirtMatch] }));
        const result = await createGeminiMatcher({ client }).compareItem({ newItem, closetItems });
        assert.deepEqual(result, { hasMatch: true, matches: [shirtMatch] });
    });

    it('sends the model, JSON config and every image with its id label in order', async () => {
        const client = fakeClient(replyWith({ hasMatch: false, matches: [] }));
        await createGeminiMatcher({ client }).compareItem({ newItem, closetItems });

        assert.equal(client.calls.length, 1);
        const params = client.calls[0];
        assert.equal(params.model, 'gemini-3.5-flash');
        assert.equal(params.config.responseMimeType, 'application/json');
        assert.deepEqual(params.config.responseSchema.required, ['hasMatch', 'matches']);

        const parts = params.contents[0].parts;
        assert.match(parts[0].text, /cut, material and color/);
        const images = parts.filter((part) => part.inlineData).map((part) => part.inlineData);
        assert.deepEqual(images, [
            { mimeType: 'image/jpeg', data: Buffer.from('new').toString('base64') },
            { mimeType: 'image/png', data: Buffer.from('shirt').toString('base64') },
            { mimeType: 'image/webp', data: Buffer.from('jeans').toString('base64') },
        ]);
        const labels = parts.filter((part) => part.text?.startsWith('Closet item')).map((part) => part.text);
        assert.deepEqual(labels, [
            'Closet item id="a1" title="Blue shirt"',
            'Closet item id="b2" title="Black jeans"',
        ]);
    });

    it('rejects with a descriptive error when the call exceeds timeoutMs', async () => {
        const client = fakeClient(() => new Promise(() => {}));
        const matcher = createGeminiMatcher({ client, timeoutMs: 20 });
        await assert.rejects(matcher.compareItem({ newItem, closetItems }), /timed out after 20 ms/);
    });

    it('rejects with a descriptive error when the API fails', async () => {
        const client = fakeClient(async () => {
            throw new Error('quota exceeded');
        });
        const matcher = createGeminiMatcher({ client });
        await assert.rejects(matcher.compareItem({ newItem, closetItems }), /Gemini comparison failed: quota exceeded/);
    });

    it('returns no matches for an empty candidate list without calling the API', async () => {
        const client = fakeClient(replyWith({ hasMatch: true, matches: [shirtMatch] }));
        const matcher = createGeminiMatcher({ client });
        assert.deepEqual(await matcher.compareItem({ newItem, closetItems: [] }), { hasMatch: false, matches: [] });
        assert.equal(client.calls.length, 0);
    });

    it('rejects when the response is not valid JSON or has the wrong shape', async () => {
        const notJson = fakeClient(async () => ({ text: 'sorry, I cannot' }));
        await assert.rejects(
            createGeminiMatcher({ client: notJson }).compareItem({ newItem, closetItems }),
            /invalid comparison/,
        );

        const wrongShape = fakeClient(replyWith({ hasMatch: true }));
        await assert.rejects(
            createGeminiMatcher({ client: wrongShape }).compareItem({ newItem, closetItems }),
            /invalid comparison/,
        );
    });

    it('drops matches with unknown ids and recomputes hasMatch', async () => {
        const client = fakeClient(replyWith({ hasMatch: true, matches: [{ ...shirtMatch, id: 'zz9' }] }));
        const result = await createGeminiMatcher({ client }).compareItem({ newItem, closetItems });
        assert.deepEqual(result, { hasMatch: false, matches: [] });
    });
});
