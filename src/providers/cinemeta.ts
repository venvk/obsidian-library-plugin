import { requestUrl } from 'obsidian'
import type { ContentType, MetadataEnricher, SeasonEntry } from './types'
import { runtimeMinutes } from '../util'

interface CinemetaTrailer {
	title?: string
	ytId?: string
}

interface CinemetaVideo {
	season?: number
	number?: number
	name?: string
	thumbnail?: string
}

interface CinemetaMeta {
	poster?: string
	description?: string
	background?: string
	runtime?: string
	trailerStreams?: CinemetaTrailer[]
	videos?: CinemetaVideo[]
}

interface CinemetaResponse {
	meta?: CinemetaMeta
}

// Keyless enricher keyed by IMDb id: trailer, stills, per-season breakdown.
export class CinemetaEnricher implements MetadataEnricher {
	private static readonly BASE = 'https://v3-cinemeta.strem.io/meta'
	private static readonly MAX_STILLS = 8
	private static readonly MAX_TRAILER_STILLS = 3

	async enrich(imdbId: string, type: ContentType): Promise<Record<string, unknown>> {
		const fields: Record<string, unknown> = {}
		try {
			if (!imdbId) return fields
			const kind = type === 'series' ? 'series' : 'movie'
			const url = `${CinemetaEnricher.BASE}/${kind}/${encodeURIComponent(imdbId)}.json`
			const resp = await requestUrl({ url, throw: false })
			if (resp.status !== 200) return fields
			const meta = (resp.json as CinemetaResponse).meta
			if (!meta || typeof meta !== 'object') return fields

			if (meta.poster) fields.Cover = meta.poster.replace('/poster/small/', '/poster/medium/')
			if (meta.description) fields.Description = meta.description
			const trailer = this.trailerOf(meta)
			if (trailer) fields.Trailer = trailer
			const runtime = runtimeMinutes(meta.runtime)
			if (runtime !== null) fields.Runtime = runtime
			const gallery = this.galleryOf(meta, type)
			if (gallery.length > 0) fields.Gallery = gallery
			if (type === 'series') {
				const seasons = this.seasonsOf(meta)
				if (seasons.length > 0) fields.Seasons = seasons
			}
		} catch (e) {
			console.error('Library: Cinemeta enrich error', e)
		}
		return fields
	}

	private trailerOf(meta: CinemetaMeta): string | null {
		const ytId = meta.trailerStreams?.[0]?.ytId
		return ytId ? `https://www.youtube.com/watch?v=${ytId}` : null
	}

	private trailerStills(meta: CinemetaMeta): string[] {
		const stills: string[] = []
		for (const stream of meta.trailerStreams ?? []) {
			if (!stream.ytId) continue
			stills.push(`https://i.ytimg.com/vi/${stream.ytId}/hqdefault.jpg`)
			if (stills.length >= CinemetaEnricher.MAX_TRAILER_STILLS) break
		}
		return stills
	}

	private episodeStills(meta: CinemetaMeta, limit: number): string[] {
		if (limit <= 0) return []
		const groups: CinemetaVideo[][] = []
		const bySeason: Record<number, CinemetaVideo[]> = {}
		const order: number[] = []
		for (const video of meta.videos ?? []) {
			// season 0 is Cinemeta's specials bucket.
			const number = video.season
			if (typeof number !== 'number' || number <= 0 || !video.thumbnail) continue
			if (!bySeason[number]) {
				bySeason[number] = []
				order.push(number)
			}
			bySeason[number].push(video)
		}
		order.sort((a, b) => a - b)
		for (const number of order) {
			const group = bySeason[number]
			if (group) groups.push(group)
		}
		if (groups.length === 0) return []

		// Picks are shared across seasons, not consumed by the first long one.
		const perSeason = Math.max(1, Math.floor(limit / groups.length))
		const stills: string[] = []
		for (const group of groups) {
			if (stills.length >= limit) break
			const take = Math.min(perSeason, limit - stills.length, group.length)
			for (let slot = 0; slot < take; slot++) {
				const index = Math.floor((slot * group.length) / take)
				const video = group[index]
				if (video?.thumbnail) stills.push(video.thumbnail)
			}
		}
		return stills
	}

	private galleryOf(meta: CinemetaMeta, type: ContentType): string[] {
		const gallery: string[] = []
		if (meta.background) gallery.push(meta.background)
		if (type === 'series') {
			for (const still of this.episodeStills(meta, CinemetaEnricher.MAX_STILLS - gallery.length)) {
				gallery.push(still)
			}
		} else {
			for (const still of this.trailerStills(meta)) {
				if (gallery.length >= CinemetaEnricher.MAX_STILLS) break
				gallery.push(still)
			}
		}
		return gallery
	}

	private seasonsOf(meta: CinemetaMeta): SeasonEntry[] {
		const bySeason: Record<number, CinemetaVideo[]> = {}
		const order: number[] = []
		for (const video of meta.videos ?? []) {
			// season 0 is Cinemeta's specials bucket.
			const number = video.season
			if (typeof number !== 'number' || number <= 0) continue
			if (bySeason[number] === undefined) {
				bySeason[number] = []
				order.push(number)
			}
			bySeason[number].push(video)
		}
		order.sort((a, b) => a - b)
		return order.map((number) => {
			const episodes = (bySeason[number] ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
			const titles = episodes.map((video) => ({ title: (video.name ?? '').trim() }))
			return {
				name: `Season ${String(number)}`,
				episodes: episodes.length,
				rating: null,
				trailer: null,
				...(titles.some((t) => t.title) ? { episode_list: titles } : {})
			}
		})
	}
}
