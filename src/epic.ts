import { requestUrl } from 'obsidian'

// Epic Games Store: library and store URLs via launcher client credentials.
const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a'
const CLIENT_BASIC = 'MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y='
const AUTH_HOST = 'https://account-public-service-prod03.ol.epicgames.com'
const LIBRARY_HOST = 'https://library-service.live.use1a.on.epicgames.com'
const CATALOG_HOST = 'https://catalog-public-service-prod06.ol.epicgames.com'

export const EPIC_AUTH_PROBE = `(() => {
	try {
		const u = window.location.href
		if (u.indexOf('/forward') !== -1) {
			const btns = document.querySelectorAll('button')
			for (let i = 0; i < btns.length; i++) {
				const txt = btns[i].innerText || btns[i].textContent || ''
				if (/продолжить|continue|proceed/i.test(txt)) {
					btns[i].click()
					break
				}
			}
		}
		if (u.indexOf('/id/api/login/provider/') !== -1) return null
		if (u.indexOf('/id/login') !== -1 || u.indexOf('/id/register') !== -1) return null
		const pre = document.querySelector('pre')
		const t = (pre && (pre.innerText || pre.textContent)) || (document.body ? (document.body.innerText || document.body.textContent || '') : '')
		try {
			const parsed = JSON.parse(t.trim())
			if (parsed && typeof parsed.authorizationCode === 'string' && /^[a-f0-9]{32}$/i.test(parsed.authorizationCode)) {
				return parsed.authorizationCode
			}
		} catch {}
		const m = t.match(/authorizationCode[^a-f0-9]+([a-f0-9]{32})/i)
		if (m) return m[1]
		const mu = u.match(/[#?&]code=([a-f0-9]{32})(?:[&#\\s"']|$)/i)
		if (mu) return mu[1]
		return null
	} catch {
		return null
	}
})()`

export interface EpicTokens {
	access: string
	refresh: string
	account: string
	expiresAt: number
	refreshExpiresAt: number
}

export interface EpicGame {
	appName: string
	catalogItemId: string
	namespace: string
	title: string
	imageUrl: string | null
	productSlug: string | null
	playtimeHours: number | null
}

export function epicAuthUrl(): string {
	const redirect = encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`)
	return `https://www.epicgames.com/id/login?redirectUrl=${redirect}`
}

export function codeFromEpicRedirect(url: string): string | null {
	if (!url) return null
	if (url.indexOf('/id/api/login/provider/') !== -1) return null
	if (url.indexOf('/id/login') !== -1 || url.indexOf('/id/register') !== -1) return null
	const match = url.match(/[#?&]code=([a-f0-9]{32})(?:[&#\s"']|$)/i)
	if (match?.[1]) return match[1]
	const jsonMatch = url.match(/"authorizationCode"\s*:\s*"([a-f0-9]{32})"/i)
	if (jsonMatch?.[1]) return jsonMatch[1]
	const rawMatch = url.trim().match(/^[a-f0-9]{32}$/i)
	if (rawMatch?.[0]) return rawMatch[0]
	return null
}

export function epicExpired(tokens: EpicTokens, now: number = Date.now()): boolean {
	return now >= tokens.expiresAt - 60000
}

async function tokenRequest(fields: Record<string, string>): Promise<EpicTokens | null> {
	const body = Object.keys(fields).map(key => `${key}=${encodeURIComponent(fields[key] ?? '')}`).join('&')
	try {
		const resp = await requestUrl({
			url: `${AUTH_HOST}/account/api/oauth/token`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Authorization: `Basic ${CLIENT_BASIC}`,
			},
			body,
			throw: false,
		})
		if (resp.status !== 200) {
			console.error('Library: Epic Games token request failed', resp.status)
			return null
		}
		const json = resp.json as {
			access_token?: string
			refresh_token?: string
			account_id?: string
			expires_in?: number
			refresh_expires?: number
		}
		if (!json.access_token || !json.refresh_token) return null
		const now = Date.now()
		return {
			access: json.access_token,
			refresh: json.refresh_token,
			account: json.account_id ?? '',
			expiresAt: now + (json.expires_in ?? 0) * 1000,
			refreshExpiresAt: now + (json.refresh_expires ?? 0) * 1000,
		}
	} catch (e) {
		console.error('Library: Epic Games token error', e)
		return null
	}
}

export function exchangeEpicCode(code: string): Promise<EpicTokens | null> {
	return tokenRequest({ grant_type: 'authorization_code', code, token_type: 'eg1' })
}

export function refreshEpicTokens(refresh: string): Promise<EpicTokens | null> {
	return tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, token_type: 'eg1' })
}

interface RawEpicRecord {
	appName?: string
	catalogItemId?: string
	namespace?: string
	sandboxName?: string
	catalogItem?: {
		title?: string
		productSlug?: string
		keyImages?: Array<{ type?: string; url?: string }>
	}
}

interface RawEpicCatalogItem {
	title?: string
	productSlug?: string
	categories?: Array<{ path?: string }>
	keyImages?: Array<{ type?: string; url?: string }>
}

interface RawEpicLibrary {
	records?: RawEpicRecord[]
	responseMetadata?: { nextCursor?: string }
}

function extractCover(images?: Array<{ type?: string; url?: string }>): string | null {
	if (!images || images.length === 0) return null
	const preferred = ['DieselGameBoxTall', 'DieselGameBox', 'Thumbnail', 'OfferImageTall', 'VaultClosed']
	for (const type of preferred) {
		const match = images.find(img => img.type === type && !!img.url)
		if (match?.url) return match.url
	}
	return images.find(img => !!img.url)?.url ?? null
}

export async function fetchEpicLibrary(token: string, accountId?: string): Promise<EpicGame[] | null> {
	const records: RawEpicRecord[] = []
	let cursor = ''

	for (let page = 0; page < 50; page++) {
		const url = `${LIBRARY_HOST}/library/api/public/items?includeMetadata=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
		try {
			const resp = await requestUrl({
				url,
				headers: { Authorization: `Bearer ${token}` },
				throw: false,
			})
			if (resp.status !== 200) {
				console.error('Library: Epic Games library fetch failed', resp.status)
				return page === 0 ? null : []
			}
			const data = resp.json as RawEpicLibrary
			const pageRecords = data.records ?? []
			for (const rec of pageRecords) {
				records.push(rec)
			}
			const next = data.responseMetadata?.nextCursor
			if (!next || next === cursor) break
			cursor = next
		} catch (e) {
			console.error('Library: Epic Games library error', e)
			return page === 0 ? null : []
		}
	}

	if (records.length === 0) return []

	const playtimes = new Map<string, number>()
	if (accountId) {
		try {
			const ptResp = await requestUrl({
				url: `${LIBRARY_HOST}/library/api/public/playtime/account/${encodeURIComponent(accountId)}/all`,
				headers: { Authorization: `Bearer ${token}` },
				throw: false,
			})
			if (ptResp.status === 200 && Array.isArray(ptResp.json)) {
				for (const item of ptResp.json as Array<{ artifactId?: string; totalTime?: number }>) {
					if (item.artifactId && typeof item.totalTime === 'number') {
						playtimes.set(item.artifactId.toLowerCase(), item.totalTime)
					}
				}
			}
		} catch {
			// playtime endpoint is optional
		}
	}

	const byNs: Record<string, string[]> = {}
	for (const r of records) {
		const ns = r.namespace
		const id = r.catalogItemId
		if (!ns || !id) continue
		let list = byNs[ns]
		if (!list) {
			list = []
			byNs[ns] = list
		}
		if (list.indexOf(id) < 0) {
			list.push(id)
		}
	}

	const catalogMap = new Map<string, RawEpicCatalogItem>()
	for (const ns of Object.keys(byNs)) {
		const ids = byNs[ns]
		if (!ids || ids.length === 0) continue
		const chunkSize = 30
		for (let i = 0; i < ids.length; i += chunkSize) {
			const chunk = ids.slice(i, i + chunkSize)
			try {
				const catResp = await requestUrl({
					url: `${CATALOG_HOST}/catalog/api/shared/namespace/${encodeURIComponent(ns)}/bulk/items?id=${chunk.map(encodeURIComponent).join('&id=')}`,
					headers: { Authorization: `Bearer ${token}` },
					throw: false,
				})
				if (catResp.status === 200 && catResp.json) {
					const items = catResp.json as Record<string, RawEpicCatalogItem>
					for (const id of Object.keys(items)) {
						const it = items[id]
						if (it) catalogMap.set(id, it)
					}
				}
			} catch {
				continue
			}
		}
	}

	const games: EpicGame[] = []
	const seenTitles = new Set<string>()

	for (const r of records) {
		const cat = r.catalogItemId ? catalogMap.get(r.catalogItemId) : undefined
		// add-ons and hidden items stay out
		const isHidden = cat?.categories?.some(c => c.path === 'hidden')
		if (isHidden) continue

		const rawTitle = cat?.title || r.catalogItem?.title || r.sandboxName || r.appName
		if (!rawTitle) continue
		const cleanTitle = rawTitle.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
		if (!cleanTitle) continue
		const key = cleanTitle.toLowerCase()
		if (seenTitles.has(key)) continue
		seenTitles.add(key)

		const appKey = (r.appName ?? '').toLowerCase()
		const catIdKey = (r.catalogItemId ?? '').toLowerCase()
		const seconds = (appKey ? playtimes.get(appKey) : undefined) ?? (catIdKey ? playtimes.get(catIdKey) : undefined)
		const playtimeHours = seconds !== undefined ? Math.round(seconds / 360) / 10 : null

		const images = cat?.keyImages || r.catalogItem?.keyImages
		games.push({
			appName: r.appName ?? '',
			catalogItemId: r.catalogItemId ?? '',
			namespace: r.namespace ?? '',
			title: cleanTitle,
			imageUrl: extractCover(images),
			productSlug: cat?.productSlug || r.catalogItem?.productSlug || null,
			playtimeHours,
		})
	}

	return games
}
