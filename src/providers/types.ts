export const CONTENT_TYPES = ['movie', 'series', 'book', 'googlebook', 'game', 'music', 'anime', 'comic', 'manual'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export function isContentType(value: string): value is ContentType {
	return (CONTENT_TYPES as readonly string[]).includes(value)
}

export interface SearchResult {
	provider: string
	sourceId: string
	title: string
	year: number | null
	cover: string | null
	subtitle: string | null
	raw: unknown
	// what the source says the title is beyond its medium, when it says it
	kind?: TitleKind
}

// A film or series' own kind, from Wikidata classes.
export type TitleKind = 'miniseries' | 'webseries' | 'animatedseries' | 'short' | 'tvfilm' | 'animatedfilm'

export interface NormalizedMetadata {
	fields: Record<string, unknown>
	progressTotal: number | null
	imdbId: string | null
}

export interface ContentProvider {
	readonly id: string
	readonly contentTypes: ContentType[]
	search(query: string, type: ContentType): Promise<SearchResult[]>
	fetch(sourceId: string, type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null>
	// false when `fetch` without the search result has nothing to look up
	// (Open Library).
	refreshable?(sourceId: string): boolean
}

export interface SeasonEntry {
	name: string
	episodes: number
	rating: number | null
	trailer: string | null
	// Episode titles in order, when the source has them (src/episodes.ts).
	episode_list?: Array<{ title: string }>
}

// Fills fields a provider cannot serve itself; keyed by an id another source
// returned, merged into that source's fields. Not a provider.
export interface MetadataEnricher {
	enrich(imdbId: string, type: ContentType): Promise<Record<string, unknown>>
}
