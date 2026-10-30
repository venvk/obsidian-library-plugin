import { readPage } from './watchSites'

// YouTube watch history, read from the history page as the signed-in member, Shorts left out.
// The page names its days in the account's language: "Today", "Yesterday", weekdays, then dates.

export interface HistoryItem {
	id: string
	title: string
	channel: string
	// the duration badge, "23:33" or "1:02:03"; '' for a live stream
	length: string
	// the watched share of the video, 0 to 100; null when the page shows no bar
	percent: number | null
}

export interface HistorySection {
	title: string
	items: HistoryItem[]
}

export interface HistoryPage {
	lang: string
	sections: HistorySection[]
}

export interface WatchedVideo {
	id: string
	title: string
	channel: string
	// the video's length; 0 for a live stream
	seconds: number
	// the watched share, 0 to 100
	percent: number
	// ISO date of the viewing day
	day: string
}

const VIDEO_ID = /^[\w-]{11}$/

// the category and Source of the connector's notes
export const YOUTUBE_TYPE = 'YouTube'
export const YOUTUBE_SOURCE = 'youtube'

export function lengthSeconds(length: string): number {
	if (!/^\d+(:\d{1,2}){1,2}$/.test(length.trim())) return 0
	return length.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

// How the page names a day `offset` days back: "today", "yesterday", a weekday within
// the week, then a short date, with its year before this one.
function dayName(lang: string, now: Date, offset: number): string {
	type Relative = new (lang: string, options: { numeric: string }) => { format: (value: number, unit: string) => string }
	const relative = (Intl as unknown as { RelativeTimeFormat?: Relative }).RelativeTimeFormat
	const date = dayBack(now, offset)
	try {
		if (offset < 2) return relative ? new relative(lang, { numeric: 'auto' }).format(-offset, 'day') : ''
		if (offset < 7) return date.toLocaleDateString(lang, { weekday: 'long' })
		const year = date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }
		return date.toLocaleDateString(lang, { day: 'numeric', month: 'short', ...year })
	} catch {
		return ''
	}
}

// Calendar days from `time` (ms) to today: 0 for today.
export function daysSince(time: number, now = new Date()): number {
	const then = new Date(time)
	return Math.round((dayBack(now, 0).getTime() - dayBack(then, 0).getTime()) / 86400000)
}

function dayBack(now: Date, offset: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
}

// Newest first, one entry per video: its latest viewing, from the last `days` days.
export function newHistory(page: HistoryPage, days: number, now = new Date()): WatchedVideo[] {
	const offsets = new Map<string, number>()
	for (let offset = 0; offset < days; offset++) {
		const name = dayName(page.lang, now, offset).trim().toLocaleLowerCase()
		if (name && !offsets.has(name)) offsets.set(name, offset)
	}
	const out: WatchedVideo[] = []
	const seen = new Set<string>()
	let offset = 0
	for (const section of page.sections) {
		const named = offsets.get(section.title.trim().toLocaleLowerCase())
		// an unknown name stays on the day before it: never a later one
		if (named !== undefined && named >= offset) offset = named
		// a day older than wanted has no name in the table
		if (named === undefined && /\d/.test(section.title)) break
		const items = section.items.filter(item => VIDEO_ID.test(item.id) && item.title)
		const date = dayBack(now, offset)
		const day = `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
		for (const item of items) {
			if (seen.has(item.id)) continue
			seen.add(item.id)
			out.push({ id: item.id, title: item.title, channel: item.channel, seconds: lengthSeconds(item.length), percent: Math.round(Math.min(100, Math.max(0, item.percent ?? 100))), day })
		}
	}
	return out
}

// ponytail: only the page's first batch (about two weeks of an average history); scrolling
// for more is needed only after weeks away or for hundreds of videos a week.
const YOUTUBE_READ = `(() => {
	const data = window.ytInitialData;
	const config = window.ytcfg && window.ytcfg.get ? window.ytcfg.get.bind(window.ytcfg) : null;
	if (!data || !config) return '';
	if (config('LOGGED_IN') === false || location.hostname !== 'www.youtube.com') return 'signed-out';
	const text = (t) => t ? (t.content ?? t.simpleText ?? (t.runs || []).map(r => r.text).join('')) : '';
	const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
	const sections = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
	const out = [];
	for (const section of sections) {
		const list = section.itemSectionRenderer;
		if (!list) continue;
		const items = [];
		for (const entry of list.contents || []) {
			const lockup = entry.lockupViewModel;
			if (lockup && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
				const meta = lockup.metadata?.lockupMetadataViewModel;
				let length = '', percent = null;
				for (const overlay of lockup.contentImage?.thumbnailViewModel?.overlays || []) {
					const bottom = overlay.thumbnailBottomOverlayViewModel;
					if (!bottom) continue;
					const bar = bottom.progressBar?.thumbnailOverlayProgressBarViewModel?.startPercent;
					if (typeof bar === 'number') percent = bar;
					for (const badge of bottom.badges || []) length = badge.thumbnailBadgeViewModel?.text || length;
				}
				items.push({ id: lockup.contentId || '', title: text(meta?.title), channel: text(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text), length, percent });
			}
			const video = entry.videoRenderer;
			if (video) {
				const resume = (video.thumbnailOverlays || []).map(o => o.thumbnailOverlayResumePlaybackRenderer).find(Boolean);
				items.push({ id: video.videoId || '', title: text(video.title), channel: text(video.ownerText || video.longBylineText), length: text(video.lengthText), percent: typeof resume?.percentDurationWatched === 'number' ? resume.percentDurationWatched : null });
			}
		}
		out.push({ title: text(list.header?.itemSectionHeaderRenderer?.title), items });
	}
	return JSON.stringify({ lang: document.documentElement.lang || 'en', sections: out });
})()`

export async function youtubeHistory(days: number, now = new Date()): Promise<WatchedVideo[] | 'signed-out' | null> {
	// signed out, the page sends the window to the Google sign-in
	const answer = await readPage('https://www.youtube.com/feed/history', YOUTUBE_READ, 60000, "!!window.ytInitialData || location.hostname !== 'www.youtube.com'")
	if (answer === 'signed-out') return answer
	try {
		return newHistory(JSON.parse(answer) as HistoryPage, days, now)
	} catch {
		return null
	}
}

export function videoUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${id}`
}

export function videoCover(id: string): string {
	return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
