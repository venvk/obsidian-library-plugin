import { sameTitle } from './util'
import { articleIntro, entities, languages, searchItems, textIn, type WikidataEntity } from './providers/wikidata'

// A note's awards, looked up on Wikidata when the note is opened.

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
	return awardsOf(album)
}

// The Wikidata item of a title, found by the id the note keeps: IMDb, Wikidata or Steam.
export async function titleAwards(sourceId: string): Promise<Award[]> {
	const item = await itemOf(sourceId)
	if (!item) return []
	return awardsOf((await entities([item], 'claims'))[item])
}

// The Wikidata item of a note made from IMDb, Steam, Open Library, MyAnimeList, AniList or Wikidata itself.
// A bare number is an AniList anime only in an anime note: RAWG and Comic Vine ids are bare numbers too.
async function itemOf(sourceId: string, kind?: string): Promise<string | undefined> {
	const id = sourceId.trim()
	if (/^Q\d+$/.test(id)) return id
	const work = /^\/works\/(OL\d+W)$/.exec(id)?.[1]
	const filter = /^tt\d+$/.test(id) ? `haswbstatement:P345=${id}`
		: /^steam:\d+$/.test(id) ? `haswbstatement:P1733=${id.slice(6)}`
		: /^mal:\d+$/.test(id) ? `haswbstatement:P4086=${id.slice(4)}`
		: /^manga:\d+$/.test(id) ? `haswbstatement:P8731=${id.slice(6)}`
		: kind === 'anime' && /^\d+$/.test(id) ? `haswbstatement:P8729=${id}`
		: work ? `haswbstatement:P648=${work}` : ''
	return filter ? (await searchItems('', filter, 1))[0] : undefined
}

// The title in the reader's own language, when it is not English; null without one
export async function localTitle(sourceId: string): Promise<string | null> {
	const lang = languages()[0] ?? 'en'
	if (lang === 'en' || lang.startsWith('en-')) return null
	const item = await itemOf(sourceId)
	if (!item) return null
	const langs = languages().filter(l => l !== 'en' && l !== 'mul')
	return textIn((await entities([item], 'labels', langs))[item]?.labels, langs)
}

// What a title is about, from Wikipedia in the reader's language; in English too when asked,
// for a title whose source says nothing. '' for an English reader otherwise, with no request made.
// A game whose id leads nowhere (a console's own, RAWG's) is looked up by its name.
export async function aboutTitle(sourceId: string, kind: string, english: boolean, name = ''): Promise<string> {
	const langs = languages().filter(lang => lang !== 'mul' && (english || lang !== 'en'))
	if (langs.length === 0) return ''
	const item = await itemOf(sourceId, kind) ?? (kind === 'game' && name ? await gameNamed(name) : undefined)
	return item ? articleIntro(item, langs) : ''
}

// The Wikidata video game of this name: an edition's words and a year in brackets aside, under any
// label or alias it has ("Ведьмак 3: Дикая Охота" is an alias of The Witcher 3: Wild Hunt).
async function gameNamed(name: string): Promise<string | undefined> {
	const plain = name.replace(/\([^)]*\)/g, ' ').replace(/\s*[-–—:]?\s*(?:\S+\s+)?(?:edition|version|издание|версия)\b.*$/i, '').trim() || name
	const ids = await searchItems(plain, 'haswbstatement:P31=Q7889', 5)
	if (ids.length === 0) return undefined
	const found = await entities(ids, 'labels|aliases', [...languages(), 'en'])
	const names = (entity: WikidataEntity | undefined): string[] => {
		const all = labels(entity)
		for (const list of Object.values(entity?.aliases ?? {})) for (const alias of list) if (alias.value) all.push(alias.value)
		return all
	}
	return ids.find(id => names(found[id]).some(known => sameTitle(known, plain)))
}

// "Award received" (P166) with its year (P585), named in the note's language.
export async function awardsOf(entity: WikidataEntity | undefined): Promise<Award[]> {
	const won = entity?.claims?.P166 ?? []
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
