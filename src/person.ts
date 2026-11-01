import { awardsOf, sameName, type Award } from './music'
import { entities, searchItems, type WikidataEntity } from './providers/wikidata'
import { publicHttpsUrl } from './util'

// A person's card on their canvas, from Wikidata: found through the titles that credit them,
// so a common name does not pick a namesake.

export interface Person {
	imdb: string
	image: string
	born: number | null
	died: number | null
	awards: Award[]
}

// director, screenwriter, cast member, producer, composer, director of photography, creator
const CREDITS = ['P57', 'P58', 'P161', 'P162', 'P86', 'P344', 'P170']

function itemIds(entity: WikidataEntity | undefined, props: string[]): string[] {
	const ids: string[] = []
	for (const prop of props) {
		for (const claim of entity?.claims?.[prop] ?? []) {
			const id = (claim.mainsnak?.datavalue?.value as { id?: unknown } | undefined)?.id
			if (typeof id === 'string' && ids.indexOf(id) < 0) ids.push(id)
		}
	}
	return ids
}

function value(entity: WikidataEntity | undefined, prop: string): unknown {
	return entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value
}

function year(entity: WikidataEntity | undefined, prop: string): number | null {
	const time = (value(entity, prop) as { time?: unknown } | undefined)?.time
	const found = typeof time === 'string' ? /^[+-](\d{4})/.exec(time)?.[1] : undefined
	return found ? Number(found) : null
}

export async function personInfo(name: string, imdbIds: string[]): Promise<Person | null> {
	for (const imdbId of imdbIds.slice(0, 3)) {
		const [title] = await searchItems('', `haswbstatement:P345=${imdbId}`, 1)
		if (!title) continue
		const credited = itemIds((await entities([title], 'claims'))[title], CREDITS)
		// names first, a few hundred bytes each; the claims only of the one who matches
		const names = await entities(credited.slice(0, 50), 'labels')
		const id = credited.find(id => Object.values(names[id]?.labels ?? {}).some(label => sameName(label.value ?? '', name)))
		if (!id) continue
		const person = (await entities([id], 'claims'))[id]
		if (!person) continue
		const file = value(person, 'P18')
		const imdb = value(person, 'P345')
		return {
			imdb: typeof imdb === 'string' && /^nm\d+$/.test(imdb) ? `https://www.imdb.com/name/${imdb}/` : '',
			image: typeof file === 'string' ? publicHttpsUrl(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400`) ?? '' : '',
			born: year(person, 'P569'),
			died: year(person, 'P570'),
			awards: await awardsOf(person),
		}
	}
	return null
}

// Wikidata labels are text, not markdown: brackets, stars and the like are escaped.
function plain(text: string): string {
	return text.replace(/[\\`*_[\]()<>#|!~]/g, char => `\\${char}`)
}

// The card's markdown: the name (a link to IMDb), the photo, the years and the awards.
export function personCard(name: string, person: Person, awardsLabel: string): string {
	const lines = [person.imdb ? `# [${plain(name)}](${person.imdb})` : `# ${plain(name)}`]
	if (person.image) lines.push(`![|300](${person.image})`)
	if (person.born) lines.push(person.died ? `${String(person.born)}–${String(person.died)}` : `${String(person.born)}–`)
	if (person.awards.length > 0) {
		const all = person.awards.map(award => award.year ? `${plain(award.name)} (${String(award.year)})` : plain(award.name))
		lines.push(`**${awardsLabel}:** ${all.slice(0, 8).join(', ')}${all.length > 8 ? ` +${String(all.length - 8)}` : ''}`)
	}
	return lines.join('\n\n')
}
