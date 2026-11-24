import { autoPullGist, findGistId, isGistTokenValid, retrieveGistWithDate, sendGist, setGistStatus } from './gist.ts'
import { sensitiveChanges, showGistBanner, validateExport } from './autopull.ts'
import { isDistantUrlValid, receiveFromURL } from './url.ts'
import { onSettingsLoad } from '../../utils/onsettingsload.ts'
import { networkForm } from '../../shared/form.ts'
import { fadeOut } from '../../shared/dom.ts'
import { storage } from '../../storage.ts'

import type { Local, SyncType } from '../../../types/local.ts'
import type { Sync } from '../../../types/sync.ts'

interface SyncUpdate {
    type?: string
    freq?: string
    url?: string
    status?: string
    gistToken?: string
    firefoxPersist?: boolean
    down?: true
    up?: true
}

const gistsyncform = networkForm('f_gistsync')
const urlsyncform = networkForm('f_urlsync')

export function synchronization(init?: Local, update?: SyncUpdate): void {
    if (init) {
        onSettingsLoad(() => {
            toggleSyncSettingsOption(init)
        })

        gistAutoPull(init)
    }

    if (update) {
        updateSyncOption(update)
    }
}

async function gistAutoPull(local: Local): Promise<void> {
    const result = await autoPullGist(local)

    if (result.status === 'skipped') {
        return
    }

    storage.local.set({ gistCheckedAt: Date.now() })

    if (result.status === 'baseline') {
        storage.local.set({ gistSyncedAt: result.updatedAt })
    }

    if (result.status === 'changed') {
        const error = validateExport(result.data)

        if (error) {
            console.warn(`Gist auto pull ignored, not a valid Bonjourr export: ${error}`)
            return
        }

        const data = result.data as Sync
        const updatedAt = result.updatedAt
        const current = await storage.sync.get()
        const changes = sensitiveChanges(current, data)

        const apply = async () => {
            await storage.sync.set(data)
            storage.local.set({ gistSyncedAt: updatedAt })
            fadeOut()
        }

        const ignore = () => {
            storage.local.set({ gistSyncedAt: updatedAt })
        }

        if (changes.length === 0) {
            apply()
        } else {
            showGistBanner(changes, apply, ignore)
        }
    }
}

async function updateSyncOption(update: SyncUpdate): Promise<void> {
    const local = await storage.local.get(['gistId', 'gistToken', 'distantUrl', 'syncType'])
    const data = await storage.sync.get()

    if (update.down) {
        if (local.syncType === 'gist') {
            gistsyncform.load()

            try {
                const id = local.gistId ?? ''
                const token = local.gistToken ?? ''
                const { data, updatedAt } = await retrieveGistWithDate(token, id)
                storage.sync.set(data)
                storage.local.set({ gistSyncedAt: updatedAt })
                fadeOut()
            } catch (err) {
                gistsyncform.warn(err as string)
            }
        }

        if (local.syncType === 'url') {
            urlsyncform.load()

            try {
                const update = await receiveFromURL(local.distantUrl)
                storage.sync.set(update)
                fadeOut()
            } catch (err) {
                urlsyncform.warn(err as string)
            }
        }
    }

    if (update.up) {
        if (local.syncType === 'gist') {
            gistsyncform.load()

            try {
                const token = local.gistToken ?? ''
                const sent = await sendGist(token, local.gistId, data)

                gistsyncform.accept()

                local.gistId = sent.id
                local.gistSyncedAt = sent.updatedAt
                storage.local.set({ gistId: sent.id, gistSyncedAt: sent.updatedAt })
                toggleSyncSettingsOption(local)
            } catch (error) {
                gistsyncform.warn(error as string)
            }
        }
    }

    if (update.gistToken === '') {
        local.gistToken = ''
        local.gistId = ''
        storage.local.remove('gistToken')
        storage.local.remove('gistId')
        storage.local.remove('gistSyncedAt')
        storage.local.remove('gistCheckedAt')
        gistsyncform.accept()
        toggleSyncSettingsOption(local)
        return
    }

    if (update.url === '') {
        local.distantUrl = ''
        storage.local.remove('distantUrl')
        toggleSyncSettingsOption(local)
        return
    }

    if (update.gistToken) {
        gistsyncform.load()

        try {
            local.gistToken = update.gistToken
            local.gistId = await findGistId(local.gistToken)

            storage.local.set({ gistId: local.gistId })
            storage.local.set({ gistToken: local.gistToken })

            gistsyncform.accept()
            toggleSyncSettingsOption(local)
        } catch (error) {
            gistsyncform.warn(error as string)
        }
    }

    if (update.url) {
        urlsyncform.load()

        try {
            await receiveFromURL(update.url)
            urlsyncform.accept('i_urlsync', update.url)

            local.distantUrl = update.url
            storage.local.set({ distantUrl: update.url })
            toggleSyncSettingsOption(local)
        } catch (error) {
            urlsyncform.warn(error as string)
        }
    }

    if (isSyncType(update.type)) {
        local.syncType = update.type
        storage.local.set({ syncType: local.syncType })
        storage.type.change(update.type === 'browser' ? 'sync' : 'local', data)

        toggleSyncSettingsOption(local)
        handleStoragePersistence(update.type)
    }

    if (update.firefoxPersist) {
        localStorage.choseStoragePersistence = 'true'
        toggleSyncSettingsOption(local)
    }
}

async function handleStoragePersistence(type?: SyncType): Promise<boolean | undefined> {
    if (!navigator?.storage?.persisted) {
        return
    }

    const persisted = await navigator.storage.persisted()

    if (type !== 'off') {
        return
    }

    if (!persisted) {
        await navigator.storage.persist()
    }
}

async function toggleSyncSettingsOption(local?: Local): Promise<void> {
    const gistId = local?.gistId
    const gistToken = local?.gistToken
    const distantUrl = local?.distantUrl
    const type = local?.syncType

    const iGistsync = document.querySelector<HTMLInputElement>('#i_gistsync')
    const iUrlsync = document.querySelector<HTMLInputElement>('#i_urlsync')
    const bGistdown = document.querySelector<HTMLInputElement>('#b_gistdown')
    const bGistup = document.querySelector<HTMLInputElement>('#b_gistup')
    const bUrldown = document.querySelector<HTMLInputElement>('#b_urldown')

    bGistdown?.setAttribute('disabled', '')
    bUrldown?.setAttribute('disabled', '')
    bGistup?.setAttribute('disabled', '')

    if (iGistsync && gistToken) {
        iGistsync.value = gistToken
    }
    if (iUrlsync && distantUrl) {
        iUrlsync.value = distantUrl
    }

    const choseStoragePersistence = localStorage.choseStoragePersistence === 'true'
    document.getElementById('disabled-sync')?.classList.toggle('shown', !choseStoragePersistence)

    switch (type) {
        case 'off':
        case 'browser': {
            document.getElementById('url-sync')?.classList.remove('shown')
            document.getElementById('sync-freq')?.classList.remove('shown')
            document.getElementById('gist-sync')?.classList.remove('shown')
            break
        }

        case 'gist': {
            document.getElementById('gist-sync')?.classList.add('shown')
            document.getElementById('url-sync')?.classList.remove('shown')
            document.getElementById('disabled-sync')?.classList.remove('shown')

            const isValid = await isGistTokenValid(gistToken)

            if (isValid) {
                bGistdown?.removeAttribute('disabled')
                bGistup?.removeAttribute('disabled')
            }

            setGistStatus(gistToken, gistId)

            break
        }

        case 'url': {
            document.getElementById('url-sync')?.classList.add('shown')
            document.getElementById('gist-sync')?.classList.remove('shown')
            document.getElementById('disabled-sync')?.classList.remove('shown')

            if (await isDistantUrlValid(distantUrl)) {
                bUrldown?.removeAttribute('disabled')
            }

            break
        }

        default:
    }
}

// Type check

function isSyncType(val = ''): val is SyncType {
    return ['browser', 'gist', 'url', 'off'].includes(val)
}

// function isSyncFreq(val: string): val is SyncFreq {
// 	return ['newtabs', 'start', 'manual'].includes(val)
// }
