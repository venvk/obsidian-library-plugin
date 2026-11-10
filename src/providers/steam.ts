import { requestUrl } from 'obsidian'
import type { GameTrailerFinder } from './gameTrailer'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import { releasedDmy } from '../util'

interface SteamSearchItem {
	id: number
	name: string
	tiny_image?: string
	metascore?: string
}

interface SteamSearchResponse {
	items?: SteamSearchItem[]
}

interface SteamAppDetails {
	type?: string
	name?: string
	header_image?: string
	short_description?: string
	release_date?: { coming_soon?: boolean; date?: string }
	developers?: string[]
	publishers?: string[]
	genres?: { description?: string }[]
	metacritic?: { score?: number }
	movies?: { hls_h264?: string; mp4?: { max?: string } }[]
	screenshots?: { path_full?: string }[]
}

interface SteamAppDetailsResponse {
	[appId: string]: { success?: boolean; data?: SteamAppDetails }
}

const GALLERY_SIZE = 8

function steamMedia(app: SteamAppDetails): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	const movie = (app.movies ?? []).find(m => m.hls_h264 || m.mp4?.max)
	const trailer = movie?.hls_h264 ?? movie?.mp4?.max
	if (trailer) out.Trailer = trailer
	const shots = (app.screenshots ?? []).map(s => s.path_full).filter((s): s is string => !!s).slice(0, GALLERY_SIZE)
	if (shots.length > 0) out.Gallery = shots
	return out
}

export async function steamMediaFor(appId: number): Promise<Record<string, unknown>> {
	try {
		const resp = await requestUrl({ url: `https://store.steampowered.com/api/appdetails?appids=${String(appId)}&l=english`, throw: false })
		if (resp.status !== 200) return {}
		const app = (resp.json as SteamAppDetailsResponse)[String(appId)]?.data
		return app ? steamMedia(app) : {}
	} catch (e) {
		console.error('Library: Steam media error', e)
		return {}
	}
}

export class SteamProvider implements ContentProvider {
	readonly id = 'steam'
	// Registered through GameAggregatorProvider only, never bound to a registry type.
	readonly contentTypes: ContentType[] = ['game']
	private trailers: GameTrailerFinder

	constructor(trailers: GameTrailerFinder) {
		this.trailers = trailers
	}

	private static readonly STORE = 'https://store.steampowered.com'
	static readonly CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
	// RAWG ids are numeric too, so Steam's carry a prefix, to keep a refresh
	// routable without the search result.
	static readonly PREFIX = 'steam:'

	private appId(value: string): number | null {
		const id = Number(value)
		return Number.isSafeInteger(id) && id > 0 ? id : null
	}

	private bareId(sourceId: string): string {
		return sourceId.startsWith(SteamProvider.PREFIX)
			? sourceId.slice(SteamProvider.PREFIX.length)
			: sourceId
	}

	private year(value: string | undefined): number | null {
		if (!value) return null
		const match = value.match(/(\d{4})/)
		return match ? Number(match[1]) : null
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			const term = encodeURIComponent(query)
			const resp = await requestUrl({
				url: `${SteamProvider.STORE}/api/storesearch/?term=${term}&l=english&cc=US`,
				throw: false
			})
			if (resp.status !== 200) return []
			const data = resp.json as SteamSearchResponse
			const items = Array.isArray(data.items) ? data.items : []
			return items.map((item) => ({
				provider: this.id,
				sourceId: SteamProvider.PREFIX + String(item.id),
				title: item.name,
				year: null,
				cover: item.tiny_image ?? null,
				subtitle: item.metascore ? `Metacritic ${item.metascore}` : null,
				raw: item
			}))
		} catch (e) {
			console.error('Library: Steam search error', e)
			return []
		}
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		try {
			const id = this.appId(this.bareId(sourceId))
			if (id === null) return null
			const resp = await requestUrl({
				url: `${SteamProvider.STORE}/api/appdetails?appids=${String(id)}&l=english`,
				throw: false
			})
			if (resp.status !== 200) return null
			const data = resp.json as SteamAppDetailsResponse
			const app = data[String(id)]?.data
			if (!app) return null

			const developers = Array.isArray(app.developers) ? app.developers : []
			const publishers = Array.isArray(app.publishers) ? app.publishers : []
			const genres = Array.isArray(app.genres)
				? app.genres.map((g) => (g.description ?? '').trim()).filter(Boolean)
				: []

			const fields: Record<string, unknown> = {
				Name: app.name,
				Year: this.year(app.release_date?.date),
				Released: releasedDmy(app.release_date?.date) || null,
				Genre: genres,
				Creator: developers.length > 0 ? developers : publishers,
				Cover: await this.cover(id, app.header_image),
				URL: `${SteamProvider.STORE}/app/${String(id)}/`
			}
			// Metacritic 0-100; notes store 0-10.
			const score = app.metacritic?.score
			if (typeof score === 'number' && score > 0) fields['Rating MC'] = Math.round(score) / 10
			if (app.short_description) fields.Description = app.short_description
			Object.assign(fields, steamMedia(app))
			const youtube = await this.trailers.youtube(id, app.name ?? '')
			if (youtube) fields.Trailer = youtube
			return { fields, progressTotal: null, imdbId: null }
		} catch (e) {
			console.error('Library: Steam fetch error', e)
			return null
		}
	}

	// Portrait capsule, matching other posters; the wide header as fallback.
	private async cover(id: number, header?: string): Promise<string | null> {
		const portrait = `${SteamProvider.CDN}/${String(id)}/library_600x900.jpg`
		try {
			const resp = await requestUrl({ url: portrait, method: 'HEAD', throw: false })
			if (resp.status === 200) return portrait
		} catch (e) {
			console.error('Library: Steam cover check error', e)
		}
		return header ?? null
	}
}
