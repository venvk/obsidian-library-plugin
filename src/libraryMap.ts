import { tr } from './i18n'
import { linkLabel, toStrArray } from './util'

// The library as an Obsidian canvas. Each busy person is a star with the
// titles that best belong to them in a ring around it, and the stars are
// packed in rows, so the map reads like a set of constellations. A title also
// hangs from every other busy person it credits, which ties the constellations
// together through the people they share.
export interface MapTitle {
	// note path, opened from the poster's link
	path: string
	name: string
	// markdown image of the cover, or ''
	cover: string
	people: string[]
}

interface CanvasNode {
	id: string
	type: 'text' | 'group'
	text?: string
	label?: string
	x: number
	y: number
	width: number
	height: number
	color?: string
}

interface CanvasEdge {
	id: string
	fromNode: string
	toNode: string
	fromEnd?: 'none' | 'arrow'
	toEnd?: 'none' | 'arrow'
}

export interface Canvas {
	nodes: CanvasNode[]
	edges: CanvasEdge[]
}

const POSTER = { width: 180, height: 330 }
const STAR = { width: 280, height: 64 }
const GAP = 40
const MARGIN = 220

function link(path: string, name: string): string {
	const target = path.replace(/\.md$/, '')
	return `[[${target}|${name.replace(/[[\]|]/g, '')}]]`
}

export function libraryMap(titles: MapTitle[], maxPeople = 40): Canvas {
	const count = new Map<string, number>()
	for (const title of titles) for (const person of new Set(title.people)) count.set(person, (count.get(person) ?? 0) + 1)
	const people = [...count.entries()]
		.filter(([, n]) => n >= 2)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxPeople)
		.map(([name]) => name)
	const rank = new Map(people.map((name, i) => [name, i]))

	// Each title sits with its busiest person; the credits are kept, so the
	// title can hang from the other people it shares too.
	const groups = new Map<string, MapTitle[]>(people.map(name => [name, []]))
	const credits = new Map<string, string[]>()
	for (const title of titles) {
		const own = [...new Set(title.people)].filter(person => rank.has(person)).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
		const home = own[0]
		if (home) {
			groups.get(home)?.push(title)
			credits.set(title.path, own)
		}
	}

	const nodes: CanvasNode[] = []
	const edges: CanvasEdge[] = []
	const titleId = new Map<string, string>()

	// Ring radius grows with the group so posters never overlap.
	// a poster's height spaces the ring: across the top and bottom posters stand on end
	const radius = (n: number): number => Math.max(360, ((POSTER.height + GAP) * Math.max(n, 1)) / (2 * Math.PI))
	const extent = (n: number): number => 2 * radius(n) + POSTER.height
	// a person whose titles all sit with busier people has no constellation
	const stars = people.filter(name => (groups.get(name)?.length ?? 0) > 0)
	// node ids are fixed before the rings are drawn, so a title in one ring can
	// point at a star drawn later
	const starId = new Map(stars.map((name, i) => [name, `p${String(i)}`]))
	const total = stars.reduce((sum, name) => sum + extent(groups.get(name)?.length ?? 0) ** 2, 0)
	const rowWidth = Math.max(extent(8), Math.sqrt(total) * 1.6)

	let x = 0
	let y = 0
	let rowHeight = 0
	stars.forEach((name, i) => {
		const group = groups.get(name) ?? []
		const size = extent(group.length)
		if (x > 0 && x + size > rowWidth) {
			x = 0
			y += rowHeight + MARGIN
			rowHeight = 0
		}
		const cx = x + size / 2
		const cy = y + size / 2
		const id = `p${String(i)}`
		nodes.push({ id, type: 'text', text: `### ${name} · ${String(count.get(name) ?? 0)}`, x: Math.round(cx - STAR.width / 2), y: Math.round(cy - STAR.height / 2), ...STAR, color: '6' })
		const r = radius(group.length)
		group.forEach((title, j) => {
			const angle = (2 * Math.PI * j) / group.length - Math.PI / 2
			const tid = `t${String(titleId.size)}`
			titleId.set(title.path, tid)
			nodes.push({
				id: tid,
				type: 'text',
				text: `${title.cover}${title.cover ? '\n\n' : ''}**${link(title.path, title.name)}**`,
				x: Math.round(cx + Math.cos(angle) * r - POSTER.width / 2),
				y: Math.round(cy + Math.sin(angle) * r - POSTER.height / 2),
				...POSTER,
			})
			// every person of the title that has a constellation draws a line
			for (const person of credits.get(title.path) ?? []) {
				const star = starId.get(person)
				if (star) edges.push({ id: `e${String(edges.length)}`, fromNode: star, toNode: tid, toEnd: 'none' })
			}
		})
		x += size + MARGIN
		rowHeight = Math.max(rowHeight, size)
	})

	return { nodes, edges }
}

// A genre's or a person's canvas: a heading, then the titles that credit them
// in a grid per category. Every node id starts with lib-, so a canvas holding
// nothing else is still Library's to redraw.
// A text node's height for its markdown at a width: lines wrapped at about 7.5 px a character,
// a heading line taller, the node's padding around; a little more than needed, so nothing scrolls.
export function textHeight(text: string, width: number): number {
	const perLine = Math.max(10, Math.floor((width - 48) / 7.5))
	let height = 40
	for (const para of text.split('\n\n')) {
		const heading = para.startsWith('# ')
		const visible = para.replace(/\]\([^)]*\)/g, ']').replace(/[#*\\]/g, '')
		const lines = Math.max(1, Math.ceil(visible.length / (heading ? perLine / 2 : perLine)))
		height += lines * (heading ? 44 : 26) + 16
	}
	return height
}

// the person card's width and its photo's, the photo sized to the thumbnail Commons sends
export const PERSON_CARD_WIDTH = 560
const CARD = PERSON_CARD_WIDTH
const PHOTO = 260

export interface PersonCard {
	text: string
	photo: string
	photoHeight: number
	// the card's height as rendered, when it could be measured
	height?: number
}

// The card's markdown: the photo at its exact size, so the layout is known before it loads, then the text.
export function personCardText(card: PersonCard): string {
	return card.photo ? `![|${String(PHOTO)}x${String(card.photoHeight)}](${card.photo})\n\n${card.text}` : card.text
}


export function linkCanvas(name: string, sections: { label: string; titles: Omit<MapTitle, 'people'>[] }[], card?: PersonCard): Canvas {
	const nodes: CanvasNode[] = []
	let head = 80
	if (card) {
		head = card.height ?? textHeight(card.text, CARD) + (card.photo ? card.photoHeight + 32 : 0)
		nodes.push({ id: 'lib-h', type: 'text', text: personCardText(card), x: 0, y: 0, width: CARD, height: head })
	} else {
		nodes.push({ id: 'lib-h', type: 'text', text: `# ${name}`, x: 0, y: 0, width: 600, height: head })
	}

	// laid out for a desktop screen: as wide as a 16:9 picture of all the posters, sections side by side
	const cellWidth = POSTER.width + GAP
	const cellHeight = POSTER.height + GAP
	const total = sections.reduce((sum, section) => sum + section.titles.length, 0)
	const targetWidth = Math.max(cellWidth * 6, Math.sqrt((total * cellWidth * cellHeight * 16) / 9) * 1.4)
	const maxCols = Math.max(1, Math.floor(targetWidth / cellWidth))
	let curX = 0
	let curY = head + 60
	let rowMaxHeight = 0

	sections.forEach((section, i) => {
		const n = section.titles.length
		const sectionCols = Math.max(1, Math.min(n, maxCols))
		const rows = Math.ceil(n / sectionCols)
		const secWidth = sectionCols * cellWidth + GAP
		const secHeight = rows * cellHeight + GAP

		if (curX > 0 && curX + secWidth > targetWidth) {
			curX = 0
			curY += rowMaxHeight + 80
			rowMaxHeight = 0
		}

		const cleanLabel = section.label.replace(/\.canvas$/i, '').trim()
		nodes.push({ id: `lib-g${String(i)}`, type: 'group', label: cleanLabel, x: curX, y: curY, width: secWidth, height: secHeight })
		section.titles.forEach((title, j) => {
			nodes.push({
				id: `lib-t${String(nodes.length)}`,
				type: 'text',
				text: `${title.cover}${title.cover ? '\n\n' : ''}**${link(title.path, title.name)}**`,
				x: curX + GAP + (j % sectionCols) * (POSTER.width + GAP),
				y: curY + GAP + Math.floor(j / sectionCols) * (POSTER.height + GAP),
				...POSTER,
			})
		})

		curX += secWidth + 60
		rowMaxHeight = Math.max(rowMaxHeight, secHeight)
	})

	return { nodes, edges: [] }
}

export function categoryCanvas(
	categoryName: string,
	titles: MapTitle[],
	getFileFm?: (path: string) => Record<string, unknown> | undefined
): Canvas {
	const groups = new Map<string, Omit<MapTitle, 'people'>[]>()
	// every group says what kind it is: creator, actor, genre
	const typed = (key: string, name: string): string => `${tr(key)}: ${name}`
	const rank = (label: string): number => {
		const at = ['header.creator', 'header.cast', 'header.genre'].findIndex(key => label.startsWith(`${tr(key)}: `))
		return at < 0 ? 3 : at
	}
	const isNft = categoryName.toLowerCase().includes('nft') || titles.some(t => getFileFm?.(t.path)?.Source === 'nft')
	const isVideo = categoryName.toLowerCase().includes('video') || titles.some(t => getFileFm?.(t.path)?.Source === 'youtube')

	if (isNft) {
		for (const title of titles) {
			const fm = getFileFm?.(title.path)
			const chain = fm ? toStrArray(fm.Platforms)[0] : ''
			const groupKey = chain ? typed('header.chain', chain) : 'NFT'
			if (!groups.has(groupKey)) groups.set(groupKey, [])
			groups.get(groupKey)?.push(title)
		}
	} else if (isVideo) {
		for (const title of titles) {
			const fm = getFileFm?.(title.path)
			const creators = fm ? toStrArray(fm.Creator).map(linkLabel).filter(Boolean) : []
			const groupKey = creators[0] ? typed('header.creator', creators[0]) : 'YouTube'
			if (!groups.has(groupKey)) groups.set(groupKey, [])
			groups.get(groupKey)?.push(title)
		}
	} else {
		const directorCounts = new Map<string, number>()
		const actorCounts = new Map<string, number>()
		const metaMap = new Map<string, { directors: string[]; actors: string[]; genres: string[] }>()

		for (const title of titles) {
			const fm = getFileFm?.(title.path)
			const directors = fm
				? [...toStrArray(fm.Director), ...toStrArray(fm.Creator), ...toStrArray(fm.Author), ...toStrArray(fm.Artist)]
					.map(linkLabel)
					.filter(Boolean)
				: []
			const actors = fm ? toStrArray(fm.Cast).map(linkLabel).filter(Boolean) : []
			const genres = fm ? toStrArray(fm.Genre).map(linkLabel).filter(Boolean) : []

			for (const d of new Set(directors)) directorCounts.set(d, (directorCounts.get(d) ?? 0) + 1)
			for (const a of new Set(actors)) actorCounts.set(a, (actorCounts.get(a) ?? 0) + 1)
			metaMap.set(title.path, { directors, actors, genres })
		}

		const topDirectors = new Set(
			[...directorCounts.entries()]
				.filter(([, count]) => count >= 2)
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.map(([name]) => name)
		)

		const topActors = new Set(
			[...actorCounts.entries()]
				.filter(([, count]) => count >= 2)
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.map(([name]) => name)
		)

		for (const title of titles) {
			const meta = metaMap.get(title.path)
			let groupKey = ''

			if (meta) {
				const matchDirector = meta.directors.find(d => topDirectors.has(d))
				if (matchDirector) {
					groupKey = typed('header.creator', matchDirector)
				} else {
					const matchActor = meta.actors.find(a => topActors.has(a))
					if (matchActor) {
						groupKey = typed('header.cast', matchActor)
					} else if (meta.genres[0]) {
						groupKey = typed('header.genre', meta.genres[0])
					}
				}
			}

			if (!groupKey) {
				groupKey = title.people[0] ? typed('header.creator', linkLabel(title.people[0])) : tr('filter.other')
			}

			if (!groups.has(groupKey)) groups.set(groupKey, [])
			groups.get(groupKey)?.push(title)
		}
	}

	const sortedSections = [...groups.entries()]
		.sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length || a[0].localeCompare(b[0]))
		.map(([label, groupTitles]) => {
			const clean = label.replace(/\.canvas$/i, '').replace(/^[|·\s-]+|[|·\s-]+$/g, '').trim()
			return {
				label: `${clean} (${String(groupTitles.length)})`,
				titles: groupTitles
			}
		})

	const canvas = linkCanvas(categoryName, sortedSections)

	const titleNodeMap = new Map<string, string>()
	for (const node of canvas.nodes) {
		if (node.id.startsWith('lib-t')) {
			for (const title of titles) {
				const base = title.path.replace(/\.md$/, '')
				if (node.text && (node.text.includes(`[[${base}|`) || node.text.includes(`[[${title.path}|`))) {
					titleNodeMap.set(title.path, node.id)
					break
				}
			}
		}
	}

	const edges: CanvasEdge[] = []
	for (let i = 0; i < titles.length; i++) {
		const t1 = titles[i]
		if (!t1) continue
		for (let j = i + 1; j < titles.length; j++) {
			const t2 = titles[j]
			if (!t2) continue
			const common = t1.people.filter(p => t2.people.includes(p))
			if (common.length > 0) {
				const n1 = titleNodeMap.get(t1.path)
				const n2 = titleNodeMap.get(t2.path)
				if (n1 && n2 && n1 !== n2) {
					edges.push({ id: `e${String(edges.length)}`, fromNode: n1, toNode: n2, toEnd: 'none' })
				}
			}
		}
	}
	canvas.edges = edges.slice(0, 150)
	return canvas
}
