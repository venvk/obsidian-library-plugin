import { entities, languages, searchItems, textIn, type WikidataEntity } from './providers/wikidata'

// A music note's awards, looked up on Wikidata when the note is opened.

// Wikidata "album"; Deezer's album id (P2722) is too rarely set to match on.
const ALBUM = 'Q482994'

export interface Award {
	name: string
	year: number | null
}

// Names compared without case, accents, spaces and punctuation: "folklore" = "Folklore".
export function sameName(a: string, b: string): boolean {
	const key = (value: string): string => value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')
	return key(a) !== '' && key(a) === key(b)
}

// "Abbey Road (Remastered 2009)" is "Abbey Road" on Wikidata.
export function albumTitle(name: string): string {
	return name.replace(/\s*[([][^)\]]*[)\]]\s*$/g, '').trim() || name.trim()
}

function labels(entity: WikidataEntity | undefined): string[] {
	return Object.values(entity?.labels ?? {}).map(label => label.value ?? '').filter(Boolean)
}

// Awards (P166) of the Wikidata album with the note's title by the note's artist.
export async function albumAwards(name: string, artist: string): Promise<Award[]> {
	const title = albumTitle(name)
	if (!title || !artist) return []
	const ids = await searchItems(title, `haswbstatement:P31=${ALBUM}`, 5)
	if (ids.length === 0) return []
	const albums = await entities(ids, 'claims|labels')
	const performers = new Set<string>()
	for (const album of Object.values(albums)) {
		for (const claim of album.claims?.P175 ?? []) {
			const id = (claim.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id
			if (typeof id === 'string') performers.add(id)
		}
	}
	const people = await entities([...performers], 'labels')
	const album = ids.map(id => albums[id]).find(entity =>
		labels(entity).some(label => sameName(label, title)) &&
		(entity?.claims?.P175 ?? []).some(claim => {
			const id = (claim.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id
			return typeof id === 'string' && labels(people[id]).some(label => sameName(label, artist))
		}))
	const won = album?.claims?.P166 ?? []
	if (won.length === 0) return []
	const awardIds: string[] = []
	const years: (number | null)[] = []
	for (const claim of won) {
		const id = (claim.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id
		if (typeof id !== 'string') continue
		const time = (claim.qualifiers?.P585?.[0]?.datavalue?.value as { time?: unknown } | undefined)?.time
		const year = typeof time === 'string' ? /^[+-](\d{4})/.exec(time)?.[1] : undefined
		awardIds.push(id)
		years.push(year ? Number(year) : null)
	}
	const langs = languages()
	const named = await entities(awardIds.filter((id, i) => awardIds.indexOf(id) === i), 'labels', langs)
	const out: Award[] = []
	awardIds.forEach((id, i) => {
		const award = textIn(named[id]?.labels, langs)
		if (award) out.push({ name: award, year: years[i] ?? null })
	})
	return out.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
}
