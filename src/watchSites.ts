// IMDb, Netflix, YouTube and Claude Academy have no open API for a member's own history: the sign-in window
// keeps the session, and a hidden webview on its partition reads the site as
// the user did. Settings keep the connected flag, last-import time and score echoes.
const PARTITION = 'persist:library-auth'

export type WatchSite = 'imdb' | 'netflix' | 'youtube' | 'claudeacademy' | 'googleedu'

export const SITE_NAME: Record<WatchSite, string> = { imdb: 'IMDb', netflix: 'Netflix', youtube: 'YouTube', claudeacademy: 'Claude Academy', googleedu: 'Google for Education' }

export interface ImdbEcho {
	r: number
	l?: boolean
	e?: Record<string, number>
}

export const SITE_SIGN_IN: Record<WatchSite, string> = {
	imdb: 'https://www.imdb.com/registration/signin',
	netflix: 'https://www.netflix.com/login',
	youtube: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Ffeed%2Fhistory',
	// the page's own "Sign in with Claude" goes through claude.ai and back; ACADEMY_SIGNED_IN says when it is done
	claudeacademy: 'https://academy.claude.com/login?returnTo=%2F',
	// Exceed LMS, where Google for Education issues its certificates, signs in with Google: the session YouTube's
	// sign-in left leaves only the account to pick
	googleedu: 'https://edu.exceedlms.com/authentication/google_authentication',
}

// Exceed LMS comes back through its own callback, which sets the session as it loads: done once a page of
// the site has loaded with its Log Out link
export const EXCEED_SIGNED_IN = "location.hostname === 'edu.exceedlms.com' && document.readyState === 'complete' && !!document.querySelector('a[href*=\"/authentication/logout\"]') ? 'ok' : ''"

// Claude Academy signs in inside the page: done once it is back on the academy with no Sign in link left
export const ACADEMY_SIGNED_IN = "location.hostname === 'academy.claude.com' && !/^\\/(login|oauth)/.test(location.pathname) && document.readyState === 'complete' && !document.querySelector('a[href*=\"/login\"]') && !!document.querySelector('header, nav') ? 'ok' : ''"

// Signed in once the window lands on the site's home: the sign-in pages live on
// the same hosts, so the path decides.
export function signedInAt(site: WatchSite, url: string): string | null {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		return null
	}
	if (parsed.protocol !== 'https:') return null
	if (site === 'imdb') return parsed.hostname === 'www.imdb.com' && (parsed.pathname === '/' || parsed.pathname === '') ? 'ok' : null
	// Google signs in on its own host, then hands the window to YouTube
	if (site === 'youtube') return parsed.hostname === 'www.youtube.com' ? 'ok' : null
	if (site === 'claudeacademy') return null
	if (site === 'googleedu') return null
	return parsed.hostname === 'www.netflix.com' && /^\/(browse|[a-z]{2}(-[a-z]{2})?\/browse)(\/|$)/.test(parsed.pathname) ? 'ok' : null
}

// Runs `code` in a hidden webview opened at `url` on the sign-in partition and
// returns its string answer; '' when the page does not load in time. `ready`
// skips pages that reload into the real one, like a bot check.
export async function readPage(url: string, code: string, timeout = 30000, ready = 'true'): Promise<string> {
	const doc = activeDocument
	const win = doc.win as Window & { createEl: typeof createEl }
	const view = win.createEl('webview' as keyof HTMLElementTagNameMap, {
		cls: 'library-steam-probe',
		attr: { partition: PARTITION, src: url },
	})
	doc.body.appendChild(view)
	const guest = view as unknown as { executeJavaScript: (code: string) => Promise<unknown> }
	try {
		await new Promise<void>((resolve, reject) => {
			let pollTimer = 0
			const timer = window.setTimeout(() => {
				window.clearInterval(pollTimer)
				view.removeEventListener('dom-ready', check)
				reject(new Error('timeout'))
			}, timeout)
			const done = (): void => {
				window.clearTimeout(timer)
				window.clearInterval(pollTimer)
				view.removeEventListener('dom-ready', check)
				resolve()
			}
			const check = (): void => {
				void guest.executeJavaScript(ready).catch(() => false).then(ok => {
					if (ok) done()
				})
			}
			view.addEventListener('dom-ready', check)
			pollTimer = window.setInterval(check, 500)
		})
		let timer = 0
		const answer = await Promise.race([
			guest.executeJavaScript(code).catch(() => null),
			new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), timeout) }),
		])
		window.clearTimeout(timer)
		return typeof answer === 'string' ? answer : ''
	} catch {
		return ''
	} finally {
		view.remove()
	}
}

export interface WatchedTitle {
	// IMDb id when the site knows it; Netflix gives no IMDb id, only its own.
	id: string
	name: string
	kind: 'movie' | 'series'
	year: number | null
	// The member's own score, 1 to 10.
	rating: number | null
	// ISO date of the rating, the viewing or the watchlist entry.
	when: string
	// Rated or viewed; a watchlist entry is not.
	watched: boolean
	netflixId?: number
	listed?: boolean
	// From Trakt: its echo and watchlist, not IMDb's.
	trakt?: boolean
	// Netflix rated it but shows no viewing: movie or series is unknown
	guessed?: boolean
	// Netflix: the names of the episodes viewed, to tell two shows of one name apart
	episodeTitles?: string[]
	// Netflix: the IMDb id Wikidata gives its Netflix ID. Not `id`: that one says IMDb holds the title's score.
	imdb?: string
	// Netflix: an anime note's Source ID, when Wikidata gives the title an AniList or MyAnimeList id
	anime?: string
}

const IMDB_MOVIE = ['movie', 'tvMovie', 'video', 'short', 'tvShort', 'tvSpecial']
const IMDB_SERIES = ['tvSeries', 'tvMiniSeries']

interface ImdbNode {
	id?: string
	titleText?: { text?: string }
	titleType?: { id?: string }
	releaseYear?: { year?: number }
	userRating?: { value?: number; date?: string } | null
	series?: { series?: ImdbNode; episodeNumber?: { seasonNumber?: number; episodeNumber?: number } } | null
}

// A rated episode, filed under its series note.
export interface EpisodeRating {
	series: WatchedTitle
	season: number
	episode: number
	rating: number
	title?: string
	episodeId?: string
}

export function imdbEpisodes(rated: ImdbNode[]): EpisodeRating[] {
	const out: EpisodeRating[] = []
	for (const node of rated) {
		if (node.titleType?.id !== 'tvEpisode') continue
		const series = node.series?.series
		const season = node.series?.episodeNumber?.seasonNumber ?? 0
		const episode = node.series?.episodeNumber?.episodeNumber ?? 0
		const rating = node.userRating?.value
		if (!series?.id || !/^tt\d+$/.test(series.id) || typeof rating !== 'number') continue
		// Standalone specials with no season and no episode number go to imdbTitles as a movie/special
		if (season === 0 && episode === 0) continue
		out.push({
			series: { id: series.id, name: series.titleText?.text ?? series.id, kind: 'series', year: series.releaseYear?.year ?? null, rating: null, when: node.userRating?.date ?? '', watched: true },
			season,
			episode,
			rating,
			title: node.titleText?.text ?? '',
			episodeId: node.id,
		})
	}
	return out
}

// The note's season for an IMDb season number: the one named with that number,
// else by position when no name has a digit ("Limited Series"), else none.
export function seasonIndex(names: string[], season: number): number {
	const named = names.findIndex(name => Number(/\d+/.exec(name)?.[0]) === season)
	if (named >= 0) return named
	return names.some(name => /\d/.test(name)) ? -1 : season - 1
}

export function imdbTitles(rated: ImdbNode[], listed: { title: ImdbNode; added: string }[]): WatchedTitle[] {
	const out = new Map<string, WatchedTitle>()
	const add = (node: ImdbNode, when: string, watched: boolean): void => {
		const id = node.id ?? ''
		const type = node.titleType?.id ?? ''
		let kind: 'movie' | 'series' | null = IMDB_MOVIE.indexOf(type) >= 0 ? 'movie' : IMDB_SERIES.indexOf(type) >= 0 ? 'series' : null
		if (!kind && type === 'tvEpisode' && node.series && node.series.episodeNumber === null) kind = 'movie'
		const known = out.get(id)
		if (known && !watched) known.listed = true
		if (!/^tt\d+$/.test(id) || !kind || known) return
		const value = node.userRating?.value
		out.set(id, {
			id,
			name: node.titleText?.text ?? id,
			kind,
			year: node.releaseYear?.year ?? null,
			rating: typeof value === 'number' && value >= 1 && value <= 10 ? value : null,
			when,
			watched,
			listed: !watched,
		})
	}
	for (const node of rated) add(node, node.userRating?.date ?? '', true)
	for (const item of listed) add(item.title, item.added, false)
	return [...out.values()]
}

// The page's own GraphQL endpoint with the member's cookies; the member id is in
// the home page data. 'signed-out' when the session is gone.
const IMDB_READ = `(async () => {
	const data = document.getElementById('__NEXT_DATA__')?.textContent ?? '';
	const user = /"userId":"(ur\\d+)"/.exec(data)?.[1];
	if (!user) return data ? 'signed-out' : '';
	const ask = async (query) => {
		const r = await window.fetch('https://api.graphql.imdb.com/', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
		if (!r.ok) throw new Error(String(r.status));
		return (await r.json()).data;
	};
	const fields = 'id titleText { text } titleType { id } releaseYear { year } userRating { value date } series { series { id titleText { text } releaseYear { year } } episodeNumber { seasonNumber episodeNumber } }';
	const rated = [];
	for (let after = null, more = true, n = 0; more && n < 40; n++) {
		const d = await ask('{ advancedTitleSearch(first: 250' + (after ? ', after: ' + JSON.stringify(after) : '') + ', constraints: {singleUserRatingConstraint: {filterType: INCLUDE, userId: "' + user + '"}}, sort: {sortBy: SINGLE_USER_RATING_DATE, sortOrder: DESC}) { pageInfo { hasNextPage endCursor } edges { node { title { ' + fields + ' } } } } }');
		const s = d.advancedTitleSearch;
		for (const e of s.edges) rated.push(e.node.title);
		more = s.pageInfo.hasNextPage; after = s.pageInfo.endCursor;
	}
	const listed = [];
	for (let after = null, more = true, n = 0; more && n < 40; n++) {
		const d = await ask('{ predefinedList(classType: WATCH_LIST) { items(first: 250' + (after ? ', after: ' + JSON.stringify(after) : '') + ') { pageInfo { hasNextPage endCursor } edges { node { createdDate listItem { ... on Title { ' + fields + ' } } } } } } }');
		const s = d.predefinedList.items;
		for (const e of s.edges) if (e.node.listItem) listed.push({ title: e.node.listItem, added: e.node.createdDate ?? '' });
		more = s.pageInfo.hasNextPage; after = s.pageInfo.endCursor;
	}
	return JSON.stringify({ rated, listed });
})().catch(() => '')`

export interface WatchHistory {
	titles: WatchedTitle[]
	episodes: EpisodeRating[]
}

// Rated titles, rated episodes and the watchlist; null when the site does not answer.
// The ids of the completion badges on the academy's "Your journey" page
export async function academyBadges(): Promise<string[] | 'signed-out' | null> {
	const code = `(async () => {
		for (let i = 0; i < 40; i++) {
			if (document.querySelector('a[href*="/login"]')) return 'signed-out'
			if (document.querySelector('a[href^="/badges/"]')) break
			await new Promise(r => setTimeout(r, 250))
		}
		await new Promise(r => setTimeout(r, 500))
		return JSON.stringify([...new Set([...document.querySelectorAll('a[href^="/badges/"]')].map(a => a.getAttribute('href').split('/')[2]).filter(Boolean))])
	})().catch(() => '')`
	const answer = await readPage('https://academy.claude.com/dashboard', code, 60000, "document.readyState === 'complete' && !!document.querySelector('header, nav')")
	if (answer === 'signed-out') return answer
	try {
		const ids = JSON.parse(answer) as unknown
		return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null
	} catch {
		return null
	}
}

interface Capturable {
	capturePage: () => Promise<{ getSize: () => { width: number }; crop: (rect: { x: number; y: number; width: number; height: number }) => { toPNG: () => Uint8Array } }>
}

export interface AcademyBadge {
	// the badge's public check, read from its "Add to LinkedIn" link
	verifyUrl: string
	// the badge as the page draws it (the same picture its PDF holds), PNG; null when the page would not paint
	picture: ArrayBuffer | null
}

// Opens `url` in a webview laid out on screen, nearly transparent and behind the workspace (a webview off
// screen paints nothing), runs `code`, which answers JSON with the box of what to photograph ({x, y, w, h, iw})
// and anything else, and photographs that box. null when the page gives no box in time.
async function photograph(url: string, code: string): Promise<{ answer: Record<string, unknown>; picture: ArrayBuffer | null } | null> {
	const doc = activeDocument
	const win = doc.win as Window & { createEl: typeof createEl; require?: (mod: string) => { remote?: { webContents?: { fromId?: (id: number) => Capturable | undefined } } } }
	const view = win.createEl('webview' as keyof HTMLElementTagNameMap, { cls: 'library-badge-probe', attr: { partition: PARTITION, src: url } })
	doc.body.appendChild(view)
	const guest = view as unknown as { executeJavaScript: (code: string) => Promise<unknown>; getWebContentsId?: () => number }
	const wait = async <T>(work: Promise<T>, ms: number): Promise<T | null> => {
		let timer = 0
		try {
			return await Promise.race([work, new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), ms) })])
		} finally {
			window.clearTimeout(timer)
		}
	}
	try {
		await wait(new Promise<void>(resolve => view.addEventListener('dom-ready', () => resolve(), { once: true })), 30000)
		const raw = await wait(guest.executeJavaScript(code).catch(() => ''), 30000)
		const answer = typeof raw === 'string' && raw ? JSON.parse(raw) as Record<string, unknown> : null
		if (!answer) return null
		const box = answer as { x?: number; y?: number; w?: number; h?: number; iw?: number }
		let picture: ArrayBuffer | null = null
		const id = guest.getWebContentsId?.()
		const contents = id !== undefined ? win.require?.('electron').remote?.webContents?.fromId?.(id) : undefined
		// a frame taken before the page painted is one flat colour, which compresses to almost nothing: taken again
		for (let attempt = 0; attempt < 4 && !picture && contents && box.w && box.h && box.iw; attempt++) {
			if (attempt > 0) await new Promise(resolve => window.setTimeout(resolve, 1500))
			const shot = await wait(contents.capturePage(), 10000).catch(() => null)
			if (!shot) continue
			const k = shot.getSize().width / box.iw
			const png = shot.crop({ x: Math.round((box.x ?? 0) * k), y: Math.round((box.y ?? 0) * k), width: Math.round(box.w * k), height: Math.round(box.h * k) }).toPNG()
			if (png.byteLength > 20000) picture = png.slice().buffer
		}
		return { answer, picture }
	} catch {
		return null
	} finally {
		view.remove()
	}
}

// the box of `selector` once it and its fonts are in, as `photograph` reads it
const boxOf = (selector: string, extra = "{}"): string => `(async () => {
	for (let i = 0; i < 60; i++) {
		if (document.querySelector('a[href*="/login"]') && !document.querySelector(${JSON.stringify(selector)})) return ''
		const el = document.querySelector(${JSON.stringify(selector)})
		if (el) {
			await document.fonts.ready
			// pictures inside it (an SVG certificate's background) load on their own time
			const srcs = [...el.querySelectorAll('img, image')].map(i => i.getAttribute('src') || i.getAttribute('href') || i.getAttribute('xlink:href') || '').filter(Boolean)
			await Promise.race([
				Promise.all(srcs.map(src => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = src }))),
				new Promise(r => setTimeout(r, 10000)),
			])
			// a badge comes in with an entrance animation: the picture is taken once it has settled
			await Promise.race([Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))), new Promise(r => setTimeout(r, 5000))])
			await new Promise(r => setTimeout(r, 1200))
			const box = el.getBoundingClientRect()
			return JSON.stringify(Object.assign(${extra}, { x: box.x, y: box.y, w: box.width, h: box.height, iw: innerWidth }))
		}
		await new Promise(r => setTimeout(r, 250))
	}
	return ''
})()`

// One badge page, read and photographed: the page draws the badge itself and serves no file of it
export async function academyBadge(badgeId: string): Promise<AcademyBadge | null> {
	const extra = "{ url: (() => { const a = document.querySelector('a[href*=\"linkedin.com/profile/add\"]'); return a ? new URL(a.href).searchParams.get('certUrl') || '' : '' })() }"
	const ready = `(async () => { for (let i = 0; i < 60 && !document.querySelector('a[href*="linkedin.com/profile/add"]'); i++) await new Promise(r => setTimeout(r, 250)); return ${boxOf('svg.absolute.inset-0', extra)} })()`
	const shot = await photograph(`https://academy.claude.com/badges/${encodeURIComponent(badgeId)}`, ready)
	const url = typeof shot?.answer.url === 'string' ? shot.answer.url : ''
	if (!shot || !/^https:\/\/academy\.claude\.com\/verify\/[^/?#]+$/.test(url)) return null
	return { verifyUrl: url, picture: shot.picture }
}

// The public pages of the certificates on Exceed LMS's Credentials list: each one opens in a dialog whose
// "Add to LinkedIn" link carries it
export async function exceedCertificates(): Promise<string[] | 'signed-out' | null> {
	const code = `(async () => {
		const sleep = ms => new Promise(r => setTimeout(r, ms))
		for (let i = 0; i < 40 && !document.querySelector('button[class*="profileCredentialsListItem"]'); i++) {
			if (document.querySelector('a[href*="/authentication/google_authentication"]')) return 'signed-out'
			await sleep(250)
		}
		const urls = []
		for (const item of document.querySelectorAll('button[class*="profileCredentialsListItem"]')) {
			item.click()
			let link = null
			for (let i = 0; i < 20 && !link; i++) { await sleep(250); link = document.querySelector('[role=dialog] a[href*="linkedin.com/profile/add"]') }
			const url = link ? new URL(link.href).searchParams.get('certUrl') || '' : ''
			if (url) urls.push(url)
			const close = document.querySelector('[role=dialog] button')
			if (close) close.click()
			await sleep(400)
		}
		return JSON.stringify(urls)
	})().catch(() => '')`
	const answer = await readPage('https://edu.exceedlms.com/student/my_learning/credentials', code, 120000, "document.readyState === 'complete' && !!document.querySelector('main')")
	if (answer === 'signed-out') return answer
	try {
		const urls = JSON.parse(answer) as unknown
		return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string' && /^https:\/\/[a-z0-9-]+\.exceedlms\.com\/student\/award\/[A-Za-z0-9]+$/.test(u)) : null
	} catch {
		return null
	}
}

// A certificate page that draws its certificate (Exceed LMS), photographed
export async function certificatePicture(url: string, selector: string): Promise<ArrayBuffer | null> {
	return (await photograph(url, boxOf(selector)))?.picture ?? null
}

export async function imdbHistory(): Promise<WatchHistory | 'signed-out' | null> {
	const answer = await readPage('https://www.imdb.com/', IMDB_READ, 120000, "!!document.getElementById('__NEXT_DATA__')")
	if (answer === 'signed-out') return answer
	try {
		const data = JSON.parse(answer) as { rated?: ImdbNode[]; listed?: { title: ImdbNode; added: string }[] }
		return { titles: imdbTitles(data.rated ?? [], data.listed ?? []), episodes: imdbEpisodes(data.rated ?? []) }
	} catch {
		return null
	}
}

// One GraphQL request as the signed-in member; null on any failure.
async function imdbAsk<T>(query: string): Promise<T | null> {
	const code = `window.fetch('https://api.graphql.imdb.com/', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ query }))} }).then(r => r.ok ? r.text() : '').catch(() => '')`
	try {
		// Any page of the site carries the cookies; robots.txt loads fastest.
		const answer = JSON.parse(await readPage('https://www.imdb.com/robots.txt', code, 30000, "document.contentType === 'text/plain'")) as { data?: T; errors?: unknown[] }
		return answer.errors?.length ? null : answer.data ?? null
	} catch {
		return null
	}
}

const IMDB_ID = /^tt\d+$/

export async function imdbRate(id: string, rating: number): Promise<boolean> {
	const value = Math.round(rating)
	if (!IMDB_ID.test(id) || value < 1 || value > 10) return false
	return (await imdbAsk(`mutation { rateTitle(input: {rating: ${String(value)}, titleId: "${id}"}) { __typename } }`)) !== null
}

export async function imdbWatchlistRemove(id: string): Promise<boolean> {
	if (!IMDB_ID.test(id)) return false
	return (await imdbAsk(`mutation { removeElementFromPredefinedList(input: {classType: WATCH_LIST, itemElementId: "${id}"}) { __typename } }`)) !== null
}

export async function imdbRatingDelete(id: string): Promise<boolean> {
	if (!IMDB_ID.test(id)) return false
	return (await imdbAsk(`mutation { deleteTitleRating(input: {titleId: "${id}"}) { __typename } }`)) !== null
}

export async function imdbWatchlistAdd(id: string): Promise<boolean> {
	if (!IMDB_ID.test(id)) return false
	return (await imdbAsk(`mutation { addItemToPredefinedList(input: {classType: WATCH_LIST, item: {itemElementId: "${id}"}}) { __typename } }`)) !== null
}

// Episode ids of one season, by episode number.
export async function imdbSeason(seriesId: string, season: number): Promise<Map<number, string>> {
	const ids = new Map<number, string>()
	if (!IMDB_ID.test(seriesId) || !Number.isSafeInteger(season)) return ids
	type Answer = { title?: { episodes?: { episodes?: { edges?: { node?: { id?: string; series?: { episodeNumber?: { episodeNumber?: number } } } }[] } } } }
	const data = await imdbAsk<Answer>(`{ title(id: "${seriesId}") { episodes { episodes(first: 250, filter: {includeSeasons: ["${String(season)}"]}) { edges { node { id series { episodeNumber { episodeNumber } } } } } } } }`)
	for (const edge of data?.title?.episodes?.episodes?.edges ?? []) {
		const id = edge.node?.id
		const number = edge.node?.series?.episodeNumber?.episodeNumber
		if (id && IMDB_ID.test(id) && number) ids.set(number, id)
	}
	return ids
}

// A watched Netflix episode, by name: Netflix knows no IMDb ids.
export interface NetflixEpisode {
	series: WatchedTitle
	// the episode's own Netflix id, for hiding its viewing
	id: number
	// ms since epoch of the viewing, 0 when unknown
	when: number
	season: number
	// Netflix cuts a long name short with "...": a prefix then.
	title: string
}

export interface NetflixHistory {
	titles: WatchedTitle[]
	episodes: NetflixEpisode[]
}

export interface NetflixViewed {
	movieID?: number
	date?: number
	title?: string
	episodeTitle?: string
	seasonDescriptor?: string
	series?: number
	seriesTitle?: string
}

export interface NetflixRated {
	movieID?: number
	title?: string
	reactionRatings?: { thumbs?: string }
}

// Netflix thumbs as library scores and back.
export const THUMB_SCORE: Record<string, number> = { THUMBS_DOWN: 3, THUMBS_UP: 7, THUMBS_WAY_UP: 9 }
export function thumbOf(score: number): 'THUMBS_DOWN' | 'THUMBS_UP' | 'THUMBS_WAY_UP' {
	return score >= 8 ? 'THUMBS_WAY_UP' : score >= 5 ? 'THUMBS_UP' : 'THUMBS_DOWN'
}

const SEASON_NUMBER = /(\d+)/

// Newest first: the last date seen for a title is when it was first watched.
export function netflixTitles(viewed: NetflixViewed[], rated: NetflixRated[]): NetflixHistory {
	const titles = new Map<number, WatchedTitle>()
	const episodes: NetflixEpisode[] = []
	const iso = (ms?: number): string => (ms ? new Date(ms).toISOString() : '')
	for (const item of viewed) {
		const series = item.series && item.seriesTitle ? item.series : null
		const id = series ?? item.movieID
		const name = series ? item.seriesTitle : item.title
		if (!id || !name) continue
		const known = titles.get(id)
		if (known) known.when = iso(item.date) || known.when
		else titles.set(id, { id: '', netflixId: id, name, kind: series ? 'series' : 'movie', year: null, rating: null, when: iso(item.date), watched: true })
		const title = titles.get(id)
		if (series && title && item.episodeTitle) {
			const season = Number(SEASON_NUMBER.exec(item.seasonDescriptor ?? '')?.[1] ?? 1)
			episodes.push({ series: title, id: item.movieID ?? 0, when: item.date ?? 0, season, title: item.episodeTitle })
			if (!title.episodeTitles) title.episodeTitles = []
			title.episodeTitles.push(item.episodeTitle)
		}
	}
	for (const item of rated) {
		const score = THUMB_SCORE[item.reactionRatings?.thumbs ?? '']
		if (!item.movieID || !score) continue
		const known = titles.get(item.movieID)
		if (known) known.rating = score
		// rated without a viewing in the history (a series' id, often): it only fills a note that has it
		else if (item.title) titles.set(item.movieID, { id: '', netflixId: item.movieID, name: item.title, kind: 'movie', year: null, rating: score, when: '', watched: true, guessed: true })
	}
	return { titles: [...titles.values()], episodes }
}

// The account pages' Falcor endpoint, paged; the profile is the signed-in one.
// The page's own account calls, shared by the reader and the hide below.
const NETFLIX_PRELUDE = `
	const context = window.netflix?.reactContext;
	if (!context) return '';
	const user = context.models?.userInfo?.data;
	if (location.pathname.includes('/login') || user?.membershipStatus === 'ANONYMOUS') return 'signed-out';
	if (!user?.guid) return '';
	const call = async (path) => {
		const query = new URLSearchParams({ falcor_server: '0.1.0', method: 'call', callPath: JSON.stringify(path) });
		const body = new URLSearchParams({ param: JSON.stringify({ guid: user.guid }), authURL: user.authURL || '' });
		const r = await window.fetch('/api/aui/pathEvaluator/web/%5E2.0.0?' + query, { method: 'POST', credentials: 'include', body,
			headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-netflix.request.routing': JSON.stringify({ path: '/nq/aui/endpoint/%5E1.0.0-web/pathEvaluator', control_tag: 'auinqweb' }) } });
		if (!r.ok) throw new Error(String(r.status));
		return (await r.json()).jsonGraph.aui[path[1]].value;
	};
	const all = async (name, field) => {
		const items = [];
		for (let page = 0; page < 100; page++) {
			const v = await call(['aui', name, page, 100]);
			const got = v[field] || [];
			items.push(...got);
			if (got.length < 100) break;
		}
		return items;
	};`

const NETFLIX_READ = `(async () => {${NETFLIX_PRELUDE}
	return JSON.stringify({ viewed: await all('viewingActivity', 'viewedItems'), rated: await all('ratingHistory', 'ratingItems') });
})().catch(() => '')`

export async function netflixHistory(): Promise<NetflixHistory | 'signed-out' | null> {
	const answer = await readPage('https://www.netflix.com/viewingactivity', NETFLIX_READ, 90000)
	if (answer === 'signed-out') return answer
	try {
		const data = JSON.parse(answer) as { viewed?: NetflixViewed[]; rated?: NetflixRated[] }
		return netflixTitles(data.viewed ?? [], data.rated ?? [])
	} catch {
		return null
	}
}

// The Viewing activity page's own "hide": one viewing, or every episode of its show.
const NETFLIX_HIDE = `
	const hide = async (videoId, all) => {
		const body = JSON.stringify({ operationName: 'HideTitleViewing', variables: { input: { videoId: String(videoId), hideAllEpisodes: all, profileGuid: user.guid } }, extensions: { persistedQuery: { id: '573bcc5d-b976-4302-8b57-c3f99479532d', version: 102 } } });
		const r = await window.fetch('/graphql', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body });
		const answer = r.ok ? await r.json() : null;
		return !!(answer && !answer.errors?.length && answer.data?.hideTitleViewing?.result);
	};`

// Hides single episodes' viewings by their Netflix ids; the ids it hid.
export async function netflixHideEpisodes(ids: number[]): Promise<number[]> {
	const clean = ids.filter(id => Number.isSafeInteger(id) && id > 0)
	if (clean.length === 0) return []
	const code = `(async () => {${NETFLIX_PRELUDE}${NETFLIX_HIDE}
	const done = [];
	for (const id of [${clean.map(id => String(id)).join(',')}]) if (await hide(id, false)) done.push(id);
	return JSON.stringify(done);
})().catch(() => '')`
	try {
		return (JSON.parse(await readPage('https://www.netflix.com/viewingactivity', code, 90000)) as number[]).filter(id => clean.indexOf(id) >= 0)
	} catch {
		return []
	}
}

// Hides a title from the profile's viewing history, every episode of a show: the
// "hide" of the Viewing activity page. 'none' when it was never there.
export async function netflixHideViewing(netflixId: number): Promise<boolean> {
	if (!Number.isSafeInteger(netflixId) || netflixId <= 0) return false
	const code = `(async () => {${NETFLIX_PRELUDE}
	const id = ${String(netflixId)};
	const item = (await all('viewingActivity', 'viewedItems')).find(v => v.series === id || v.movieID === id);
	if (!item) return 'none';${NETFLIX_HIDE}
	return await hide(item.movieID, item.series === id) ? 'hidden' : '';
})().catch(() => '')`
	const answer = await readPage('https://www.netflix.com/viewingactivity', code, 90000)
	return answer === 'hidden' || answer === 'none'
}

// Adds a title (a show's id for a series) to My List, by the page's safelisted mutation.
export async function netflixAddToList(netflixId: number): Promise<boolean> {
	if (!Number.isSafeInteger(netflixId) || netflixId <= 0) return false
	const body = JSON.stringify({ operationName: 'AddToPlaylist', variables: { entityId: String(netflixId), trackId: null, signature: null }, extensions: { persistedQuery: { id: '5426b5a2-bb59-4b4a-a1f1-d04290c1160f', version: 102 } } })
	const code = `window.fetch('/graphql', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(body)} }).then(r => r.ok ? r.text() : '').catch(() => '')`
	try {
		// any data without errors counts: the result field's name is not pinned down
		const answer = JSON.parse(await readPage('https://www.netflix.com/robots.txt', code)) as { data?: Record<string, unknown> | null; errors?: unknown[] }
		return !answer.errors?.length && !!answer.data && Object.values(answer.data).some(Boolean)
	} catch {
		return false
	}
}

// A thumb on the title (a show's id for a series), by the page's safelisted mutation.
export async function netflixRate(netflixId: number, score: number): Promise<boolean> {
	if (!Number.isSafeInteger(netflixId) || score < 1 || score > 10) return false
	const body = JSON.stringify({ operationName: 'SetEntityThumbRating', variables: { entityId: String(netflixId), rating: thumbOf(score), trackId: null }, extensions: { persistedQuery: { id: '699dce5b-9632-493d-9b6a-5b2713c4769a', version: 102 } } })
	const code = `window.fetch('/graphql', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(body)} }).then(r => r.ok ? r.text() : '').catch(() => '')`
	try {
		const answer = JSON.parse(await readPage('https://www.netflix.com/robots.txt', code)) as { data?: unknown; errors?: unknown[] }
		return !answer.errors?.length && !!answer.data
	} catch {
		return false
	}
}
