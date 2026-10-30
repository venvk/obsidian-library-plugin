import { MarkdownRenderChild } from 'obsidian'
import type LibraryPlugin from './main'
import { LibraryRenderer, type CardData } from './view'
import { categoryLabel } from './categories'
import { tr } from './i18n'
import { isCollectible, isFinished, linkLabel, notStarted, toStr, toStrArray } from './util'

export interface BlockQuery {
	show: 'cards' | 'now' | 'soon' | 'stats'
	category: string
	genre: string
	year: number
	rating: number
	sort: 'date' | 'rating' | 'year' | 'name'
	limit: number
}

const SHOWS: BlockQuery['show'][] = ['cards', 'now', 'soon', 'stats']
const SORTS: BlockQuery['sort'][] = ['date', 'rating', 'year', 'name']

// "key: value" lines; anything else is ignored.
export function parseBlock(source: string): BlockQuery {
	const query: BlockQuery = { show: 'cards', category: '', genre: '', year: 0, rating: 0, sort: 'date', limit: 24 }
	for (const line of source.split('\n')) {
		const match = /^\s*([a-z]+)\s*:\s*(.*?)\s*$/i.exec(line)
		if (!match) continue
		const key = (match[1] ?? '').toLowerCase()
		const value = match[2] ?? ''
		const number = Number(value)
		if (key === 'show' && SHOWS.indexOf(value.toLowerCase() as BlockQuery['show']) >= 0) query.show = value.toLowerCase() as BlockQuery['show']
		else if (key === 'sort' && SORTS.indexOf(value.toLowerCase() as BlockQuery['sort']) >= 0) query.sort = value.toLowerCase() as BlockQuery['sort']
		else if (key === 'category') query.category = value.toLowerCase()
		else if (key === 'genre') query.genre = value.toLowerCase()
		else if (key === 'year' && Number.isInteger(number)) query.year = number
		else if (key === 'rating' && Number.isFinite(number)) query.rating = number
		else if (key === 'limit' && Number.isInteger(number) && number > 0) query.limit = Math.min(number, 200)
	}
	return query
}

export function pickCards(cards: CardData[], query: BlockQuery): CardData[] {
	const chosen = cards.filter(card => {
		if (query.show === 'now' && (isCollectible(card.fm) || notStarted(card.fm, card.kind) || isFinished(card.fm, card.kind))) return false
		if (query.genre && !toStrArray(card.fm.Genre).some(genre => linkLabel(genre).toLowerCase() === query.genre)) return false
		if (query.year && card.year !== query.year) return false
		return !query.rating || card.rating >= query.rating
	})
	const by: Record<BlockQuery['sort'], (a: CardData, b: CardData) => number> = {
		date: (a, b) => b.date - a.date,
		rating: (a, b) => b.rating - a.rating,
		year: (a, b) => b.year - a.year,
		name: (a, b) => a.name.localeCompare(b.name),
	}
	return chosen.sort((a, b) => by[query.sort](a, b) || a.name.localeCompare(b.name)).slice(0, query.limit)
}

// A ```library block: cards, what is in progress, the Soon list or statistics, redrawn as notes change.
export class LibraryBlock extends MarkdownRenderChild {
	private timer = 0

	constructor(containerEl: HTMLElement, private plugin: LibraryPlugin, private source: string) {
		super(containerEl)
	}

	onload(): void {
		this.draw()
		this.registerEvent(this.plugin.app.metadataCache.on('changed', () => {
			window.clearTimeout(this.timer)
			this.timer = window.setTimeout(() => this.draw(), 500)
		}))
	}

	onunload(): void {
		window.clearTimeout(this.timer)
	}

	private draw(): void {
		const el = this.containerEl
		el.empty()
		// library-view: the tab's own styles apply inside the note too
		const root = el.createDiv({ cls: 'library-view library-block' })
		const query = parseBlock(this.source)
		const renderer = new LibraryRenderer(this.plugin.app, this.plugin)
		const categories = this.plugin.settings.categories.filter(category => !query.category
			|| [category.name, category.typeValue, categoryLabel(category)].some(name => toStr(name).toLowerCase() === query.category))
		let cards: CardData[] = []
		for (const category of categories) cards = cards.concat(renderer.collectCards(category))
		if (query.show === 'stats') {
			if (!renderer.renderStats(root, cards)) root.createDiv({ cls: 'library-block-empty', text: tr('block.empty') })
			return
		}
		if (query.show === 'soon') {
			renderer.renderComingSoon(root, cards)
			if (!root.hasChildNodes()) root.createDiv({ cls: 'library-block-empty', text: tr('block.empty') })
			return
		}
		const shown = pickCards(cards, query)
		if (shown.length === 0) {
			root.createDiv({ cls: 'library-block-empty', text: tr('block.empty') })
			return
		}
		const grid = root.createDiv({ cls: 'library-grid' })
		for (const card of shown) renderer.renderCard(grid, card)
	}
}
