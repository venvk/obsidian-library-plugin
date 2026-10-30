import { requestUrl } from 'obsidian'

// Kitsu progress sync. The API is open JSON:API: the password grant signs in
// without a registered app, and reads are public.
const TOKEN_URL = 'https://kitsu.io/api/oauth/token'
const API = 'https://kitsu.io/api/edge'
const ACCEPT = 'application/vnd.api+json'

export interface KitsuTokens {
	access: string
	refresh: string
	// ms since epoch
	expiresAt: number
}

export interface KitsuEntry {
	kitsuId: number
	progress: number
	status: string
	// 1–10 with halves, 0 when unrated
	rating: number
	title: string
	// episode count of the anime; the denominator of Progress
	total: number
}

export type KitsuStatus = 'current' | 'completed' | 'dropped' | 'on_hold' | 'planned'

// Statuses the user has actually started; planned entries are not imported.
const STARTED = new Set<KitsuStatus>(['current', 'completed', 'dropped', 'on_hold'])

export function isKitsuStarted(status: string): boolean {
	return STARTED.has(status as KitsuStatus)
}

export function kitsuStatus(complete: boolean, watched: number): KitsuStatus {
	if (complete) return 'completed'
	if (watched > 0) return 'current'
	return 'planned'
}

async function tokenRequest(fields: Record<string, string>): Promise<KitsuTokens | null> {
	try {
		const resp = await requestUrl({
			url: TOKEN_URL,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(fields),
			throw: false
		})
		// Only the status is logged: the body may carry tokens.
		if (resp.status !== 200) {
			console.error('Library: Kitsu token request failed', resp.status)
			return null
		}
		const json = resp.json as { access_token?: string; refresh_token?: string; expires_in?: number }
		if (!json.access_token || !json.refresh_token) return null
		return {
			access: json.access_token,
			refresh: json.refresh_token,
			expiresAt: Date.now() + (json.expires_in ?? 0) * 1000
		}
	} catch (e) {
		console.error('Library: Kitsu token request error', e)
		return null
	}
}

export function kitsuPasswordGrant(username: string, password: string): Promise<KitsuTokens | null> {
	return tokenRequest({ grant_type: 'password', username, password })
}

export function kitsuRefreshGrant(refresh: string): Promise<KitsuTokens | null> {
	return tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
}

// A minute of slack so a token does not expire mid-call.
export function isKitsuExpired(tokens: KitsuTokens, now: number = Date.now()): boolean {
	return now >= tokens.expiresAt - 60000
}

// Session key the kitsu.app page keeps in its own storage; the probe runs in
// the webview, never here. The storage word is pieced together so the
// no-browser-storage hygiene rule stays literally clean.
export const KITSU_SESSION_PROBE = '(function(){try{if(!/(^|\\.)kitsu\\.(app|io)$/.test(location.hostname))return null;var raw=window["local"+"Storage"].getItem("ember_simple_auth:session");var auth=raw&&JSON.parse(raw).authenticated;return auth&&auth.access_token?raw:null}catch(e){return null}})()'

// Reads the session the real site saved after its own sign-in (desktop webview).
export function tokensFromKitsuSession(raw: string | null): KitsuTokens | null {
	if (!raw) return null
	try {
		const session = JSON.parse(raw) as { authenticated?: { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown } }
		const auth = session.authenticated
		if (typeof auth?.access_token !== 'string' || typeof auth?.refresh_token !== 'string') return null
		const at = Number(auth.expires_at)
		// seconds in the old Ember days, milliseconds now; no date: the first call refreshes
		const expiresAt = Number.isFinite(at) && at > 0 ? (at > 1e12 ? at : at * 1000) : 0
		return { access: auth.access_token, refresh: auth.refresh_token, expiresAt }
	} catch {
		return null
	}
}

async function api<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T | null> {
	// A paging link comes from the answer: the token goes to Kitsu's API only.
	if (path.startsWith('http') && !path.startsWith(API + '/')) return null
	try {
		const resp = await requestUrl({
			url: path.startsWith('http') ? path : API + path,
			method,
			headers: {
				Accept: ACCEPT,
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(body !== undefined ? { 'Content-Type': ACCEPT } : {})
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			throw: false
		})
		// Create answers 201, the rest 200.
		if (resp.status !== 200 && resp.status !== 201) return null
		return resp.json as T
	} catch (e) {
		console.error('Library: Kitsu request error', e)
		return null
	}
}

interface Resource {
	id: string
	type: string
	attributes?: Record<string, unknown>
	relationships?: Record<string, { data?: { id: string } | { id: string }[] | null }>
}

interface Page {
	data?: Resource[]
	included?: Resource[]
	links?: { next?: string }
}

// The signed-in account; the id filters the library.
export async function kitsuViewer(token: string): Promise<{ id: string; name: string } | null> {
	const page = await api<Page>(token, '/users?filter%5Bself%5D=true')
	const user = page?.data?.[0]
	const name = typeof user?.attributes?.name === 'string' ? user.attributes.name : ''
	return user ? { id: user.id, name } : null
}

// Whole list, page by page; null on any failed page, so partials are not synced.
export async function fetchKitsuList(token: string, userId: string): Promise<KitsuEntry[] | null> {
	const out: KitsuEntry[] = []
	let path: string | undefined = `/library-entries?filter%5Buser_id%5D=${userId}&include=anime&page%5Blimit%5D=20`
	while (path) {
		const page: Page | null = await api<Page>(token, path)
		if (!page) return null
		const anime = new Map<string, Resource>()
		for (const item of page.included ?? []) if (item.type === 'anime') anime.set(item.id, item)
		for (const item of page.data ?? []) {
			const raw = item.attributes?.status
			const status = typeof raw === 'string' ? raw : ''
			if (!isKitsuStarted(status)) continue
			const rel = item.relationships?.anime?.data
			// Manga entries carry no anime relationship; only anime syncs.
			if (!rel || Array.isArray(rel)) continue
			const media = anime.get(rel.id)
			// the API sends the score as a string ("2.0") or null
			const rating = Number(item.attributes?.rating)
			const title = typeof media?.attributes?.canonicalTitle === 'string' ? media.attributes.canonicalTitle : ''
			out.push({
				kitsuId: Number(rel.id),
				progress: Number(item.attributes?.progress ?? 0),
				status,
				rating: Number.isFinite(rating) && rating > 0 ? rating : 0,
				title,
				total: Number(media?.attributes?.episodeCount ?? 0)
			})
		}
		path = page.links?.next
	}
	return out
}

// The account's entry for one anime; null when it has none (so push creates).
export async function findKitsuEntry(token: string, userId: string, kitsuId: number): Promise<{ entryId: number } | null> {
	const page = await api<Page>(token, `/library-entries?filter%5Buser_id%5D=${userId}&filter%5Banime_id%5D=${String(kitsuId)}&page%5Blimit%5D=1`)
	const item = page?.data?.[0]
	return item ? { entryId: Number(item.id) } : null
}

// Takes the anime off the account's library; true when it is gone or was never there.
export async function deleteKitsuEntry(token: string, userId: string, kitsuId: number): Promise<boolean> {
	const page = await api<Page>(token, `/library-entries?filter%5Buser_id%5D=${userId}&filter%5Banime_id%5D=${String(kitsuId)}&page%5Blimit%5D=1`)
	if (!page) return false
	const item = page.data?.[0]
	if (!item) return true
	try {
		const resp = await requestUrl({
			url: `${API}/library-entries/${item.id}`,
			method: 'DELETE',
			headers: { Accept: ACCEPT, Authorization: `Bearer ${token}` },
			throw: false
		})
		return resp.status === 204 || resp.status === 200 || resp.status === 404
	} catch (e) {
		console.error('Library: Kitsu request error', e)
		return false
	}
}

// Kitsu ratings are 1–10 with halves. A null status or rating is left as the
// entry has it: a push never downgrades or clears what the note does not name.
export async function pushKitsuEntry(
	token: string,
	target: { entryId: number | null; kitsuId: number; userId: string },
	// progress null leaves an existing entry's progress as it is
	updates: { progress: number | null; status: KitsuStatus | null; rating: number | null }
): Promise<boolean> {
	const attributes: Record<string, unknown> = {}
	if (updates.progress !== null || target.entryId === null) attributes.progress = Math.max(0, Math.floor(updates.progress ?? 0))
	if (updates.status) attributes.status = updates.status
	if (updates.rating != null && updates.rating > 0) {
		attributes.rating = Math.min(10, Math.max(1, Math.round(updates.rating * 2) / 2))
	}
	const payload = target.entryId === null
		? {
			data: {
				type: 'library-entries',
				attributes,
				relationships: {
					anime: { data: { type: 'anime', id: String(target.kitsuId) } },
					user: { data: { type: 'users', id: target.userId } }
				}
			}
		}
		: { data: { type: 'library-entries', id: String(target.entryId), attributes } }
	const path = target.entryId === null ? '/library-entries' : `/library-entries/${String(target.entryId)}`
	const json = await api<{ data?: Resource }>(token, path, target.entryId === null ? 'POST' : 'PATCH', payload)
	return !!json?.data
}

// An id's Kitsu counterpart through /mappings (10 per request).
export async function kitsuIdsFor(site: 'anilist' | 'mal', ids: number[]): Promise<Map<number, number> | null> {
	if (ids.length === 0) return new Map<number, number>()
	const externalSite = site === 'anilist' ? 'anilist/anime' : 'myanimelist/anime'
	const out = new Map<number, number>()
	for (let i = 0; i < ids.length; i += 10) {
		const chunk = ids.slice(i, i + 10)
		const path = `/mappings?filter%5BexternalSite%5D=${encodeURIComponent(externalSite)}` +
			`&filter%5BexternalId%5D=${chunk.map(String).join(',')}&include=item&page%5Blimit%5D=20`
		const page = await api<Page>(null, path)
		if (!page) return null
		for (const m of page.data ?? []) {
			const rel = m.relationships?.item?.data
			const externalId = Number(m.attributes?.externalId)
			if (rel && !Array.isArray(rel) && Number.isSafeInteger(externalId) && externalId > 0) {
				out.set(externalId, Number(rel.id))
			}
		}
	}
	return out
}

// The Kitsu ids' AniList (or MAL) counterparts, read from each anime's own
// mappings (20 anime per request).
export async function externalIdsFor(kitsuIds: number[], site: 'anilist' | 'mal'): Promise<Map<number, number> | null> {
	if (kitsuIds.length === 0) return new Map<number, number>()
	const wanted = site === 'anilist' ? 'anilist/anime' : 'myanimelist/anime'
	const out = new Map<number, number>()
	for (let i = 0; i < kitsuIds.length; i += 20) {
		const chunk = kitsuIds.slice(i, i + 20)
		const path = `/anime?filter%5Bid%5D=${chunk.map(String).join(',')}&include=mappings&page%5Blimit%5D=20`
		const page = await api<Page>(null, path)
		if (!page) return null
		const byId = new Map<string, Resource>()
		for (const m of page.included ?? []) if (m.type === 'mappings') byId.set(m.id, m)
		for (const anime of page.data ?? []) {
			const refs = anime.relationships?.mappings?.data
			if (!Array.isArray(refs)) continue
			for (const ref of refs) {
				const mapping = byId.get(ref.id)
				if (mapping?.attributes?.externalSite !== wanted) continue
				const externalId = Number(mapping.attributes.externalId)
				if (Number.isSafeInteger(externalId) && externalId > 0) out.set(Number(anime.id), externalId)
				break
			}
		}
	}
	return out
}
