import { requestUrl } from 'obsidian'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import type { ILibrarySettings } from '../constants'
import { pickTitle } from '../util'

interface MangaMedia {
	id: number
	title?: { romaji?: string | null; english?: string | null; native?: string | null }
	startDate?: { year?: number | null }
	format?: string | null
	description?: string | null
	chapters?: number | null
	volumes?: number | null
	genres?: string[]
	coverImage?: { extraLarge?: string; large?: string }
	staff?: { edges?: { role?: string; node?: { name?: { full?: string } } }[] }
	siteUrl?: string
}

const search = (adult: boolean): string => 'query ($s: String) { Page(perPage: 15) { media(search: $s, type: MANGA, sort: SEARCH_MATCH' +
	(adult ? '' : ', isAdult: false') + ') { id title { romaji english native } startDate { year } format coverImage { large } } } }'
const MEDIA = 'query ($id: Int) { Media(id: $id, type: MANGA) { id title { romaji english native } startDate { year }' +
	' chapters volumes genres coverImage { extraLarge large } staff(perPage: 8) { edges { role node { name { full } } } } siteUrl description(asHtml: false) } }'

// Manga/manhwa from AniList (no key); notes carry the `manga:` prefix, so the
// anime sync never touches them.
export class MangaProvider implements ContentProvider {
	readonly id = 'manga'
	readonly contentTypes: ContentType[] = ['comic']

	static readonly PREFIX = 'manga:'

	constructor(private prefs: () => Pick<ILibrarySettings, 'titleLanguage' | 'adultTitles'>) {}

	private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
		try {
			const resp = await requestUrl({
				url: 'https://graphql.anilist.co',
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ query, variables }),
				throw: false
			})
			return resp.status === 200 ? resp.json as T : null
		} catch (e) {
			console.error('Library: AniList manga request error', e)
			return null
		}
	}

	private title(media: MangaMedia): string {
		return (media.title && pickTitle(media.title, this.prefs().titleLanguage)) || String(media.id)
	}

	async search(query: string): Promise<SearchResult[]> {
		const json = await this.gql<{ data?: { Page?: { media?: MangaMedia[] } } }>(search(this.prefs().adultTitles), { s: query })
		return (json?.data?.Page?.media ?? []).map((media): SearchResult => ({
			provider: this.id,
			sourceId: MangaProvider.PREFIX + String(media.id),
			title: this.title(media),
			year: media.startDate?.year ?? null,
			cover: media.coverImage?.large ?? null,
			subtitle: [media.title?.native, media.format?.replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · ') || null,
			raw: null
		}))
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		const id = Number(sourceId.startsWith(MangaProvider.PREFIX) ? sourceId.slice(MangaProvider.PREFIX.length) : NaN)
		if (!Number.isSafeInteger(id)) return null
		const media = (await this.gql<{ data?: { Media?: MangaMedia } }>(MEDIA, { id }))?.data?.Media
		if (!media) return null
		const creators: string[] = []
		for (const edge of media.staff?.edges ?? []) {
			const name = edge.node?.name?.full
			if (name && /story|art/i.test(edge.role ?? '') && creators.indexOf(name) < 0) creators.push(name)
		}
		const fields: Record<string, unknown> = {
			Name: this.title(media),
			Year: media.startDate?.year ?? null,
			Genre: media.genres ?? [],
			Creator: creators,
			Cover: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
			URL: media.siteUrl ?? `https://anilist.co/manga/${String(id)}`
		}
		if (media.description) fields.Description = media.description
		const total = media.chapters ?? media.volumes ?? null
		return { fields, progressTotal: total && total > 0 ? total : null, imdbId: null }
	}
}
