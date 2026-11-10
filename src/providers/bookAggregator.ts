import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import { AudiobookProvider, isAudiobookId } from './audiobooks'
import { findChapters, workDescription } from './openlibrary'
import { tr } from '../i18n'
import { SEARCH_BUDGET_MS, within } from '../util'

interface WrappedRaw {
	__pid: string
	__raw: unknown
}

export class BookAggregatorProvider implements ContentProvider {
	readonly id = 'books'
	readonly contentTypes: ContentType[] = ['book']

	private google: ContentProvider
	private openlib: ContentProvider
	private audio: ContentProvider

	constructor(google: ContentProvider, openlib: ContentProvider, audio: ContentProvider = new AudiobookProvider()) {
		this.google = google
		this.openlib = openlib
		this.audio = audio
	}

	async search(query: string): Promise<SearchResult[]> {
		const [fromGoogle, fromOpenlib, fromAudio] = await Promise.all([
			within(this.google.search(query, 'googlebook'), SEARCH_BUDGET_MS, [] as SearchResult[]),
			// Open Library is slow and keyless: a longer wait than the others.
			within(this.openlib.search(query, 'book'), SEARCH_BUDGET_MS * 4, [] as SearchResult[]),
			within(this.audio.search(query, 'book'), SEARCH_BUDGET_MS * 2, [] as SearchResult[])
		])
		const wrap = (results: SearchResult[], pid: string): SearchResult[] =>
			results.map((r) => ({ ...r, badge: tr('format.book'), raw: { __pid: pid, __raw: r.raw } }))
		return [...wrap(fromGoogle, 'googlebooks'), ...wrap(fromOpenlib, 'openlibrary'), ...fromAudio]
	}

	// Open Library keys start with '/' and have nothing to refetch by id
	// (see openlibrary.ts); a Google id refetches only with a key.
	refreshable(sourceId: string): boolean {
		if (isAudiobookId(sourceId)) return true
		return !sourceId.startsWith('/') && (this.google.refreshable?.(sourceId) ?? true)
	}

	async fetch(sourceId: string, type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		// an audiobook brings its own chapters, or has none to look up by ISBN
		if (isAudiobookId(sourceId)) return this.audio.fetch(sourceId, type)
		const meta = await this.fetchBook(sourceId, type, raw)
		if (meta) {
			const text = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
			const creator = meta.fields.Creator
			const titles = await findChapters({
				isbn: text(meta.fields.ISBN),
				work: /^\/works\/[\w.-]+$/.test(sourceId) ? sourceId : '',
				title: text(meta.fields.Name),
				author: text(Array.isArray(creator) ? creator[0] : creator)
			})
			if (titles.length >= 2) meta.fields.Chapters = titles.map((title) => ({ title }))
			if (!meta.fields.Description) meta.fields.Description = await within(workDescription(sourceId), SEARCH_BUDGET_MS, '')
		}
		return meta
	}

	private async fetchBook(sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		const wrapped = raw as WrappedRaw | undefined
		if (wrapped && typeof wrapped === 'object') {
			if (wrapped.__pid === 'googlebooks') return this.google.fetch(sourceId, 'googlebook', wrapped.__raw)
			if (wrapped.__pid === 'openlibrary') return this.openlib.fetch(sourceId, 'book', wrapped.__raw)
			return null
		}
		return sourceId.startsWith('/')
			? this.openlib.fetch(sourceId, 'book')
			: this.google.fetch(sourceId, 'googlebook')
	}
}
