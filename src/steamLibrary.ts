import { requestUrl } from 'obsidian'
import type { PsnTrophy } from './psn'
import { authPartition } from './session'

// Steam sign-in and library. No key: a hidden webview on the sign-in window's
// partition reads steamcommunity.com as the user (nothing is kept in settings).
const API = 'https://api.steampowered.com'
const WEB = 'https://steamcommunity.com'
const ORIGIN = encodeURIComponent(WEB)
// The sign-in window's partition, so the hidden webview sees its cookies.

// The OpenID window returns to steamcommunity.com with the account in the address.
export function steamAuthUrl(): string {
	const params = [
		'openid.ns=http://specs.openid.net/auth/2.0',
		'openid.mode=checkid_setup',
		`openid.return_to=${encodeURIComponent(`${WEB}/`)}`,
		`openid.realm=${encodeURIComponent(WEB)}`,
		'openid.identity=http://specs.openid.net/auth/2.0/identifier_select',
		'openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select'
	]
	return `${WEB}/openid/login?${params.join('&')}`
}

// SteamID64 out of the returned address; null on the sign-in page or another host.
export function steamIdFromRedirect(url: string): string | null {
	if (!url.startsWith(`${WEB}/`)) return null
	const match = url.match(/(?:%2F|\/)id(?:%2F|\/)(7656119\d{10})/)
	return match?.[1] ?? null
}

export interface OwnedGame {
	appId: number
	name: string
	minutes: number
	/** Last session end, epoch seconds; 0 when the game was never played. */
	lastPlayed: number
}

export interface SteamStats {
	achieved: number
	total: number
}

async function get<T>(url: string): Promise<T | null> {
	try {
		const resp = await requestUrl({ url, throw: false })
		if (resp.status !== 200) return null
		return resp.json as T
	} catch (e) {
		console.error('Library: Steam Web API error', e)
		return null
	}
}

export function steamTokenFromAnswer(text: string): string | null {
	try {
		const answer = JSON.parse(text) as { data?: { webapi_token?: unknown } }
		const token = answer.data?.webapi_token
		return typeof token === 'string' && token !== '' ? token : null
	} catch {
		return null
	}
}

export interface SteamSession {
	token: string
	stats(appId: number): Promise<SteamStats | null>
	// Unlock times by achievement key, epoch seconds.
	unlocks(appId: number): Promise<Map<number, number> | null>
	close(): void
}

// The signed-in session: a hidden webview on the sign-in partition reads the
// token, then an achievements page per game; null when the session is gone.
export async function steamSession(steamId: string): Promise<SteamSession | null> {
	const win = activeDocument.win as Window & { createEl: typeof createEl }
	const view = win.createEl('webview' as keyof HTMLElementTagNameMap, {
		cls: 'library-steam-probe',
		attr: { partition: authPartition(), src: `${WEB}/pointssummary/ajaxgetasyncconfig` }
	})
	activeDocument.body.appendChild(view)
	const guest = view as unknown as { executeJavaScript: (code: string) => Promise<unknown> }

	let closed = false
	const close = (): void => {
		if (closed) return
		closed = true
		view.remove()
	}
	// Nothing here may hang an import: every answer has its own deadline.
	const read = async (code: string): Promise<string> => {
		let timer = 0
		const answer = await Promise.race([
			guest.executeJavaScript(code).catch(() => null),
			new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), 15000) })
		])
		window.clearTimeout(timer)
		return typeof answer === 'string' ? answer : ''
	}

	// A window still on the sign-in page is what a dead session looks like.
	let token: string | null = null
	const until = Date.now() + 15000
	while (token === null && Date.now() < until) {
		await new Promise<void>(resolve => { window.setTimeout(resolve, 400) })
		token = steamTokenFromAnswer(await read('document.body ? document.body.innerText : ""'))
	}
	if (token === null) {
		close()
		return null
	}

	const id = encodeURIComponent(steamId)
	// The summary is in the page as "... of ...". window.fetch in the page carries
	// the session cookies; the plugin's own code never calls fetch.
	const page = (appId: number): string =>
		`window.fetch("/profiles/${id}/stats/${String(appId)}?l=english").then(r => r.text()).then(t => {` +
		' const m = /topSummaryAchievements[^>]*>[\\s\\S]*?([\\d,]+) of ([\\d,]+)/.exec(t);' +
		' return m ? m[1].replace(/,/g, "") + "/" + m[2].replace(/,/g, "") : ""; }).catch(() => "")'

	return {
		token,
		stats: async (appId: number): Promise<SteamStats | null> => {
			// The id comes from Steam's answer and goes into a script run in the page.
			if (!Number.isSafeInteger(appId) || appId <= 0) return null
			const match = /^(\d+)\/(\d+)$/.exec(await read(page(appId)))
			if (!match) return null
			const achieved = Number(match[1])
			const total = Number(match[2])
			return total > 0 ? { achieved, total } : null
		},
		unlocks: async (appId: number): Promise<Map<number, number> | null> => {
			if (!Number.isSafeInteger(appId) || appId <= 0) return null
			try {
				const pairs = JSON.parse(await read(unlockScript(id, appId))) as Array<[number, number]>
				return new Map(pairs)
			} catch {
				return null
			}
		},
		close
	}
}

// The achievements page keeps the member's unlocks in its server-rendered query
// cache (valve-ssr-data), JSON nested in JSON strings.
function unlockScript(id: string, appId: number): string {
	return `window.fetch("/profiles/${id}/stats/${String(appId)}?l=english").then(r => r.text()).then(t => {` +
		' const raw = new DOMParser().parseFromString(t, "text/html").getElementById("valve-ssr-data")?.textContent;' +
		' if (!raw) return "";' +
		' const out = []; const seen = new Set();' +
		' const walk = (v) => {' +
		'  if (typeof v === "string") { if (/^[[{]/.test(v)) { try { walk(JSON.parse(v)) } catch {} } return; }' +
		'  if (!v || typeof v !== "object" || seen.has(v)) return; seen.add(v);' +
		`  if (v.appid === ${String(appId)} && v.achievements && typeof v.achievements === "object") {` +
		'   for (const a of Object.values(v.achievements)) if (a && a.unlocked && a.unlock_time) out.push([a.internal_key, a.unlock_time]);' +
		'   return; }' +
		'  for (const k of Object.keys(v)) walk(v[k]);' +
		' };' +
		' walk(JSON.parse(raw)); return JSON.stringify(out); }).catch(() => "")'
}

// Steam's own names for languages; English when Steam has none for it.
const STEAM_LANGUAGES: Record<string, string> = {
	ru: 'russian', de: 'german', fr: 'french', es: 'spanish', it: 'italian', ja: 'japanese', ko: 'koreana',
	zh: 'schinese', 'zh-tw': 'tchinese', pt: 'portuguese', 'pt-br': 'brazilian', pl: 'polish', tr: 'turkish',
	uk: 'ukrainian', cs: 'czech', nl: 'dutch', da: 'danish', fi: 'finnish', nb: 'norwegian', no: 'norwegian',
	sv: 'swedish', hu: 'hungarian', ro: 'romanian', th: 'thai', vi: 'vietnamese', bg: 'bulgarian', el: 'greek',
	ar: 'arabic', id: 'indonesian',
}
export function steamLanguage(language: string): string {
	const tag = language.toLowerCase()
	return STEAM_LANGUAGES[tag] ?? STEAM_LANGUAGES[tag.split('-')[0] ?? ''] ?? 'english'
}

export interface SteamAchievement {
	internal_key?: number
	localized_name?: string
	localized_desc?: string
	icon?: string
	player_percent_unlocked?: string
}

// Unlocked ones first by date, newest on top.
export function earnedAchievements(appId: number, defs: SteamAchievement[], unlocks: Map<number, number>): PsnTrophy[] {
	const out: PsnTrophy[] = []
	for (const def of defs) {
		const at = unlocks.get(def.internal_key ?? -1)
		if (!at) continue
		const rate = Number(def.player_percent_unlocked)
		out.push({
			grade: null,
			name: def.localized_name ?? '',
			detail: def.localized_desc ?? '',
			iconUrl: def.icon && /^[\w.]+$/.test(def.icon) ? `https://shared.fastly.steamstatic.com/community_assets/images/apps/${String(appId)}/${def.icon}` : null,
			earnedAt: new Date(at * 1000).toISOString(),
			rate: def.player_percent_unlocked && Number.isFinite(rate) ? rate : null,
		})
	}
	return out.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
}

export async function gameAchievements(token: string, appId: number, language: string): Promise<SteamAchievement[] | null> {
	const json = await get<{ response?: { achievements?: SteamAchievement[] } }>(
		`${API}/IPlayerService/GetGameAchievements/v1/?access_token=${encodeURIComponent(token)}&appid=${String(appId)}&language=${encodeURIComponent(language)}`
	)
	return json?.response?.achievements ?? null
}

export async function ownedGames(token: string, steamId: string): Promise<OwnedGame[] | null> {
	const json = await get<{ response?: { games?: { appid: number; name?: string; playtime_forever?: number; rtime_last_played?: number }[] } }>(
		`${API}/IPlayerService/GetOwnedGames/v1/?access_token=${encodeURIComponent(token)}&steamid=${encodeURIComponent(steamId)}` +
		`&include_appinfo=1&include_played_free_games=1&origin=${ORIGIN}`
	)
	const games = json?.response?.games
	if (!games) return null
	return games.map(g => ({
		appId: g.appid,
		name: g.name ?? String(g.appid),
		minutes: g.playtime_forever ?? 0,
		lastPlayed: g.rtime_last_played ?? 0
	}))
}

// Hours with one decimal, the unit Playtime stores.
export function playtimeHours(minutes: number): number {
	return Math.round(minutes / 6) / 10
}
