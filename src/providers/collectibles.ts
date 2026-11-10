import { requestUrl } from 'obsidian'
import { SEARCH_BUDGET_MS, within } from '../util'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './types'

// Trading cards from open catalogues, no key: Pokémon (TCGdex), Magic (Scryfall), Yu-Gi-Oh! (YGOPRODeck).
// A card's Source ID is "pokemon:base1-4", "mtg:<Scryfall id>" or "ygo:46986414";
// its set's `Series ID` is "pokemon:base1" or "mtg:lea", the key a set's completion counts by.

export const COLLECTIBLE_SOURCE = 'collectibles'

const TCGDEX = 'https://api.tcgdex.net/v2/en'
const SCRYFALL = 'https://api.scryfall.com'
const YGO = 'https://db.ygoprodeck.com/api/v7'

async function getJson<T>(url: string): Promise<T | null> {
	try {
		const resp = await requestUrl({ url, throw: false, headers: { Accept: 'application/json' } })
		return resp.status === 200 ? (resp.json as T) : null
	} catch {
		return null
	}
}

interface TcgdexBrief { id: string; localId: string; name: string; image?: string }
interface TcgdexCard extends TcgdexBrief {
	rarity?: string
	illustrator?: string
	set?: { id: string; name: string; cardCount?: { official?: number; total?: number } }
	pricing?: { cardmarket?: { trend?: number | null; avg?: number | null } }
}
interface TcgdexSet { id: string; name: string; releaseDate?: string; cards?: TcgdexBrief[] }

interface ScryfallCard {
	id: string
	name: string
	set: string
	set_name: string
	collector_number: string
	released_at?: string
	rarity?: string
	artist?: string
	scryfall_uri?: string
	image_uris?: { normal?: string; small?: string; large?: string }
	card_faces?: Array<{ image_uris?: { normal?: string; small?: string; large?: string } }>
	prices?: { eur?: string | null; usd?: string | null }
}
interface ScryfallList { data?: ScryfallCard[]; has_more?: boolean; next_page?: string }

interface YgoCard {
	id: number
	name: string
	type?: string
	ygoprodeck_url?: string
	card_images?: Array<{ image_url?: string; image_url_small?: string }>
	card_prices?: Array<{ cardmarket_price?: string }>
	card_sets?: Array<{ set_name?: string; set_rarity?: string }>
}

// A card of a set, for the list of what is still missing
export interface SetCard {
	sourceId: string
	name: string
	number: string
	image: string | null
}

// TCGdex images take a quality and a format after the base path
const tcgImage = (base: string | undefined, size: 'high' | 'low'): string | null => (base ? `${base}/${size}.webp` : null)
const scryImage = (card: ScryfallCard, size: 'large' | 'small'): string | null =>
	card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? null
const price = (value: unknown): number | null => {
	const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
	return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
// "1999–2003", or the one year when both ends agree
const span = (from: number | undefined, to: number | undefined): string => (from && to && to !== from ? `${String(from)}–${String(to)}` : from ? String(from) : '')
const year = (date: string | undefined): number | null => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null)

let setNames: Promise<Record<string, string>> | null = null
// every Pokémon set's name, once a session: the card search answers with ids only
function pokemonSetNames(): Promise<Record<string, string>> {
	setNames ??= getJson<Array<{ id: string; name: string }>>(`${TCGDEX}/sets`).then(sets => {
		const out: Record<string, string> = {}
		for (const set of sets ?? []) out[set.id] = set.name
		return out
	})
	return setNames
}

const NUMISTA = 'https://api.numista.com/v3'

interface NumistaBrief { id: number; title: string; issuer?: { name?: string }; min_year?: number; max_year?: number; obverse_thumbnail?: string }
interface NumistaType extends NumistaBrief {
	url?: string
	value?: { text?: string }
	composition?: { text?: string }
	obverse?: { picture?: string }
	reverse?: { picture?: string }
}

export class CollectibleProvider implements ContentProvider {
	readonly id = COLLECTIBLE_SOURCE
	readonly contentTypes: ContentType[] = ['collectible']

	// coins and banknotes need the reader's own Numista key; cards need none
	constructor(private readonly numistaKey: () => string = () => '') {}

	private async numista<T>(path: string): Promise<T | null> {
		const key = this.numistaKey().trim()
		if (!key) return null
		try {
			const resp = await requestUrl({ url: `${NUMISTA}${path}`, headers: { 'Numista-API-Key': key, Accept: 'application/json' }, throw: false })
			return resp.status === 200 ? (resp.json as T) : null
		} catch {
			return null
		}
	}

	async search(query: string): Promise<SearchResult[]> {
		const q = query.trim()
		if (!q) return []
		const [pokemon, mtg, ygo, coins] = await Promise.all([
			within(this.searchPokemon(q), SEARCH_BUDGET_MS * 2, [] as SearchResult[]),
			within(this.searchMtg(q), SEARCH_BUDGET_MS * 2, [] as SearchResult[]),
			within(this.searchYgo(q), SEARCH_BUDGET_MS * 2, [] as SearchResult[]),
			within(this.searchNumista(q), SEARCH_BUDGET_MS * 2, [] as SearchResult[]),
		])
		return [...pokemon, ...mtg, ...ygo, ...coins]
	}

	private async searchNumista(q: string): Promise<SearchResult[]> {
		const list = await this.numista<{ types?: NumistaBrief[] }>(`/types?count=30&lang=en&q=${encodeURIComponent(q)}`)
		return (list?.types ?? []).map(coin => ({
			provider: this.id,
			sourceId: `numista:${String(coin.id)}`,
			title: coin.title,
			year: coin.min_year ?? null,
			cover: coin.obverse_thumbnail ?? null,
			subtitle: ['Numista', coin.issuer?.name, span(coin.min_year, coin.max_year)].filter(Boolean).join(' · '),
			raw: null,
		}))
	}

	private async fetchNumista(id: string): Promise<NormalizedMetadata | null> {
		if (!/^\d+$/.test(id)) return null
		const coin = await this.numista<NumistaType>(`/types/${id}?lang=en`)
		if (!coin) return null
		// a price is known per issue: the first issue's, at a middle grade when there are several
		const issues = await this.numista<Array<{ id: number }>>(`/types/${id}/issues?lang=en`)
		const issue = issues?.[0]?.id
		const prices = issue ? (await this.numista<{ prices?: Array<{ grade?: string; price?: number }> }>(`/types/${id}/issues/${String(issue)}/prices?currency=EUR`))?.prices ?? [] : []
		const cost = price((prices.find(p => p.grade === 'vf') ?? prices[Math.floor(prices.length / 2)])?.price)
		const pictures = [coin.obverse?.picture, coin.reverse?.picture].filter((url): url is string => !!url)
		return {
			fields: {
				Name: coin.title,
				Cover: pictures[0] ?? null,
				Gallery: pictures,
				Year: coin.min_year ?? null,
				Issuer: coin.issuer?.name ?? null,
				Value: coin.value?.text ?? null,
				Composition: coin.composition?.text ?? null,
				Price: cost,
				Currency: cost ? 'EUR' : null,
				URL: coin.url ?? `https://en.numista.com/${id}`,
			},
			progressTotal: null,
			imdbId: null,
		}
	}

	private async searchPokemon(q: string): Promise<SearchResult[]> {
		const [cards, names] = await Promise.all([
			getJson<TcgdexBrief[]>(`${TCGDEX}/cards?name=${encodeURIComponent(q)}`),
			pokemonSetNames().catch((): Record<string, string> => ({})),
		])
		return (cards ?? []).slice(0, 30).map(card => {
			const set = card.id.slice(0, card.id.length - card.localId.length - 1)
			return {
				provider: this.id,
				sourceId: `pokemon:${card.id}`,
				title: card.name,
				year: null,
				cover: tcgImage(card.image, 'low'),
				subtitle: ['Pokémon', names[set] ?? set, `#${card.localId}`].join(' · '),
				raw: null,
			}
		})
	}

	private async searchMtg(q: string): Promise<SearchResult[]> {
		const list = await getJson<ScryfallList>(`${SCRYFALL}/cards/search?unique=prints&q=${encodeURIComponent(q)}`)
		return (list?.data ?? []).slice(0, 30).map(card => ({
			provider: this.id,
			sourceId: `mtg:${card.id}`,
			title: card.name,
			year: year(card.released_at),
			cover: scryImage(card, 'small'),
			subtitle: ['Magic', card.set_name, `#${card.collector_number}`].join(' · '),
			raw: card,
		}))
	}

	private async searchYgo(q: string): Promise<SearchResult[]> {
		const list = await getJson<{ data?: YgoCard[] }>(`${YGO}/cardinfo.php?num=20&offset=0&fname=${encodeURIComponent(q)}`)
		return (list?.data ?? []).map(card => ({
			provider: this.id,
			sourceId: `ygo:${String(card.id)}`,
			title: card.name,
			year: null,
			cover: card.card_images?.[0]?.image_url_small ?? null,
			subtitle: ['Yu-Gi-Oh!', card.type].filter(Boolean).join(' · '),
			raw: card,
		}))
	}

	async fetch(sourceId: string, _type: ContentType, raw?: unknown): Promise<NormalizedMetadata | null> {
		const [game, id] = [sourceId.slice(0, sourceId.indexOf(':')), sourceId.slice(sourceId.indexOf(':') + 1)]
		if (!id) return null
		if (game === 'pokemon') return this.fetchPokemon(id)
		if (game === 'mtg') return this.fetchMtg(id, raw as ScryfallCard | undefined)
		if (game === 'ygo') return this.fetchYgo(id, raw as YgoCard | undefined)
		if (game === 'numista') return this.fetchNumista(id)
		return null
	}

	private async fetchPokemon(id: string): Promise<NormalizedMetadata | null> {
		const card = await getJson<TcgdexCard>(`${TCGDEX}/cards/${encodeURIComponent(id)}`)
		if (!card) return null
		const set = card.set
		const official = set?.cardCount?.official ?? set?.cardCount?.total
		const setInfo = set ? await getJson<TcgdexSet>(`${TCGDEX}/sets/${encodeURIComponent(set.id)}`) : null
		const cost = price(card.pricing?.cardmarket?.trend ?? card.pricing?.cardmarket?.avg)
		return {
			fields: {
				Name: card.name,
				Cover: tcgImage(card.image, 'high'),
				Year: year(setInfo?.releaseDate),
				Creator: card.illustrator ? [card.illustrator] : [],
				Series: set?.name ?? null,
				'Series ID': set ? `pokemon:${set.id}` : null,
				'Series Total': setInfo?.cards?.length ?? official ?? null,
				Number: official ? `${card.localId}/${String(official)}` : card.localId,
				Rarity: card.rarity ?? null,
				Price: cost,
				Currency: cost ? 'EUR' : null,
			},
			progressTotal: null,
			imdbId: null,
		}
	}

	private async fetchMtg(id: string, raw?: ScryfallCard): Promise<NormalizedMetadata | null> {
		const card = raw?.id === id ? raw : await getJson<ScryfallCard>(`${SCRYFALL}/cards/${encodeURIComponent(id)}`)
		if (!card) return null
		const set = await getJson<{ card_count?: number }>(`${SCRYFALL}/sets/${encodeURIComponent(card.set)}`)
		const eur = price(card.prices?.eur)
		const usd = price(card.prices?.usd)
		return {
			fields: {
				Name: card.name,
				Cover: scryImage(card, 'large'),
				Year: year(card.released_at),
				Creator: card.artist ? [card.artist] : [],
				Series: card.set_name,
				'Series ID': `mtg:${card.set}`,
				'Series Total': set?.card_count ?? null,
				Number: set?.card_count ? `${card.collector_number}/${String(set.card_count)}` : card.collector_number,
				Rarity: card.rarity ?? null,
				Price: eur ?? usd,
				Currency: eur ? 'EUR' : usd ? 'USD' : null,
				URL: card.scryfall_uri ?? null,
			},
			progressTotal: null,
			imdbId: null,
		}
	}

	private async fetchYgo(id: string, raw?: YgoCard): Promise<NormalizedMetadata | null> {
		const card = raw && String(raw.id) === id ? raw : (await getJson<{ data?: YgoCard[] }>(`${YGO}/cardinfo.php?id=${encodeURIComponent(id)}`))?.data?.[0]
		if (!card) return null
		const cost = price(card.card_prices?.[0]?.cardmarket_price)
		return {
			fields: {
				Name: card.name,
				Cover: card.card_images?.[0]?.image_url ?? null,
				Rarity: card.card_sets?.[0]?.set_rarity ?? null,
				Price: cost,
				Currency: cost ? 'EUR' : null,
				URL: card.ygoprodeck_url ?? null,
			},
			progressTotal: null,
			imdbId: null,
		}
	}
}

// Every card of a set, in order, for what is still missing; empty for a set no catalogue lists
export async function setCards(seriesId: string): Promise<SetCard[]> {
	const [game, id] = [seriesId.slice(0, seriesId.indexOf(':')), seriesId.slice(seriesId.indexOf(':') + 1)]
	if (!id) return []
	if (game === 'pokemon') {
		const set = await getJson<TcgdexSet>(`${TCGDEX}/sets/${encodeURIComponent(id)}`)
		return (set?.cards ?? []).map(card => ({ sourceId: `pokemon:${card.id}`, name: card.name, number: card.localId, image: tcgImage(card.image, 'low') }))
	}
	if (game === 'mtg') {
		const out: SetCard[] = []
		let url: string | undefined = `${SCRYFALL}/cards/search?order=set&unique=prints&q=${encodeURIComponent(`e:${id}`)}`
		// a set runs to a few hundred cards, 175 a page
		for (let page = 0; url && page < 6; page++) {
			const list: ScryfallList | null = await getJson<ScryfallList>(url)
			for (const card of list?.data ?? []) out.push({ sourceId: `mtg:${card.id}`, name: card.name, number: card.collector_number, image: scryImage(card, 'small') })
			url = list?.has_more ? list.next_page : undefined
		}
		return out
	}
	return []
}
