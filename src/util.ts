import { App, normalizePath } from 'obsidian'
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
	const raw = toStr(val)
	const dmyMatch = raw.match(dmyDatePattern)
	if (dmyMatch) {
		return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1])).getTime()
	}
	const timestamp = new Date(raw).getTime()
	return Number.isNaN(timestamp) ? 0 : timestamp
}

// ISO → the note's dd.mm.yyyy, local time.
export function dmyOf(iso: string): string {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return ''
	const dd = ('0' + String(date.getDate())).slice(-2)
	const mm = ('0' + String(date.getMonth() + 1)).slice(-2)
	return `${dd}.${mm}.${String(date.getFullYear())}`
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
	'rating anilist'
])

export function rankableProperties(frontmatters: Record<string, unknown>[], coverProperty: string): string[] {
	const found = new Map<string, string>()
	for (const fm of frontmatters) {
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
export function notStarted(fm: Record<string, unknown>, kind?: ContentType): boolean {
	if (isFinished(fm, kind) || parseWatched(fm.Progress) > 0) return false
	if (Number(fm.Playtime) > 0) return false
	const rating = fm['My Rating'] ?? fm.Rating
	return rating === null || rating === undefined || toStr(rating).trim() === ''
}

// Series store one episode's length in Runtime; the note shows the whole run.
export function totalRuntimeMinutes(fm: Record<string, unknown>, perEpisode: number, kind?: ContentType): number {
	if (perEpisode <= 0) return 0
	const { total } = progressEpisodes(fm)
	return total > 1 && kind !== 'music' && !isVideo(fm) ? perEpisode * total : perEpisode
}

// A YouTube note: Runtime is the whole video and Progress the watched share, as for an album.
function isVideo(fm: Record<string, unknown>): boolean {
	return fm.Source === 'youtube'
}

export function watchedRuntimeMinutes(fm: Record<string, unknown>, kind?: ContentType): number {
	const perEpisode = runtimeMinutes(fm.Runtime)
	if (perEpisode === null) return 0
	const { watched, total } = progressEpisodes(fm)
	// Album Runtime is the whole album: the played track share counts.
	if (kind === 'music' || isVideo(fm)) {
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

export function spentTime(totalMinutes: number): string {
	const minutes = Math.round(totalMinutes)
	const HOUR = 60
	const DAY = 24 * HOUR
	const MONTH = 30.44 * DAY
	const YEAR = 365.25 * DAY
	const unit = (count: number, name: string): string =>
		formatNumber(count, { style: 'unit', unit: name, unitDisplay: 'short' })
	const pair = (big: number, bigName: string, small: number, smallName: string): string =>
		small > 0 ? `${unit(big, bigName)} ${unit(small, smallName)}` : unit(big, bigName)
	if (minutes < HOUR) return unit(minutes, 'minute')
	if (minutes < DAY) return pair(Math.floor(minutes / HOUR), 'hour', minutes % HOUR, 'minute')
	if (minutes < 100 * DAY) return pair(Math.floor(minutes / DAY), 'day', Math.floor((minutes % DAY) / HOUR), 'hour')
	if (minutes < YEAR) return pair(Math.floor(minutes / MONTH), 'month', Math.floor((minutes % MONTH) / DAY), 'day')
	return pair(Math.floor(minutes / YEAR), 'year', Math.floor((minutes % YEAR) / MONTH), 'month')
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

// Loose match: source titles differ ("Dune (2021)" vs "Дюна").
export function sameTitle(a: string, b: string): boolean {
	const left = titleKey(a)
	return left !== '' && left === titleKey(b)
}

function titleKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
}

// Genre/Cast/Creator hold [[links]]; the UI shows names: [[T|Alias]] → Alias.
export function linkLabel(value: string): string {
	const match = value.match(/^\[\[([^\]|]*)(?:\|([^\]]*))?\]\]$/)
	if (!match) return value
	return (match[2] ?? match[1] ?? '').replace(/\.canvas$/i, '').trim()
}

// What a name's canvas gathers: the link properties and the plain names older notes keep.
export const NAME_FIELDS = ['Genre', 'Creator', 'Cast', 'Director', 'Author', 'Artist']

// The file a link property points at, without .canvas: [[Drama.canvas|Drama]] → Drama.
export function linkTarget(value: string): string {
	const target = /^\[\[([^\]|#^]+)/.exec(value)?.[1] ?? sanitizeLink(value)
	return target.replace(/\.canvas$/i, '').trim()
}

// Plain names → [[Name.canvas|Name]], the canvas of the titles that share the
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

// File extension for a downloaded image, from its content type; null when it is not one.
export function imageExtension(contentType: string): string | null {
	const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
	const known: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
	return known[type] ?? null
}

export function coverSrc(app: App, raw: unknown): string | null {
	const value = toStr(raw).trim()
	if (!value) return null
	if (/^https?:\/\//i.test(value)) return value
	// Vault image: a path or the properties panel's "[[poster.jpg]]" / "![[...|300]]".
	const link = value.match(/^!?\[\[([^\]|#]+)/)
	const path = (link?.[1] ?? value).trim()
	if (!path) return null
	const file = app.vault.getFileByPath(normalizePath(path))
		?? app.metadataCache.getFirstLinkpathDest(path, '')
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
