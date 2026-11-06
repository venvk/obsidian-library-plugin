import { requestUrl } from 'obsidian'
import { tr } from '../i18n'
import { publicHttpsUrl } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

// Audiobooks from three open catalogues, none needs a key: Apple Books through the iTunes search,
// LibriVox and the Internet Archive. A note's Source ID says which one: itunes:, librivox:, archive:.

export function isAudiobookId(sourceId: string): boolean {
	return /^(itunes|librivox|archive):/.test(sourceId)
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

const list = (value: string | string[] | undefined): string[] => Array.isArray(value) ? value : value ? [value] : []
const yearOf = (value: string | undefined): number | null => {
	const year = Number(/\d{4}/.exec(value ?? '')?.[0])
	return year > 0 ? year : null
}
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

export function itunesMeta(book: ItunesBook): NormalizedMetadata {
	const narrator = /narrated by ([^<.;,]+)/i.exec(book.description ?? '')?.[1]?.trim()
	return audiobook({
		Name: book.collectionName,
		Creator: book.artistName ? [book.artistName] : [],
		Year: yearOf(book.releaseDate),
		Genre: book.primaryGenreName ? [book.primaryGenreName] : [],
		Cover: itunesCover(book),
		URL: publicHttpsUrl(book.collectionViewUrl ?? ''),
		...(narrator ? { Narrator: [narrator] } : {}),
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
		// Runtime of a book with chapters is per chapter, as of a series per episode
		...(minutes > 0 ? { Runtime: Math.max(1, Math.round(minutes / Math.max(1, sections.length))) } : {}),
		...(sections.length >= 2 ? { Chapters: sections.map((section, i) => ({ title: section.title || `${String(i + 1)}` })) } : {}),
	}, sections.length)
}

export function archiveMeta(doc: ArchiveDoc): NormalizedMetadata {
	const hours = /^(\d+):(\d{2})(?::\d{2})?$/.exec(doc.runtime ?? '')
	const skip = /^(audio ?book|librivox|podcast)s?$/i
	return audiobook({
		Name: doc.title,
		Creator: list(doc.creator),
		Year: yearOf(doc.date),
		Genre: list(doc.subject).reduce((all, value) => all.concat(value.split(/;\s*/)), [] as string[]).filter(value => value && !skip.test(value)).slice(0, 5),
		Cover: archiveCover(doc.identifier ?? ''),
		URL: doc.identifier ? `https://archive.org/details/${doc.identifier}` : null,
		...(hours ? { Runtime: Number(hours[1]) * 60 + Number(hours[2]) } : {}),
	})
}

const subtitle = (creator: string | undefined): string => [tr('format.audiobook'), creator].filter(Boolean).join(' · ')

export class AudiobookProvider implements ContentProvider {
	readonly id = 'audiobooks'
	readonly contentTypes: ContentType[] = ['book']

	async search(query: string): Promise<SearchResult[]> {
		const found = await Promise.all([this.searchItunes(query), this.searchLibrivox(query), this.searchArchive(query)])
		return found.reduce((all, part) => all.concat(part), [] as SearchResult[])
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		const [source = '', id = ''] = sourceId.split(/:(.*)/)
		try {
			if (source === 'itunes') {
				const book = (await this.json<{ results?: ItunesBook[] }>(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=audiobook`))?.results?.[0]
				return book ? itunesMeta(book) : null
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

	private async searchItunes(query: string): Promise<SearchResult[]> {
		try {
			const data = await this.json<{ results?: ItunesBook[] }>(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=audiobook&entity=audiobook&limit=8`)
			return (data?.results ?? []).filter(book => book.collectionId && book.collectionName).map(book => ({
				provider: this.id,
				sourceId: `itunes:${String(book.collectionId)}`,
				title: book.collectionName ?? '',
				year: yearOf(book.releaseDate),
				cover: itunesCover(book),
				subtitle: subtitle(book.artistName),
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
				subtitle: subtitle(authorsOf(book)[0]),
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
			const fields = ['identifier', 'title', 'creator', 'date'].map(field => `fl[]=${field}`).join('&')
			const data = await this.json<{ response?: { docs?: ArchiveDoc[] } }>(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&${fields}&rows=6&output=json`)
			return (data?.response?.docs ?? []).filter(doc => doc.identifier && doc.title).map(doc => ({
				provider: this.id,
				sourceId: `archive:${doc.identifier ?? ''}`,
				title: doc.title ?? '',
				year: yearOf(doc.date),
				cover: archiveCover(doc.identifier ?? ''),
				subtitle: subtitle(list(doc.creator)[0]),
				raw: doc,
			}))
		} catch {
			return []
		}
	}
}
