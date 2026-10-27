import { requestUrl } from 'obsidian'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

interface DeezerArtist {
	name?: string
}

interface DeezerAlbumLite {
	id: number
	title: string
	cover_big?: string
	cover_xl?: string
	artist?: DeezerArtist
	nb_tracks?: number
}

interface DeezerSearchResponse {
	data?: DeezerAlbumLite[]
}

interface DeezerAlbumFull {
	id: number
	title: string
	release_date?: string
	cover_big?: string
	cover_xl?: string
	artist?: DeezerArtist
	nb_tracks?: number
	// The album's length in seconds.
	duration?: number
	genres?: { data?: { name?: string }[] }
	link?: string
	record_type?: string
	tracks?: { data?: { title?: string }[] }
}

export class DeezerProvider implements ContentProvider {
	readonly id = 'deezer'
	readonly contentTypes: ContentType[] = ['music']

	private static readonly SEARCH = 'https://api.deezer.com/search/album'
	private static readonly ALBUM = 'https://api.deezer.com/album/'

	private year(value: string | undefined): number | null {
		if (!value) return null
		const match = value.match(/^(\d{4})/)
		return match ? Number(match[1]) : null
	}

	private cover(album: { cover_big?: string; cover_xl?: string }): string | null {
		return album.cover_xl ?? album.cover_big ?? null
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			const params = new URLSearchParams({ q: query, limit: '20' })
			const resp = await requestUrl({ url: `${DeezerProvider.SEARCH}?${params.toString()}`, throw: false })
			if (resp.status !== 200) return []
			const data = resp.json as DeezerSearchResponse
			return (data.data ?? []).map((a) => ({
				provider: this.id,
				sourceId: String(a.id),
				title: a.title,
				year: null,
				cover: this.cover(a),
				subtitle: a.artist?.name ?? null,
				raw: a
			}))
		} catch (e) {
			console.error('Library: Deezer search error', e)
			return []
		}
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		try {
			const resp = await requestUrl({ url: `${DeezerProvider.ALBUM}${encodeURIComponent(sourceId)}`, throw: false })
			if (resp.status !== 200) return null
			const album = resp.json as DeezerAlbumFull | null
			// A removed album answers 200 with `{ error }`; reading it resets the track count.
			if (!album || typeof album.id !== 'number') return null

			const genres = (album.genres?.data ?? []).map((g) => g.name).filter((n): n is string => Boolean(n))
			const fields: Record<string, unknown> = {
				Name: album.title,
				Year: this.year(album.release_date),
				Creator: album.artist?.name ? [album.artist.name] : [],
				Genre: genres,
				Cover: this.cover(album)
			}
			if (album.link) fields['URL'] = album.link
			// an album's tracks to tick and rate; a single has none
			let listed = album.tracks?.data ?? []
			// the album answer carries 25 tracks at most
			if (album.nb_tracks && album.nb_tracks > listed.length) {
				const all = await requestUrl({ url: `${DeezerProvider.ALBUM}${encodeURIComponent(sourceId)}/tracks?limit=500`, throw: false })
				const more = all.status === 200 ? (all.json as { data?: { title?: string }[] }).data : undefined
				if (more && more.length > listed.length) listed = more
			}
			const tracks = listed.map((track) => track.title).filter((title): title is string => Boolean(title))
			if (album.record_type !== 'single' && tracks.length > 1) fields['Tracks'] = tracks.map((title) => ({ title }))
			// Whole album, minutes.
			if (typeof album.duration === 'number' && album.duration > 0) fields['Runtime'] = Math.max(1, Math.round(album.duration / 60))

			return { fields, progressTotal: album.nb_tracks && album.nb_tracks > 0 ? album.nb_tracks : 1, imdbId: null }
		} catch (e) {
			console.error('Library: Deezer fetch error', e)
			return null
		}
	}
}
