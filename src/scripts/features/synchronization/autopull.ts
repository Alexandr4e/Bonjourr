import { tradThis } from '../../utils/translations.ts'
import { SYNC_DEFAULT } from '../../defaults.ts'

import type { Sync } from '../../../types/sync.ts'

// Validation

/**
 * Checks that data looks like a Bonjourr export before applying it automatically.
 * Returns an error message, or an empty string when data is valid.
 */
export function validateExport(data: unknown): string {
    if (!isPlainObject(data)) {
        return 'not an object'
    }

    const about = data.about

    if (!isPlainObject(about) || typeof about.version !== 'string') {
        return 'missing about.version'
    }

    const defaults = SYNC_DEFAULT as unknown as Record<string, unknown>

    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('links') && key.length === 11) {
            if (!isPlainObject(value) || value._id !== key) {
                return `invalid link "${key}"`
            }
            continue
        }

        if (!(key in defaults)) {
            return `unknown key "${key}"`
        }

        const expected = defaults[key]

        // Compare shapes only: Bonjourr itself sometimes stores numbers as strings (ex: linksrow)
        if (expected !== undefined && shapeOf(value) !== shapeOf(expected)) {
            return `wrong type for "${key}"`
        }
    }

    return ''
}

// Sensitive changes

/**
 * Lists settings that can send the user elsewhere or load remote content.
 * These are not applied automatically, the user has to confirm.
 */
export function sensitiveChanges(current: Sync, incoming: Sync): string[] {
    const curr = current as unknown as Record<string, unknown>
    const next = incoming as unknown as Record<string, unknown>
    const changes: string[] = []

    let linksChanged = false

    for (const key of Object.keys(next)) {
        const isLinkKey = key.startsWith('links') && key.length === 11

        if (isLinkKey && !isEqual(curr[key], next[key])) {
            linksChanged = true
        }
    }

    if (linksChanged) {
        changes.push(tradThis('Quick Links'))
    }

    if (next.css !== undefined && !isEqual(curr.css, next.css)) {
        changes.push(tradThis('Custom CSS'))
    }

    if (next.favicon !== undefined && !isEqual(curr.favicon, next.favicon)) {
        changes.push(tradThis('Favicon'))
    }

    const currSearch = curr.searchbar as Record<string, unknown> | undefined
    const nextSearch = next.searchbar as Record<string, unknown> | undefined

    if (nextSearch) {
        const engineChanged = !isEqual(currSearch?.engine, nextSearch.engine)
        const requestChanged = !isEqual(currSearch?.request, nextSearch.request)

        if (engineChanged || requestChanged) {
            changes.push(tradThis('Search engine'))
        }
    }

    const currBackgrounds = curr.backgrounds as Record<string, unknown> | undefined
    const nextBackgrounds = next.backgrounds as Record<string, unknown> | undefined

    if (nextBackgrounds && !isEqual(currBackgrounds?.urls, nextBackgrounds.urls)) {
        changes.push(tradThis('Background URLs'))
    }

    return changes
}

// Confirmation banner

export function showGistBanner(changes: string[], onApply: () => void, onIgnore: () => void): void {
    document.getElementById('gist-autopull-banner')?.remove()

    const banner = document.createElement('div')
    const text = document.createElement('span')
    const apply = document.createElement('button')
    const ignore = document.createElement('button')

    banner.id = 'gist-autopull-banner'
    banner.setAttribute('role', 'alert')
    banner.style.cssText = [
        'position: fixed',
        'bottom: 1.5em',
        'left: 50%',
        'transform: translateX(-50%)',
        'z-index: 9999',
        'display: flex',
        'gap: 1em',
        'align-items: center',
        'max-width: 90vw',
        'padding: 0.8em 1.2em',
        'border-radius: 0.8em',
        'background: #000c',
        'color: #fff',
        'font-size: 14px',
        'font-family: system-ui, sans-serif',
    ].join(';')

    text.textContent = `${tradThis('Synced Gist changed sensitive settings:')} ${changes.join(', ')}`

    for (const button of [apply, ignore]) {
        button.style.cssText = [
            'padding: 0.4em 0.9em',
            'border: none',
            'border-radius: 0.5em',
            'cursor: pointer',
            'font: inherit',
        ].join(';')
    }

    apply.textContent = tradThis('Apply')
    apply.style.background = '#fff'
    apply.style.color = '#000'

    ignore.textContent = tradThis('Ignore')
    ignore.style.background = '#fff3'
    ignore.style.color = '#fff'

    apply.addEventListener('click', () => {
        banner.remove()
        onApply()
    })

    ignore.addEventListener('click', () => {
        banner.remove()
        onIgnore()
    })

    banner.append(text, apply, ignore)
    document.body.appendChild(banner)
}

// Helpers

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function shapeOf(value: unknown): 'array' | 'object' | 'primitive' | 'other' {
    if (Array.isArray(value)) {
        return 'array'
    }
    if (isPlainObject(value)) {
        return 'object'
    }
    if (['string', 'number', 'boolean'].includes(typeof value)) {
        return 'primitive'
    }
    return 'other'
}

/** Deep equality that ignores object key order */
function isEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false
        }
        for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) {
                return false
            }
        }
        return true
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        const aKeys = Object.keys(a)
        const bKeys = Object.keys(b)

        if (aKeys.length !== bKeys.length) {
            return false
        }
        for (const key of aKeys) {
            if (!isEqual(a[key], b[key])) {
                return false
            }
        }
        return true
    }

    return false
}
