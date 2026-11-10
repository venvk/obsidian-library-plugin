import { requestUrl } from 'obsidian'
import { MalProvider } from './mal'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import type { ILibrarySettings } from '../constants'
import { pickTitle } from '../util'

interface AniListMedia {
	id: number
	idMal?: number | null
	title: { romaji?: string; english?: string; native?: string }
	startDate?: { year?: number | null }
	episodes?: number | null
	duration?: number | null
	genres?: string[]
	status?: string
	averageScore?: number | null
	coverImage?: { extraLarge?: string; large?: string }
	bannerImage?: string | null
	trailer?: { id?: string; site?: string }
	streamingEpisodes?: { thumbnail?: string | null }[]
	studios?: { nodes?: { name: string }[] }
	siteUrl?: string
	description?: string | null
}

interface AniListSearchResponse {
	data?: { Page?: { media?: AniListMedia[] } }
}

interface AniListMediaResponse {
	data?: { Media?: AniListMedia }
}

const MEDIA_FIELDS =
	'id idMal title { romaji english native } startDate { year } episodes duration genres status averageScore coverImage { extraLarge large } bannerImage trailer { id site } streamingEpisodes { thumbnail } studios(isMain: true) { nodes { name } } siteUrl description(asHtml: false)'

// Anime via AniList GraphQL (no key); a "mal:" note is found here by that id.
// Jikan (the MyAnimeList proxy) answers 504 too often to search through.
export class AnimeProvider implements ContentProvider {
	readonly id = 'anilist'
	readonly contentTypes: ContentType[] = ['anime']

	private static readonly ENDPOINT = 'https://graphql.anilist.co'

	constructor(private prefs: () => Pick<ILibrarySettings, 'titleLanguage' | 'adultTitles'>) {}

	private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
		const resp = await requestUrl({
			url: AnimeProvider.ENDPOINT,
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ query, variables }),
			throw: false
		})
		if (resp.status !== 200) return null
		return resp.json as T
	}

	private title(media: AniListMedia): string {
		return pickTitle(media.title, this.prefs().titleLanguage)
	}

	private cover(media: AniListMedia): string | null {
		return media.coverImage?.extraLarge ?? media.coverImage?.large ?? null
	}

	private trailer(media: AniListMedia): string | null {
		const id = media.trailer?.id
		if (!id) return null
		if (media.trailer?.site === 'youtube') return `https://www.youtube.com/watch?v=${id}`
		if (media.trailer?.site === 'dailymotion') return `https://www.dailymotion.com/video/${id}`
		return null
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			const q = `query ($s: String) { Page(perPage: 20) { media(search: $s, type: ANIME, sort: SEARCH_MATCH${this.prefs().adultTitles ? '' : ', isAdult: false'}) { ${MEDIA_FIELDS} } } }`
			const json = await this.gql<AniListSearchResponse>(q, { s: query })
			const media = json?.data?.Page?.media ?? []
			return media.map((m) => ({
				provider: this.id,
				sourceId: String(m.id),
				title: this.title(m),
				year: m.startDate?.year ?? null,
				cover: this.cover(m),
				subtitle: m.title.native ?? null,
				raw: m
			}))
		} catch (e) {
			console.error('Library: AniList search error', e)
			return []
		}
	}

	async fetch(sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		try {
			let media = raw as AniListMedia | undefined
			if (!media || typeof media !== 'object') {
				const byMal = sourceId.startsWith(MalProvider.PREFIX)
				const id = Number(byMal ? sourceId.slice(MalProvider.PREFIX.length) : sourceId)
				const q = `query ($id: Int) { Media(${byMal ? 'idMal' : 'id'}: $id, type: ANIME) { ${MEDIA_FIELDS} } }`
				const json = await this.gql<AniListMediaResponse>(q, { id })
				media = json?.data?.Media ?? undefined
			}
			if (!media) return null

			const fields: Record<string, unknown> = {
				Name: this.title(media),
				Year: media.startDate?.year ?? null,
				Genre: media.genres ?? [],
				Creator: (media.studios?.nodes ?? []).map((s) => s.name),
				Cover: this.cover(media),
				URL: media.siteUrl ?? `https://anilist.co/anime/${media.id}`
			}
			if (typeof media.averageScore === 'number') fields['Rating AniList'] = media.averageScore / 10
			// AniList's duration is one episode's length.
			if (typeof media.duration === 'number' && media.duration > 0) fields.Runtime = media.duration
			if (media.description) fields.Description = media.description
			const trailer = this.trailer(media)
			if (trailer) fields.Trailer = trailer
			const stills = [
				media.bannerImage,
				media.trailer?.site === 'youtube' && media.trailer.id ? `https://i.ytimg.com/vi/${media.trailer.id}/hqdefault.jpg` : null,
				...(media.streamingEpisodes ?? []).map(e => e.thumbnail)
			].filter((s): s is string => !!s)
			if (stills.length > 0) fields.Gallery = stills.slice(0, 8)

			const episodes = media.episodes && media.episodes > 0 ? media.episodes : null
			return { fields, progressTotal: episodes, imdbId: null }
		} catch (e) {
			console.error('Library: AniList fetch error', e)
			return null
		}
	}
}
