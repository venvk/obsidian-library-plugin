import { SteamProvider } from './steam'
import { SEARCH_BUDGET_MS, within } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import { NON_LATIN } from './wikidata'

// RAWG first when there is a key, then Steam, then Wikidata. Source ID says
// which: `steam:` prefixed, Q-number = Wikidata, bare number = RAWG.
function hasCountryOf(provider: ContentProvider): provider is ContentProvider & { countryOf(name: string, steamAppId: string | null): Promise<string[]> } {
	return typeof (provider as { countryOf?: unknown }).countryOf === 'function'
}

export class GameAggregatorProvider implements ContentProvider {
	readonly id = 'games'
	readonly contentTypes: ContentType[] = ['game']

	private rawg: ContentProvider
	private steam: ContentProvider
	private wikidata: ContentProvider

	constructor(rawg: ContentProvider, steam: ContentProvider, wikidata: ContentProvider) {
		this.rawg = rawg
		this.steam = steam
		this.wikidata = wikidata
	}

	async search(query: string): Promise<SearchResult[]> {
		const [fromRawg, fromSteam, fromWikidata] = await Promise.all([
			within(this.rawg.search(query, 'game'), SEARCH_BUDGET_MS, []),
			within(this.steam.search(query, 'game'), SEARCH_BUDGET_MS, []),
			within(this.wikidata.search(query, 'game'), SEARCH_BUDGET_MS, [])
		])
		// Steam's store search reads Latin names only; another script finds games
		// through Wikidata's labels.
		const open = NON_LATIN.test(query) ? [...fromWikidata, ...fromSteam] : [...fromSteam, ...fromWikidata]
		const seen = new Set<string>()
		return [...fromRawg, ...open].filter(r => !seen.has(r.sourceId) && !!seen.add(r.sourceId))
	}

	refreshable(sourceId: string): boolean {
		// no source has these: the enrich walk would revisit them forever
		if (/^(psn|nintendo|epic|ea):/.test(sourceId)) return false
		if (sourceId.startsWith(SteamProvider.PREFIX) || /^Q\d+$/.test(sourceId)) return true
		return this.rawg.refreshable?.(sourceId) ?? true
	}

	async fetch(sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		// A PS/Nintendo/Epic/EA game no source knew: keep what the platform gave.
		if (/^(psn|nintendo|epic|ea):/.test(sourceId)) return null
		if (/^Q\d+$/.test(sourceId)) return this.wikidata.fetch(sourceId, 'game')
		const steam = sourceId.startsWith(SteamProvider.PREFIX)
		const meta = steam ? await this.steam.fetch(sourceId, 'game') : await this.rawg.fetch(sourceId, 'game', raw)
		// Neither RAWG nor Steam says where a game was made; Wikidata does.
		const name = typeof meta?.fields.Name === 'string' ? meta.fields.Name : ''
		if (meta && name && !(Array.isArray(meta.fields.Country) && meta.fields.Country.length > 0) && hasCountryOf(this.wikidata)) {
			const country = await within(this.wikidata.countryOf(name, steam ? sourceId.slice(SteamProvider.PREFIX.length) : null), SEARCH_BUDGET_MS, [])
			if (country.length > 0) meta.fields.Country = country
		}
		return meta
	}
}
