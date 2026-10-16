// backend/tagger.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTagger, normalizeTags } from './tagger.js';

function fakeClient(response) {
    const calls = [];
    return {
        calls,
        messages: {
            async parse(params, options) {
                calls.push({ params, options });
                return response;
            },
        },
    };
}

const ok = (parsed_output) => ({ stop_reason: 'end_turn', parsed_output });
const shirt = { category: 'top', subType: 'button-down shirt', color: 'light blue' };

describe('createTagger', () => {
    it('returns { category, subType, color } from a valid parsed output', async () => {
        const tagger = createTagger({ client: fakeClient(ok(shirt)) });
        assert.deepEqual(await tagger.tag(Buffer.from('img'), 'image/jpeg'), shirt);
    });

    it('sends the model, a base64 image block, effort and request options', async () => {
        const client = fakeClient(ok(shirt));
        await createTagger({ client }).tag(Buffer.from('img'), 'image/png');

        assert.equal(client.calls.length, 1);
        const { params, options } = client.calls[0];
        assert.equal(params.model, 'claude-haiku-5-5');
        assert.equal(params.max_tokens, 1024);
        assert.equal(params.output_config.effort, 'low');
        assert.ok(params.output_config.format);
        const image = params.messages[0].content.find((block) => block.type === 'image');
        assert.deepEqual(image.source, {
            type: 'base64',
            media_type: 'image/png',
            data: Buffer.from('img').toString('base64'),
        });
        assert.deepEqual(options, { timeout: 8000, maxRetries: 0 });
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

    it('throws on a refusal and on a null parsed_output', async () => {
        const refused = createTagger({ client: fakeClient({ stop_reason: 'refusal', parsed_output: null }) });
        await assert.rejects(refused.tag(Buffer.from('img'), 'image/jpeg'), /refused/);

        const empty = createTagger({ client: fakeClient(ok(null)) });
        await assert.rejects(empty.tag(Buffer.from('img'), 'image/jpeg'), /no tags/);
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
