import { Platform, requestUrl } from 'obsidian'
import { readPage } from './watchSites'

// EA App and Origin: games from Nucleus, playtimes from the local desktop log.
const AUTH_HOST = 'https://accounts.ea.com'
const GATEWAY_HOST = 'https://gateway.ea.com'
const GRAPHQL_HOST = 'https://service-aggregation-layer.juno.ea.com/graphql'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

export const EA_AUTH_PROBE = `(() => {
	try {
		const h = window.location.hostname || ''
		const p = window.location.pathname || ''
		if (h.indexOf('signin.') !== -1 || h.indexOf('accounts.') !== -1 || p.indexOf('/connect/') !== -1) return null
		if (h.indexOf('ea.com') === -1) return null
		if (window.__eaToken) return window.__eaToken
		if (!window.__eaFetching) {
			window.__eaFetching = true
			window['fetch']('https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none', { credentials: 'include' })
				.then(r => r.json())
				.then(d => {
					if (d && d.access_token) {
						window.__eaToken = d.access_token
					} else {
						window.__eaFetching = false
					}
				})
				.catch(() => { window.__eaFetching = false })
		}
		return null
	} catch {
		return null
	}
})()`

export interface EaTokens {
	access: string
	pid: string
	expiresAt: number
}

export interface EaGame {
	offerId: string
	title: string
	imageUrl: string | null
	lastPlayed?: string | null
	playtimeHours?: number | null
}

export function eaAuthUrl(): string {
	const params = [
		'response_type=code',
		'client_id=EADOTCOM-WEB-SERVER',
		'display=junoWeb/login',
		'locale=en_US',
		'release_type=prod',
		`redirect_uri=${encodeURIComponent('https://www.ea.com/ea-play')}`,
	]
	return `${AUTH_HOST}/connect/auth?${params.join('&')}`
}

export function tokenFromEaRedirect(url: string): string | null {
	if (!url) return null
	const tokenMatch = url.match(/[#?&]access_token=([^&#\s]+)/)
	if (tokenMatch?.[1]) return decodeURIComponent(tokenMatch[1])
	const jsonMatch = url.match(/"access_token"\s*:\s*"([^"]+)"/)
	if (jsonMatch?.[1]) return jsonMatch[1]
	const trimmed = url.trim()
	if (/^[A-Za-z0-9_.-]{40,}$/.test(trimmed)) return trimmed
	return null
}

export function eaExpired(tokens: EaTokens, now: number = Date.now()): boolean {
	return now >= tokens.expiresAt - 60000
}

export async function eaSilentToken(): Promise<string | null> {
	const code = `(async () => {
		try {
			const r = await window['fetch']('https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none', { credentials: 'include' })
			const d = await r.json()
			return d.access_token || ''
		} catch {
			return ''
		}
	})()`
	const res = await readPage('https://accounts.ea.com/', code, 15000)
	return res || null
}

export async function exchangeEaToken(accessToken: string): Promise<EaTokens | null> {
	try {
		const resp = await requestUrl({
			url: `${GATEWAY_HOST}/proxy/identity/pids/me`,
			headers: {
				Authorization: `Bearer ${accessToken}`,
				AuthToken: accessToken,
				'X-AuthToken': accessToken,
			},
			throw: false,
		})
		if (resp.status !== 200) {
			console.error('Library: EA identity request failed', resp.status)
			return null
		}
		const data = resp.json as { pid?: { pidId?: string } }
		const pidId = data.pid?.pidId
		if (!pidId) return null
		return {
			access: accessToken,
			pid: pidId,
			expiresAt: Date.now() + 14400 * 1000,
		}
	} catch (e) {
		console.error('Library: EA identity error', e)
		return null
	}
}

interface RawEntitlementItem {
	entitlementId?: string
	offerId?: string
	productId?: string
	status?: string
}

interface EaLocalPlaytime {
	seconds: number
	lastPlayed: string | null
}

export function readEaDesktopPlaytimes(): Map<string, EaLocalPlaytime> {
	const map = new Map<string, EaLocalPlaytime>()
	if (!Platform.isDesktopApp) return map
	try {
		const nodeRequire = (window as unknown as { require?: (id: string) => unknown }).require
		if (typeof nodeRequire !== 'function') return map
		const fs = nodeRequire('fs') as { existsSync: (p: string) => boolean; readFileSync: (p: string, enc: string) => string } | undefined
		const os = nodeRequire('os') as { homedir: () => string } | undefined
		const path = nodeRequire('path') as { join: (...args: string[]) => string } | undefined
		if (!fs || !os || !path) return map

		const home = typeof os.homedir === 'function' ? os.homedir() : ''
		const proc = (window as unknown as { process?: { env?: Record<string, string> } }).process
		const localAppData = proc?.env?.LOCALAPPDATA || ''
		const candidates: string[] = []
		if (home) {
			candidates.push(path.join(home, 'Library/Application Support/Electronic Arts/EA app/Logs/EADesktop.log'))
		}
		if (localAppData) {
			candidates.push(path.join(localAppData, 'Electronic Arts/EA Desktop/Logs/EADesktop.log'))
		}

		let logPath = ''
		for (let i = 0; i < candidates.length; i++) {
			const cand = candidates[i]
			if (cand && fs.existsSync(cand)) {
				logPath = cand
				break
			}
		}
		if (!logPath) return map

		const content = fs.readFileSync(logPath, 'utf8')
		const lines = content.split('\n')
		const sessionsSeen = new Set<string>()

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (!line || (line.indexOf('game.sess.exit') < 0 && line.indexOf('title_close') < 0)) continue
			const jsonMatch = line.match(/\{[\s\S]*"taxonomy"\s*:\s*"(?:game\.sess\.exit|title_close)"[\s\S]*\}/)
			if (!jsonMatch) continue
			try {
				const ev = JSON.parse(jsonMatch[0]) as {
					timestamp?: number
					params?: {
						offer_id?: string
						tl_offer_id?: string
						mdm_mt_id?: string
						slug?: string
						sdur?: number
						last_play_date?: string
						tlsid?: string
					}
				}
				const p = ev.params
				if (!p) continue
				const sdur = Number(p.sdur) || 0
				if (sdur <= 0) continue

				const tlsid = p.tlsid || String(ev.timestamp || '')
				if (tlsid && sessionsSeen.has(tlsid)) continue
				if (tlsid) sessionsSeen.add(tlsid)

				let dmy: string | null = null
				if (p.last_play_date && /^\d{4}-\d{2}-\d{2}$/.test(p.last_play_date)) {
					const parts = p.last_play_date.split('-')
					if (parts.length === 3) dmy = `${parts[2]}.${parts[1]}.${parts[0]}`
				}

				const rawKeys = [p.offer_id, p.tl_offer_id, p.slug, p.mdm_mt_id]
				for (let k = 0; k < rawKeys.length; k++) {
					const raw = rawKeys[k]
					if (!raw) continue
					const key = String(raw).toLowerCase()
					const existing = map.get(key)
					const total = (existing?.seconds || 0) + sdur
					const lastPlayed = dmy || existing?.lastPlayed || null
					map.set(key, { seconds: total, lastPlayed })
				}
			} catch {
				continue
			}
		}
	} catch (e) {
		console.error('Library: failed to read local EA playtimes', e)
	}
	return map
}

export async function fetchEaLibrary(token: string, pid: string): Promise<EaGame[] | null> {
	try {
		const entResp = await requestUrl({
			url: `${GATEWAY_HOST}/proxy/identity/pids/${encodeURIComponent(pid)}/entitlements`,
			headers: {
				Authorization: `Bearer ${token}`,
				AuthToken: token,
				'X-AuthToken': token,
			},
			throw: false,
		})
		if (entResp.status !== 200) {
			console.error('Library: EA entitlements fetch failed', entResp.status)
			return null
		}
		const data = entResp.json as {
			entitlements?: {
				entitlementUri?: string[]
				entitlement?: RawEntitlementItem[]
			} | RawEntitlementItem[]
		}

		const activeProductIds: string[] = []

		const directList = Array.isArray(data.entitlements)
			? data.entitlements
			: (data.entitlements?.entitlement ?? [])
		for (const item of directList) {
			const id = item.productId || item.offerId
			if (!id || item.status === 'DELETED' || item.status === 'DISABLED') continue
			if (activeProductIds.indexOf(id) < 0) activeProductIds.push(id)
		}

		// gateway returns URIs to fetch in batches
		const uris = (!Array.isArray(data.entitlements) && data.entitlements?.entitlementUri) || []
		if (uris.length > 0) {
			const chunkSize = 5
			for (let i = 0; i < uris.length; i += chunkSize) {
				const chunk = uris.slice(i, i + chunkSize)
				const results = await Promise.all(chunk.map(async (uri) => {
					try {
						const fullUrl = uri.startsWith('http')
							? uri
							: (uri.startsWith('/proxy/identity') ? `${GATEWAY_HOST}${uri}` : `${GATEWAY_HOST}/proxy/identity${uri}`)
						const r = await requestUrl({
							url: fullUrl,
							headers: { Authorization: `Bearer ${token}`, AuthToken: token },
							throw: false,
						})
						if (r.status !== 200) return null
						const json = r.json as { entitlement?: RawEntitlementItem }
						return json.entitlement
					} catch {
						return null
					}
				}))
				for (const item of results) {
					if (!item || item.status !== 'ACTIVE') continue
					const id = item.productId || item.offerId
					if (!id || activeProductIds.indexOf(id) >= 0) continue
					activeProductIds.push(id)
				}
			}
		}

		if (activeProductIds.length === 0) return []

		// offer titles come from GraphQL
		const gqlResp = await requestUrl({
			url: GRAPHQL_HOST,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': CHROME_UA,
			},
			body: JSON.stringify({
				query: 'query getLegacyCatalogDefs($offerIds: [String!]!, $locale: Locale) { legacyOffers(offerIds: $offerIds, locale: $locale) { offerId: id displayName } }',
				operationName: 'getLegacyCatalogDefs',
				variables: { locale: 'DEFAULT', offerIds: activeProductIds },
			}),
			throw: false,
		})

		const localPlaytimes = readEaDesktopPlaytimes()
		const games: EaGame[] = []
		if (gqlResp.status === 200) {
			const gqlData = gqlResp.json as { data?: { legacyOffers?: Array<{ offerId?: string; displayName?: string }> } }
			const offers = gqlData.data?.legacyOffers ?? []
			for (const offer of offers) {
				if (offer.offerId && offer.displayName) {
					const cleanTitle = offer.displayName.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
					if (cleanTitle) {
						const offerKey = offer.offerId.toLowerCase()
						const titleKey = cleanTitle.toLowerCase()
						const slugKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
						const pt = localPlaytimes.get(offerKey) || localPlaytimes.get(titleKey) || localPlaytimes.get(slugKey)
						const playtimeHours = pt && pt.seconds > 0 ? Math.round(pt.seconds / 360) / 10 : null
						const item: EaGame = {
							offerId: offer.offerId,
							title: cleanTitle,
							imageUrl: null,
						}
						if (pt?.lastPlayed) item.lastPlayed = pt.lastPlayed
						if (playtimeHours !== null) item.playtimeHours = playtimeHours
						games.push(item)
					}
				}
			}
		}

		return games
	} catch (e) {
		console.error('Library: EA library error', e)
		return null
	}
}
