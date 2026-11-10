import { requestUrl } from 'obsidian'
import { isbnOf } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

interface GoogleIdentifier {
	type: string
	identifier: string
}

interface GoogleVolumeInfo {
	title: string
	authors?: string[]
	publishedDate?: string
	categories?: string[]
	pageCount?: number
	description?: string
	imageLinks?: { thumbnail?: string; smallThumbnail?: string }
	industryIdentifiers?: GoogleIdentifier[]
}

interface GoogleItem {
	id: string
	volumeInfo: GoogleVolumeInfo
}

interface GoogleResponse {
	items?: GoogleItem[]
}

// Google finds an edition by ISBN only when asked with the isbn: prefix
function isbnQuery(query: string): string {
	const isbn = isbnOf(query)
	return isbn ? `isbn:${isbn}` : query
}

export class GoogleBooksProvider implements ContentProvider {
	readonly id = 'googlebooks'
	readonly contentTypes: ContentType[] = ['googlebook']

	private static readonly BASE = 'https://www.googleapis.com/books/v1/volumes'

	private getKey: () => string

	constructor(getKey: () => string) {
		this.getKey = getKey
	}

	private withKey(params: URLSearchParams): URLSearchParams {
		const key = this.getKey().trim()
		if (key) params.set('key', key)
		return params
	}

	private year(value: string | undefined): number | null {
		if (!value) return null
		const match = value.match(/^(\d{4})/)
		return match ? Number(match[1]) : null
	}

	private cover(info: GoogleVolumeInfo): string | null {
		const url = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail
		return url ? url.replace('http://', 'https://') : null
	}

	// Google's keyless quota is shared and mostly exhausted: without a key, books
	// come from Open Library.
	refreshable(): boolean {
		return !!this.getKey().trim()
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			if (!this.getKey().trim()) return []
			const params = this.withKey(new URLSearchParams({ q: isbnQuery(query), maxResults: '20' }))
			const resp = await requestUrl({ url: `${GoogleBooksProvider.BASE}?${params.toString()}`, throw: false })
			if (resp.status !== 200) return []
			const data = resp.json as GoogleResponse
			return (data.items ?? []).map((item) => ({
				provider: this.id,
				sourceId: item.id,
				title: item.volumeInfo.title,
				year: this.year(item.volumeInfo.publishedDate),
				cover: this.cover(item.volumeInfo),
				subtitle: (item.volumeInfo.authors ?? []).join(', ') || null,
				raw: item
			}))
		} catch (e) {
			console.error('Library: Google Books search error', e)
			return []
		}
	}

	async fetch(sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		try {
			let info: GoogleVolumeInfo | undefined = (raw as GoogleItem | undefined)?.volumeInfo
			if (!info) {
				const params = this.withKey(new URLSearchParams())
				const query = params.toString()
				const url = `${GoogleBooksProvider.BASE}/${encodeURIComponent(sourceId)}${query ? `?${query}` : ''}`
				const resp = await requestUrl({ url, throw: false })
				if (resp.status !== 200) return null
				info = (resp.json as GoogleItem).volumeInfo
			}
			if (!info) return null

			const fields: Record<string, unknown> = {
				Name: info.title,
				Year: this.year(info.publishedDate),
				Creator: info.authors ?? [],
				Genre: (info.categories ?? []).slice(0, 5),
				Cover: this.cover(info)
			}
			const isbn =
				info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ??
				info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier
			if (isbn) fields['ISBN'] = isbn
			if (info.description) fields.Description = info.description

			return { fields, progressTotal: info.pageCount && info.pageCount > 0 ? info.pageCount : null, imdbId: null }
		} catch (e) {
			console.error('Library: Google Books fetch error', e)
			return null
		}
	}
}
