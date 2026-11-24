import { assertEquals } from '@std/assert'
import '../init.ts'

import type { Local } from '../../src/types/local.ts'

const { autoPullGist } = await import('../../src/scripts/features/synchronization/gist.ts')
const { LOCAL_DEFAULT } = await import('../../src/scripts/defaults.ts')

const realFetch = globalThis.fetch

function mockGist(updatedAt: string): void {
    globalThis.fetch = (() => {
        const body = { updated_at: updatedAt, files: { 'bonjourr-export.json': { content: '{"about":{}}' } } }
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    }) as typeof fetch
}

function localWith(extra: Partial<Local>): Local {
    return { ...structuredClone(LOCAL_DEFAULT), syncType: 'gist', gistToken: 'token', gistId: 'abc123', ...extra }
}

Deno.test('Gist auto pull', async (t) => {
    await t.step('skips when sync type is not gist', async () => {
        mockGist('2026-01-01T00:00:00Z')
        const result = await autoPullGist(localWith({ syncType: 'browser' }))
        assertEquals(result.status, 'skipped')
    })

    await t.step('skips without token or gist id', async () => {
        mockGist('2026-01-01T00:00:00Z')
        assertEquals((await autoPullGist(localWith({ gistToken: '' }))).status, 'skipped')
        assertEquals((await autoPullGist(localWith({ gistId: undefined }))).status, 'skipped')
    })

    await t.step('skips when checked less than a minute ago', async () => {
        mockGist('2026-01-01T00:00:00Z')
        const result = await autoPullGist(localWith({ gistCheckedAt: Date.now() }))
        assertEquals(result.status, 'skipped')
    })

    await t.step('first run only saves a baseline, never applies', async () => {
        mockGist('2026-01-01T00:00:00Z')
        const result = await autoPullGist(localWith({}))
        assertEquals(result.status, 'baseline')
    })

    await t.step('unchanged gist is not applied', async () => {
        mockGist('2026-01-01T00:00:00Z')
        const result = await autoPullGist(localWith({ gistSyncedAt: '2026-01-01T00:00:00Z' }))
        assertEquals(result.status, 'unchanged')
    })

    await t.step('updated gist is returned for apply', async () => {
        mockGist('2026-02-01T00:00:00Z')
        const result = await autoPullGist(localWith({ gistSyncedAt: '2026-01-01T00:00:00Z' }))
        assertEquals(result.status, 'changed')
    })

    await t.step('network error is swallowed', async () => {
        globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch
        const result = await autoPullGist(localWith({ gistSyncedAt: '2026-01-01T00:00:00Z' }))
        assertEquals(result.status, 'skipped')
    })

    globalThis.fetch = realFetch
})
