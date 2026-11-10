import { requestUrl } from 'obsidian'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import type { ILibrarySettings } from '../constants'
import { pickTitle } from '../util'

interface MalAnime {
	id: number
	title: string
	alternative_titles?: { en?: string; ja?: string }
	start_date?: string
	synopsis?: string
	mean?: number
	num_episodes?: number
	average_episode_duration?: number
	genres?: { name: string }[]
	studios?: { name: string }[]
	main_picture?: { medium?: string; large?: string }
}

// `id`, `title` and `main_picture` come with every answer; the rest is asked for.
const SEARCH_FIELDS = 'alternative_titles,start_date'
const DETAIL_FIELDS = 'alternative_titles,start_date,mean,num_episodes,average_episode_duration,genres,studios,synopsis'

// MyAnimeList anime; needs only the Client ID, silent without it. Notes carry
// `mal:` ids and refresh back here.
export class MalProvider implements ContentProvider {
	readonly id = 'mal'
	readonly contentTypes: ContentType[] = ['anime']

	static readonly PREFIX = 'mal:'
	private static readonly API = 'https://api.myanimelist.net/v2'

	private getClientId: () => string

	constructor(getClientId: () => string, private prefs: () => Pick<ILibrarySettings, 'titleLanguage' | 'adultTitles'>) {
		this.getClientId = getClientId
	}

	enabled(): boolean {
		return !!this.getClientId().trim()
	}

	refreshable(): boolean {
		return this.enabled()
	}

	private async get<T>(path: string): Promise<T | null> {
		const clientId = this.getClientId().trim()
		if (!clientId) return null
		const resp = await requestUrl({
			url: MalProvider.API + path,
			headers: { 'X-MAL-CLIENT-ID': clientId, Accept: 'application/json' },
			throw: false
		})
		// A failed request may answer with HTML; only 200 is JSON.
		return resp.status === 200 ? resp.json as T : null
	}

	// MyAnimeList's main title is the romaji one.
	private title(anime: MalAnime): string {
		const alt = anime.alternative_titles
		return pickTitle({ english: alt?.en, romaji: anime.title, native: alt?.ja }, this.prefs().titleLanguage)
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			const json = await this.get<{ data?: { node: MalAnime }[] }>(
				`/anime?q=${encodeURIComponent(query)}&limit=20&fields=${SEARCH_FIELDS}${this.prefs().adultTitles ? '&nsfw=true' : ''}`
			)
			return (json?.data ?? []).map(({ node }) => ({
				provider: this.id,
				sourceId: MalProvider.PREFIX + String(node.id),
				title: this.title(node),
				year: yearOf(node.start_date),
				cover: node.main_picture?.large ?? node.main_picture?.medium ?? null,
				subtitle: node.alternative_titles?.ja || null,
				raw: null
			}))
		} catch (e) {
			console.error('Library: MyAnimeList search error', e)
			return []
		}
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		const id = sourceId.startsWith(MalProvider.PREFIX) ? sourceId.slice(MalProvider.PREFIX.length) : ''
		if (!/^\d+$/.test(id)) return null
		try {
			const anime = await this.get<MalAnime>(`/anime/${id}?fields=${DETAIL_FIELDS}`)
			if (!anime) return null
			const fields: Record<string, unknown> = {
				Name: this.title(anime),
				Year: yearOf(anime.start_date),
				Genre: (anime.genres ?? []).map(genre => genre.name),
				Creator: (anime.studios ?? []).map(studio => studio.name),
				Cover: anime.main_picture?.large ?? anime.main_picture?.medium ?? null,
				URL: `https://myanimelist.net/anime/${id}`
			}
			if (typeof anime.mean === 'number') fields['Rating MAL'] = anime.mean
			if (anime.synopsis) fields.Description = anime.synopsis
			// MyAnimeList gives seconds; `Runtime` keeps one episode's minutes.
			const seconds = anime.average_episode_duration ?? 0
			if (seconds > 0) fields.Runtime = Math.round(seconds / 60)
			const episodes = anime.num_episodes && anime.num_episodes > 0 ? anime.num_episodes : null
			return { fields, progressTotal: episodes, imdbId: null }
		} catch (e) {
			console.error('Library: MyAnimeList fetch error', e)
			return null
		}
	}
}

// Read as written: `new Date` would give the previous year west of Greenwich.
export function yearOf(date: string | undefined): number | null {
	const match = date?.match(/^(\d{4})/)
	return match ? Number(match[1]) : null
}
