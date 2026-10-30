import { requestUrl } from 'obsidian'
import { MalProvider } from './providers/mal'
import { MangaProvider } from './providers/manga'

// MyAnimeList progress sync. MAL has no PIN page: the plugin's registered web
// client (redirect http://localhost, PKCE plain) is embedded. OAuth client, PKCE
// and token refresh adapted from RobertoJarquinRR's fork (MIT).
const AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize'
const TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token'
const API = 'https://api.myanimelist.net/v2'
const ANILIST = 'https://graphql.anilist.co'

// The plugin's registered client; no client_secret (PKCE public client).
export const MAL_CLIENT_ID = '2f13c7079ccc195191fc2fac84d0fdf5'
export const MAL_CLIENT_SECRET = ''

// The user's own registration when set, else the embedded PKCE client: tokens are
// bound to the issuing client.
export function malClientPair(creds: { malClientId: string; malClientSecret: string }): { id: string; secret: string } {
	const own = creds.malClientId.trim()
	return own ? { id: own, secret: creds.malClientSecret.trim() } : { id: MAL_CLIENT_ID, secret: MAL_CLIENT_SECRET }
}

export interface MalTokens {
	access: string
	refresh: string
	// ms since epoch
	expiresAt: number
}

export interface MalEntry {
	malId: number
	progress: number
	status: string
	score: number
	title: string
	// Episodes for anime, chapters for manga; the denominator of Progress.
	total: number
}

export type MalStatus = 'watching' | 'reading' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch' | 'plan_to_read'

// Statuses the user has actually started; plan_to_* entries are not imported.
const STARTED = new Set<MalStatus>(['watching', 'reading', 'completed', 'on_hold', 'dropped'])

export function isStarted(status: string): boolean {
	return STARTED.has(status as MalStatus)
}

// 96 bytes make 128 base64url chars, the longest RFC 7636 verifier allows.
export function makeVerifier(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(96))
	let binary = ''
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_')
}

export function malAuthUrl(clientId: string, verifier: string): string {
	return `${AUTH_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
		`&code_challenge=${verifier}&code_challenge_method=plain`
}

// Code from the app's localhost redirect; the host is compared exactly, not by
// prefix (Google's callback also carries `code=`).
export function codeFromRedirect(url: string): string | null {
	let host = ''
	try {
		host = new URL(url).hostname
	} catch {
		return null
	}
	if (host !== 'localhost' || !url.startsWith('http://')) return null
	const match = url.match(/[?&]code=([^&#\s]+)/)
	return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function codeFromInput(input: string): string {
	return codeFromRedirect(input) ?? input.trim()
}

export function malStatus(complete: boolean, watched: number): MalStatus {
	if (complete) return 'completed'
	if (watched > 0) return 'watching'
	return 'plan_to_watch'
}

async function tokenRequest(fields: Record<string, string>, secret: string): Promise<MalTokens | null> {
	const params: string[] = []
	for (const key of Object.keys(fields)) params.push(`${key}=${encodeURIComponent(fields[key] ?? '')}`)
	if (secret) params.push(`client_secret=${encodeURIComponent(secret)}`)
	try {
		const resp = await requestUrl({
			url: TOKEN_URL,
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.join('&'),
			throw: false
		})
		// Only the status is logged: the body may carry tokens.
		if (resp.status !== 200) {
			console.error('Library: MyAnimeList token request failed', resp.status)
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
		console.error('Library: MyAnimeList token request error', e)
		return null
	}
}

export function exchangeCode(clientId: string, secret: string, code: string, verifier: string): Promise<MalTokens | null> {
	return tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier }, secret)
}

export function refreshTokens(clientId: string, secret: string, refresh: string): Promise<MalTokens | null> {
	return tokenRequest({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh }, secret)
}

// A minute of slack so a token does not expire mid-call.
export function isExpired(tokens: MalTokens, now: number = Date.now()): boolean {
	return now >= tokens.expiresAt - 60000
}

async function api<T>(token: string, path: string, method = 'GET', body?: string): Promise<T | null> {
	// A paging link comes from the answer: the token goes to MAL's API only.
	if (path.startsWith('http') && !path.startsWith(API + '/')) return null
	try {
		const resp = await requestUrl({
			url: path.startsWith('http') ? path : API + path,
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
			},
			body,
			throw: false
		})
		if (resp.status !== 200) return null
		return resp.json as T
	} catch (e) {
		console.error('Library: MyAnimeList request error', e)
		return null
	}
}

// MAL scores are 1–10 (0 would clear it); status only when Complete.
export async function pushMalEntry(token: string, malId: number, kind: 'anime' | 'manga', progress: number, status: MalStatus | null, rating: number | null): Promise<boolean> {
	const parts = [`${kind === 'anime' ? 'num_watched_episodes' : 'num_chapters_read'}=${String(Math.max(0, Math.floor(progress)))}`]
	if (status) parts.push(`status=${status}`)
	if (rating != null && rating > 0) parts.push(`score=${String(Math.min(10, Math.max(1, Math.round(rating))))}`)
	const json = await api<{ status?: string }>(token, `/${kind}/${String(malId)}/my_list_status`, 'PATCH', parts.join('&'))
	return !!json?.status
}

// Takes the title off the list; a 404 means it was not on it.
export async function deleteMalEntry(token: string, malId: number, kind: 'anime' | 'manga'): Promise<boolean> {
	try {
		const resp = await requestUrl({
			url: `${API}/${kind}/${String(malId)}/my_list_status`,
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` },
			throw: false
		})
		return resp.status === 200 || resp.status === 404
	} catch (e) {
		console.error('Library: MyAnimeList request error', e)
		return false
	}
}

interface MalListPage {
	data?: { node: { id: number; title?: string; num_episodes?: number; num_chapters?: number }; list_status?: { status?: string; num_episodes_watched?: number; num_chapters_read?: number; score?: number } }[]
	paging?: { next?: string }
}

// Whole list, page by page; null on any failed page, so partials are not synced.
export async function fetchMalList(token: string, kind: 'anime' | 'manga' = 'anime'): Promise<MalEntry[] | null> {
	const out: MalEntry[] = []
	const countField = kind === 'anime' ? 'num_episodes_watched' : 'num_chapters_read'
	const totalField = kind === 'anime' ? 'num_episodes' : 'num_chapters'
	let path: string | undefined = `/users/@me/${kind}list?fields=list_status,title,${totalField},main_picture&limit=1000&nsfw=true`
	while (path) {
		const page: MalListPage | null = await api<MalListPage>(token, path)
		if (!page) return null
		for (const item of page.data ?? []) {
			const st = item.list_status?.status ?? ''
			if (!isStarted(st)) continue
			out.push({
				malId: item.node.id,
				progress: item.list_status?.[countField] ?? 0,
				status: st,
				score: item.list_status?.score ?? 0,
				title: item.node.title ?? '',
				total: item.node[totalField] ?? 0
			})
		}
		path = page.paging?.next
	}
	return out
}

// AniList knows MAL ids, so ids map both ways (50 per page).
async function mapIds(ids: number[], from: 'id' | 'idMal', type: 'ANIME' | 'MANGA'): Promise<Map<number, number> | null> {
	const out = new Map<number, number>()
	for (let i = 0; i < ids.length; i += 50) {
		const page = ids.slice(i, i + 50)
		try {
			const resp = await requestUrl({
				url: ANILIST,
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					query: `query ($ids: [Int]) { Page(perPage: 50) { media(${from}_in: $ids, type: ${type}) { id idMal } } }`,
					variables: { ids: page }
				}),
				throw: false
			})
			if (resp.status !== 200) return null
			const media = (resp.json as { data?: { Page?: { media?: { id: number; idMal: number | null }[] } } })
				.data?.Page?.media ?? []
			for (const m of media) {
				if (m.idMal) out.set(from === 'id' ? m.id : m.idMal, from === 'id' ? m.idMal : m.id)
			}
		} catch (e) {
			console.error('Library: AniList MAL id lookup error', e)
			return null
		}
	}
	return out
}

export function malIdsFor(anilistIds: number[]): Promise<Map<number, number> | null> {
	return mapIds(anilistIds, 'id', 'ANIME')
}

export function anilistIdsFor(malIds: number[]): Promise<Map<number, number> | null> {
	return mapIds(malIds, 'idMal', 'ANIME')
}

export function malMangaIdsFor(anilistIds: number[]): Promise<Map<number, number> | null> {
	return mapIds(anilistIds, 'id', 'MANGA')
}

export function anilistMangaIdsFor(malIds: number[]): Promise<Map<number, number> | null> {
	return mapIds(malIds, 'idMal', 'MANGA')
}

// The id an anime note was added under: AniList's, or MyAnimeList's (`mal:`).
export function animeIds(sourceId: string): { anilist: number | null; mal: number | null } | null {
	const fromMal = sourceId.startsWith(MalProvider.PREFIX)
	const id = Number(fromMal ? sourceId.slice(MalProvider.PREFIX.length) : sourceId)
	if (!Number.isSafeInteger(id) || id <= 0) return null
	return fromMal ? { anilist: null, mal: id } : { anilist: id, mal: null }
}

// Same for manga notes: Source ID is `manga:` + AniList id.
export function mangaIds(sourceId: string): { anilist: number | null; mal: number | null } | null {
	const id = Number(sourceId.startsWith(MangaProvider.PREFIX) ? sourceId.slice(MangaProvider.PREFIX.length) : sourceId)
	if (!Number.isSafeInteger(id) || id <= 0) return null
	return { anilist: id, mal: null }
}
