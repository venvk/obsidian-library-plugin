import { requestUrl } from 'obsidian'
import type { ContentType, MetadataEnricher, SeasonEntry } from './types'

interface TmdbFindResponse {
	movie_results?: { id?: number }[]
	tv_results?: { id?: number }[]
}

interface TmdbVideo {
	site?: string
	type?: string
	key?: string
}

interface TmdbVideosResponse {
	results?: TmdbVideo[]
}

interface TmdbImagesResponse {
	backdrops?: { file_path?: string }[]
}

interface TmdbMovieDetails {
	runtime?: number
	overview?: string
}

interface TmdbSeasonDetails {
	episodes?: Array<{ name?: string; episode_number?: number }>
	videos?: TmdbVideosResponse
}

interface TmdbSeason {
	name?: string
	season_number?: number
	episode_count?: number
	vote_average?: number
}

interface TmdbTvDetails {
	episode_run_time?: number[]
	overview?: string
	seasons?: TmdbSeason[]
}

// Fills the extras OMDb lacks: trailer, stills, per-season breakdown. Keys by
// IMDb id through TMDB's find endpoint.
export class TmdbEnricher implements MetadataEnricher {
	private static readonly BASE = 'https://api.themoviedb.org/3'
	private static readonly IMAGE = 'https://image.tmdb.org/t/p/w780'
	private static readonly MAX_STILLS = 8
	private static readonly MAX_SEASONS = 15

	private getKey: () => string

	constructor(getKey: () => string) {
		this.getKey = getKey
	}

	async enrich(imdbId: string, type: ContentType): Promise<Record<string, unknown>> {
		const fields: Record<string, unknown> = {}
		try {
			if (!imdbId || !this.getKey().trim()) return fields
			const found = await this.get<TmdbFindResponse>(`/find/${encodeURIComponent(imdbId)}`, {
				external_source: 'imdb_id'
			})
			if (!found) return fields
			if (type === 'series') {
				const id = found.tv_results?.[0]?.id
				if (typeof id === 'number') await this.tvFields(fields, id)
			} else {
				const id = found.movie_results?.[0]?.id
				if (typeof id === 'number') await this.movieFields(fields, id)
			}
		} catch (e) {
			console.error('Library: TMDB enrich error', e)
		}
		return fields
	}

	private async get<T>(path: string, params?: Record<string, string>): Promise<T | null> {
		try {
			const key = this.getKey().trim()
			if (!key) return null
			const query = new URLSearchParams({ api_key: key, ...params })
			const resp = await requestUrl({ url: `${TmdbEnricher.BASE}${path}?${query.toString()}`, throw: false })
			if (resp.status !== 200) return null
			return resp.json as T
		} catch (e) {
			console.error('Library: TMDB request error', e)
			return null
		}
	}

	private trailerOf(videos: TmdbVideosResponse | null): string | null {
		const results = videos?.results ?? []
		const pick =
			results.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.key) ??
			results.find((v) => v.site === 'YouTube' && v.type === 'Teaser' && v.key) ??
			results.find((v) => v.site === 'YouTube' && v.key)
		return pick?.key ? `https://www.youtube.com/watch?v=${pick.key}` : null
	}

	private galleryOf(images: TmdbImagesResponse | null): string[] {
		const stills: string[] = []
		for (const image of images?.backdrops ?? []) {
			if (!image.file_path) continue
			stills.push(TmdbEnricher.IMAGE + image.file_path)
			if (stills.length >= TmdbEnricher.MAX_STILLS) break
		}
		return stills
	}

	private async movieFields(fields: Record<string, unknown>, id: number): Promise<void> {
		const [videos, details, images] = await Promise.all([
			this.get<TmdbVideosResponse>(`/movie/${String(id)}/videos`),
			this.get<TmdbMovieDetails>(`/movie/${String(id)}`),
			this.get<TmdbImagesResponse>(`/movie/${String(id)}/images`, { include_image_language: 'en,null' })
		])
		const trailer = this.trailerOf(videos)
		if (trailer) fields.Trailer = trailer
		const gallery = this.galleryOf(images)
		if (gallery.length > 0) fields.Gallery = gallery
		if (typeof details?.runtime === 'number' && details.runtime > 0) fields.Runtime = details.runtime
		if (details?.overview) fields.Description = details.overview
	}

	private async tvFields(fields: Record<string, unknown>, id: number): Promise<void> {
		const [videos, details] = await Promise.all([
			this.get<TmdbVideosResponse>(`/tv/${String(id)}/videos`),
			this.get<TmdbTvDetails>(`/tv/${String(id)}`)
		])
		const trailer = this.trailerOf(videos)
		if (trailer) fields.Trailer = trailer
		const runtime = details?.episode_run_time?.[0]
		if (typeof runtime === 'number' && runtime > 0) fields.Runtime = runtime
		if (details?.overview) fields.Description = details.overview
		const seasons = await this.seasonFields(id, details?.seasons ?? [])
		if (seasons.length > 0) fields.Seasons = seasons
	}

	private async seasonFields(tvId: number, seasons: TmdbSeason[]): Promise<SeasonEntry[]> {
		const list: SeasonEntry[] = []
		for (const season of seasons) {
			const number = season.season_number
			// season_number 0 is TMDB's bucket for specials.
			if (typeof number !== 'number' || number <= 0) continue
			if (list.length >= TmdbEnricher.MAX_SEASONS) break
			const details = await this.get<TmdbSeasonDetails>(`/tv/${String(tvId)}/season/${String(number)}`, {
				append_to_response: 'videos'
			})
			const videos = details?.videos ?? null
			const episodes = (details?.episodes ?? []).slice().sort((a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0))
			list.push({
				name: season.name?.trim() || `Season ${String(number)}`,
				episodes: typeof season.episode_count === 'number' ? season.episode_count : 0,
				rating:
					typeof season.vote_average === 'number' && season.vote_average > 0
						? Math.round(season.vote_average * 10) / 10
						: null,
				trailer: this.trailerOf(videos),
				...(episodes.length > 0 ? { episode_list: episodes.map((e) => ({ title: (e.name ?? '').trim() })) } : {})
			})
		}
		return list
	}
}
