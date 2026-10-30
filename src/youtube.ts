import { requestUrl } from 'obsidian'
import { VIDEO_CATEGORY } from './categories'
import { tr } from './i18n'
import { readPage } from './watchSites'

// YouTube watch history, read from the history page as the signed-in member, Shorts left out.
// The page names its days in the account's language: "Today", "Yesterday", weekdays, then dates.

export interface HistoryItem {
	id: string
	title: string
	channel: string
	// the channel's path on the site, "/@name"
	channelPath?: string
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
	// the continuation of older days; '' at the end of the history
	next?: string
}

export interface WatchedVideo {
	id: string
	title: string
	channel: string
	channelUrl: string
	// the video's length; 0 for a live stream
	seconds: number
	// the watched share, 0 to 100
	percent: number
	// ISO date of the viewing day
	day: string
}

export interface VideoDetails {
	description: string
	reaction: 'like' | 'dislike' | ''
	subscribed: boolean | null
	channelUrl: string
	channelId: string
	// ISO date the video came out; '' when unknown
	published: string
	// counts; null when unknown. Dislikes are Return YouTube Dislike's estimate: YouTube hides them.
	views: number | null
	likes: number | null
	dislikes: number | null
}

export type YoutubeAction = 'like' | 'dislike' | 'removelike' | 'subscribe' | 'unsubscribe'
const ACTIONS: YoutubeAction[] = ['like', 'dislike', 'removelike', 'subscribe', 'unsubscribe']

const VIDEO_ID = /^[\w-]{11}$/
const CHANNEL_ID = /^UC[\w-]{22}$/
const CHANNEL_PATH = /^\/(@[^/?#\s]+|channel\/UC[\w-]+)$/

// the category and Source of the connector's notes
export const YOUTUBE_TYPE = VIDEO_CATEGORY
export const YOUTUBE_SOURCE = 'youtube'

// dated headings reach back this far
const HISTORY_DAYS = 25 * 366

export function lengthSeconds(length: string): number {
	if (!/^\d+(:\d{1,2}){1,2}$/.test(length.trim())) return 0
	return length.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

export function channelUrl(path: string | undefined): string {
	return path && CHANNEL_PATH.test(path) ? `https://www.youtube.com${path}` : ''
}

// How the page names each day back, to its offset: "today", "yesterday", a weekday
// within the week, then a short date, with its year before this one.
function dayOffsets(lang: string, now: Date): Map<string, number> {
	type Relative = new (lang: string, options: { numeric: string }) => { format: (value: number, unit: string) => string }
	const relative = (Intl as unknown as { RelativeTimeFormat?: Relative }).RelativeTimeFormat
	const offsets = new Map<string, number>()
	const add = (name: string, offset: number): void => {
		const key = name.trim().toLocaleLowerCase()
		if (key && !offsets.has(key)) offsets.set(key, offset)
	}
	try {
		if (relative) {
			const named = new relative(lang, { numeric: 'auto' })
			add(named.format(0, 'day'), 0)
			add(named.format(-1, 'day'), 1)
		}
		const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long' })
		const short = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })
		const dated = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' })
		for (let offset = 2; offset < HISTORY_DAYS; offset++) {
			const date = dayBack(now, offset)
			add((offset < 7 ? weekday : date.getFullYear() === now.getFullYear() ? short : dated).format(date), offset)
		}
	} catch {
		// an unknown language: every day reads as today
	}
	return offsets
}

// Calendar days from `time` (ms) to today: 0 for today.
export function daysSince(time: number, now = new Date()): number {
	const then = new Date(time)
	return Math.round((dayBack(now, 0).getTime() - dayBack(then, 0).getTime()) / 86400000)
}

function dayBack(now: Date, offset: number): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
}

export function isoDay(date: Date): string {
	return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// A page's videos, newest first, each at its latest viewing, with the day of its
// last section; `days` keeps only the last so many days.
export function pageVideos(page: HistoryPage, now = new Date(), days = HISTORY_DAYS): { videos: WatchedVideo[]; lastDay: string } {
	const offsets = dayOffsets(page.lang, now)
	const videos: WatchedVideo[] = []
	const seen = new Set<string>()
	let offset = 0
	let lastDay = ''
	for (const section of page.sections) {
		const named = offsets.get(section.title.trim().toLocaleLowerCase())
		// an unknown name stays on the day before it: never a later one
		if (named !== undefined && named >= offset) offset = named
		if (offset >= days) break
		lastDay = isoDay(dayBack(now, offset))
		for (const item of section.items) {
			if (!VIDEO_ID.test(item.id) || !item.title || seen.has(item.id)) continue
			seen.add(item.id)
			videos.push({ id: item.id, title: item.title, channel: item.channel, channelUrl: channelUrl(item.channelPath), seconds: lengthSeconds(item.length), percent: Math.round(Math.min(100, Math.max(0, item.percent ?? 100))), day: lastDay })
		}
	}
	return { videos, lastDay }
}

// The page's own API calls carry the signed-in session: SAPISIDHASH, as its scripts sign them.
const YOUTUBE_ASK = `
	const config = window.ytcfg && window.ytcfg.get ? window.ytcfg.get.bind(window.ytcfg) : null;
	if (!window.ytInitialData || !config) return '';
	if (config('LOGGED_IN') === false || location.hostname !== 'www.youtube.com') return 'signed-out';
	const ask = async (path, body) => {
		const sid = (document.cookie.match(/(?:^|; )SAPISID=([^;]+)/) || [])[1] || '';
		const time = Math.floor(Date.now() / 1000);
		const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(time + ' ' + sid + ' ' + location.origin));
		const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
		const r = await window.fetch('/youtubei/v1/' + path + '?prettyPrint=false', { method: 'POST', credentials: 'include', body: JSON.stringify({ context: config('INNERTUBE_CONTEXT'), ...body }),
			headers: { 'content-type': 'application/json', authorization: 'SAPISIDHASH ' + time + '_' + hash, 'x-origin': location.origin, 'x-goog-authuser': '0' } });
		if (!r.ok) throw new Error(String(r.status));
		return r.json();
	};
	const text = (t) => t ? (t.content ?? t.simpleText ?? (t.runs || []).map(r => r.text).join('')) : '';`

// Values go into page code only as literals of checked characters: JSON.stringify is no code escaper.
const TOKEN = /^[\w%=+/-]*$/

// One batch of the history: the page's own, or the continuation `token` names.
function historyCode(token: string): string {
	return `(async () => {${YOUTUBE_ASK}
	const token = '${TOKEN.test(token) ? token : ''}';
	let entries;
	if (token) {
		const more = await ask('browse', { continuation: token });
		entries = [].concat(...(more.onResponseReceivedActions || []).map(a => a.appendContinuationItemsAction?.continuationItems || []));
	} else {
		const tabs = window.ytInitialData.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
		entries = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
	}
	const sections = [];
	let next = '';
	for (const entry of entries) {
		next = entry.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || next;
		const list = entry.itemSectionRenderer;
		if (!list) continue;
		const items = [];
		for (const item of list.contents || []) {
			const lockup = item.lockupViewModel;
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
				const channelPath = meta?.image?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.canonicalBaseUrl || '';
				items.push({ id: lockup.contentId || '', title: text(meta?.title), channel: text(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text), channelPath, length, percent });
			}
			const video = item.videoRenderer;
			if (video) {
				const resume = (video.thumbnailOverlays || []).map(o => o.thumbnailOverlayResumePlaybackRenderer).find(Boolean);
				const owner = video.ownerText || video.longBylineText;
				items.push({ id: video.videoId || '', title: text(video.title), channel: text(owner), channelPath: owner?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '', length: text(video.lengthText), percent: typeof resume?.percentDurationWatched === 'number' ? resume.percentDurationWatched : null });
			}
		}
		sections.push({ title: text(list.header?.itemSectionHeaderRenderer?.title), items });
	}
	return JSON.stringify({ lang: document.documentElement.lang || 'en', sections, next });
})().catch(() => '')`
}

const HISTORY_URL = 'https://www.youtube.com/feed/history'
// signed out, the page sends the window to the Google sign-in
const HISTORY_READY = "!!window.ytInitialData || location.hostname !== 'www.youtube.com'"

export async function youtubePage(token = ''): Promise<HistoryPage | 'signed-out' | null> {
	const answer = await readPage(HISTORY_URL, historyCode(token), 60000, HISTORY_READY)
	if (answer === 'signed-out') return answer
	try {
		return JSON.parse(answer) as HistoryPage
	} catch {
		return null
	}
}

// Description, like and subscription of each video, as the watch page shows them.
export async function videoDetails(ids: string[]): Promise<Map<string, VideoDetails> | 'signed-out'> {
	const out = new Map<string, VideoDetails>()
	const clean = ids.filter(id => VIDEO_ID.test(id))
	if (clean.length === 0) return out
	const code = `(async () => {${YOUTUBE_ASK}
	const out = {};
	for (const id of [${clean.map(id => `'${id}'`).join(',')}]) {
		try {
			const watch = await ask('next', { videoId: id });
			const parts = watch.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
			const primary = parts.map(p => p.videoPrimaryInfoRenderer).find(Boolean);
			const secondary = parts.map(p => p.videoSecondaryInfoRenderer).find(Boolean);
			const like = (JSON.stringify(primary || {}).match(/"likeStatus":"([A-Z]+)"/) || [])[1] || '';
			const subscribed = secondary?.subscribeButton?.subscribeButtonRenderer?.subscribed;
			const player = await ask('player', { videoId: id }).catch(() => null);
			out[id] = { description: text(secondary?.attributedDescription) || text(secondary?.description), reaction: like === 'LIKE' ? 'like' : like === 'DISLIKE' ? 'dislike' : '',
				subscribed: typeof subscribed === 'boolean' ? subscribed : null, channelPath: secondary?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '',
				channelId: secondary?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || '', published: player?.microformat?.playerMicroformatRenderer?.publishDate || '', views: Number(player?.videoDetails?.viewCount) };
		} catch {}
		await new Promise(r => setTimeout(r, 300));
	}
	return JSON.stringify(out);
})().catch(() => '')`
	const text = await readPage(HISTORY_URL, code, 60000 + clean.length * 3000, HISTORY_READY)
	if (text === 'signed-out') return text
	try {
		const answer = JSON.parse(text) as Record<string, { description?: unknown; reaction?: unknown; subscribed?: unknown; channelPath?: unknown; channelId?: unknown; published?: unknown; views?: unknown }>
		for (const id of clean) {
			const found = answer[id]
			if (!found) continue
			out.set(id, {
				description: typeof found.description === 'string' ? found.description : '',
				reaction: found.reaction === 'like' || found.reaction === 'dislike' ? found.reaction : '',
				subscribed: typeof found.subscribed === 'boolean' ? found.subscribed : null,
				channelUrl: channelUrl(typeof found.channelPath === 'string' ? found.channelPath : ''),
				channelId: typeof found.channelId === 'string' && CHANNEL_ID.test(found.channelId) ? found.channelId : '',
				published: typeof found.published === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(found.published)?.[0] ?? '' : '',
				views: count(found.views),
				likes: null,
				dislikes: null,
			})
		}
		for (const [id, found] of out) {
			const vote = await votes(id)
			found.likes = vote.likes
			found.dislikes = vote.dislikes
		}
	} catch {
		// no answer: the notes are made without
	}
	return out
}

function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

// Likes and the estimated dislikes, from Return YouTube Dislike: YouTube shows no dislike count since 2021.
async function votes(id: string): Promise<{ likes: number | null; dislikes: number | null }> {
	try {
		const answer = await requestUrl({ url: `https://returnyoutubedislikeapi.com/votes?videoId=${id}`, throw: false })
		const data = answer.status === 200 ? answer.json as { likes?: unknown; dislikes?: unknown } : {}
		return { likes: count(data.likes), dislikes: count(data.dislikes) }
	} catch {
		return { likes: null, dislikes: null }
	}
}

// Like, dislike or clear the video, or subscribe to or leave its channel, as the watch page's buttons do.
export async function youtubeAct(videoId: string, action: YoutubeAction): Promise<boolean> {
	if (!VIDEO_ID.test(videoId)) return false
	const code = `(async () => {${YOUTUBE_ASK}
	const id = '${videoId}';
	const action = '${ACTIONS.indexOf(action) >= 0 ? action : ''}';
	if (action === 'like' || action === 'dislike' || action === 'removelike') {
		await ask('like/' + action, { target: { videoId: id } });
		return 'ok';
	}
	const watch = await ask('next', { videoId: id });
	const parts = watch.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
	const channel = parts.map(p => p.videoSecondaryInfoRenderer).find(Boolean)?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId;
	if (!channel) return '';
	await ask('subscription/' + action, { channelIds: [channel] });
	return 'ok';
})().catch(() => '')`
	return await readPage(HISTORY_URL, code, 60000, HISTORY_READY) === 'ok'
}

// The description as a callout in the note's body, folded, every line quoted.
export function descriptionCallout(description: string, title = tr('header.description')): string {
	const lines = description.replace(/\r/g, '').trim().split('\n').map(line => `> ${line}`.replace(/\s+$/, ''))
	return [`> [!quote]- ${title}`, ...lines].join('\n')
}

export function videoUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${id}`
}

export function videoCover(id: string): string {
	return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
