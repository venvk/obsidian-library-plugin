import { seasonsOf, type EpisodeChange, type TrackKind } from './episodes'
import { seasonIndex } from './watchSites'
import { clockOf, toStr, toStrArray } from './util'

// A note's diary lives in its "Log" property: "2026-10-18 S2E5", or a bare date for a finished title.
export interface LogEntry {
	date: string
	label: string
}

const ENTRY = /^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/

export function logOf(fm: Record<string, unknown>): LogEntry[] {
	const out: LogEntry[] = []
	for (const raw of toStrArray(fm.Log)) {
		const match = ENTRY.exec(raw.trim())
		if (match?.[1]) out.push({ date: match[1], label: (match[2] ?? '').trim() })
	}
	return out
}

export function todayIso(now = new Date()): string {
	const pad = (n: number): string => String(n).padStart(2, '0')
	return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addLog(fm: Record<string, unknown>, date: string, label: string): void {
	const entry = label ? `${date} ${label}` : date
	const log = toStrArray(fm.Log)
	if (log.indexOf(entry) < 0) fm.Log = [...log, entry]
}

// A sitting with a book without chapters: "2026-11-08 p 140–216", or "1:20–2:40" for an audiobook.
// Later saves the same day stretch that day's range; a first save says only where the reader is.
export function addReadRange(fm: Record<string, unknown>, date: string, from: number, to: number, audio: boolean): void {
	if (to <= from) return
	const show = (n: number): string => (audio ? clockOf(n) : String(n))
	const prefix = audio ? '' : 'p '
	const log = toStrArray(fm.Log)
	const same = new RegExp(`^${date} ${prefix}([\\d:]+)(?:–[\\d:]+)?$`)
	const today = log.findIndex(entry => same.test(entry))
	const start = today >= 0 ? same.exec(log[today] ?? '')?.[1] : from > 0 ? show(from) : ''
	const entry = `${date} ${prefix}${start ? `${start}–` : ''}${show(to)}`
	fm.Log = today >= 0 ? log.map((old, i) => (i === today ? entry : old)) : [...log, entry]
}

// A rating goes in the diary as "★ 7"; a second one the same day replaces the first, a cleared one leaves it out
export function logRating(fm: Record<string, unknown>, date: string, points: number | null): void {
	const log = toStrArray(fm.Log).filter(entry => !entry.startsWith(`${date} ★`))
	fm.Log = points === null ? log : [...log, `${date} ★ ${String(points)}`]
}

// The days a note saw something happen: its diary, and the day in its Date (added or watched) when the diary has nothing then
export function activityDays(fm: Record<string, unknown>): string[] {
	const days = logOf(fm).map(entry => entry.date)
	const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(toStr(fm.Date).trim())
	const added = dmy ? `${dmy[3] ?? ''}-${dmy[2] ?? ''}-${dmy[1] ?? ''}` : ''
	if (added && days.indexOf(added) < 0) days.push(added)
	return days
}

// What a tick adds to the diary, read before it is applied; null when nothing new gets watched.
export function tickLabel(fm: Record<string, unknown>, change: EpisodeChange, kind: TrackKind): string | null {
	if (!('watched' in change) || !change.watched) return null
	const seasons = seasonsOf(fm, kind)
	const season = seasons[change.season]
	if (!season) return null
	const names = seasons.map(s => s.name)
	const numbered = Number(/\d+/.exec(season.name)?.[0])
	const number = seasonIndex(names, numbered) === change.season ? numbered : change.season + 1
	if (change.episode === undefined) {
		if (season.episodes.every(episode => episode.watched)) return null
		return kind === 'book' ? '' : `S${String(number)}`
	}
	if (season.episodes[change.episode]?.watched) return null
	const at = change.episode + 1
	if (kind === 'book') return `Ch ${String(at)}`
	if (kind === 'anime' && seasons.length === 1) return `E${String(at)}`
	return `S${String(number)}E${String(at)}`
}
