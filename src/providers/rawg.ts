import { requestUrl } from 'obsidian'
import { steamMediaFor } from './steam'
import type { GameTrailerFinder } from './gameTrailer'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import { releasedDmy } from '../util'

interface RawgSearchItem {
	id: number
	name: string
	released?: string | null
	background_image?: string | null
	genres?: { name: string }[]
}

interface RawgSearchResponse {
	results?: RawgSearchItem[]
}

interface RawgDetails {
	name: string
	released?: string | null
	background_image?: string | null
	slug?: string
	genres?: { name: string }[]
	developers?: { name: string }[]
	publishers?: { name: string }[]
	rating?: number | null
	metacritic?: number | null
}

export class RawgProvider implements ContentProvider {
	readonly id = 'rawg'
	readonly contentTypes: ContentType[] = ['game']

	private static readonly BASE = 'https://api.rawg.io/api/games'

	private getKey: () => string

	private trailers: GameTrailerFinder

	// A RAWG id needs a key to look up.
	refreshable(): boolean {
		return !!this.getKey().trim()
	}

	constructor(getKey: () => string, trailers: GameTrailerFinder) {
		this.getKey = getKey
		this.trailers = trailers
	}

	private year(value: string | null | undefined): number | null {
		if (!value) return null
		const match = value.match(/^(\d{4})/)
		return match ? Number(match[1]) : null
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			const key = this.getKey().trim()
			if (!key) return []
			const params = new URLSearchParams({ key, search: query, page_size: '20' })
			const resp = await requestUrl({ url: `${RawgProvider.BASE}?${params.toString()}`, throw: false })
			if (resp.status !== 200) return []
			const data = resp.json as RawgSearchResponse
			return (data.results ?? []).map((item) => ({
				provider: this.id,
				sourceId: String(item.id),
				title: item.name,
				year: this.year(item.released),
				cover: item.background_image ?? null,
				subtitle: (item.genres ?? []).map((g) => g.name).join(', ') || null,
				raw: item
			}))
		} catch (e) {
			console.error('Library: RAWG search error', e)
			return []
		}
	}

	// RAWG's screenshots; trailer from YouTube (IGDB, Wikidata), else the Steam
	// page: RAWG's own video list is mostly empty.
	private async media(id: string, name: string, params: URLSearchParams): Promise<Record<string, unknown>> {
		const out: Record<string, unknown> = {}
		const get = async <T>(path: string): Promise<T | null> => {
			const resp = await requestUrl({ url: `${RawgProvider.BASE}/${encodeURIComponent(id)}/${path}?${params.toString()}`, throw: false })
			return resp.status === 200 ? resp.json as T : null
		}
		const [shots, stores] = await Promise.all([
			get<{ results?: { image?: string }[] }>('screenshots'),
			get<{ results?: { url?: string }[] }>('stores')
		])
		const gallery = (shots?.results ?? []).map(s => s.image).filter((s): s is string => !!s).slice(0, 8)
		if (gallery.length > 0) out.Gallery = gallery
		const steamApp = (stores?.results ?? []).map(s => s.url?.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1]).find(Boolean)
		const steam = steamApp ? await steamMediaFor(Number(steamApp)) : {}
		if (!out.Gallery && steam.Gallery) out.Gallery = steam.Gallery
		const trailer = await this.trailers.youtube(steamApp ? Number(steamApp) : null, name) ?? steam.Trailer
		if (trailer) out.Trailer = trailer
		return out
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		try {
			const key = this.getKey().trim()
			if (!key) return null
			const params = new URLSearchParams({ key })
			const resp = await requestUrl({ url: `${RawgProvider.BASE}/${encodeURIComponent(sourceId)}?${params.toString()}`, throw: false })
			if (resp.status !== 200) return null
			const details = resp.json as RawgDetails

			const creators = (details.developers ?? details.publishers ?? []).map((d) => d.name)
			const fields: Record<string, unknown> = {
				Name: details.name,
				Year: this.year(details.released),
				Released: releasedDmy(details.released) || null,
				Genre: (details.genres ?? []).map((g) => g.name),
				Creator: creators,
				Cover: details.background_image ?? null
			}
			if (details.slug) fields['URL'] = `https://rawg.io/games/${details.slug}`
			// RAWG 0-5, Metacritic 0-100; both normalized to 0-10.
			if (typeof details.rating === 'number' && details.rating > 0) {
				fields['Rating RAWG'] = Math.round(details.rating * 20) / 10
			}
			if (typeof details.metacritic === 'number' && details.metacritic > 0) {
				fields['Rating MC'] = Math.round(details.metacritic) / 10
			}

			Object.assign(fields, await this.media(sourceId, details.name, params))
			return { fields, progressTotal: 1, imdbId: null }
		} catch (e) {
			console.error('Library: RAWG fetch error', e)
			return null
		}
	}
}
