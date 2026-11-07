import { App, normalizePath, TFile } from 'obsidian'
import { progressPattern, dmyDatePattern, type ICategory, type IStatsTop, type TitleLanguage } from './constants'
import { formatNumber, tr } from './i18n'
import { categoryLabel } from './categories'
import { normalizeSeasons } from './trailer'
import type { ContentType } from './providers/types'

export function toStr(val: unknown): string {
	if (typeof val === 'string') return val
	if (typeof val === 'number' || typeof val === 'boolean') return String(val)
	if (val == null) return ''
	if (Array.isArray(val)) return val.join(', ')
	return JSON.stringify(val)
}

export function parseProgress(val: unknown): number {
	if (typeof val === 'number') return val <= 1 ? Math.round(val * 100) : Math.round(val)
	const match = toStr(val).match(progressPattern)
	if (!match) return 0
	const current = Number(match[1])
	const total = Number(match[2])
	if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return 0
	return Math.round((current / total) * 100)
}

export function parseWatched(val: unknown): number {
	const match = toStr(val).match(/^(\d+)\s*\//)
	return match ? Number(match[1]) : 0
}

// Hand-edited since the echo last wrote it; empty Progress means no opinion.
export function editedSince(echo: { p: string; r: number } | undefined, progress: string, score: number): boolean {
	if (!echo || !progress.trim()) return false
	return parseWatched(echo.p) !== parseWatched(progress) || echo.r !== score
}

export function parseDate(val: unknown): number {
	if (!val) return 0
	if (typeof val === 'number') {
		if (isNaN(val) || val <= 0) return 0
		if (val >= 1800 && val <= 2100) return new Date(val, 0, 1).getTime()
		return val > 1e11 ? (val > 1e14 ? Math.floor(val / 1000) : val) : val * 1000
	}
	const raw = toStr(val).trim()
	if (!raw) return 0
	if (/^\d{4}$/.test(raw)) {
		const y = Number(raw)
		if (y >= 1800 && y <= 2100) return new Date(y, 0, 1).getTime()
	}
	if (/^\d{9,16}$/.test(raw)) {
		const num = Number(raw)
		if (isNaN(num) || num <= 0) return 0
		return num > 1e11 ? (num > 1e14 ? Math.floor(num / 1000) : num) : num * 1000
	}
	const dmyMatch = raw.match(dmyDatePattern)
	if (dmyMatch) {
		return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1])).getTime()
	}
	let iso = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw
	iso = iso.replace(/T(\d):/, 'T0$1:').replace(/ (\d):/, ' 0$1:')
	const timestamp = new Date(iso).getTime()
	return Number.isNaN(timestamp) ? 0 : timestamp
}

// ISO or timestamp to the note's dd.mm.yyyy, local time.
export function dmyOf(iso: unknown): string {
	if (iso === null || iso === undefined || iso === '') return ''
	let ms = 0
	if (typeof iso === 'number') {
		if (isNaN(iso) || iso <= 0) return ''
		if (iso >= 1800 && iso <= 2100) return `01.01.${String(iso)}`
		ms = iso > 1e11 ? (iso > 1e14 ? Math.floor(iso / 1000) : iso) : iso * 1000
	} else {
		const raw = toStr(iso).trim()
		if (!raw) return ''
		const dmyMatch = raw.match(dmyDatePattern)
		if (dmyMatch) return raw
		if (/^\d{4}$/.test(raw)) {
			const y = Number(raw)
			if (y >= 1800 && y <= 2100) return `01.01.${String(y)}`
		}
		if (/^\d{9,16}$/.test(raw)) {
			const num = Number(raw)
			if (isNaN(num) || num <= 0) return ''
			ms = num > 1e11 ? (num > 1e14 ? Math.floor(num / 1000) : num) : num * 1000
		} else {
			let normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw
			normalized = normalized.replace(/T(\d):/, 'T0$1:').replace(/ (\d):/, ' 0$1:')
			const date = new Date(normalized)
			if (Number.isNaN(date.getTime())) return ''
			ms = date.getTime()
		}
	}
	const d = new Date(ms)
	if (isNaN(d.getTime())) return ''
	const dd = ('0' + String(d.getDate())).slice(-2)
	const mm = ('0' + String(d.getMonth() + 1)).slice(-2)
	return `${dd}.${mm}.${String(d.getFullYear())}`
}

// Finds the oldest on-chain timestamp for an NFT note (from Minted, Acquired, History, TokenDates).
// Returns timestamp in milliseconds, or 0 if missing.
export function getNftMintTimestamp(fm: Record<string, unknown>): number {
	if (fm.Minted) {
		const t = parseDate(fm.Minted)
		if (t > 0) return t
	}
	if (fm.Acquired) {
		const t = parseDate(fm.Acquired)
		if (t > 0) return t
	}
	const rawHistory = Array.isArray(fm.History) ? fm.History : []
	let oldest = 0
	for (const tx of rawHistory) {
		if (tx && typeof tx === 'object') {
			const item = tx as Record<string, unknown>
			const tsVal = item.timeStamp || item.timestamp || item.date
			if (tsVal && tsVal !== '-') {
				const t = parseDate(tsVal)
				if (t > 0 && (oldest === 0 || t < oldest)) oldest = t
			}
		}
	}
	if (oldest > 0) return oldest

	if (typeof fm.TokenDates === 'object' && fm.TokenDates !== null) {
		const td = fm.TokenDates as Record<string, unknown>
		for (const k of Object.keys(td)) {
			const t = parseDate(td[k])
			if (t > 0 && (oldest === 0 || t < oldest)) oldest = t
		}
		if (oldest > 0) return oldest
	}
	if (fm.Date) {
		const t = parseDate(fm.Date)
		if (t > 0) return t
	}
	return 0
}

// '' when the source date has no day in it ("2020", "Q4 2020", "Coming soon").
export function releasedDmy(value: string | null | undefined): string {
	const raw = (value ?? '').trim()
	const iso = raw.match(/^\+?(\d{4})-(\d{2})-(\d{2})/)
	if (iso) return iso[2] === '00' || iso[3] === '00' ? '' : `${iso[3] ?? ''}.${iso[2] ?? ''}.${iso[1] ?? ''}`
	if (!/\d{1,2}\D+\d{4}|[A-Za-z]{3,}\.? \d{1,2},? \d{4}/.test(raw)) return ''
	const time = Date.parse(raw)
	return Number.isNaN(time) ? '' : dmyOf(new Date(time).toISOString())
}

export function todayDmy(): string {
	const now = new Date()
	const dd = ('0' + now.getDate()).slice(-2)
	const mm = ('0' + (now.getMonth() + 1)).slice(-2)
	return `${dd}.${mm}.${now.getFullYear()}`
}

// 255-byte FS cap; 2–3 bytes per Cyrillic/CJK char, rest headroom for " (2).md".
const MAX_FILENAME_BYTES = 200

function truncateBytes(value: string, max: number): string {
	const encoder = new TextEncoder()
	let out = ''
	let bytes = 0
	for (const char of value) {
		bytes += encoder.encode(char).length
		if (bytes > max) break
		out += char
	}
	return out
}

// Leading dot hides a note in Obsidian; trailing dots/spaces invalid on Windows.
export function sanitizeFilename(name: string): string {
	const cleaned = name.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim()
	const trimmed = truncateBytes(cleaned.replace(/^\.+/, ''), MAX_FILENAME_BYTES)
	return trimmed.replace(/[. ]+$/, '').trim() || 'Untitled'
}

// Untrusted frontmatter: http(s) only, never `javascript:` or another scheme.
// For a request the plugin itself makes from a note's value: https to a named
// public host, never loopback, a private address or an IP literal.
export function publicHttpsUrl(value: unknown): string | null {
	let url: URL
	try {
		url = new URL(toStr(value).trim())
	} catch {
		return null
	}
	const host = url.hostname.toLowerCase()
	if (url.protocol !== 'https:' || !host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null
	if (/^[\d.]+$/.test(host) || host.startsWith('[') || host.includes(':')) return null
	return url.href
}

export function safeUrl(value: unknown): string | null {
	const url = toStr(value).trim()
	return /^https?:\/\/\S/i.test(url) ? url : null
}

export function isTemplateFile(path: string): boolean {
	const segments = path.split('/')
	const folders = segments.slice(0, -1)
	if (folders.some(f => f.startsWith('_') || f.toLowerCase() === 'templates')) return true
	const base = segments[segments.length - 1] ?? ''
	return base.startsWith('_')
}

export function isEmptyValue(val: unknown): boolean {
	return val == null || val === '' || (Array.isArray(val) && val.length === 0)
}

// Never a top: per-note unique, measurements, plugin bookkeeping. Lower case.
const UNRANKED = new Set([
	'name', 'url', 'cover', 'image', 'baner', 'gallery', 'trailer', 'seasons', 'source', 'source id',
	'date', 'progress', 'related', 'type', 'isbn', 'aliases', 'cssclasses', 'runtime', 'season',
	'end year', 'complete', 'my rating', 'rating', 'rating imdb', 'rating rt', 'rating rawg', 'rating mc',
	'rating anilist', 'contract', 'token id', 'tokens', 'tokendates', 'wallet', 'spam', 'oat', 'count',
	'favorite', 'standard', 'kind', 'acquired', 'minted'
])

export function rankableProperties(frontmatters: Record<string, unknown>[], coverProperty: string): string[] {
	const found = new Map<string, string>()
	for (const fm of frontmatters) {
		if (isCollectible(fm)) continue
		for (const key of Object.keys(fm)) {
			const lower = key.trim().toLowerCase()
			if (!lower || UNRANKED.has(lower) || lower === coverProperty.trim().toLowerCase()) continue
			if (!found.has(lower)) found.set(lower, key.trim())
		}
	}
	return [...found.values()].sort((a, b) => a.localeCompare(b))
}

export function propertyValues(fm: Record<string, unknown>, property: string): string[] {
	const lower = property.toLowerCase()
	const values: string[] = []
	for (const [key, value] of Object.entries(fm)) {
		if (key.trim().toLowerCase() !== lower) continue
		// Numbers count too ("Top: Year"): toStrArray would drop them.
		const list = typeof value === 'number' && Number.isFinite(value) ? [String(value)] : toStrArray(value)
		values.push(...list.map(linkLabel))
	}
	return values
}

// A medium's own word for its top: declined languages need "Топ фильмов", not "Топ Фильмы".
const MEDIUM_TOPS: Partial<Record<ContentType, string>> = {
	movie: 'stats.topOf.movie',
	series: 'stats.topOf.series',
	book: 'stats.topOf.book',
	comic: 'stats.topOf.comic',
	game: 'stats.topOf.game',
	music: 'stats.topOf.music',
	anime: 'stats.topOf.anime'
}

// Medium word only when unambiguous; else "Top: <name>".
export function topLabel(top: IStatsTop, categories: ICategory[]): string {
	if (top.kind === 'platform') return tr('stats.psn')
	if (top.kind === 'property' && top.scope) {
		const scope = categories.find(c => c.typeValue === top.scope)
		if (top.key.toLowerCase() === 'creator' && scope?.contentType === 'game') return tr('stats.topDevelopers')
		if (top.key.toLowerCase() === 'creator' && scope?.contentType === 'manual') return tr('stats.topChannels')
		return tr('stats.topNamed', { name: `${top.key} · ${scope ? categoryLabel(scope) : top.scope}` })
	}
	if (top.kind === 'property') {
		switch (top.key.toLowerCase()) {
			case 'genre': return tr('stats.topGenres')
			case 'creator': return tr('stats.topDirectors')
			case 'cast': return tr('stats.topCast')
			default: return tr('stats.topNamed', { name: top.key })
		}
	}
	const category = categories.find(c => c.typeValue === top.key)
	if (!category) return tr('stats.topNamed', { name: top.key })
	const word = MEDIUM_TOPS[category.contentType]
	const shared = categories.filter(c => c.contentType === category.contentType).length > 1
	return word && !shared ? tr(word) : tr('stats.topNamed', { name: category.name || category.typeValue })
}

// OMDb "148 min"; TMDB a plain number.
export function runtimeMinutes(val: unknown): number | null {
	if (typeof val === 'number') {
		return Number.isFinite(val) && val > 0 ? Math.round(val) : null
	}
	const match = toStr(val).match(/(\d+)\s*min\b/i)
	return match ? Number(match[1]) : null
}

// OMDb junk runtimes ("1 min"): below = missing, so a bad value never sticks.
export const MIN_RUNTIME_MINUTES = 5

export function plausibleRuntime(val: unknown): number | null {
	const minutes = runtimeMinutes(val)
	return minutes !== null && minutes >= MIN_RUNTIME_MINUTES ? minutes : null
}

// Progress denominator wins over the season list the enrichment writes.
function progressEpisodes(fm: Record<string, unknown>): { watched: number; total: number } {
	const match = toStr(fm.Progress).match(progressPattern)
	if (match) return { watched: Number(match[1]), total: Number(match[2]) }
	let total = 0
	for (const season of normalizeSeasons(fm.Seasons)) {
		if (season.episodes) total += season.episodes
	}
	return { watched: 0, total }
}

function isComplete(fm: Record<string, unknown>): boolean {
	return fm.Complete === true || toStr(fm.Complete) === 'true'
}

export type Tracking = 'progress' | 'watched' | 'both'

export function trackingOf(kind: ContentType | undefined): Tracking {
	if (kind === 'series' || kind === 'anime' || kind === 'book') return 'progress'
	return kind === 'movie' ? 'watched' : 'both'
}

export function isFinished(fm: Record<string, unknown>, kind?: ContentType): boolean {
	if (trackingOf(kind) !== 'progress') return isComplete(fm)
	const match = toStr(fm.Progress).match(progressPattern)
	const total = match ? Number(match[2]) : 0
	return total > 0 ? Number(match?.[1]) >= total : isComplete(fm)
}

export function hasEnded(fm: Record<string, unknown>, kind?: ContentType): boolean {
	if (kind === 'book' || toStr(fm['End Year']).trim()) return true
	return kind === 'anime' && isFinished(fm, 'anime')
}

// Null for movies; hidden when a title that won't grow is done, or Complete is on for other media.
export function shownProgress(fm: Record<string, unknown>, kind?: ContentType): number | null {
	const tracking = trackingOf(kind)
	if (tracking === 'watched') return null
	const percent = Math.min(100, parseProgress(fm.Progress))
	if (percent <= 0) return null
	if (tracking === 'both') return isComplete(fm) ? null : percent
	return isFinished(fm, kind) && hasEnded(fm, kind) ? null : percent
}

// A rated title counts as seen, ticked or not.
// A collectible (an NFT) is held, not watched or read: never started, never in progress.
export function isCollectible(fm: Record<string, unknown>): boolean {
	return fm.Source === 'nft' || fm.Type === 'NFT' || fm.Contract !== undefined
}

// Detects raw public blockchain wallet addresses (EVM, Solana, TON, etc.)
export function isWalletAddress(val: unknown): boolean {
	if (typeof val !== 'string') return false
	const s = val.trim()
	if (!s) return false
	// EVM address: 0x followed by 32+ hex characters (standard is 40)
	if (/^0x[a-f0-9]{32,}$/i.test(s)) return true
	// TON user-friendly (UQ/EQ/kQ...) or raw (0:hex...) address
	if (/^(UQ|EQ|kQ)[a-zA-Z0-9_-]{40,}$/i.test(s) || /^0:[a-f0-9]{60,}$/i.test(s)) return true
	// Solana base58 address: 32-44 characters, no spaces, no punctuation
	if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && !/\s/.test(s) && !s.includes('-') && !s.includes('.')) return true
	return false
}

export function notStarted(fm: Record<string, unknown>, kind?: ContentType): boolean {
	if (isCollectible(fm)) return false
	if (isFinished(fm, kind) || parseWatched(fm.Progress) > 0) return false
	if (Number(fm.Playtime) > 0) return false
	const rating = fm['My Rating'] ?? fm.Rating
	return rating === null || rating === undefined || toStr(rating).trim() === ''
}

// Series store one episode's length in Runtime; the note shows the whole run.
export function totalRuntimeMinutes(fm: Record<string, unknown>, perEpisode: number, kind?: ContentType): number {
	if (perEpisode <= 0) return 0
	const { total } = progressEpisodes(fm)
	return total > 1 && kind !== 'music' && !isVideo(fm) && !isAudiobook(fm) ? perEpisode * total : perEpisode
}

// A YouTube note: Runtime is the whole video and Progress the watched share, as for an album.
function isVideo(fm: Record<string, unknown>): boolean {
	return fm.Source === 'youtube'
}

// What a person types for time listened, in minutes: "5:20", "5h 20m", "5ч 20м", "5,5", "320m", "48%".
// A bare number is hours; null when the text says nothing a clock can read.
export function parseListened(text: string, totalMinutes: number): number | null {
	const value = text.trim().toLowerCase().replace(',', '.')
	if (!value) return null
	const share = /^(\d+(?:\.\d+)?)\s*%$/.exec(value)
	if (share) return Math.round((totalMinutes * Math.min(100, Number(share[1]))) / 100)
	const clock = /^(\d+):([0-5]?\d)(?::[0-5]\d)?$/.exec(value)
	if (clock) return Number(clock[1]) * 60 + Number(clock[2])
	if (/^\d+(?:\.\d+)?$/.test(value)) return Math.round(Number(value) * 60)
	const parts = /^(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|часов|часа|час|ч)\.?)?\s*(?:(\d+)\s*(?:minutes?|mins?|m|минуты|минута|минут|мин|м)\.?)?$/.exec(value)
	if (parts && (parts[1] || parts[2])) return Math.round(Number(parts[1] ?? 0) * 60) + Number(parts[2] ?? 0)
	return null
}

// minutes as h:mm, the form an input shows back
export function clockOf(minutes: number): string {
	const whole = Math.max(0, Math.round(minutes))
	return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`
}

// A page read aloud takes about 1.8 minutes (some 275 words at 9,000 an hour). Too few pages say nothing.
export function listeningEstimate(pages: number): number {
	return pages >= 20 ? Math.round(pages * 1.8) : 0
}

// Runtime is the whole book, as for an album; the share read counts.
export function isAudiobook(fm: Record<string, unknown>): boolean {
	return toStrArray(fm.Format).some(value => /audio/i.test(value))
}

export function watchedRuntimeMinutes(fm: Record<string, unknown>, kind?: ContentType): number {
	const perEpisode = runtimeMinutes(fm.Runtime)
	if (perEpisode === null) return 0
	const { watched, total } = progressEpisodes(fm)
	// Album Runtime is the whole album: the played track share counts.
	if (kind === 'music' || isVideo(fm) || isAudiobook(fm)) {
		// a rewatched video counts once more for each rewatch
		const times = isVideo(fm) ? 1 + Math.max(0, Number(fm.Rewatched) || 0) : 1
		if (isFinished(fm, kind)) return perEpisode * times
		return total > 0 ? Math.round(perEpisode * Math.min(1, watched / total) * times) : 0
	}
	if (isFinished(fm, kind)) return perEpisode * (total > 0 ? total : 1)
	return perEpisode * watched
}

export function spentMinutes(fm: Record<string, unknown>, kind?: ContentType): number {
	if (kind === 'game') {
		const hours = Number(fm.Playtime)
		return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0
	}
	return watchedRuntimeMinutes(fm, kind)
}

// Time in the two largest calendar units it fills: "6 mo 2 d", "87 d 1 h".
export function spentParts(totalMinutes: number): string[] {
	const minutes = Math.round(totalMinutes)
	const HOUR = 60
	const DAY = 24 * HOUR
	const MONTH = 30.44 * DAY
	const YEAR = 365.25 * DAY
	const unit = (count: number, name: string): string =>
		formatNumber(count, { style: 'unit', unit: name, unitDisplay: 'short' })
	const pair = (big: number, bigName: string, small: number, smallName: string): string[] =>
		small > 0 ? [unit(big, bigName), unit(small, smallName)] : [unit(big, bigName)]
	if (minutes < HOUR) return [unit(minutes, 'minute')]
	if (minutes < DAY) return pair(Math.floor(minutes / HOUR), 'hour', minutes % HOUR, 'minute')
	if (minutes < 100 * DAY) return pair(Math.floor(minutes / DAY), 'day', Math.floor((minutes % DAY) / HOUR), 'hour')
	if (minutes < YEAR) return pair(Math.floor(minutes / MONTH), 'month', Math.floor((minutes % MONTH) / DAY), 'day')
	return pair(Math.floor(minutes / YEAR), 'year', Math.floor((minutes % YEAR) / MONTH), 'month')
}

export function spentTime(totalMinutes: number): string {
	return spentParts(totalMinutes).join(' ')
}

export function runtimeParts(totalMinutes: number): string[] {
	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	const parts: string[] = []
	if (hours > 0) parts.push(tr('header.hours', { count: String(hours) }))
	if (minutes > 0 || hours === 0) parts.push(tr('header.minutes', { count: String(minutes) }))
	return parts
}

export function formatRuntime(totalMinutes: number): string {
	return runtimeParts(totalMinutes).join(' ')
}

export function toStrArray(val: unknown): string[] {
	if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean)
	if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean)
	return []
}

const ROMAN_NUMERALS: Record<string, string> = {
	i: '1', ii: '2', iii: '3', iv: '4', v: '5',
	vi: '6', vii: '7', viii: '8', ix: '9', x: '10'
}

// Loose match: source titles differ ("Dune (2021)" vs "Дюна", "Grand Theft Auto V" vs "Grand Theft Auto V Enhanced").
// "978-5-17-080115-2" or "0-14-118776-1" typed in a search box: the digits, else null
export function isbnOf(query: string): string | null {
	const digits = query.replace(/[\s-]/g, '').toUpperCase()
	return /^(?:\d{9}[\dX]|97[89]\d{10})$/.test(digits) ? digits : null
}

export function sameTitle(a: string, b: string): boolean {
	const left = titleKey(a)
	return left !== '' && left === titleKey(b)
}

function titleKey(value: string): string {
	let s = value
		.normalize('NFC')
		.toLowerCase()
		.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
		.replace(/\s+(?:на\s+|для\s+|for\s+|on\s+)(?:nintendo\s+switch|switch|playstation(?:\s*\d)?|ps\d|pc|xbox(?:\s*one|\s*series\s*[xs]?)?)\b.*$/i, ' ')
		.replace(/\s*[-–—:]?\s*(?:cloud\s+version|pc\s+edition|ps[45]\s*&\s*ps[45])\b.*$/i, ' ')
		.replace(/^(?:sid meier'?s|tom clancy'?s|ea sports)\s+/i, '')
		.replace(/\s*[-–—:]?\s*(?:standard|digital deluxe|deluxe|enhanced|definitive|goty|game of the year|complete|director'?s cut|anniversary|special|collector'?s|gold|premium|ultimate|remastered|remaster|legendary|legacy|redux|обновленная версия|обновлённая версия|полное издание|золотое издание)\s*(?:edition|cut|bundle|version)?\s*$/i, ' ')
		.replace(/\s+(?:remastered|goty|redux)\s*$/i, ' ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()

	if (s) {
		s = s.split(/\s+/).map((word, idx) => (word === 'i' && idx === 0 ? 'i' : (ROMAN_NUMERALS[word] || word))).join(' ')
	}
	return s
}

// Drops trademark marks and platform tags from note names.
export function cleanGameTitle(title: string): string {
	const plain = title
		.normalize('NFC')
		.replace(/[™®©]/g, '')
		.replace(/\s*\((?:PlayStation\s*\d?|PS[45](?:\s*[&/]\s*PS[45])?|Nintendo\s*Switch|Switch|PC|Xbox(?:\s*One|\s*Series\s*[xs]?)?)\)/i, ' ')
	// "Game for Nintendo Switch": the name ends where the platform tag starts
	const tag = plain.search(/\s+(?:на\s+|для\s+|for\s+|on\s+)(?:nintendo\s+switch|switch|playstation(?:\s*\d)?|ps\d|pc|xbox(?:\s*one|\s*series\s*[xs]?)?)\b/i)
	return (tag < 0 ? plain : plain.slice(0, tag)).replace(/\s+/g, ' ').trim()
}

export function findGameNote(
	notes: TFile[],
	app: App,
	query: {
		name: string
		url?: string
		psnId?: string
		nintendoId?: string
		sourceId?: string
	}
): TFile | undefined {
	return notes.find((file) => {
		const fm = app.metadataCache.getFileCache(file)?.frontmatter
		if (!fm) return false
		if (query.psnId && toStr(fm['PSN ID']) === query.psnId) return true
		if (query.nintendoId && toStr(fm['Nintendo ID']) === query.nintendoId) return true
		if (query.sourceId && toStr(fm['Source ID']) === query.sourceId) return true
		if (query.url && toStr(fm.URL) && toStr(fm.URL) === query.url) return true
		const noteName = toStr(fm.Name)
		if (noteName && sameTitle(noteName, query.name)) return true
		return sameTitle(file.basename, query.name)
	})
}

// a book or comic medium, stored in Format as these English words; any other value a user wrote shows as is
export const BOOK_FORMATS: [string, string][] = [['Paper', 'format.paper'], ['eBook', 'format.ebook'], ['Audiobook', 'format.audiobook']]
export const COMIC_FORMATS: [string, string][] = [['Paper', 'format.paper'], ['eBook', 'format.ebook']]

export function formatLabel(value: string): string {
	const known = BOOK_FORMATS.find(([v]) => v.toLowerCase() === value.toLowerCase())
	return known ? tr(known[1]) : value
}

// Genre/Cast/Creator hold [[links]]; the UI shows names: [[T|Alias]] shows Alias.
export function linkLabel(value: string): string {
	const match = value.match(/^\[\[([^\]|]*)(?:\|([^\]]*))?\]\]$/)
	if (!match) return value
	return (match[2] ?? match[1] ?? '').replace(/\.canvas$/i, '').trim()
}

// What a name's canvas gathers: the link properties and the plain names older notes keep.
export const NAME_FIELDS = ['Genre', 'Creator', 'Cast', 'Director', 'Author', 'Artist', 'Wallet']

// The file a link property points at, without .canvas: [[Drama.canvas|Drama]] gives Drama.
export function linkTarget(value: string): string {
	const target = /^\[\[([^\]|#^]+)/.exec(value)?.[1] ?? sanitizeLink(value)
	return target.replace(/\.canvas$/i, '').trim()
}

// Plain names become [[Name.canvas|Name]], the canvas of the titles that share the
// name; a name with a note of its own (hasNote) links the note. Written links
// are kept, except a bare [[Name]] with no note behind it.
export function toLinks(value: unknown, hasNote: (name: string) => boolean = () => false): string[] {
	const links: string[] = []
	for (const item of toStrArray(value)) {
		const bare = /^\[\[([^\]|#^/]+)\]\]$/.exec(item)?.[1]
		const written = /^\[\[[^\]]+\]\]$/.test(item)
		const name = sanitizeLink(bare ?? item)
		const keep = written && (bare === undefined || /\.(md|canvas)$/i.test(bare) || hasNote(bare))
		const link = keep ? item : !name ? '' : hasNote(name) ? `[[${name}]]` : `[[${name}.canvas|${name}]]`
		if (link && links.indexOf(link) < 0) links.push(link)
	}
	return links
}

// A target is a note name: a slash = folder path, others invalid on Windows/mobile.
export function sanitizeLink(name: string): string {
	return name
		.replace(/[[\]|#^*"<>?:]/g, '')
		.replace(/[\\/]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
}

export function inferContentType(typeValue: string): ContentType {
	switch (typeValue) {
		case 'Series': return 'series'
		case 'Book': return 'book'
		case 'Game': return 'game'
		case 'Music': return 'music'
		case 'Anime': return 'anime'
		case 'Comic': return 'comic'
		case 'Manual': return 'manual'
		default: return 'movie'
	}
}

// Falls back to older property names, so a rename keeps notes rendering.
export function coverValue(fm: Record<string, unknown>, property = 'Cover'): unknown {
	const keys = [property, 'Cover', 'Image', 'Baner']
	for (const key of keys) {
		if (!key) continue
		const value = fm[key]
		if (!isEmptyValue(value)) return value
	}
	return undefined
}

// The property that holds the cover, in coverValue's order.
export function coverKey(fm: Record<string, unknown>, property = 'Cover'): string | null {
	for (const key of [property, 'Cover', 'Image', 'Baner']) {
		if (key && !isEmptyValue(fm[key])) return key
	}
	return null
}

// File extension for a downloaded media file, from its content type; null when it is not one.
export function imageExtension(contentType: string): string | null {
	const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
	const known: Record<string, string> = {
		'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
		'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
		'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
	}
	return known[type] ?? null
}

// A short stable name for a URL (two 32-bit FNV-1a passes), for files shared by notes.
export function urlHash(url: string): string {
	let a = 0x811c9dc5
	let b = 0x01000193
	for (let i = 0; i < url.length; i++) {
		const c = url.charCodeAt(i)
		a = Math.imul(a ^ c, 0x01000193) >>> 0
		b = Math.imul(b ^ c, 0x811c9dc5) >>> 0
	}
	return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

// Image and media servers that answer application/octet-stream: the first bytes tell the format.
export function sniffImage(data: ArrayBuffer): string | null {
	const b = new Uint8Array(data.slice(0, 12))
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
	if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
	if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'mp4'
	if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm'
	return null
}

export function coverSrc(app: App, raw: unknown): string | null {
	const value = toStr(raw).trim()
	if (!value) return null
	if (/^https?:\/\//i.test(value) || value.startsWith('data:image/')) return value
	// Vault image: a path or the properties panel's "[[poster.jpg]]" / "![[...|300]]".
	const link = value.match(/^!?\[\[([^\]|]+)/)
	const rawPath = (link?.[1] ?? value).trim()
	if (!rawPath) return null
	let file = app.vault.getFileByPath(normalizePath(rawPath))
		?? app.metadataCache.getFirstLinkpathDest(rawPath, '')
	if (!file && rawPath.indexOf('#') >= 0) {
		const withoutHash = (rawPath.split('#')[0] ?? '').trim()
		file = app.vault.getFileByPath(normalizePath(withoutHash))
			?? app.metadataCache.getFirstLinkpathDest(withoutHash, '')
	}
	return file ? app.vault.getResourcePath(file) : null
}

// Per-source search timeout: a stalled server must not hold back the others.
export const SEARCH_BUDGET_MS = 4000

export function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	return new Promise((resolve) => {
		const timer = window.setTimeout(() => resolve(fallback), ms)
		promise.then(
			(value) => { window.clearTimeout(timer); resolve(value) },
			() => { window.clearTimeout(timer); resolve(fallback) }
		)
	})
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms)
	})
}

// "Playtime <platform>" holds each platform's hours, Playtime their sum; a store link alone is not ownership.
export function addPlatform(fm: Record<string, unknown>, platform: string, hours: number | null): void {
	const perPlatform = (): string[] => Object.keys(fm).filter(key => /^Playtime .+/.test(key))
	// "PS5" makes a bare "PlayStation" entry redundant; its hours still count.
	const isPlayStation = (value: string): boolean => /^ps\d/i.test(value)
	let platforms = toStrArray(fm.Platforms)
	if (isPlayStation(platform)) platforms = platforms.filter(value => value.toLowerCase() !== 'playstation')
	const covered = platform.toLowerCase() === 'playstation' && platforms.some(isPlayStation)
	if (!covered && !platforms.some(value => value.toLowerCase() === platform.toLowerCase())) platforms.push(platform)
	fm.Platforms = platforms
	if (hours !== null) fm[`Playtime ${platform}`] = hours
	const total = perPlatform().reduce((sum, key) => sum + (Number(fm[key]) || 0), 0)
	if (perPlatform().length > 0) fm.Playtime = Math.round(total * 10) / 10
}

export function dropPlatforms(fm: Record<string, unknown>, family: (platform: string) => boolean): void {
	fm.Platforms = toStrArray(fm.Platforms).filter(value => !family(value))
	for (const key of Object.keys(fm)) {
		const match = key.match(/^Playtime (.+)$/)
		if (match?.[1] && family(match[1])) delete fm[key]
	}
}

export function exactHours(totalMinutes: number): string {
	return formatNumber(Math.round(totalMinutes / 6) / 10, { style: 'unit', unit: 'hour', unitDisplay: 'long', maximumFractionDigits: 1 })
}

export interface TitleNames { english?: string | null; romaji?: string | null; native?: string | null }

// Anime and manga name in the chosen language, else the next one a source has.
export function pickTitle(names: TitleNames, language: TitleLanguage): string {
	const order: TitleLanguage[] = language === 'romaji' ? ['romaji', 'english', 'native']
		: language === 'native' ? ['native', 'romaji', 'english'] : ['english', 'romaji', 'native']
	for (const key of order) {
		const name = names[key]?.trim()
		if (name) return name
	}
	return ''
}

// A deep copy of plain data: objects, arrays and primitives.
export function plainCopy<T>(value: T): T {
	if (Array.isArray(value)) return value.map(item => plainCopy(item as unknown)) as unknown as T
	if (!value || typeof value !== 'object') return value
	const out: Record<string, unknown> = {}
	for (const key of Object.keys(value)) out[key] = plainCopy((value as Record<string, unknown>)[key])
	return out as T
}

export function latestNftMintDate(fm: Record<string, unknown>, cardName = ''): string {
	const match = cardName.match(/#([a-zA-Z0-9xX_-]+)$/)
	const tokenDates = (typeof fm.TokenDates === 'object' && fm.TokenDates !== null) ? (fm.TokenDates as Record<string, string>) : null
	if (match && tokenDates) {
		const tid = match[1] ?? ''
		if (tokenDates[tid]) {
			const d = toStr(tokenDates[tid])
			if (/^\d{2}\.\d{2}\.\d{4}$/.test(d)) return d
			const dmy = dmyOf(d)
			if (dmy) return dmy
		}
	}

	let latestTime = 0
	let latestStr = ''

	const consider = (val: unknown) => {
		const s = toStr(val).trim()
		if (!s) return
		let dmy = ''
		let time = 0
		if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
			dmy = s
			time = parseDate(s)
		} else {
			dmy = dmyOf(s)
			time = dmy ? parseDate(dmy) : 0
		}
		if (time > latestTime) {
			latestTime = time
			latestStr = dmy
		}
	}

	if (tokenDates) {
		for (const k of Object.keys(tokenDates)) consider(tokenDates[k])
	}
	if (Array.isArray(fm.History)) {
		for (let i = 0; i < fm.History.length; i++) {
			const item = fm.History[i] as Record<string, unknown> | null
			if (item) consider(item.date || item.timeStamp)
		}
	}
	consider(fm.Minted)
	consider(fm.Acquired)

	return latestStr || toStr(fm.Minted) || toStr(fm.Acquired) || ''
}
