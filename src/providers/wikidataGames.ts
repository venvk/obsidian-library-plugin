import { SteamProvider } from './steam'
import { releasedDmy } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'
import {
	claim, claimValues, entities, firstDate, firstYear, itemIds, labelsOf, languages, pageUrl, searchItems, textIn,
	wikipediaImages, yearIn
} from './wikidata'

const VIDEO_GAME = 'haswbstatement:P31=Q7889'

// Games by any-language title; one with a Steam app id becomes a Steam result.
export class WikidataGameProvider implements ContentProvider {
	readonly id = 'wikidata'
	readonly contentTypes: ContentType[] = ['game']

	async search(query: string): Promise<SearchResult[]> {
		try {
			const ids = await searchItems(query, VIDEO_GAME, 8)
			const langs = languages()
			const [found, steamIds] = await Promise.all([
				entities(ids, 'labels|descriptions|sitelinks', langs),
				Promise.all(ids.map(id => claim(id, 'P1733')))
			])
			const appIds = steamIds.map(steam => (typeof steam === 'string' && /^\d+$/.test(steam) ? steam : null))
			const articles = ids.map((id, i) => (appIds[i] ? null : found[id]?.sitelinks?.enwiki?.title ?? null))
			const covers = await wikipediaImages(articles.filter((title): title is string => !!title))
			return ids.map((id, i): SearchResult => {
				const entity = found[id]
				const english = textIn(entity?.labels, ['en', 'mul'])
				const local = textIn(entity?.labels, langs)
				const description = textIn(entity?.descriptions, langs)
				const appId = appIds[i]
				const article = articles[i]
				return {
					provider: this.id,
					sourceId: appId ? SteamProvider.PREFIX + appId : id,
					title: english ?? local ?? id,
					year: yearIn(description),
					cover: appId ? `${SteamProvider.CDN}/${appId}/capsule_sm_120.jpg` : article ? covers[article] ?? null : null,
					subtitle: [local !== english ? local : null, description].filter(Boolean).join(' · ') || null,
					raw: null
				}
			// an item with no name in the reader's languages or English has nothing to show
			}).filter(result => !/^Q\d+$/.test(result.title))
		} catch (e) {
			console.error('Library: Wikidata game search error', e)
			return []
		}
	}

	async fetch(sourceId: string): Promise<NormalizedMetadata | null> {
		try {
			if (!/^Q\d+$/.test(sourceId)) return null
			const langs = ['en', 'mul']
			const item = (await entities([sourceId], 'labels|claims|sitelinks', langs))[sourceId]
			const name = textIn(item?.labels, langs)
			if (!item || !name) return null
			const genres = itemIds(item, 'P136')
			const developers = itemIds(item, 'P178')
			const publishers = itemIds(item, 'P123')
			const countries = itemIds(item, 'P495')
			const article = item.sitelinks?.enwiki?.title ?? null
			const [labels, covers] = await Promise.all([
				labelsOf([...genres, ...developers, ...publishers, ...countries], langs),
				wikipediaImages(article ? [article] : [])
			])
			const fields: Record<string, unknown> = {
				Name: name,
				Year: firstYear(item, ['P577']),
				Released: releasedDmy(firstDate(item, ['P577'])) || null,
				Genre: labels(genres),
				Country: labels(countries),
				Creator: developers.length > 0 ? labels(developers) : labels(publishers),
				Cover: article ? covers[article] ?? null : null,
				URL: pageUrl(sourceId, article)
			}
			const youtube = claimValues(item, 'P1651')[0]
			if (typeof youtube === 'string' && /^[\w-]{11}$/.test(youtube)) fields.Trailer = `https://www.youtube.com/watch?v=${youtube}`
			return { fields, progressTotal: null, imdbId: null }
		} catch (e) {
			console.error('Library: Wikidata game fetch error', e)
			return null
		}
	}

	// Where a RAWG or Steam game was made: Wikidata's country of origin, by
	// Steam app id when there is one, else by a matching title.
	async countryOf(name: string, steamAppId: string | null): Promise<string[]> {
		// Source ID is user-editable: only digits go into the search, else the title.
		if (steamAppId !== null && !/^\d+$/.test(steamAppId)) steamAppId = null
		try {
			const ids = steamAppId
				? await searchItems('', `haswbstatement:P1733=${steamAppId}`, 1)
				: await searchItems(name, VIDEO_GAME, 3)
			if (ids.length === 0) return []
			const langs = ['en', 'mul']
			const found = await entities(ids, 'labels|claims', langs)
			const wanted = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
			const id = steamAppId ? ids[0] : ids.find(id => {
				const label = textIn(found[id]?.labels, langs) ?? ''
				return label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === wanted
			})
			const countries = id ? itemIds(found[id], 'P495') : []
			if (countries.length === 0) return []
			return (await labelsOf(countries, langs))(countries)
		} catch (e) {
			console.error('Library: Wikidata game country error', e)
			return []
		}
	}
}
