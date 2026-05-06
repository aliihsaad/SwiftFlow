import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildMediaResultSnapshot,
    getExistingMediaUrls,
    shouldGenerateAutomationImage,
} from '../lib/publishing-automation-run-media.ts'

test('detects generated-image runs that still need media', () => {
    assert.equal(
        shouldGenerateAutomationImage({
            workflow_config: { media_mode: 'generated_image' },
            post_media_urls: [],
        }),
        true,
    )
})

test('does not regenerate image when post already has media', () => {
    assert.equal(
        shouldGenerateAutomationImage({
            workflow_config: { media_mode: 'generated_image' },
            post_media_urls: ['https://example.com/image.png'],
        }),
        false,
    )
})

test('preserves existing run snapshot fields while adding media', () => {
    const snapshot = buildMediaResultSnapshot(
        {
            idea: { title: 'Original idea' },
            caption: 'Original caption',
            draft_created_at: '2026-05-05T19:18:11.192Z',
            media_urls: [],
        },
        ['https://example.com/generated.png'],
        'post-123',
    )

    assert.deepEqual(snapshot, {
        idea: { title: 'Original idea' },
        caption: 'Original caption',
        draft_created_at: '2026-05-05T19:18:11.192Z',
        media_urls: ['https://example.com/generated.png'],
        post_id: 'post-123',
    })
})

test('normalizes malformed media url values to an empty list', () => {
    assert.deepEqual(getExistingMediaUrls(['', null, 'https://example.com/a.png', 42]), ['https://example.com/a.png'])
    assert.deepEqual(getExistingMediaUrls({ url: 'https://example.com/a.png' }), [])
})
