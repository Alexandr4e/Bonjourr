import { assertEquals, assertNotEquals } from '@std/assert'
import '../init.ts'

import type { Sync } from '../../src/types/sync.ts'

const { validateExport, sensitiveChanges } = await import('../../src/scripts/features/synchronization/autopull.ts')
const { filterData } = await import('../../src/scripts/compatibility/apply.ts')
const { SYNC_DEFAULT } = await import('../../src/scripts/defaults.ts')

const link = {
    _id: 'linksabcdef',
    order: 0,
    parent: 'default',
    title: 'Instagram',
    url: 'https://www.instagram.com/',
}

function config(extra: Record<string, unknown> = {}): Sync {
    return { ...structuredClone(SYNC_DEFAULT), linksabcdef: structuredClone(link), ...extra } as unknown as Sync
}

Deno.test('Gist auto pull: export validation', async (t) => {
    await t.step('accepts default settings with a link', () => {
        assertEquals(validateExport(config()), '')
    })

    await t.step('accepts numbers stored as strings, like Bonjourr does', () => {
        assertEquals(validateExport(config({ linksrow: '16', linkiconradius: '1.5' })), '')
    })

    await t.step('accepts an old export once upgraded', () => {
        const old = JSON.parse(Deno.readTextFileSync('./tests/compatibility/configs/20.4.2.json'))
        assertEquals(validateExport(filterData('update', old)), '')
    })

    await t.step('rejects non objects and missing version', () => {
        assertNotEquals(validateExport('hello'), '')
        assertNotEquals(validateExport([]), '')
        assertNotEquals(validateExport({ lang: 'en' }), '')
    })

    await t.step('rejects unknown keys and wrong types', () => {
        assertNotEquals(validateExport(config({ hacked: true })), '')
        assertNotEquals(validateExport(config({ css: { evil: true } })), '')
        assertNotEquals(validateExport(config({ lang: null })), '')
        assertNotEquals(validateExport(config({ searchbar: [] })), '')
    })

    await t.step('rejects malformed links', () => {
        assertNotEquals(validateExport(config({ linksabcdef: 'https://evil.example' })), '')
        assertNotEquals(validateExport(config({ linksabcdef: { ...link, _id: 'linkszzzzzz' } })), '')
    })
})

Deno.test('Gist auto pull: sensitive changes', async (t) => {
    await t.step('notes only is safe', () => {
        const next = config({ notes: { ...SYNC_DEFAULT.notes, text: 'new task' } })
        assertEquals(sensitiveChanges(config(), next), [])
    })

    await t.step('key order does not matter', () => {
        const reordered = config({
            linksabcdef: { url: link.url, title: link.title, _id: link._id, parent: 'default', order: 0 },
        })
        assertEquals(sensitiveChanges(config(), reordered), [])
    })

    await t.step('detects changed and added links', () => {
        const changed = config({ linksabcdef: { ...link, url: 'https://evil.example' } })
        const added = config({ linksxxxxxx: { ...link, _id: 'linksxxxxxx' } })
        assertEquals(sensitiveChanges(config(), changed).length, 1)
        assertEquals(sensitiveChanges(config(), added).length, 1)
    })

    await t.step('detects css, favicon, search engine and background urls', () => {
        assertEquals(sensitiveChanges(config(), config({ css: 'body{}' })).length, 1)
        assertEquals(sensitiveChanges(config(), config({ favicon: 'https://evil.example/x.ico' })).length, 1)

        const search = config({ searchbar: { ...SYNC_DEFAULT.searchbar, request: 'https://evil.example/?q=%s' } })
        assertEquals(sensitiveChanges(config(), search).length, 1)

        const bg = config({ backgrounds: { ...SYNC_DEFAULT.backgrounds, urls: 'https://evil.example/bg.jpg' } })
        assertEquals(sensitiveChanges(config(), bg).length, 1)
    })
})
