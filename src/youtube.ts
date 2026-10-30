import { readPage } from './watchSites'

// YouTube watch history, read from the history page as the signed-in member: videos of
// the last seven days, Shorts left out. The page names its days in the account's language
// ("Today", "Yesterday", weekday names) and dates older ones, which have a digit.

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
	// minutes watched: the length times the watched share
	minutes: number
	// ISO date of the viewing day
	day: string
}

const VIDEO_ID = /^[\w-]{11}$/

export function lengthSeconds(length: string): number {
	if (!/^\d+(:\d{1,2}){1,2}$/.test(length.trim())) return 0
	return length.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

function dayName(lang: string, date: Date, offset: number): string {
	type Relative = new (lang: string, options: { numeric: string }) => { format: (value: number, unit: string) => string }
	const relative = (Intl as unknown as { RelativeTimeFormat?: Relative }).RelativeTimeFormat
	try {
		if (offset < 2) return relative ? new relative(lang, { numeric: 'auto' }).format(-offset, 'day') : ''
		return date.toLocaleDateString(lang, { weekday: 'long' })
	} catch {
		return ''
	}
}

// Newest first, one entry per video: its latest viewing.
export function lastWeek(page: HistoryPage, now = new Date()): WatchedVideo[] {
	const names: string[] = []
	for (let offset = 0; offset < 7; offset++) {
		const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
		names.push(dayName(page.lang, date, offset).toLocaleLowerCase())
	}
	const out: WatchedVideo[] = []
	const seen = new Set<string>()
	let offset = 0
	for (const section of page.sections) {
		const title = section.title.trim().toLocaleLowerCase()
		// a dated day is a week old or more
		if (/\d/.test(title)) break
		const named = names.indexOf(title)
		// an unknown name stays on the day before it: never a later one
		if (named >= offset) offset = named
		const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
		const day = `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
		for (const item of section.items) {
			if (!VIDEO_ID.test(item.id) || !item.title || seen.has(item.id)) continue
			seen.add(item.id)
			const seconds = lengthSeconds(item.length)
			const share = Math.min(100, Math.max(0, item.percent ?? 100)) / 100
			out.push({ id: item.id, title: item.title, channel: item.channel, minutes: seconds > 0 ? Math.max(1, Math.round((seconds * share) / 60)) : 0, day })
		}
	}
	return out
}

// ponytail: only the page's first batch (about two weeks of an average history); scrolling
// for more is needed only for a week of several hundred videos.
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

export async function youtubeHistory(now = new Date()): Promise<WatchedVideo[] | 'signed-out' | null> {
	// signed out, the page sends the window to the Google sign-in
	const answer = await readPage('https://www.youtube.com/feed/history', YOUTUBE_READ, 60000, "!!window.ytInitialData || location.hostname !== 'www.youtube.com'")
	if (answer === 'signed-out') return answer
	try {
		return lastWeek(JSON.parse(answer) as HistoryPage, now)
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
