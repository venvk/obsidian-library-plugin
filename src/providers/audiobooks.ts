import { requestUrl } from 'obsidian'
import { tr } from '../i18n'
import { formatRuntime, publicHttpsUrl, sameTitle, SEARCH_BUDGET_MS, within } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

// Audiobooks from four open catalogues, none needs a key: Audible, Apple Books through the iTunes
// search, LibriVox and the Internet Archive. A note's Source ID says which one by its prefix.
// An audiobook's Runtime is the whole book, as an album's is.

export function isAudiobookId(sourceId: string): boolean {
	return /^(audible|itunes|librivox|archive):/.test(sourceId)
}

export interface AudibleBook {
	asin?: string
	title?: string
	authors?: { name?: string }[]
	narrators?: { name?: string }[]
	runtime_length_min?: number
	release_date?: string
	product_images?: Record<string, string>
}

export interface ItunesBook {
	collectionId?: number
	collectionName?: string
	artistName?: string
	artworkUrl100?: string
	releaseDate?: string
	primaryGenreName?: string
	collectionViewUrl?: string
	description?: string
}

export interface LibrivoxBook {
	id?: string
	title?: string
	copyright_year?: string
	totaltimesecs?: number
	url_librivox?: string
	url_iarchive?: string
	authors?: { first_name?: string; last_name?: string }[]
	genres?: { name?: string }[]
	sections?: { title?: string; readers?: { display_name?: string }[] }[]
}

interface ArchiveDoc {
	identifier?: string
	title?: string
	creator?: string | string[]
	date?: string
	subject?: string | string[]
	runtime?: string
}

const toText = (value: unknown): string => typeof value === 'string' ? value : ''
const toNames = (value: unknown): string[] => Array.isArray(value) ? value.map(toText).filter(Boolean) : []
const list = (value: string | string[] | undefined): string[] => Array.isArray(value) ? value : value ? [value] : []
const yearOf = (value: string | undefined): number | null => {
	const year = Number(/\d{4}/.exec(value ?? '')?.[0])
	return year > 0 ? year : null
}
const names = (people: { name?: string }[] | undefined): string[] => (people ?? []).map(person => person.name ?? '').filter(Boolean)
const audiobook = (fields: Record<string, unknown>, chapters = 0): NormalizedMetadata => ({
	fields: { ...fields, Format: 'Audiobook' },
	progressTotal: chapters > 0 ? chapters : null,
	imdbId: null,
})
const itunesCover = (book: ItunesBook): string | null => publicHttpsUrl((book.artworkUrl100 ?? '').replace('100x100bb', '600x600bb'))
const authorsOf = (book: LibrivoxBook): string[] =>
	(book.authors ?? []).map(author => `${author.first_name ?? ''} ${author.last_name ?? ''}`.trim()).filter(Boolean)
// a LibriVox book lives on the Internet Archive, which draws its cover
const archiveCover = (identifier: string): string | null => identifier ? `https://archive.org/services/img/${identifier}` : null
const librivoxCover = (book: LibrivoxBook): string | null => archiveCover(/\/details\/([^/?#]+)/.exec(book.url_iarchive ?? '')?.[1] ?? '')

export function audibleMeta(book: AudibleBook): NormalizedMetadata {
	const cover = book.product_images ? Object.keys(book.product_images).map(size => book.product_images?.[size] ?? '').pop() ?? '' : ''
	return audiobook({
		Name: book.title,
		Creator: names(book.authors),
		Year: yearOf(book.release_date),
		Cover: publicHttpsUrl(cover),
		URL: book.asin ? `https://www.audible.com/pd/${book.asin}` : null,
		Narrator: names(book.narrators),
		...(book.runtime_length_min ? { Runtime: book.runtime_length_min } : {}),
	})
}

// "PT21H2M4S" in the page's schema.org data: the iTunes API does not say how long a book is.
export function isoMinutes(value: string): number {
	const parts = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(value)
	return parts ? Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0) : 0
}

export function itunesMeta(book: ItunesBook, minutes = 0): NormalizedMetadata {
	const narrator = /narrated by ([^<.;,]+)/i.exec(book.description ?? '')?.[1]?.trim()
	return audiobook({
		Name: book.collectionName,
		Creator: book.artistName ? [book.artistName] : [],
		Year: yearOf(book.releaseDate),
		Genre: book.primaryGenreName ? [book.primaryGenreName] : [],
		Cover: itunesCover(book),
		URL: publicHttpsUrl(book.collectionViewUrl ?? ''),
		...(narrator ? { Narrator: [narrator] } : {}),
		...(minutes > 0 ? { Runtime: minutes } : {}),
	})
}

export function librivoxMeta(book: LibrivoxBook): NormalizedMetadata {
	const sections = book.sections ?? []
	const readers = new Set<string>()
	for (const section of sections) for (const reader of section.readers ?? []) if (reader.display_name) readers.add(reader.display_name)
	const minutes = Math.round((book.totaltimesecs ?? 0) / 60)
	return audiobook({
		Name: book.title,
		Creator: authorsOf(book),
		Year: yearOf(book.copyright_year),
		Genre: (book.genres ?? []).map(genre => genre.name ?? '').filter(Boolean),
		Cover: librivoxCover(book),
		URL: publicHttpsUrl(book.url_librivox ?? ''),
		// a crowd reads the long ones: the first few are enough
		Narrator: [...readers].slice(0, 5),
		...(minutes > 0 ? { Runtime: minutes } : {}),
		...(sections.length >= 2 ? { Chapters: sections.map((section, i) => ({ title: section.title || `${String(i + 1)}` })) } : {}),
	}, sections.length)
}

export function archiveMeta(doc: ArchiveDoc): NormalizedMetadata {
	const minutes = hoursOf(doc.runtime)
	const skip = /^(audio ?book|librivox|podcast)s?$/i
	return audiobook({
		Name: doc.title,
		Creator: list(doc.creator),
		Year: yearOf(doc.date),
		Genre: list(doc.subject).reduce((all, value) => all.concat(value.split(/;\s*/)), [] as string[]).filter(value => value && !skip.test(value)).slice(0, 5),
		Cover: archiveCover(doc.identifier ?? ''),
		URL: doc.identifier ? `https://archive.org/details/${doc.identifier}` : null,
		...(minutes > 0 ? { Runtime: minutes } : {}),
	})
}

const badge = (minutes: number): string => [tr('format.audiobook'), minutes > 0 ? formatRuntime(minutes) : ''].filter(Boolean).join(' · ')
const hoursOf = (runtime: string | undefined): number => {
	const hours = /^(\d+):(\d{2})(?::\d{2})?$/.exec(runtime ?? '')
	return hours ? Number(hours[1]) * 60 + Number(hours[2]) : 0
}
const AUDIBLE = 'https://api.audible.com/1.0/catalog/products'
const AUDIBLE_GROUPS = 'response_groups=contributors,product_attrs,media'

export class AudiobookProvider implements ContentProvider {
	readonly id = 'audiobooks'
	readonly contentTypes: ContentType[] = ['book']

	async search(query: string): Promise<SearchResult[]> {
		const [audible, apple, librivox, archive] = await Promise.all([this.searchAudible(query), this.searchItunes(query), this.searchLibrivox(query), this.searchArchive(query)])
		// the same book on Audible and Apple Books once: Audible says how long it is without another request
		const unique = apple.filter(book => !audible.some(known => sameTitle(known.title, book.title)))
		return [...audible, ...await this.withItunesTime(unique), ...librivox, ...archive]
	}

	// The book's length in pages, for an estimate when no catalogue has the audiobook.
	async pagesOf(title: string, author: string): Promise<number> {
		try {
			const params = new URLSearchParams({ title, ...(author ? { author } : {}), fields: 'number_of_pages_median', limit: '5' })
			const data = await this.json<{ docs?: { number_of_pages_median?: number }[] }>(`https://openlibrary.org/search.json?${params.toString()}`)
			return (data?.docs ?? []).map(doc => doc.number_of_pages_median ?? 0).find(pages => pages > 0) ?? 0
		} catch {
			return 0
		}
	}

	// How long a book in the library runs and who reads it, found by its title and author.
	async lookUp(title: string, author: string): Promise<{ minutes: number; narrators: string[] } | null> {
		const plain = (value: string): string => value.replace(/\s*[[(].*$/, '')
		try {
			const data = await this.json<{ products?: AudibleBook[] }>(`${AUDIBLE}?keywords=${encodeURIComponent(`${title} ${author}`.trim())}&num_results=25&${AUDIBLE_GROUPS}`)
			const family = author.trim().split(/\s+/).pop()?.toLowerCase() ?? ''
			const book = (data?.products ?? []).find(item => sameTitle(plain(item.title ?? ''), title) && item.runtime_length_min && (!family || names(item.authors).some(name => name.toLowerCase().includes(family))))
			if (book) return { minutes: book.runtime_length_min ?? 0, narrators: names(book.narrators) }
			const free = await this.json<{ books?: LibrivoxBook[] }>(`https://librivox.org/api/feed/audiobooks?title=${encodeURIComponent(title)}&format=json&extended=1&limit=5`)
			const open = (free?.books ?? []).find(item => sameTitle(item.title ?? '', title) && item.totaltimesecs)
			if (!open) return null
			return { minutes: Math.round((open.totaltimesecs ?? 0) / 60), narrators: toNames(librivoxMeta(open).fields.Narrator) }
		} catch {
			return null
		}
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		const [source = '', id = ''] = sourceId.split(/:(.*)/)
		try {
			if (source === 'audible') {
				const book = (await this.json<{ product?: AudibleBook }>(`${AUDIBLE}/${encodeURIComponent(id)}?${AUDIBLE_GROUPS}`))?.product
				return book ? audibleMeta(book) : null
			}
			if (source === 'itunes') {
				const book = (await this.json<{ results?: ItunesBook[] }>(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=audiobook`))?.results?.[0]
				return book ? itunesMeta(book, await this.itunesMinutes(book)) : null
			}
			if (source === 'librivox') {
				const book = (await this.json<{ books?: LibrivoxBook[] }>(`https://librivox.org/api/feed/audiobooks?id=${encodeURIComponent(id)}&format=json&extended=1`))?.books?.[0]
				return book ? librivoxMeta(book) : null
			}
			if (source === 'archive') {
				const doc = (await this.json<{ result?: ArchiveDoc }>(`https://archive.org/metadata/${encodeURIComponent(id)}/metadata`))?.result
				return doc ? archiveMeta({ ...doc, identifier: id }) : null
			}
		} catch (e) {
			console.error('Library: audiobook error', sourceId, e)
		}
		return null
	}

	private async json<T>(url: string): Promise<T | null> {
		const resp = await requestUrl({ url, throw: false })
		return resp.status === 200 ? resp.json as T : null
	}

	private async itunesMinutes(book: ItunesBook): Promise<number> {
		const url = publicHttpsUrl(book.collectionViewUrl ?? '')
		if (!url) return 0
		try {
			const page = await requestUrl({ url, throw: false })
			return page.status === 200 ? isoMinutes(/"duration":"(PT[^"]+)"/.exec(page.text)?.[1] ?? '') : 0
		} catch {
			return 0
		}
	}

	// the first few only: each one costs a page, and a slow page must not hold the search back
	private async withItunesTime(results: SearchResult[]): Promise<SearchResult[]> {
		const shown = results.slice(0, 4)
		const minutes = await Promise.all(shown.map(result => within(this.itunesMinutes(result.raw as ItunesBook), SEARCH_BUDGET_MS, 0)))
		return results.map((result, i) => ({ ...result, badge: badge(minutes[i] ?? 0) }))
	}

	private async searchAudible(query: string): Promise<SearchResult[]> {
		try {
			const data = await this.json<{ products?: AudibleBook[] }>(`${AUDIBLE}?keywords=${encodeURIComponent(query)}&num_results=8&${AUDIBLE_GROUPS}`)
			return (data?.products ?? []).filter(book => book.asin && book.title).map(book => ({
				provider: this.id,
				sourceId: `audible:${book.asin ?? ''}`,
				title: book.title ?? '',
				year: yearOf(book.release_date),
				cover: toText(audibleMeta(book).fields.Cover) || null,
				subtitle: names(book.authors)[0] ?? null,
				badge: badge(book.runtime_length_min ?? 0),
				raw: book,
			}))
		} catch {
			return []
		}
	}

	private async searchItunes(query: string): Promise<SearchResult[]> {
		try {
			const data = await this.json<{ results?: ItunesBook[] }>(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=audiobook&entity=audiobook&limit=8`)
			return (data?.results ?? []).filter(book => book.collectionId && book.collectionName).map(book => ({
				provider: this.id,
				sourceId: `itunes:${String(book.collectionId)}`,
				title: book.collectionName ?? '',
				year: yearOf(book.releaseDate),
				cover: itunesCover(book),
				subtitle: book.artistName ?? null,
				raw: book,
			}))
		} catch {
			return []
		}
	}

	private async searchLibrivox(query: string): Promise<SearchResult[]> {
		try {
			const data = await this.json<{ books?: LibrivoxBook[] }>(`https://librivox.org/api/feed/audiobooks?title=${encodeURIComponent(query)}&format=json&extended=1&limit=8`)
			return (data?.books ?? []).filter(book => book.id && book.title).map(book => ({
				provider: this.id,
				sourceId: `librivox:${book.id ?? ''}`,
				title: book.title ?? '',
				year: yearOf(book.copyright_year),
				cover: librivoxCover(book),
				subtitle: authorsOf(book)[0] ?? null,
				badge: badge(Math.round((book.totaltimesecs ?? 0) / 60)),
				raw: book,
			}))
		} catch {
			return []
		}
	}

	// LibriVox's own books are on the Archive too: they come from LibriVox, with their chapters
	private async searchArchive(query: string): Promise<SearchResult[]> {
		try {
			const words = query.replace(/["()\\:]/g, ' ').trim()
			const q = `title:(${words}) AND mediatype:audio AND subject:audiobook AND NOT collection:librivoxaudio`
			const fields = ['identifier', 'title', 'creator', 'date', 'runtime'].map(field => `fl[]=${field}`).join('&')
			const data = await this.json<{ response?: { docs?: ArchiveDoc[] } }>(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&${fields}&rows=6&output=json`)
			return (data?.response?.docs ?? []).filter(doc => doc.identifier && doc.title).map(doc => ({
				provider: this.id,
				sourceId: `archive:${doc.identifier ?? ''}`,
				title: doc.title ?? '',
				year: yearOf(doc.date),
				cover: archiveCover(doc.identifier ?? ''),
				subtitle: list(doc.creator)[0] ?? null,
				badge: badge(hoursOf(doc.runtime)),
				raw: doc,
			}))
		} catch {
			return []
		}
	}
}
