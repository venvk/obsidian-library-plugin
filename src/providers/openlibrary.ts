import { requestUrl } from 'obsidian'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

interface OpenLibraryDoc {
	key: string
	title: string
	first_publish_year?: number
	author_name?: string[]
	cover_i?: number
	isbn?: string[]
	number_of_pages_median?: number
	subject?: string[]
}

interface OpenLibrarySearchResponse {
	docs?: OpenLibraryDoc[]
}

interface OpenLibraryEdition {
	table_of_contents?: Array<{ title?: string; level?: number }>
	works?: Array<{ key?: string }>
}

export interface BookLookup {
	isbn?: string
	// An Open Library work key, "/works/OL…W".
	work?: string
	title?: string
	author?: string
}

const contentsCache = new Map<string, string[]>()

async function getJson<T>(url: string): Promise<T | null> {
	try {
		const resp = await requestUrl({ url, throw: false })
		return resp.status === 200 ? (resp.json as T) : null
	} catch (e) {
		console.error('Library: Open Library request error', e)
		return null
	}
}

// Top-level entries only: nested ones are sections inside a chapter. Entries with no title still count
// chapters ("Chapter 3" then); a list broken into stray letters is no table of contents at all.
export function chapterTitles(edition: OpenLibraryEdition | null): string[] {
	const titles: string[] = []
	for (const entry of edition?.table_of_contents ?? []) {
		if ((entry.level ?? 0) > 0) continue
		titles.push((entry.title ?? '').trim())
	}
	const named = titles.filter(Boolean)
	// a short title is fine when it is a number, Roman or not: "I", "II", "3"
	const scraps = named.filter(title => title.length < 3 && !/^(?:\d+|[ivxlc]+)\.?$/i.test(title)).length
	if (scraps > named.length / 2) return []
	// blanks among named chapters are gaps in the record; only a list of blanks is a count
	return named.length > 0 ? named : titles
}

// Writing system by first letter; matching the title's script picks the edition.
function scriptOf(text: string): string {
	const letter = text.match(/\p{L}/u)?.[0] ?? ''
	if (/\p{Script=Latin}/u.test(letter)) return 'Latin'
	if (/\p{Script=Cyrillic}/u.test(letter)) return 'Cyrillic'
	if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(letter)) return 'CJK'
	return letter ? 'other' : ''
}

// Named chapters beat a bare count; then the title's own script; then the fullest list.
export function pickContents(lists: string[][], title: string): string[] {
	const script = scriptOf(title)
	const rank = (titles: string[]): number[] => {
		const named = titles.filter(Boolean).join(' ')
		return [named ? 1 : 0, script !== '' && named !== '' && scriptOf(named) === script ? 1 : 0, titles.length]
	}
	let best: string[] = []
	for (const titles of lists) {
		if (titles.length < 2) continue
		const a = rank(titles)
		const b = rank(best)
		if (best.length === 0 || a[0]! > b[0]! || (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! > b[2]!)))) best = titles
	}
	return best
}

// Chapter titles: the ISBNed edition first, else the best table of contents among all editions.
export async function findChapters(book: BookLookup): Promise<string[]> {
	const isbn = (book.isbn ?? '').replace(/[^0-9Xx]/g, '')
	const cacheKey = isbn || book.work || `${book.title ?? ''}|${book.author ?? ''}`
	const cached = contentsCache.get(cacheKey)
	if (cached) return cached
	const done = (titles: string[]): string[] => {
		contentsCache.set(cacheKey, titles)
		return titles
	}

	let work = book.work && /^\/works\/[\w.-]+$/.test(book.work) ? book.work : ''
	if (isbn.length === 10 || isbn.length === 13) {
		const edition = await getJson<OpenLibraryEdition>(`https://openlibrary.org/isbn/${isbn}.json`)
		const own = chapterTitles(edition)
		if (own.length >= 2 && own.some(Boolean)) return done(own)
		work = work || edition?.works?.[0]?.key || ''
	}
	// A title alone matches other books of the same name: the author must agree too.
	if (!work && book.title && book.author) {
		const query = new URLSearchParams({ title: book.title, limit: '1', fields: 'key' })
		if (book.author) query.set('author', book.author)
		const found = await getJson<OpenLibrarySearchResponse>(`${OpenLibraryProvider.SEARCH}?${query.toString()}`)
		work = found?.docs?.[0]?.key ?? ''
	}
	if (!/^\/works\/[\w.-]+$/.test(work)) return done([])
	// every edition: a well-known book has hundreds, and the one with contents is often far down the list
	const entries: OpenLibraryEdition[] = []
	for (let offset = 0; offset < 1000; offset += 100) {
		const page = await getJson<{ entries?: OpenLibraryEdition[] }>(`https://openlibrary.org${work}/editions.json?limit=100&offset=${String(offset)}`)
		entries.push(...(page?.entries ?? []))
		if ((page?.entries ?? []).length < 100) break
	}
	return done(pickContents(entries.map(chapterTitles), book.title ?? ''))
}

export class OpenLibraryProvider implements ContentProvider {
	readonly id = 'openlibrary'
	readonly contentTypes: ContentType[] = ['book']

	static readonly SEARCH = 'https://openlibrary.org/search.json'
	private static readonly COVER = 'https://covers.openlibrary.org/b/id/'
	private static readonly FIELDS =
		'key,title,first_publish_year,author_name,cover_i,isbn,number_of_pages_median,subject'

	private cover(id: number | undefined): string | null {
		return id ? `${OpenLibraryProvider.COVER}${id}-L.jpg` : null
	}

	async search(query: string): Promise<SearchResult[]> {
		try {
			const params = new URLSearchParams({ q: query, fields: OpenLibraryProvider.FIELDS, limit: '20' })
			const resp = await requestUrl({ url: `${OpenLibraryProvider.SEARCH}?${params.toString()}`, throw: false })
			if (resp.status !== 200) return []
			const data = resp.json as OpenLibrarySearchResponse
			const docs = Array.isArray(data?.docs) ? data.docs : []
			return docs.map((doc) => ({
				provider: this.id,
				sourceId: doc.key,
				title: doc.title,
				year: doc.first_publish_year ?? null,
				cover: this.cover(doc.cover_i),
				subtitle: (doc.author_name ?? []).join(', ') || null,
				raw: doc
			}))
		} catch (e) {
			console.error('Library: Open Library search error', e)
			return []
		}
	}

	refreshable(): boolean {
		return false
	}

	// A refresh without raw has nothing to refetch here.
	async fetch(_sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		if (!raw || typeof raw !== 'object') return null
		const doc = raw as OpenLibraryDoc
		if (!doc.title) return null
		const fields: Record<string, unknown> = {
			Name: doc.title,
			Year: doc.first_publish_year ?? null,
			Creator: doc.author_name ?? [],
			Genre: (doc.subject ?? []).slice(0, 5),
			Cover: this.cover(doc.cover_i)
		}
		if (doc.isbn?.[0]) fields['ISBN'] = doc.isbn[0]
		return { fields, progressTotal: doc.number_of_pages_median ?? null, imdbId: null }
	}
}
