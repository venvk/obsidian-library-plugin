import { getLanguage, requestUrl } from 'obsidian'
import type { MetadataEnricher } from './types'

// Wikidata's action API: no key, no daily cap, any-language titles.

const API = 'https://www.wikidata.org/w/api.php'

// Non-Latin letters; a curly apostrophe stays Latin.
export const NON_LATIN = /[\u0370-\u1fff\u2c00-\uffff]/

export interface WikidataClaim {
	mainsnak?: { datavalue?: { value?: unknown } }
	qualifiers?: Record<string, { datavalue?: { value?: unknown } }[]>
}

export interface WikidataEntity {
	labels?: Record<string, { value?: string }>
	descriptions?: Record<string, { value?: string }>
	claims?: Record<string, WikidataClaim[]>
	sitelinks?: Record<string, { title?: string }>
}

// Wikimedia asks clients to identify themselves.
const HEADERS = { 'Api-User-Agent': 'LibraryObsidianPlugin (https://github.com/venvk/obsidian-library-plugin)' }

async function api<T>(params: Record<string, string>): Promise<T | null> {
	try {
		const query = new URLSearchParams({ ...params, format: 'json', origin: '*' })
		const resp = await requestUrl({ url: `${API}?${query.toString()}`, headers: HEADERS, throw: false })
		return resp.status === 200 ? resp.json as T : null
	} catch (e) {
		console.error('Library: Wikidata request error', e)
		return null
	}
}

// Reader's language, then English, then "mul".
export function languages(): string[] {
	const tag = getLanguage().toLowerCase()
	const all = [tag, tag.split('-')[0] ?? tag, 'en', 'mul']
	return all.filter((lang, i) => lang && all.indexOf(lang) === i)
}

// Item ids of a full-text search narrowed by CirrusSearch keywords.
export async function searchItems(text: string, filter: string, limit: number): Promise<string[]> {
	const json = await api<{ query?: { search?: { title: string }[] } }>({
		action: 'query',
		list: 'search',
		srsearch: `${text} ${filter}`.trim(),
		srlimit: String(limit)
	})
	return (json?.query?.search ?? []).map(hit => hit.title).filter(id => /^Q\d+$/.test(id))
}

export async function entities(ids: string[], props: string, langs: string[] = languages()): Promise<Record<string, WikidataEntity>> {
	if (ids.length === 0) return {}
	const json = await api<{ entities?: Record<string, WikidataEntity> }>({
		action: 'wbgetentities',
		ids: ids.slice(0, 50).join('|'),
		props,
		languages: langs.join('|')
	})
	return json?.entities ?? {}
}

// One property of one item: a full claim list runs to a hundred KB.
export async function claim(id: string, property: string): Promise<unknown> {
	const json = await api<{ claims?: Record<string, WikidataClaim[]> }>({ action: 'wbgetclaims', entity: id, property })
	return json?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value
}

// Every item one property of one item points at, such as all its classes (P31).
export async function claimItems(id: string, property: string): Promise<string[]> {
	const json = await api<{ claims?: Record<string, WikidataClaim[]> }>({ action: 'wbgetclaims', entity: id, property })
	const ids: string[] = []
	for (const c of json?.claims?.[property] ?? []) {
		const item = (c.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id
		if (typeof item === 'string') ids.push(item)
	}
	return ids
}

export function claimValues(entity: WikidataEntity | undefined, property: string): unknown[] {
	return (entity?.claims?.[property] ?? []).map(c => c.mainsnak?.datavalue?.value).filter(v => v !== undefined)
}

export function itemIds(entity: WikidataEntity | undefined, property: string): string[] {
	const ids: string[] = []
	for (const value of claimValues(entity, property)) {
		const id = (value as { id?: unknown } | null)?.id
		if (typeof id === 'string' && /^Q\d+$/.test(id)) ids.push(id)
	}
	return ids
}

export function textIn(map: Record<string, { value?: string }> | undefined, langs: string[] = languages()): string | null {
	for (const lang of langs) {
		const value = map?.[lang]?.value
		if (value) return value
	}
	return null
}

const ROTTEN_TOMATOES = 'Q105584'
const TOMATOMETER = 'Q108403393'

function qualifierValues(claim: WikidataClaim, property: string): unknown[] {
	return (claim.qualifiers?.[property] ?? []).map(q => q.datavalue?.value)
}

// Tomatometer from Wikidata (P444); OMDb lacks it for recent or keyless films.
export class RottenTomatoesEnricher implements MetadataEnricher {
	async enrich(imdbId: string): Promise<Record<string, unknown>> {
		if (!/^tt\d+$/.test(imdbId)) return {}
		const [item] = await searchItems('', `haswbstatement:P345=${imdbId}`, 1)
		if (!item) return {}
		const json = await api<{ claims?: Record<string, WikidataClaim[]> }>({ action: 'wbgetclaims', entity: item, property: 'P444' })
		let best: { score: number; when: string } | null = null
		for (const c of json?.claims?.P444 ?? []) {
			const by = qualifierValues(c, 'P447').map(v => (v as { id?: unknown } | undefined)?.id)
			const method = qualifierValues(c, 'P459').map(v => (v as { id?: unknown } | undefined)?.id)
			if (by.indexOf(ROTTEN_TOMATOES) < 0 || method.indexOf(TOMATOMETER) < 0) continue
			const raw = c.mainsnak?.datavalue?.value
			const match = typeof raw === 'string' ? raw.match(/^(\d{1,3})%$/) : null
			if (!match) continue
			const time = (qualifierValues(c, 'P585')[0] as { time?: unknown } | undefined)?.time
			const when = typeof time === 'string' ? time : ''
			if (!best || when > best.when) best = { score: Number(match[1]), when }
		}
		return best ? { 'Rating RT': best.score } : {}
	}
}

// Lead image of an English Wikipedia article; non-free images count.
export async function wikipediaImages(titles: string[]): Promise<Record<string, string>> {
	const images: Record<string, string> = {}
	if (titles.length === 0) return images
	try {
		const query = new URLSearchParams({
			action: 'query', prop: 'pageimages', titles: titles.slice(0, 50).join('|'), piprop: 'thumbnail',
			pithumbsize: '600', pilicense: 'any', redirects: '1', format: 'json', origin: '*'
		})
		const resp = await requestUrl({ url: `https://en.wikipedia.org/w/api.php?${query.toString()}`, headers: HEADERS, throw: false })
		if (resp.status !== 200) return images
		type Hop = { from: string; to: string }
		type Page = { title?: string; thumbnail?: { source?: string } }
		const answer = (resp.json as { query?: { normalized?: Hop[]; redirects?: Hop[]; pages?: Record<string, Page> } }).query
		const byTitle: Record<string, string> = {}
		for (const page of Object.values(answer?.pages ?? {})) {
			// Drop Wikipedia's tracking query.
			if (page.title && page.thumbnail?.source) byTitle[page.title] = page.thumbnail.source.split('?')[0] ?? page.thumbnail.source
		}
		// Keyed by each article's final title: normalized, then redirected.
		const hops = [...(answer?.normalized ?? []), ...(answer?.redirects ?? [])]
		for (const title of titles) {
			let final = title
			for (const hop of hops) if (hop.from === final) final = hop.to
			const source = byTitle[final]
			if (source) images[title] = source
		}
	} catch (e) {
		console.error('Library: Wikipedia request error', e)
	}
	return images
}

export async function labelsOf(ids: string[], langs: string[]): Promise<(list: string[]) => string[]> {
	const named = await entities(ids.filter((id, i) => ids.indexOf(id) === i), 'labels', langs)
	return (list) => list.map(id => textIn(named[id]?.labels, langs)).filter((label): label is string => !!label)
}

// First year among an item's dates.
export function firstYear(entity: WikidataEntity | undefined, properties: string[]): number | null {
	const years: number[] = []
	for (const property of properties) {
		for (const value of claimValues(entity, property)) {
			const time = (value as { time?: unknown } | null)?.time
			const year = typeof time === 'string' ? yearIn(time) : null
			if (year !== null) years.push(year)
		}
	}
	return years.length > 0 ? Math.min(...years) : null
}

// Earliest value precise to the day (precision 11), as Wikidata writes it.
export function firstDate(entity: WikidataEntity | undefined, properties: string[]): string | null {
	const dates: string[] = []
	for (const property of properties) {
		for (const value of claimValues(entity, property)) {
			const v = value as { time?: unknown; precision?: unknown } | null
			if (typeof v?.time === 'string' && Number(v.precision) >= 11) dates.push(v.time)
		}
	}
	return dates.length > 0 ? dates.sort()[0] ?? null : null
}

export function pageUrl(id: string, article: string | null): string {
	// Colons and commas read as themselves in an article link.
	return article
		? `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2C/g, ',')}`
		: `https://www.wikidata.org/wiki/${id}`
}

// The year a description names: "1997 film by…", "фильм 1997 года".
export function yearIn(text: string | null): number | null {
	const match = text?.match(/\b(1[89]\d\d|20\d\d)\b/)
	return match ? Number(match[1]) : null
}

// What Wikidata knows of Netflix titles by its "Netflix ID" (P1874): the IMDb id (P345), and for
// anime the AniList (P8729) and MyAnimeList (P4086) ids. A title it lacks is left out.
export interface NetflixIds {
	imdb?: string
	anilist?: number
	mal?: number
}

export async function idsForNetflix(netflixIds: number[]): Promise<Map<number, NetflixIds>> {
	const out = new Map<number, NetflixIds>()
	const ids = netflixIds.filter(id => Number.isSafeInteger(id) && id > 0)
	const first = (entity: WikidataEntity, prop: string): unknown => entity.claims?.[prop]?.map(claim => claim.mainsnak?.datavalue?.value).find(value => value !== undefined)
	for (let i = 0; i < ids.length; i += 40) {
		const chunk = ids.slice(i, i + 40)
		const found = await api<{ query?: { search?: { title: string }[] } }>({
			action: 'query', list: 'search', srprop: '', srlimit: '50',
			srsearch: 'haswbstatement:' + chunk.map(id => `P1874=${String(id)}`).join('|'),
		})
		const items = (found?.query?.search ?? []).map(hit => hit.title).filter(title => /^Q\d+$/.test(title))
		if (items.length === 0) continue
		const data = await api<{ entities?: Record<string, WikidataEntity> }>({ action: 'wbgetentities', ids: items.join('|'), props: 'claims' })
		for (const entity of Object.values(data?.entities ?? {})) {
			const imdb = first(entity, 'P345')
			const anilist = Number(first(entity, 'P8729'))
			const mal = Number(first(entity, 'P4086'))
			const known: NetflixIds = {}
			if (typeof imdb === 'string' && /^tt\d+$/.test(imdb)) known.imdb = imdb
			if (Number.isSafeInteger(anilist) && anilist > 0) known.anilist = anilist
			if (Number.isSafeInteger(mal) && mal > 0) known.mal = mal
			if (!known.imdb && !known.anilist && !known.mal) continue
			for (const claim of entity.claims?.P1874 ?? []) {
				const id = Number(claim.mainsnak?.datavalue?.value)
				if (chunk.indexOf(id) >= 0 && !out.has(id)) out.set(id, known)
			}
		}
	}
	return out
}
