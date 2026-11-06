import { linkLabel, toStr, toStrArray } from './util'

export interface TasteCard {
	fm: Record<string, unknown>
	rating: number
	year: number
}

export interface Taste {
	rated: number
	average: number
	// Own score minus the source's, over titles that have both; null when too few.
	versusOthers: number | null
	// Titles per rounded score, index 0 = 1 … index 9 = 10.
	histogram: number[]
	genres: { name: string; average: number; count: number }[]
	decade: { decade: number; count: number } | null
}

// The audience's score on a 0–10 scale: IMDb, else RAWG (0–5), else Metacritic (0–100).
function othersScore(fm: Record<string, unknown>): number | null {
	const imdb = Number(toStr(fm['Rating IMDB']))
	if (imdb > 0 && imdb <= 10) return imdb
	const rawg = Number(toStr(fm['Rating RAWG']))
	if (rawg > 0 && rawg <= 5) return rawg * 2
	const mc = Number(toStr(fm['Rating MC']))
	if (mc > 0 && mc <= 100) return mc / 10
	return null
}

const round1 = (value: number): number => Math.round(value * 10) / 10

// Five rated titles before there is a taste to speak of; three before a genre or decade counts.
export function tasteOf(cards: TasteCard[]): Taste | null {
	const nonNft = cards.filter(card => {
		const fm = card.fm
		if (!fm) return true
		if (toStr(fm.Source) === 'nft' || toStr(fm.Type) === 'NFT' || fm.Contract !== undefined || fm.Tokens !== undefined) return false
		if (toStr(fm.Source) === 'youtube' || toStr(fm.Type) === 'Video') return false
		return true
	})
	const rated = nonNft.filter(card => card.rating >= 1 && card.rating <= 10)
	if (rated.length < 5) return null
	const histogram = new Array<number>(10).fill(0)
	let sum = 0
	let diff = 0
	let pairs = 0
	const genres = new Map<string, { total: number; count: number }>()
	const decades = new Map<number, number>()
	for (const card of rated) {
		sum += card.rating
		const bucket = Math.min(10, Math.max(1, Math.round(card.rating))) - 1
		histogram[bucket] = (histogram[bucket] ?? 0) + 1
		const others = othersScore(card.fm)
		if (others !== null) { diff += card.rating - others; pairs++ }
		for (const genre of toStrArray(card.fm.Genre).map(linkLabel).filter(Boolean)) {
			const entry = genres.get(genre) ?? { total: 0, count: 0 }
			entry.total += card.rating
			entry.count++
			genres.set(genre, entry)
		}
	}
	for (const card of rated) if (card.year > 1800) decades.set(Math.floor(card.year / 10) * 10, (decades.get(Math.floor(card.year / 10) * 10) ?? 0) + 1)
	const topDecade = [...decades.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
	return {
		rated: rated.length,
		average: round1(sum / rated.length),
		versusOthers: pairs >= 5 ? round1(diff / pairs) : null,
		histogram,
		genres: [...genres.entries()]
			.filter(([, entry]) => entry.count >= 3)
			.map(([name, entry]) => ({ name, average: round1(entry.total / entry.count), count: entry.count }))
			.sort((a, b) => b.average - a.average || b.count - a.count)
			.slice(0, 3),
		decade: topDecade ? { decade: topDecade[0], count: topDecade[1] } : null,
	}
}
