import { requestUrl } from 'obsidian'
import { SEARCH_BUDGET_MS, isEmptyValue, plausibleRuntime, within } from '../util'
import { NON_LATIN, claim, claimItems, entities, languages, searchItems, textIn, yearIn } from './wikidata'
import type {
	ContentProvider,
	ContentType,
	MetadataEnricher,
	NormalizedMetadata,
	SearchResult,
	TitleKind
} from './types'

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

interface OmdbSearchItem {
	Title: string
	Year?: string
	imdbID: string
	Poster?: string
}

interface OmdbSearchResponse {
	Search?: OmdbSearchItem[]
	Response?: string
}

interface OmdbRating {
	Source?: string
	Value?: string
}

interface OmdbDetails {
	Title: string
	Year?: string
	Genre?: string
	// Comma-separated: "Japan, United States".
	Country?: string
	Director?: string
	Writer?: string
	Actors?: string
	Poster?: string
	imdbRating?: string
	Ratings?: OmdbRating[]
	Runtime?: string
	totalSeasons?: string
	imdbID: string
	Response?: string
}

interface OmdbSeasonResponse {
	Episodes?: unknown[]
}

interface CinemetaMeta {
	imdb_id?: string
	id?: string
	name?: string
	releaseInfo?: string
	year?: string
	genre?: string[]
	// Comma-separated, like OMDb's.
	country?: string
	director?: string[] | null
	writer?: string[] | null
	cast?: string[]
	imdbRating?: string
	runtime?: string
	poster?: string
	videos?: { season?: number }[]
}

function countries(value: string | undefined): string[] {
	if (!value || value === 'N/A') return []
	return value.split(',').map(s => s.trim()).filter(Boolean)
}

// A failed request's body may not be JSON (an HTML error page).
function jsonOf(resp: { json: unknown }): unknown {
	try {
		return resp.json
	} catch {
		return null
	}
}

function na(value: string | undefined): string | null {
	return value && value !== 'N/A' ? value : null
}

// P31 classes (Wikidata): film, feature film, television film, animated film, animated
// feature film / television series, miniseries, web series, anime series, animated series.
const FILM_CLASSES = ['Q11424', 'Q24869', 'Q506240', 'Q202866', 'Q29168811', 'Q24862']
const SERIES_CLASSES = ['Q5398426', 'Q1259759', 'Q526877', 'Q63952888', 'Q117467246']
// a class that says more than "film" or "series", most telling first
const KINDS: [string, TitleKind][] = [
	['Q1259759', 'miniseries'], ['Q526877', 'webseries'], ['Q117467246', 'animatedseries'],
	['Q24862', 'short'], ['Q506240', 'tvfilm'], ['Q202866', 'animatedfilm'], ['Q29168811', 'animatedfilm']
]

export function kindOf(classes: string[]): TitleKind | undefined {
	return KINDS.find(([item]) => classes.indexOf(item) >= 0)?.[1]
}

// "brother 1997" searches "brother"; "1917"/"2049" stay titles.
export function splitYear(query: string): { title: string; year: number | null } {
	const match = query.trim().match(/^(.*\S)\s+(\d{4})$/)
	const year = match ? Number(match[2]) : NaN
	if (match?.[1] && year >= 1870 && year <= new Date().getFullYear() + 5) return { title: match[1], year }
	return { title: query.trim(), year: null }
}

function arrange(results: SearchResult[], year: number | null): SearchResult[] {
	const byId = new Map<string, SearchResult>()
	for (const result of results) {
		const kept = byId.get(result.sourceId)
		if (!kept) {
			byId.set(result.sourceId, { ...result })
			continue
		}
		kept.subtitle = kept.subtitle ?? result.subtitle
		kept.year = kept.year ?? result.year
		kept.cover = kept.cover ?? result.cover
		kept.kind = kept.kind ?? result.kind
	}
	const unique = [...byId.values()]
	if (year === null) return unique
	return [...unique.filter(r => r.year === year), ...unique.filter(r => r.year !== year)]
}

export class OmdbProvider implements ContentProvider {
	readonly id = 'omdb'
	readonly contentTypes: ContentType[] = ['movie', 'series']

	private static readonly BASE = 'https://www.omdbapi.com/'
	private static readonly CINEMETA = 'https://v3-cinemeta.strem.io'
	private static readonly REST = 60 * 60 * 1000

	// No key, or an hour after OMDb's limit (1,000/day free) or an outage: Cinemeta.
	private restingSince = 0

	private getKey: () => string
	private enrichers: MetadataEnricher[]

	constructor(getKey: () => string, enrichers: MetadataEnricher[] = []) {
		this.getKey = getKey
		this.enrichers = enrichers
	}

	private url(params: Record<string, string>): string {
		return `${OmdbProvider.BASE}?${new URLSearchParams({ apikey: this.getKey(), ...params }).toString()}`
	}

	private year(value: string | null): number | null {
		if (!value) return null
		const match = value.match(/^(\d{4})/)
		return match ? Number(match[1]) : null
	}

	private cover(value: string | undefined): string | null {
		return na(value)
	}

	// Rotten Tomatoes as "87%" in Ratings.
	private rtRating(details: OmdbDetails): number | null {
		const entry = (details.Ratings ?? []).find((r) => r.Source === 'Rotten Tomatoes')
		const match = entry?.Value?.match(/^(\d+)%$/)
		return match ? Number(match[1]) : null
	}

	// Enrichers fill only what OMDb lacks, in order: TMDB, then keyless Cinemeta.
	private async applyEnrichers(
		fields: Record<string, unknown>,
		imdbId: string,
		type: ContentType
	): Promise<void> {
		for (const enricher of this.enrichers) {
			const extra = await enricher.enrich(imdbId, type)
			for (const [key, value] of Object.entries(extra)) {
				if (isEmptyValue(value)) continue
				if (isEmptyValue(fields[key])) fields[key] = value
			}
		}
	}

	private resting(): boolean {
		return Date.now() - this.restingSince < OmdbProvider.REST
	}

	// Daily limit or outage: ask Cinemeta. "Movie not found!" stays a miss.
	private unavailable(status: number, json: unknown): boolean {
		const error = json && typeof json === 'object' ? (json as { Error?: unknown }).Error : null
		if (status >= 500 || (typeof error === 'string' && /limit reached/i.test(error))) {
			this.restingSince = Date.now()
			return true
		}
		return false
	}

	// OMDb answers ten titles and only with a key; Cinemeta/Wikidata add the rest.
	async search(query: string, type: ContentType): Promise<SearchResult[]> {
		const kind = type === 'series' ? 'series' : 'movie'
		const { title, year } = splitYear(query)
		const open = this.searchOpen(query, title, kind)
		const keyed = this.getKey() && !this.resting() ? await within(this.searchOmdb(title, kind, year), SEARCH_BUDGET_MS, []) : []
		return arrange([...keyed, ...(await open)], year)
	}

	private async searchOmdb(title: string, kind: 'movie' | 'series', year: number | null): Promise<SearchResult[]> {
		try {
			const params: Record<string, string> = { s: title, type: kind }
			if (year !== null) params.y = String(year)
			const resp = await requestUrl({ url: this.url(params), throw: false })
			const data = jsonOf(resp) as OmdbSearchResponse | null
			if (this.unavailable(resp.status, data) || resp.status !== 200) return []
			if (!data || typeof data !== 'object' || data.Response === 'False') return []
			const items = Array.isArray(data.Search) ? data.Search : []
			return items.map((item) => ({
				provider: this.id,
				sourceId: item.imdbID,
				title: item.Title,
				year: this.year(na(item.Year)),
				cover: this.cover(item.Poster),
				subtitle: null,
				raw: item
			}))
		} catch (e) {
			console.error('Library: OMDb search error', e)
			return []
		}
	}

	// Non-Latin queries lead with Wikidata labels; Latin with Cinemeta.
	private async searchOpen(query: string, title: string, kind: 'movie' | 'series'): Promise<SearchResult[]> {
		const [cinemeta, wikidata] = await Promise.all([
			within(this.searchCinemeta(title, kind), SEARCH_BUDGET_MS, []),
			within(this.searchWikidata(query, kind), SEARCH_BUDGET_MS, [])
		])
		return NON_LATIN.test(query) ? [...wikidata, ...cinemeta] : [...cinemeta, ...wikidata]
	}

	private async searchWikidata(query: string, kind: 'movie' | 'series'): Promise<SearchResult[]> {
		try {
			const classes = (kind === 'series' ? SERIES_CLASSES : FILM_CLASSES).map(c => `P31=${c}`).join('|')
			const ids = await searchItems(query, `haswbstatement:P345 haswbstatement:${classes}`, 8)
			const langs = languages()
			const [found, imdbIds, kinds] = await Promise.all([
				entities(ids, 'labels|descriptions', langs),
				Promise.all(ids.map(id => claim(id, 'P345'))),
				Promise.all(ids.map(id => claimItems(id, 'P31')))
			])
			const out: SearchResult[] = []
			ids.forEach((id, i) => {
				const imdb = imdbIds[i]
				if (typeof imdb !== 'string' || !/^tt\d+$/.test(imdb)) return
				const entity = found[id]
				const english = textIn(entity?.labels, ['en', 'mul'])
				const local = textIn(entity?.labels, langs)
				const description = textIn(entity?.descriptions, langs)
				out.push({
					provider: this.id,
					sourceId: imdb,
					title: english ?? local ?? imdb,
					year: yearIn(description),
					cover: `https://images.metahub.space/poster/small/${imdb}/img`,
					subtitle: [local !== english ? local : null, description].filter(Boolean).join(' · ') || null,
					raw: null,
					kind: kindOf(kinds[i] ?? [])
				})
			})
			return out
		} catch (e) {
			console.error('Library: Wikidata search error', e)
			return []
		}
	}

	private async searchCinemeta(query: string, kind: 'movie' | 'series'): Promise<SearchResult[]> {
		try {
			const resp = await requestUrl({
				url: `${OmdbProvider.CINEMETA}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`,
				throw: false
			})
			if (resp.status !== 200) return []
			const metas = (jsonOf(resp) as { metas?: CinemetaMeta[] } | null)?.metas ?? []
			const out: SearchResult[] = []
			for (const meta of metas) {
				const id = meta.imdb_id ?? meta.id ?? ''
				if (!/^tt\d+$/.test(id)) continue
				out.push({
					provider: this.id,
					sourceId: id,
					title: meta.name ?? id,
					year: this.year(meta.releaseInfo ?? meta.year ?? null),
					cover: meta.poster ?? null,
					subtitle: null,
					raw: meta
				})
			}
			return out
		} catch (e) {
			console.error('Library: Cinemeta search error', e)
			return []
		}
	}

	private async fromCinemeta(imdbId: string, type: ContentType): Promise<{ fields: Record<string, unknown>; years: string | null; seasons: number } | null> {
		try {
			const kind = type === 'series' ? 'series' : 'movie'
			const resp = await requestUrl({ url: `${OmdbProvider.CINEMETA}/meta/${kind}/${encodeURIComponent(imdbId)}.json`, throw: false })
			if (resp.status !== 200) return null
			const meta = (jsonOf(resp) as { meta?: CinemetaMeta } | null)?.meta
			if (!meta?.name) return null
			const years = meta.releaseInfo ?? meta.year ?? null
			const fields: Record<string, unknown> = {
				Name: meta.name,
				Year: this.year(years),
				Genre: meta.genre ?? [],
				Country: countries(meta.country),
				Creator: meta.director?.length ? meta.director : meta.writer ?? [],
				Cast: meta.cast ?? [],
				Cover: meta.poster ?? null,
				URL: `https://www.imdb.com/title/${imdbId}/`
			}
			const rating = Number(meta.imdbRating)
			if (rating > 0) fields['Rating IMDB'] = rating
			const runtime = plausibleRuntime(meta.runtime)
			if (runtime !== null) fields.Runtime = runtime
			// Season 0 holds specials.
			const seasons = new Set<number>()
			for (const video of meta.videos ?? []) if (typeof video.season === 'number' && video.season > 0) seasons.add(video.season)
			return { fields, years, seasons: seasons.size }
		} catch (e) {
			console.error('Library: Cinemeta fetch error', e)
			return null
		}
	}

	async fetch(sourceId: string, type: ContentType): Promise<NormalizedMetadata | null> {
		try {
			let details: OmdbDetails | null = null
			if (this.getKey() && !this.resting()) {
				const resp = await requestUrl({ url: this.url({ i: sourceId }), throw: false })
				const json = jsonOf(resp) as OmdbDetails | null
				if (!this.unavailable(resp.status, json)) {
					if (resp.status !== 200) return null
					if (!json || typeof json !== 'object' || json.Response === 'False') return null
					details = json
				}
			}
			if (!details) {
				const backup = await this.fromCinemeta(sourceId, type)
				if (!backup) return null
				await this.applyEnrichers(backup.fields, sourceId, type)
				if (type === 'series') return this.enrichSeries(backup.fields, backup.years, backup.seasons, sourceId)
				return { fields: backup.fields, progressTotal: 1, imdbId: sourceId }
			}

			const creatorSource = na(details.Director) ?? na(details.Writer)
			const creators = creatorSource
				? creatorSource.split(',').map((s) => s.trim()).filter(Boolean)
				: []
			const genreSource = na(details.Genre)
			const genres = genreSource
				? genreSource.split(',').map((s) => s.trim()).filter(Boolean)
				: []
			const actorSource = na(details.Actors)
			const cast = actorSource
				? actorSource.split(',').map((s) => s.trim()).filter(Boolean)
				: []
			const rawYear = na(details.Year)
			const rating = na(details.imdbRating)

			const fields: Record<string, unknown> = {
				Name: details.Title,
				Year: this.year(rawYear),
				Genre: genres,
				Country: countries(details.Country),
				Creator: creators,
				Cast: cast,
				Cover: this.cover(details.Poster),
				URL: `https://www.imdb.com/title/${details.imdbID}/`
			}
			if (rating) fields['Rating IMDB'] = parseFloat(rating)
			const rt = this.rtRating(details)
			if (rt !== null) fields['Rating RT'] = rt
			const runtime = plausibleRuntime(details.Runtime)
			if (runtime !== null) fields.Runtime = runtime

			await this.applyEnrichers(fields, details.imdbID, type)

			if (type === 'series') {
				const seasons = na(details.totalSeasons) ? Number(details.totalSeasons) : 0
				return this.enrichSeries(fields, rawYear, seasons, sourceId)
			}
			return { fields, progressTotal: 1, imdbId: details.imdbID }
		} catch (e) {
			console.error('Library: OMDb fetch error', e)
			return null
		}
	}

	// Episode total from the enrichers' season list; OMDb is asked season by season
	// only when that list is missing or short (TMDB caps at 15).
	private async enrichSeries(
		fields: Record<string, unknown>,
		years: string | null,
		totalSeasons: number,
		imdbId: string
	): Promise<NormalizedMetadata> {
		const endMatch = years?.match(/[–-](\d{4})/)
		if (endMatch) fields['End Year'] = Number(endMatch[1])

		if (totalSeasons > 0) fields.Season = totalSeasons
		const seasons = Array.isArray(fields.Seasons) ? fields.Seasons as { episodes?: unknown }[] : []
		const listed = seasons.reduce((sum, s) => sum + (Number(s.episodes) || 0), 0)
		const episodes = listed > 0 && seasons.length >= totalSeasons ? listed
			: totalSeasons > 0 && this.getKey() && !this.resting() ? await this.countEpisodes(imdbId, totalSeasons) : 0
		return { fields, progressTotal: episodes > 0 ? episodes : null, imdbId }
	}

	private async countEpisodes(imdbId: string, totalSeasons: number): Promise<number> {
		let total = 0
		// The count comes from the answer; the longest soaps run about 60 seasons.
		const last = Math.min(totalSeasons, 80)
		for (let season = 1; season <= last; season++) {
			try {
				const resp = await requestUrl({ url: this.url({ i: imdbId, Season: String(season) }), throw: false })
				if (this.unavailable(resp.status, jsonOf(resp))) return 0
				if (resp.status !== 200) continue
				const data = resp.json as OmdbSeasonResponse
				if (Array.isArray(data?.Episodes)) total += data.Episodes.length
			} catch (e) {
				console.error('Library: OMDb season fetch error', e)
			}
			if (season < last) await delay(150)
		}
		return total
	}
}
