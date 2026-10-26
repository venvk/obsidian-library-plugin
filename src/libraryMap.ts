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
export function linkCanvas(name: string, sections: { label: string; titles: Omit<MapTitle, 'people'>[] }[]): Canvas {
	// as many columns as keep the whole grid about as wide as a 16:9 screen
	const total = sections.reduce((sum, section) => sum + section.titles.length, 0)
	const cols = Math.max(1, Math.round(Math.sqrt((total * 16 * (POSTER.height + GAP)) / (9 * (POSTER.width + GAP)))))
	const nodes: CanvasNode[] = [{ id: 'lib-h', type: 'text', text: `# ${name}`, x: 0, y: 0, width: 600, height: 80 }]
	let y = 140
	sections.forEach((section, i) => {
		const rows = Math.ceil(section.titles.length / cols)
		const width = Math.min(section.titles.length, cols) * (POSTER.width + GAP) + GAP
		const height = rows * (POSTER.height + GAP) + GAP
		nodes.push({ id: `lib-g${String(i)}`, type: 'group', label: section.label, x: 0, y, width, height })
		section.titles.forEach((title, j) => {
			nodes.push({
				id: `lib-t${String(nodes.length)}`,
				type: 'text',
				text: `${title.cover}${title.cover ? '\n\n' : ''}**${link(title.path, title.name)}**`,
				x: GAP + (j % cols) * (POSTER.width + GAP),
				y: y + GAP + Math.floor(j / cols) * (POSTER.height + GAP),
				...POSTER,
			})
		})
		y += height + 100
	})
	return { nodes, edges: [] }
}
