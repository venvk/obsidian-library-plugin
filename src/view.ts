import { App, ItemView, WorkspaceLeaf, TFile, setIcon, setTooltip } from 'obsidian'
import { airingLabel, type Airing } from './airing'
import type LibraryPlugin from './main'
import { categoryLabel } from './categories'
import { RATING_RT_ICON, type ICategory, type IStatsTop } from './constants'
import type { ContentType } from './providers/types'
import { formatNumber, relativeDay, tr, trCount } from './i18n'
import { comparisonOfTheDay, comparisonText } from './facts'
import { renderTrophies } from './ui/trophyIcons'
import { tasteOf } from './taste'
import { logOf, todayIso } from './diary'
import { renderPlatforms } from './ui/platformIcons'
import {
	toStr,
	toStrArray,
	parseDate,
	isTemplateFile,
	linkLabel,
	NAME_FIELDS,
	notStarted,
	shownProgress,
	isFinished,
	parseProgress,
	coverSrc,
	coverValue,
	runtimeMinutes,
	formatRuntime,
	spentTime,
	spentMinutes,
	exactHours,
	runtimeParts,
	propertyValues,
	topLabel
} from './util'

export const LIBRARY_VIEW_TYPE = 'library-view'

export interface CardData {
	file: TFile
	fm: Record<string, unknown>
	kind: ContentType
	name: string
	year: number
	rating: number
	date: number
}

type StatsColumn =
	| { top: IStatsTop; kind: 'platform'; items: true[] }
	| { top: IStatsTop; kind: 'property'; items: [string, number][] }
	| { top: IStatsTop; kind: 'category'; items: CardData[] }

interface TimeSlice {
	name: string
	minutes: number
	color: string
}

// Present = counted in the watch-time donut; value = that medium's shade of the accent.
const TIME_COLORS: Record<string, string> = {
	movie: 'var(--interactive-accent)',
	series: 'color-mix(in srgb, var(--interactive-accent) 60%, var(--background-primary))',
	anime: 'color-mix(in srgb, var(--interactive-accent) 30%, var(--background-primary))',
	game: 'color-mix(in srgb, var(--interactive-accent) 80%, var(--text-normal))'
}

type SortKey = 'name' | 'year' | 'rating' | 'date' | 'modified' | 'played' | 'unstarted' | 'progress'

const SORT_KEYS: SortKey[] = ['name', 'year', 'rating', 'date', 'modified', 'played', 'unstarted', 'progress']

interface SortChoice {
	key: SortKey
	asc: boolean
}

type Facet = 'year' | 'genre' | 'artist' | 'country' | 'platform'

const FACETS: { facet: Facet, label: string }[] = [
	{ facet: 'year', label: 'sort.year' },
	{ facet: 'genre', label: 'header.genre' },
	{ facet: 'artist', label: 'header.creator' },
	{ facet: 'country', label: 'filter.country' },
	{ facet: 'platform', label: 'settings.stats.groupPlatforms' },
]

function facetValues(card: CardData, facet: Facet): string[] {
	switch (facet) {
		case 'year': return card.year > 0 ? [String(card.year)] : []
		case 'genre': return toStrArray(card.fm.Genre).map(linkLabel).filter(Boolean)
		// an album's artist; other media have too many creators to pick from
		case 'artist': return card.kind === 'music' ? toStrArray(card.fm.Creator).map(linkLabel).filter(Boolean) : []
		case 'country': return toStrArray(card.fm.Country)
		case 'platform': return toStrArray(card.fm.Platforms)
	}
}

function filterCards(cards: CardData[], chosen: Record<string, string>): CardData[] {
	const active = FACETS.filter(f => chosen[f.facet])
	if (active.length === 0) return cards
	return cards.filter(card => active.every(f => facetValues(card, f.facet).indexOf(chosen[f.facet] as string) >= 0))
}

interface SectionSpec {
	title: string
	sortId: string
	defaultSort: SortChoice
	collapsed: boolean
	setCollapsed(collapsed: boolean): void
	kind?: ContentType
	filters?: { all: CardData[], chosen: Record<string, string>, choose(facet: Facet, value: string): void }
}

// A key no category name takes.
const UP_NEXT_SORT = '@upNext'

// Cards, statistics and the Soon list, shared by the library tab and the note blocks.
export class LibraryRenderer {
	constructor(private app: App, private plugin: LibraryPlugin) {}

	collectCards(category: ICategory): CardData[] {
		const cards: CardData[] = []
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || fm.Type !== category.typeValue) continue
			cards.push({
				file,
				fm,
				kind: category.contentType,
				name: toStr(fm.Name) || file.basename,
				year: Number(fm.Year) || 0,
				rating: Number(fm['My Rating'] ?? fm.Rating) || 0,
				date: parseDate(fm.Date)
			})
		}
		return cards
	}

	collectStats(): { columns: StatsColumn[]; time: TimeSlice[]; undated: number } {
		const tops = this.plugin.settings.stats.tops
		const properties = tops.filter(top => top.kind === 'property').map(top => top.key)
		const counts = properties.map(() => new Map<string, { label: string; count: number }>())
		const rated = new Map<ICategory, CardData[]>()
		const timeMinutes = new Map<string, number>()
		let undated = 0

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm) continue
			// Library notes only: an unrelated note's genre must not become a top one.
			const cat = this.plugin.settings.categories.find(c => c.typeValue === fm.Type)
			if (!cat) continue

			properties.forEach((property, i) => {
				const tally = counts[i]
				if (!tally) return
				const seen = new Set<string>()
				for (const value of propertyValues(fm, property)) {
					const key = value.toLowerCase()
					if (!key || seen.has(key)) continue
					seen.add(key)
					const entry = tally.get(key)
					if (entry) entry.count++
					else tally.set(key, { label: value, count: 1 })
				}
			})

			const list = rated.get(cat) || []
			list.push({
				file,
				fm,
				kind: cat.contentType,
				name: toStr(fm.Name) || file.basename,
				year: Number(fm.Year) || 0,
				rating: Number(fm['My Rating'] ?? fm['Rating IMDB'] ?? fm.Rating) || 0,
				date: parseDate(fm.Date)
			})
			rated.set(cat, list)

			if (TIME_COLORS[cat.contentType]) {
				const minutes = spentMinutes(fm, cat.contentType)
				if (minutes > 0) {
					timeMinutes.set(cat.name, (timeMinutes.get(cat.name) || 0) + minutes)
				} else if (cat.contentType !== 'game' && runtimeMinutes(fm.Runtime) === null) {
					// Counted out loud: silently dropping unknown lengths would understate the library.
					undated++
				}
			}
		}

		const columns: StatsColumn[] = []
		for (const top of tops) {
			if (top.kind === 'platform') {
				columns.push({ top, kind: 'platform', items: top.key === 'playstation' && this.plugin.settings.psnStats ? [true] : top.key === 'myanimelist' && this.plugin.settings.malStats ? [true] : top.key === 'nintendo' && this.plugin.settings.nintendoStats ? [true] : [] })
				continue
			}
			if (top.kind === 'property') {
				const tally = counts[properties.indexOf(top.key)]
				columns.push({
					top,
					kind: 'property',
					items: [...(tally?.values() ?? [])]
						.sort((a, b) => b.count - a.count)
						.slice(0, 3)
						.map((entry): [string, number] => [entry.label, entry.count])
				})
				continue
			}
			const cat = this.plugin.settings.categories.find(c => c.typeValue === top.key)
			if (!cat) continue
			columns.push({
				top,
				kind: 'category',
				items: (rated.get(cat) || []).sort((a, b) => b.rating - a.rating).slice(0, 3)
			})
		}

		const time: TimeSlice[] = []
		for (const cat of this.plugin.settings.categories) {
			const color = TIME_COLORS[cat.contentType]
			if (!color) continue
			const minutes = timeMinutes.get(cat.name) || 0
			if (minutes > 0) time.push({ name: categoryLabel(cat), minutes, color })
		}

		return { columns, time, undated }
	}

	renderTimeChart(body: HTMLElement, slices: TimeSlice[], undated: number): void {
		const col = body.createDiv({ cls: 'library-stats-col library-time-col' })
		col.createEl('h3', { text: tr('stats.watchTime') })

		const total = slices.reduce((sum, slice) => sum + slice.minutes, 0)
		if (total <= 0) {
			col.createEl('p', { cls: 'library-stats-empty', text: tr('stats.noData') })
			return
		}

		const chart = col.createDiv({ cls: 'library-time-chart' })
		let consumed = 0
		const stops: string[] = []
		for (const slice of slices) {
			const from = (consumed / total) * 100
			consumed += slice.minutes
			stops.push(`${slice.color} ${from}% ${(consumed / total) * 100}%`)
		}
		chart.setCssStyles({ background: `conic-gradient(${stops.join(', ')})` })
		// Split: a long total breaks only between hours and minutes.
		const totalEl = chart.createDiv({ cls: 'library-time-hole' }).createDiv({ cls: 'library-time-total' })
		runtimeParts(total).forEach((part, i) => {
			if (i > 0) totalEl.appendText(' ')
			totalEl.createSpan({ text: part })
		})

		const legend = col.createDiv({ cls: 'library-time-legend' })
		for (const slice of slices) {
			const row = legend.createDiv({ cls: 'library-time-item' })
			row.createSpan({ cls: 'library-time-dot' }).setCssStyles({ backgroundColor: slice.color })
			row.createSpan({ cls: 'library-time-name', text: slice.name })
			const share = Math.round((slice.minutes / total) * 100)
			row.createSpan({
				cls: 'library-time-value',
				text: formatRuntime(slice.minutes) + ' · ' + String(share) + '%'
			})
		}

		if (undated > 0) {
			col.createEl('p', {
				cls: 'library-stats-empty',
				text: tr('stats.noDuration', { count: String(undated) })
			})
		}

		const comparison = comparisonOfTheDay(total)
		if (!comparison) return
		const facts = col.createDiv({ cls: 'library-time-facts' })
		facts.createDiv({ cls: 'library-time-facts-title', text: tr('fact.title') })
		const row = facts.createDiv({ cls: 'library-time-item' })
		setIcon(row.createSpan({ cls: 'library-time-icon' }), comparison.icon)
		row.createSpan({ cls: 'library-time-name', text: comparisonText(comparison) })
	}

	renderStats(root: HTMLElement, cards?: CardData[]): HTMLElement | null {
		const stats = this.collectStats()
		const columns = stats.columns.filter(column => column.items.length > 0)
		const showTime = this.plugin.settings.stats.watchTime
			&& this.plugin.settings.categories.some(c => TIME_COLORS[c.contentType])
		const psn = this.plugin.settings.psnStats
		const mal = this.plugin.settings.malStats
		const nintendo = this.plugin.settings.nintendoStats
		const taste = cards && this.plugin.settings.showProfile ? tasteOf(cards) : null
		const today = todayIso()
		const diaryRows: Array<{ card: CardData; label: string; date: string }> = []
		if (cards && this.plugin.settings.showDiary) {
			const entries: Array<{ card: CardData; label: string; date: string; at: number }> = []
			for (const card of cards) {
				logOf(card.fm).forEach((entry, at) => {
					if (entry.date <= today) entries.push({ card, label: entry.label, date: entry.date, at })
				})
			}
			// One row per diary line, newest first; a fourth line pushes the oldest row out.
			entries.sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1))
			diaryRows.push(...entries.slice(0, 3))
		}
		// Only a diary with entries earns the column: an empty one adds no information.
		const showDiary = diaryRows.length > 0
		if (!showTime && columns.length === 0 && !taste && !showDiary) return null

		const section = root.createDiv({ cls: 'library-stats' })
		const header = section.createDiv({ cls: 'library-stats-header' })
		setIcon(header.createSpan({ cls: 'library-stats-icon' }), 'bar-chart-2')
		header.createSpan({ text: tr('stats.title') })

		const collapsed = this.plugin.settings.statsCollapsed
		const collapseBtn = header.createEl('button', {
			cls: 'library-collapse-btn',
			text: collapsed ? '▶' : '▼',
			attr: { 'aria-label': tr('stats.title'), 'aria-expanded': collapsed ? 'false' : 'true' }
		})
		// tops above taste on the left, the time column down the right
		const body = section.createDiv({ cls: `library-stats-body${showTime ? ' has-time' : ''}` })
		if (collapsed) body.classList.add('collapsed')
		// No columns: the chart gets the body bare, not an empty box pushing it aside.
		const box = columns.length > 0 || showDiary ? body.createDiv({ cls: 'library-stats-tops' }) : createDiv()

		if (showTime) this.renderTimeChart(body, stats.time, stats.undated)

		const medals = ['🥇', '🥈', '🥉']

		const renderPsn = (): void => {
			if (!psn) return
			const col = box.createDiv({ cls: 'library-stats-col library-stats-psn' })
			col.createEl('h3', { text: tr('stats.psn') })
			const line = (label: string, value: string, title = ''): void => {
				const row = col.createDiv({ cls: 'library-stats-psn-row' })
				if (title) setTooltip(row, title, { placement: 'top' })
				row.createSpan({ cls: 'library-stats-psn-label', text: label })
				row.createSpan({ cls: 'library-stats-psn-value', text: value })
			}
			line(tr('stats.psn.games'), formatNumber(psn.games))
			if (psn.minutes > 0) line(tr('stats.psn.time'), spentTime(psn.minutes), exactHours(psn.minutes))
			if (psn.level > 0) line(tr('stats.psn.level'), formatNumber(psn.level))
			renderTrophies(col, { Platinum: psn.earned.platinum, Gold: psn.earned.gold, Silver: psn.earned.silver, Bronze: psn.earned.bronze }, 'library-stats-trophies')
		}

		const renderMal = (): void => {
			if (!mal) return
			const col = box.createDiv({ cls: 'library-stats-col library-stats-psn' })
			col.createEl('h3', { text: tr('stats.mal') })
			const line = (label: string, value: string): void => {
				const row = col.createDiv({ cls: 'library-stats-psn-row' })
				row.createSpan({ cls: 'library-stats-psn-label', text: label })
				row.createSpan({ cls: 'library-stats-psn-value', text: value })
			}
			line(tr('stats.mal.anime'), formatNumber(mal.anime))
			line(tr('stats.mal.manga'), formatNumber(mal.manga))
		}

		const renderNintendo = (): void => {
			if (!nintendo) return
			const col = box.createDiv({ cls: 'library-stats-col library-stats-psn' })
			col.createEl('h3', { text: tr('stats.nintendo') })
			const line = (label: string, value: string, title = ''): void => {
				const row = col.createDiv({ cls: 'library-stats-psn-row' })
				if (title) setTooltip(row, title, { placement: 'top' })
				row.createSpan({ cls: 'library-stats-psn-label', text: label })
				row.createSpan({ cls: 'library-stats-psn-value', text: value })
			}
			line(tr('stats.nintendo.games'), formatNumber(nintendo.games))
			if (nintendo.minutes > 0) line(tr('stats.nintendo.time'), spentTime(nintendo.minutes), exactHours(nintendo.minutes))
		}

		for (const column of columns) {
			if (column.kind === 'platform') {
				if (column.top.key === 'myanimelist') renderMal(); else if (column.top.key === 'nintendo') renderNintendo(); else renderPsn()
				continue
			}
			const col = box.createDiv({ cls: 'library-stats-col' })
			col.createEl('h3', { text: topLabel(column.top, this.plugin.settings.categories) })
			if (column.kind === 'property') {
				column.items.forEach(([name, count], i) => {
					const row = col.createDiv({ cls: 'library-stats-medal' })
					row.createSpan({ cls: 'library-stats-medal-icon', text: medals[i] || '' })
					const label = row.createDiv({ cls: 'library-stats-medal-label' })
					const nameEl = label.createSpan({ cls: 'library-stats-medal-name', text: name })
					if (NAME_FIELDS.some(key => key.toLowerCase() === column.top.key.toLowerCase())) this.plugin.linkName(nameEl, name)
					label.createSpan({ cls: 'library-stats-medal-count', text: `${count} ${trCount('stats.works', count)}` })
				})
				continue
			}
			column.items.forEach((item, i) => {
				const fm = item.fm
				const row = col.createDiv({ cls: 'library-stats-medal' })
				row.createSpan({ cls: 'library-stats-medal-icon', text: medals[i] || '' })
				const src = coverSrc(this.app, coverValue(fm, this.plugin.settings.coverProperty))
				if (src) row.createEl('img', { cls: 'library-stats-medal-cover', attr: { src } })
				const info = row.createDiv({ cls: 'library-stats-medal-label' })
				const nameEl = info.createDiv({
					cls: 'library-stats-medal-name',
					text: item.name,
					attr: { 'role': 'button', 'tabindex': '0', 'aria-label': item.name },
				})
				const openItem = (): void => { void this.app.workspace.getLeaf(false).openFile(item.file) }
				nameEl.addEventListener('click', openItem)
				nameEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault()
						openItem()
					}
				})
				const meta: string[] = []
				if (fm.Year) meta.push(toStr(fm.Year))
				if (item.rating) meta.push('★ ' + toStr(item.rating))
				if (meta.length) info.createDiv({ cls: 'library-stats-medal-count', text: meta.join(' · ') })
			})
		}

		// Diary: the three latest watched titles, one more column beside the tops.
		if (showDiary) {
			const col = box.createDiv({ cls: 'library-stats-col library-diary-col' })
			col.createEl('h3', { text: tr('diary.title') })
			for (const { card, label, date } of diaryRows) {
				const row = col.createDiv({
					cls: 'library-soon-row',
					attr: { 'role': 'button', 'tabindex': '0', 'aria-label': card.name },
				})
				const src = coverSrc(this.app, coverValue(card.fm, this.plugin.settings.coverProperty))
				if (src) row.createEl('img', { cls: 'library-soon-cover', attr: { src } })
				const text = row.createDiv({ cls: 'library-soon-text' })
				text.createDiv({ cls: 'library-soon-name', text: card.name })
				text.createDiv({ cls: 'library-soon-when', text: [label || tr('diary.finished'), relativeDay(date, today)].join(' · ') })
				const openCard = (): void => { void this.app.workspace.getLeaf(false).openFile(card.file) }
				row.addEventListener('click', openCard)
				row.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault()
						openCard()
					}
				})
			}
		}

		// Your taste: the horizontal panel, placed as it was, on its own row of the statistics.
		if (taste) {
			// one more block among the tops, three cells wide, so the grid packs it with them
			const inTops = columns.length > 0 || showDiary
			body.toggleClass('has-taste', !inTops)
			const row = (inTops ? box : body).createDiv({ cls: 'library-stats-taste' })
			const panel = row.createDiv({ cls: 'library-profile-body' }).createDiv({ cls: 'library-profile-panel library-taste' })
			const side = panel.createDiv({ cls: 'library-taste-side' })
			const lead = side.createDiv({ cls: 'library-taste-lead' })
			lead.createDiv({ cls: 'library-taste-average', text: formatNumber(taste.average) })
			const caption = lead.createDiv({ cls: 'library-taste-caption' })
			caption.createDiv({ cls: 'library-taste-label', text: tr('stats.taste.averageLabel') })
			caption.createDiv({ cls: 'library-taste-count', text: trCount('stats.taste.rated', taste.rated) })
			if (taste.versusOthers !== null) {
				const gap = Math.abs(taste.versusOthers)
				side.createDiv({
					cls: 'library-taste-verdict',
					text: gap < 0.15 ? tr('stats.taste.same') : tr(taste.versusOthers < 0 ? 'stats.taste.harsher' : 'stats.taste.kinder', { diff: formatNumber(gap) }),
				})
			}
			const peak = Math.max(...taste.histogram, 1)
			const bars = panel.createDiv({ cls: 'library-taste-bars', attr: { role: 'img', 'aria-label': taste.histogram.map((count, i) => `${String(i + 1)}: ${String(count)}`).join(', ') } })
			taste.histogram.forEach((count, i) => {
				const bar = bars.createDiv({ cls: `library-taste-bar${count === peak ? ' is-peak' : ''}` })
				setTooltip(bar, `${String(i + 1)} · ${trCount('stats.taste.rated', count)}`, { placement: 'top' })
				bar.createDiv({ cls: 'library-taste-fill' }).setCssStyles({ height: `${String(Math.max(count > 0 ? 6 : 2, Math.round((count / peak) * 100)))}%` })
				bar.createDiv({ cls: 'library-taste-score', text: String(i + 1) })
			})
			const facts = side.createDiv({ cls: 'library-taste-facts' })
			if (taste.genres.length > 0) {
				const row = facts.createDiv({ cls: 'library-taste-fact' })
				row.createDiv({ cls: 'library-taste-fact-name', text: tr('stats.taste.genres') })
				const chips = row.createDiv({ cls: 'library-taste-chips' })
				for (const genre of taste.genres) {
					const chip = chips.createSpan({ cls: 'library-taste-chip' })
					this.plugin.linkName(chip, genre.name)
					chip.createSpan({ text: genre.name })
					chip.createSpan({ cls: 'library-taste-chip-score', text: formatNumber(genre.average) })
				}
			}
			if (taste.decade) {
				const row = facts.createDiv({ cls: 'library-taste-fact' })
				row.createDiv({ cls: 'library-taste-fact-name', text: tr('stats.taste.decade') })
				const chip = row.createDiv({ cls: 'library-taste-chips' }).createSpan({ cls: 'library-taste-chip' })
				chip.createSpan({ text: tr('stats.taste.decadeValue', { decade: String(taste.decade.decade) }) })
				chip.createSpan({ cls: 'library-taste-chip-score', text: formatNumber(taste.decade.count) })
			}
		}

		// As many columns as fill two rows (the time column's height); taste counts three cells.
		if (box.parentElement) {
			const cells = Array.from(box.children).reduce((n, el) => n + (el.hasClass('library-stats-taste') ? 3 : 1), 0)
			box.setCssProps({ '--stats-cols': String(Math.max(1, Math.ceil(cells / 2))) })
		}

		collapseBtn.addEventListener('click', () => {
			const nowCollapsed = body.classList.toggle('collapsed')
			collapseBtn.setText(nowCollapsed ? '▶' : '▼')
			collapseBtn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true')
			this.plugin.settings.statsCollapsed = nowCollapsed
			void this.plugin.persistSettings()
		})
		return header
	}

	renderComingSoon(root: HTMLElement, cards: CardData[]): void {
		const soon = cards
			.map(card => ({ card, airing: this.plugin.airingFor(card.fm) }))
			.filter((item): item is { card: CardData; airing: Airing } => item.airing !== null)
			.sort((a, b) => a.airing.at - b.airing.at)
			.slice(0, 20)
		if (soon.length === 0) return
		const settings = this.plugin.settings
		const section = root.createDiv({ cls: 'library-section library-coming-soon' })
		const heading = section.createDiv({ cls: 'library-section-heading' })
		heading.createEl('h2', { text: tr('soon.title') })
		const collapseBtn = heading.createEl('button', { cls: 'library-collapse-btn', text: '▼', attr: { 'aria-label': tr('soon.title'), 'aria-expanded': 'true' } })
		const list = section.createDiv({ cls: 'library-soon-list' })
		for (const { card, airing } of soon) {
			const row = list.createDiv({ cls: 'library-soon-row' })
			const src = coverSrc(this.app, coverValue(card.fm, settings.coverProperty))
			if (src) row.createEl('img', { cls: 'library-soon-cover', attr: { src } })
			const text = row.createDiv({ cls: 'library-soon-text' })
			text.createDiv({ cls: 'library-soon-name', text: card.name })
			text.createDiv({ cls: 'library-soon-when', text: airingLabel(airing) })
			row.addEventListener('click', () => { void this.app.workspace.getLeaf(false).openFile(card.file) })
		}
		const applyCollapsed = (collapsed: boolean): void => {
			list.toggleClass('collapsed', collapsed)
			collapseBtn.setText(collapsed ? '▶' : '▼')
			collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
		}
		collapseBtn.addEventListener('click', () => {
			settings.comingSoonCollapsed = !list.hasClass('collapsed')
			applyCollapsed(settings.comingSoonCollapsed)
			void this.plugin.persistSettings()
		})
		if (settings.comingSoonCollapsed) applyCollapsed(true)
	}

	renderCard(grid: HTMLElement, card: CardData): void {
		const { file, fm } = card
		// album covers are square
		const cardEl = grid.createDiv({
			cls: card.kind === 'music' ? 'library-card is-square' : 'library-card',
			attr: {
				'role': 'button',
				'tabindex': '0',
				'aria-label': card.name
			}
		})
		cardEl.addEventListener('click', () => {
			void this.app.workspace.getLeaf(false).openFile(file)
		})
		cardEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				void this.app.workspace.getLeaf(false).openFile(file)
			}
		})

		const cover = coverValue(fm, this.plugin.settings.coverProperty)
		const imgDiv = cardEl.createDiv({ cls: 'card-image' })
		const cardCover = coverSrc(this.app, cover)
		if (cardCover) {
			imgDiv.createEl('img', { attr: { src: cardCover, alt: card.name, loading: 'lazy', decoding: 'async' } })
		} else {
			const type = toStr(fm.Type).toLowerCase()
			const emoji = type === 'anime' ? '🎌'
				: type === 'comic' ? '📚'
				: type === 'book' ? '📖'
				: type === 'game' ? '🎮'
				: type === 'music' ? '🎵'
				: type === 'manual' ? '📝'
				: '🎬'
			imgDiv.createSpan({ text: emoji })
		}
		renderPlatforms(imgDiv, fm, 'card-platforms')
		if (notStarted(fm, card.kind)) {
			const badge = imgDiv.createSpan({
				cls: 'card-unstarted',
				attr: { 'role': 'img', 'aria-label': tr('card.notStarted') }
			})
			setIcon(badge, 'eye')
		}

		const info = cardEl.createDiv({ cls: 'card-info' })
		info.createDiv({ cls: 'card-title', text: card.name })

		const author = toStrArray(fm.Author || fm.Creator || fm.Director || fm.Artist).map(linkLabel).join(', ')
		if (author) info.createDiv({ cls: 'card-author', text: author })
		if (fm.Year) info.createDiv({ cls: 'card-year', text: toStr(fm.Year) })

		const myRating = fm['My Rating'] ?? fm.Rating
		const imdb = fm['Rating IMDB']
		const rt = fm['Rating RT']
		const rawg = fm['Rating RAWG']
		const mc = fm['Rating MC']
		if (imdb || rt || rawg || mc || myRating) {
			const parts: string[] = []
			if (imdb) parts.push('IMDb ' + toStr(imdb))
			if (rt) parts.push(RATING_RT_ICON + ' ' + toStr(rt) + '%')
			if (rawg) parts.push('RAWG ' + toStr(rawg))
			if (mc) parts.push('MC ' + toStr(mc))
			if (myRating) parts.push(toStr(myRating))
			info.createDiv({ cls: 'card-rating', text: parts.join(' | ') })
		}

		renderTrophies(info, fm, 'card-trophies')

		const percent = shownProgress(fm, card.kind)
		if (percent !== null && percent < 100) {
			const pc = info.createDiv({ cls: 'card-progress' })
			pc.createDiv({ cls: 'card-progress-label', text: String(percent) + '%' })
			const bar = pc.createDiv({ cls: 'card-progress-bar' })
			bar.createDiv({ cls: 'card-progress-fill' }).setCssStyles({ width: String(percent) + '%' })
		}
	}
}

export class LibraryView extends ItemView {
	private plugin: LibraryPlugin
	private renderTimer: number | null = null
	// Paths shown last render: a note ceasing to be one must still trigger the render that drops it.
	private shown = new Set<string>()

	private r: LibraryRenderer

	constructor(leaf: WorkspaceLeaf, plugin: LibraryPlugin) {
		super(leaf)
		this.plugin = plugin
		this.r = new LibraryRenderer(this.app, plugin)
	}

	getViewType(): string {
		return LIBRARY_VIEW_TYPE
	}

	getDisplayText(): string {
		return tr('view.title')
	}

	getIcon(): string {
		return 'library'
	}

	async onOpen(): Promise<void> {
		// Only library notes redraw: any other note fires `changed` every few seconds.
		this.registerEvent(this.app.metadataCache.on('changed', (file) => {
			if (this.shown.has(file.path) || this.isLibraryNote(this.app.metadataCache.getFileCache(file)?.frontmatter)) {
				this.scheduleRender()
			}
		}))
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (this.shown.has(file.path)) this.scheduleRender()
		}))
		this.registerEvent(this.app.vault.on('rename', (_file, oldPath) => {
			if (this.shown.has(oldPath)) this.scheduleRender()
		}))
		this.registerDomEvent(activeDocument, 'click', () => {
			this.contentEl.querySelectorAll('.library-sort-menu.open').forEach(m => m.removeClass('open'))
		})
		this.render()
	}

	private scheduleRender(): void {
		if (this.renderTimer) window.clearTimeout(this.renderTimer)
		this.renderTimer = window.setTimeout(() => this.render(), 300)
	}

	private isLibraryNote(fm: Record<string, unknown> | undefined): boolean {
		const type = fm?.Type
		return typeof type === 'string' && this.plugin.settings.categories.some(c => c.typeValue === type)
	}

	private readSort(section: string, fallback: SortChoice): SortChoice {
		const saved = this.plugin.settings.sortState[section]
		if (!saved || SORT_KEYS.indexOf(saved.key as SortKey) < 0) return fallback
		return { key: saved.key as SortKey, asc: saved.asc !== false }
	}

	private writeSort(section: string, key: SortKey, asc: boolean): void {
		this.plugin.settings.sortState[section] = { key, asc }
		void this.plugin.persistSettings()
	}

	render(): void {
		const root = this.contentEl
		const scrollTop = root.scrollTop
		root.empty()
		root.addClass('library-view')

		const sections = this.plugin.settings.categories.map(category => ({
			category,
			cards: this.r.collectCards(category)
		}))
		this.shown.clear()
		for (const { cards } of sections) {
			for (const card of cards) this.shown.add(card.file.path)
		}

		const actions = createDiv({ cls: 'library-actions' })

		const addBtn = actions.createEl('button', {
			cls: 'library-icon-btn',
			attr: { 'aria-label': tr('cmd.addContent') }
		})
		setIcon(addBtn, 'plus')
		addBtn.addEventListener('click', () => this.plugin.openAddContent())

		const searchBtn = actions.createEl('button', {
			cls: 'library-icon-btn',
			attr: { 'aria-label': tr('cmd.searchLibrary') }
		})
		setIcon(searchBtn, 'search')
		searchBtn.addEventListener('click', () => this.plugin.openLibrarySearch())

		// One press, every platform: forces what would otherwise wait for the daily timers.
		const updateBtn = actions.createEl('button', {
			cls: 'library-icon-btn',
			attr: { 'aria-label': tr('cmd.updateAll') }
		})
		setIcon(updateBtn, 'refresh-cw')
		updateBtn.addEventListener('click', () => void this.plugin.updateAll())

		// The map has its own command; this is the same thing one press away.
		const mapBtn = actions.createEl('button', {
			cls: 'library-icon-btn',
			attr: { 'aria-label': tr('cmd.libraryMap') }
		})
		setIcon(mapBtn, 'network')
		mapBtn.addEventListener('click', () => void this.plugin.buildLibraryMap())

		const pageHeader = (): void => {
			root.createDiv({ cls: 'library-page-header' }).appendChild(actions)
		}
		if (sections.length === 0) {
			pageHeader()
			root.createEl('p', { text: tr('view.empty') })
			return
		}

		// Not-started may live in Up next alone only while that block is on.
		const settings = this.plugin.settings
		const everything = sections.reduce((all, section) => all.concat(section.cards), [] as CardData[])
		const statsHeader = this.r.renderStats(root, everything)
		if (statsHeader) statsHeader.appendChild(actions)
		else pageHeader()

		if (settings.showComingSoon) this.r.renderComingSoon(root, everything)
		const upNextOnly = settings.showUpNext && !settings.upNextInCategories
		let rendered = 0
		for (const { category, cards } of sections) {
			const shown = upNextOnly ? cards.filter(card => !notStarted(card.fm, card.kind)) : cards
			if (shown.length === 0) continue
			rendered++
			const chosen = settings.filterState[category.name] ?? {}
			this.renderSection(root, {
				title: categoryLabel(category),
				sortId: category.name,
				defaultSort: { key: 'name', asc: true },
				kind: category.contentType,
				collapsed: category.collapsed === true,
				setCollapsed: (collapsed) => {
					if (collapsed) category.collapsed = true
					else delete category.collapsed
				},
				filters: {
					all: shown,
					chosen,
					choose: (facet, value) => {
						const next = { ...(settings.filterState[category.name] ?? {}) }
						if (value) next[facet] = value
						else delete next[facet]
						if (Object.keys(next).length > 0) settings.filterState[category.name] = next
						else delete settings.filterState[category.name]
						void this.plugin.persistSettings()
						this.render()
					}
				}
			}, filterCards(shown, chosen))
		}

		const upNext: { category: string, card: CardData }[] = []
		for (const { category, cards } of sections) {
			for (const card of cards) if (notStarted(card.fm, card.kind)) upNext.push({ category: category.name, card })
		}
		if (settings.showUpNext && upNext.length > 0) {
			const names: string[] = []
			for (const item of upNext) if (names.indexOf(item.category) < 0) names.push(item.category)
			const chosen = names.indexOf(settings.upNextCategory) >= 0 ? settings.upNextCategory : ''
			const shown = upNext.filter(item => !chosen || item.category === chosen).map(item => item.card)
			const upNextEl = this.renderSection(root, {
				title: tr('upNext.title'),
				sortId: UP_NEXT_SORT,
				defaultSort: { key: 'date', asc: false },
				collapsed: settings.upNextCollapsed,
				setCollapsed: (collapsed) => { settings.upNextCollapsed = collapsed }
			}, shown)
			upNextEl.addClass('library-up-next')
			if (names.length > 1) this.upNextFilter(upNextEl, names, chosen, name => { const cat = settings.categories.find(c => c.name === name); return cat ? categoryLabel(cat) : name })
			rendered++
		}
		if (rendered === 0) root.createEl('p', { text: tr('view.empty') })
		root.scrollTop = scrollTop
	}

	private upNextFilter(section: HTMLElement, names: string[], chosen: string, label: (name: string) => string): void {
		const row = createDiv({ cls: 'library-filter', attr: { role: 'group', 'aria-label': tr('upNext.title') } })
		for (const name of ['', ...names]) {
			const button = row.createEl('button', {
				cls: 'library-filter-item',
				text: name ? label(name) : tr('filter.all'),
				attr: { 'aria-pressed': name === chosen ? 'true' : 'false' }
			})
			if (name === chosen) button.addClass('is-active')
			button.addEventListener('click', () => {
				if (name === this.plugin.settings.upNextCategory) return
				this.plugin.settings.upNextCategory = name
				void this.plugin.persistSettings()
				this.render()
			})
		}
		const toolbar = section.querySelector('.library-toolbar')
		toolbar?.insertBefore(row, toolbar.querySelector('.library-toolbar-spacer'))
	}

	// Only values some card has; a filter shows with 2+ values or a chosen one.
	private sectionFilters(toolbar: HTMLElement, filters: NonNullable<SectionSpec['filters']>): void {
		const groups = FACETS.map(({ facet, label }) => {
			const counts = new Map<string, number>()
			for (const card of filters.all) {
				for (const value of facetValues(card, facet)) counts.set(value, (counts.get(value) ?? 0) + 1)
			}
			const values = [...counts.keys()].sort((a, b) => facet === 'year' ? Number(b) - Number(a) : a.localeCompare(b))
			return { facet, label, counts, values, chosen: filters.chosen[facet] ?? '' }
		}).filter(group => group.counts.size >= 2 || group.chosen)
		if (groups.length === 0) return
		const active = groups.filter(group => group.chosen).length
		const dropdown = toolbar.createDiv({ cls: 'library-sort-dropdown library-filter-dropdown' })
		const trigger = dropdown.createEl('button', {
			cls: 'library-sort-trigger library-filter-trigger',
			attr: { 'aria-label': tr('filter.title'), 'aria-haspopup': 'true', 'aria-expanded': 'false' }
		})
		setIcon(trigger.createSpan({ cls: 'library-filter-icon' }), 'filter')
		trigger.createSpan({ text: active > 0 ? `${tr('filter.title')} · ${formatNumber(active)}` : tr('filter.title') })
		if (active > 0) trigger.addClass('is-active')
		const menu = dropdown.createDiv({ cls: 'library-sort-menu library-filter-menu' })
		if (active > 0) {
			const clear = menu.createEl('button', { cls: 'library-sort-menu-item library-filter-clear', text: tr('filter.clear') })
			clear.addEventListener('click', e => {
				e.stopPropagation()
				menu.removeClass('open')
				for (const group of groups) if (group.chosen) filters.choose(group.facet, '')
			})
		}
		for (const group of groups) {
			const head = menu.createEl('button', { cls: 'library-filter-group', attr: { 'aria-expanded': 'false' } })
			head.createSpan({ cls: 'library-filter-group-name', text: tr(group.label) })
			if (group.chosen) head.createSpan({ cls: 'library-filter-group-value', text: group.chosen })
			const chevron = head.createSpan({ cls: 'library-filter-group-chevron' })
			setIcon(chevron, 'chevron-right')
			const list = menu.createDiv({ cls: 'library-filter-values' })
			for (const value of ['', ...group.values]) {
				const item = list.createEl('button', {
					cls: 'library-sort-menu-item',
					text: value ? `${value} · ${formatNumber(group.counts.get(value) ?? 0)}` : tr('filter.all')
				})
				if (value === group.chosen) item.addClass('active')
				item.addEventListener('click', e => {
					e.stopPropagation()
					menu.removeClass('open')
					if (value !== group.chosen) filters.choose(group.facet, value)
				})
			}
			head.addEventListener('click', e => {
				e.stopPropagation()
				const open = !list.hasClass('open')
				list.toggleClass('open', open)
				head.setAttribute('aria-expanded', open ? 'true' : 'false')
				setIcon(chevron, open ? 'chevron-down' : 'chevron-right')
			})
		}
		trigger.addEventListener('click', e => {
			e.stopPropagation()
			const open = !menu.hasClass('open')
			this.contentEl.querySelectorAll('.library-sort-menu.open').forEach(m => m.removeClass('open'))
			menu.toggleClass('open', open)
			trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
		})
	}

	private sectionMeta(row: HTMLElement, cards: CardData[], kind?: ContentType): void {
		const count = formatNumber(cards.length)
		row.createSpan({
			cls: 'library-section-count',
			text: count,
			attr: { 'aria-label': `${count} ${trCount('stats.works', cards.length)}` }
		})
		if (kind !== 'movie' && kind !== 'series' && kind !== 'anime' && kind !== 'music' && kind !== 'game') return
		let minutes = 0
		for (const card of cards) minutes += spentMinutes(card.fm, card.kind)
		if (minutes <= 0) return
		const time = row.createSpan({ cls: 'library-section-time' })
		setTooltip(time, exactHours(minutes), { placement: 'top' })
		setIcon(time.createSpan({ cls: 'library-section-time-icon' }), 'clock')
		time.createSpan({ text: spentTime(minutes) })
	}

	private renderSection(root: HTMLElement, spec: SectionSpec, cards: CardData[]): HTMLElement {
		const section = root.createDiv({ cls: 'library-section' })
		const toolbar = section.createDiv({ cls: 'library-section-heading library-toolbar' })
		toolbar.createEl('h2', { text: spec.title })
		const collapseBtn = toolbar.createEl('button', {
			cls: 'library-collapse-btn',
			text: '▼',
			attr: { 'aria-label': spec.title, 'aria-expanded': 'true' }
		})
		this.sectionMeta(toolbar, cards, spec.kind)
		if (spec.filters) this.sectionFilters(toolbar, spec.filters)
		toolbar.createDiv({ cls: 'library-toolbar-spacer' })

		const sortDropdown = toolbar.createDiv({ cls: 'library-sort-dropdown' })
		const sortTrigger = sortDropdown.createEl('button', {
			cls: 'library-sort-trigger',
			text: tr('sort.name') + ' ▾',
			attr: {
				'aria-label': tr('sort.name'),
				'aria-haspopup': 'true',
				'aria-expanded': 'false'
			}
		})
		const sortMenu = sortDropdown.createDiv({ cls: 'library-sort-menu' })

		const grid = section.createDiv({ cls: 'library-grid' })

		const sortOptions: { label: string; key: SortKey }[] = [
			{ label: tr('sort.name'), key: 'name' },
			{ label: tr('sort.year'), key: 'year' },
			{ label: tr('sort.rating'), key: 'rating' },
			{ label: tr('sort.date'), key: 'date' },
			{ label: tr('sort.modified'), key: 'modified' },
			{ label: tr('sort.progress'), key: 'progress' },
			...(spec.kind === 'game' ? [{ label: tr('sort.played'), key: 'played' as SortKey }] : []),
			// Only where some exist: Up next can take them all away.
			...(spec.sortId !== UP_NEXT_SORT && cards.some(card => notStarted(card.fm, card.kind))
				? [{ label: tr('sort.unstarted'), key: 'unstarted' as SortKey }] : [])
		]

		const restored = this.readSort(spec.sortId, spec.defaultSort)
		const savedSort = sortOptions.some(o => o.key === restored.key) ? restored : spec.defaultSort
		let currentSort: SortKey = savedSort.key
		let sortAsc = savedSort.asc

		const updateTrigger = (): void => {
			const opt = sortOptions.find(o => o.key === currentSort)
			sortTrigger.setText((opt?.label ?? '') + ' ' + (sortAsc ? '↑' : '↓'))
		}

		// finished counts as full even without a Progress value
		const progressOf = (card: CardData): number => isFinished(card.fm, card.kind) ? 100 : Math.min(100, parseProgress(card.fm.Progress))
		const renderGrid = (): void => {
			const sorted = [...cards].sort((a, b) => {
				let cmp = 0
				switch (currentSort) {
					case 'name': cmp = a.name.localeCompare(b.name); break
					case 'year': cmp = a.year - b.year || parseDate(a.fm.Released) - parseDate(b.fm.Released); break
					case 'rating': cmp = a.rating - b.rating; break
					case 'date': cmp = a.date - b.date; break
					case 'modified': cmp = a.file.stat.mtime - b.file.stat.mtime; break
					case 'played': cmp = parseDate(a.fm['Last Played']) - parseDate(b.fm['Last Played']); break
					case 'progress': cmp = progressOf(a) - progressOf(b) || a.name.localeCompare(b.name); break
					case 'unstarted':
						cmp = Number(notStarted(b.fm, b.kind)) - Number(notStarted(a.fm, a.kind))
						// Named order within each half, whichever way the halves go.
						if (cmp === 0) return a.name.localeCompare(b.name)
						break
				}
				return sortAsc ? cmp : -cmp
			})
			grid.empty()
			for (const card of sorted) this.r.renderCard(grid, card)
		}

		sortOptions.forEach(opt => {
			const item = sortMenu.createEl('button', { cls: 'library-sort-menu-item', text: opt.label })
			if (opt.key === currentSort) item.addClass('active')
			item.addEventListener('click', e => {
				e.stopPropagation()
				if (currentSort === opt.key) {
					sortAsc = !sortAsc
				} else {
					currentSort = opt.key
					sortAsc = opt.key === 'name' || opt.key === 'unstarted'
				}
				sortMenu.querySelectorAll('.library-sort-menu-item').forEach(b => b.removeClass('active'))
				item.addClass('active')
				updateTrigger()
				sortMenu.removeClass('open')
				renderGrid()
				this.writeSort(spec.sortId, currentSort, sortAsc)
			})
		})

		sortTrigger.addEventListener('click', e => {
			e.stopPropagation()
			const isOpen = !sortMenu.hasClass('open')
			sortMenu.toggleClass('open', isOpen)
			sortTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
		})

		// Fold stays a CSS class: a hidden tab has no layout to hide rows in.
		const applyCollapsed = (collapsed: boolean): void => {
			grid.toggleClass('collapsed', collapsed)
			collapseBtn.setText(collapsed ? '▶' : '▼')
			collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
		}
		collapseBtn.addEventListener('click', () => {
			const collapsed = !grid.hasClass('collapsed')
			spec.setCollapsed(collapsed)
			applyCollapsed(collapsed)
			void this.plugin.persistSettings()
		})

		// Show a restored choice; an untouched section keeps its default label.
		if (currentSort !== 'name' || !sortAsc) updateTrigger()
		renderGrid()
		if (spec.collapsed) applyCollapsed(true)
		return section
	}

	async onClose(): Promise<void> {
		if (this.renderTimer) window.clearTimeout(this.renderTimer)
	}
}
