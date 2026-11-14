import { App, ItemView, WorkspaceLeaf, TFile, getLanguage, setIcon, setTooltip } from 'obsidian'
import { airingLabel, type Airing } from './airing'
import type LibraryPlugin from './main'
import { categoryLabel, ownCreators, sectionOrder, NFT_CATEGORY, isNftCategory } from './categories'
import { cleanCollectionName, looksLikeSpam, viaPinata } from './nft'
import { RATING_RT_ICON, type ICategory, type IStatsTop } from './constants'
import type { ContentType } from './providers/types'
import { compactNumber, formatNumber, relativeDay, tr, trCount } from './i18n'
import { comparisonOfTheDay, comparisonText } from './facts'
import { renderTrophies } from './ui/trophyIcons'
import { tasteOf } from './taste'
import { activityDays, logOf, todayIso } from './diary'
import { renderPlatformLabels, renderPlatforms } from './ui/platformIcons'
import { YOUTUBE_TYPE } from './youtube'
import {
	toStr,
	toStrArray,
	isCollectible,
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
	spentParts,
	spentMinutes,
	isAudiobook,
	exactHours,
	runtimeParts,
	propertyValues,
	topLabel,
	formatLabel,
	BOOK_FORMATS,
	latestNftMintDate,
	getNftMintTimestamp
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
	cover?: string
	tokenCount?: number
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
	game: 'color-mix(in srgb, var(--interactive-accent) 80%, var(--text-normal))',
	video: 'color-mix(in srgb, #ff0000 70%, var(--background-primary))'
}

const AUDIOBOOK_POOL = '\u0000audiobooks'
const AUDIOBOOK_COLOR = 'color-mix(in srgb, #f59e0b 80%, var(--background-primary))'

// the video category is a manual one, counted by its minutes watched
function timeColor(cat: ICategory): string | undefined {
	return TIME_COLORS[cat.typeValue === YOUTUBE_TYPE ? 'video' : cat.contentType]
}

type SortKey = 'name' | 'year' | 'rating' | 'date' | 'modified' | 'played' | 'unstarted' | 'progress' | 'chain' | 'favorite' | 'minted'

const SORT_KEYS: SortKey[] = ['name', 'year', 'rating', 'date', 'modified', 'played', 'unstarted', 'progress', 'chain', 'favorite', 'minted']

interface SortChoice {
	key: SortKey
	asc: boolean
}

type Facet = 'year' | 'genre' | 'artist' | 'country' | 'platform' | 'kind' | 'format'

const FACETS: { facet: Facet, label: string }[] = [
	{ facet: 'year', label: 'sort.year' },
	{ facet: 'genre', label: 'header.genre' },
	{ facet: 'artist', label: 'header.creator' },
	{ facet: 'country', label: 'filter.country' },
	{ facet: 'platform', label: 'settings.stats.groupPlatforms' },
	{ facet: 'kind', label: 'filter.kind' },
	{ facet: 'format', label: 'header.format' },
]

function facetValues(card: CardData, facet: Facet): string[] {
	switch (facet) {
		case 'year': return card.year > 0 ? [String(card.year)] : []
		case 'genre': return toStrArray(card.fm.Genre).map(linkLabel).filter(Boolean)
		// an album's artist or a token's collection; other media have too many creators to pick from
		case 'artist': return card.kind === 'music' || isCollectible(card.fm) ? toStrArray(card.fm.Creator).map(linkLabel).filter(Boolean) : []
		case 'country': return toStrArray(card.fm.Country)
		case 'platform': return toStrArray(card.fm.Platforms)
		// a token is a collectible or an achievement (OAT)
		case 'kind': return isCollectible(card.fm) ? [card.fm.OAT === true ? 'OAT' : 'NFT'] : []
		case 'format': {
			if (card.kind !== 'book' && card.kind !== 'comic') return []
			return toStrArray(card.fm.Format).map((val) => {
				const match = BOOK_FORMATS.find(([v]) => v.toLowerCase() === val.toLowerCase())
				return match ? match[0] : val
			})
		}
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
	category?: ICategory
	filters?: { all: CardData[], chosen: Record<string, string>, choose(facet: Facet, value: string): void }
}

// A key no category name takes.
const UP_NEXT_SORT = '@upNext'

// Cards, statistics and the Soon list, shared by the library tab and the note blocks.
export class LibraryRenderer {
	constructor(private app: App, private plugin: LibraryPlugin) {}

	collectCards(category: ICategory): CardData[] {
		let cards: CardData[] = []
		const seenFiles = new Set<string>()
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (seenFiles.has(file.path)) continue
			seenFiles.add(file.path)
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || fm.Type !== category.typeValue) continue
			// spam NFTs stay hidden unless the setting shows them, OATs while it hides them
			const isNft = fm.Source === 'nft' || isNftCategory(category)
			const isSpam = fm.Spam === true || (isNft && fm.Spam !== false && looksLikeSpam(toStr(fm.Name), toStr(fm.Contract)))
			if (isSpam && isNft && !this.plugin.settings.showNftSpam) continue
			if (fm.OAT === true && isNft && !this.plugin.settings.showNftOat) continue
			if (!this.plugin.settings.youtubeIncludeShorts && toStr(fm.Source) === 'youtube') {
				if (fm.Short === true || toStr(fm.URL).includes('/shorts/') || /#shorts\b/i.test(toStr(fm.Name))) continue
			}
			cards.push({
				file,
				fm,
				kind: category.contentType,
				name: toStr(fm.Name) || file.basename,
				year: Number(fm.Year) || 0,
				rating: Number(fm['My Rating'] ?? fm.Rating) || 0,
				date: isNft ? getNftMintTimestamp(fm) : parseDate(fm.Date)
			})
		}
		if (category.contentType === 'game') {
			const seenGameKeys = new Set<string>()
			const deduped: CardData[] = []
			for (const card of cards) {
				const sourceId = toStr(card.fm['Source ID'])
				const nameKey = card.name.toLowerCase().trim()
				const key = sourceId || nameKey
				if (seenGameKeys.has(key)) continue
				seenGameKeys.add(key)
				deduped.push(card)
			}
			return deduped
		}
		if (!isNftCategory(category)) {
			const seenKeys = new Set<string>()
			const deduped: CardData[] = []
			for (const card of cards) {
				const sourceId = toStr(card.fm['Source ID'])
				if (sourceId) {
					if (seenKeys.has(sourceId)) continue
					seenKeys.add(sourceId)
				}
				deduped.push(card)
			}
			cards = deduped
		}
		if (category.typeValue === NFT_CATEGORY || category.name === NFT_CATEGORY) {
			if (this.plugin.settings.nftDisplayMode === 'all') {
				const allCards: CardData[] = []
				for (const card of cards) {
					const tokenIds = toStrArray(card.fm.Tokens)
					if (tokenIds.length > 0) {
						const gallery = toStrArray(card.fm.Gallery)
						const cover = toStr(card.fm.Cover)
						for (let j = 0; j < tokenIds.length; j++) {
							const tid = tokenIds[j]
							allCards.push({
								file: card.file,
								fm: card.fm,
								kind: card.kind,
								name: `${card.name} #${tid}`,
								year: card.year,
								rating: card.rating,
								date: card.date,
								cover: gallery[j] || (tokenIds.length === 1 ? cover : '') || cover
							})
						}
					} else {
						allCards.push(card)
					}
				}
				return allCards
			}
			const seenContracts = new Set<string>()
			const deduped: CardData[] = []
			for (const card of cards) {
				const contract = toStr(card.fm.Contract).toLowerCase()
				const chain = toStrArray(card.fm.Platforms)[0] || toStr(card.fm.Platforms) || toStr(card.fm['Source ID']).split(':')[0] || ''
				const cleanName = cleanCollectionName(card.name, toStrArray(card.fm.Creator)[0] || '', toStr(card.fm['Token ID']))
				const key = contract && contract !== '0' ? `${chain}:${contract}` : `${chain}:${cleanName.toLowerCase()}`
				if (seenContracts.has(key)) continue
				seenContracts.add(key)
				deduped.push(card)
			}
			return deduped
		}
		return cards
	}

	collectStats(): { columns: StatsColumn[]; time: TimeSlice[]; undated: number } {
		const tops = this.plugin.settings.stats.tops
		const properties = tops.filter(top => top.kind === 'property')
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

			const isNft = isCollectible(fm) || cat.typeValue === NFT_CATEGORY || toStr(fm.Source) === 'nft' || isNftCategory(cat)
			if (isNft) {
				// an NFT counts only in its own collection and chain tops, and only as the library shows it: spam and OATs while hidden stay out
				if (!isNftCategory(cat) && toStr(fm.Source) !== 'nft') continue
				const spam = fm.Spam === true || (fm.Spam !== false && looksLikeSpam(toStr(fm.Name), toStr(fm.Contract)))
				if ((spam && !this.plugin.settings.showNftSpam) || (fm.OAT === true && !this.plugin.settings.showNftOat)) continue
				const tokens = Math.max(1, Number(fm.Count) || 1)
				properties.forEach((top, i) => {
					const tally = counts[i]
					if (!tally || top.scope !== cat.typeValue) return
					for (const value of propertyValues(fm, top.key)) {
						const clean = linkLabel(value).trim()
						const key = clean.toLowerCase()
						if (!key) continue
						const entry = tally.get(key)
						if (entry) entry.count += tokens
						else tally.set(key, { label: clean, count: tokens })
					}
				})
				continue
			}

			properties.forEach((top, i) => {
				const tally = counts[i]
				if (!tally) return
				// a scoped top counts its category alone; the shared creator top leaves out games and videos
				if (top.scope) {
					if (cat.typeValue !== top.scope) return
				} else {
					if (top.key.toLowerCase() === 'creator' && ownCreators(cat)) return
				}

				const seen = new Set<string>()
				const vals = propertyValues(fm, top.key)

				for (const value of vals) {
					const clean = linkLabel(value).trim()
					const key = clean.toLowerCase()
					if (!key || seen.has(key)) continue
					seen.add(key)
					const entry = tally.get(key)
					if (entry) entry.count += 1
					else tally.set(key, { label: clean, count: 1 })
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

			// books have no time of their own, the audiobooks among them do
			const audiobook = cat.contentType === 'book' && isAudiobook(fm)
			if (timeColor(cat) || audiobook) {
				const minutes = spentMinutes(fm, cat.contentType)
				if (minutes > 0) {
					const pool = audiobook ? AUDIOBOOK_POOL : cat.name
					timeMinutes.set(pool, (timeMinutes.get(pool) || 0) + minutes)
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
				const tally = counts[properties.indexOf(top)]
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
			const color = timeColor(cat)
			if (!color) continue
			const minutes = timeMinutes.get(cat.name) || 0
			if (minutes > 0) time.push({ name: categoryLabel(cat), minutes, color })
		}
		const listened = timeMinutes.get(AUDIOBOOK_POOL) || 0
		if (listened > 0) time.push({ name: tr('settings.default.audiobook'), minutes: listened, color: AUDIOBOOK_COLOR })

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
		chart.setCssProps({ '--library-time-chart': `conic-gradient(${stops.join(', ')})` })
		// The total switches between hours and days, months, years; the legend follows. Remembered.
		const stats = this.plugin.settings.stats
		const totalEl = chart.createDiv({ cls: 'library-time-hole' }).createEl('button', { cls: 'library-time-total' })
		const legend = col.createDiv({ cls: 'library-time-legend' })
		const values: Array<{ el: HTMLElement; minutes: number; share: number }> = []
		for (const slice of slices) {
			const row = legend.createDiv({ cls: 'library-time-item' })
			row.createSpan({ cls: 'library-time-dot' }).setCssProps({ '--library-time-dot': slice.color })
			row.createSpan({ cls: 'library-time-name', text: slice.name })
			values.push({ el: row.createSpan({ cls: 'library-time-value' }), minutes: slice.minutes, share: Math.round((slice.minutes / total) * 100) })
		}
		const show = (): void => {
			const calendar = stats.calendarTime === true
			// Split: a long total breaks only between its units.
			totalEl.empty()
			const parts = calendar ? spentParts(total) : runtimeParts(total)
			parts.forEach((part, i) => {
				if (i > 0) totalEl.appendText(' ')
				totalEl.createSpan({ text: part })
			})
			// the value first: a screen reader names the button by its label
			totalEl.setAttribute('aria-label', `${parts.join(' ')} · ${tr(calendar ? 'stats.showHours' : 'stats.showCalendar')}`)
			for (const value of values) value.el.setText(`${calendar ? spentTime(value.minutes) : formatRuntime(value.minutes)} · ${String(value.share)}%`)
		}
		show()
		totalEl.addEventListener('click', () => {
			stats.calendarTime = stats.calendarTime !== true
			show()
			void this.plugin.persistSettings()
		})

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

	private activityObserver: ResizeObserver | null = null

	renderStats(root: HTMLElement, cards?: CardData[]): HTMLElement | null {
		if (!this.plugin.settings.showStats) return null
		const stats = this.collectStats()
		const columns = stats.columns.filter(column => column.items.length > 0)
		const showTime = this.plugin.settings.stats.watchTime
			&& this.plugin.settings.categories.some(c => timeColor(c) !== undefined || c.contentType === 'book')
		const psn = this.plugin.settings.psnStats
		const mal = this.plugin.settings.malStats
		const nintendo = this.plugin.settings.nintendoStats
		const taste = cards && this.plugin.settings.showProfile ? tasteOf(cards.filter(c => !isCollectible(c.fm) && c.fm.Type !== NFT_CATEGORY && toStr(c.fm.Source) !== 'nft' && c.fm.Type !== YOUTUBE_TYPE && toStr(c.fm.Source) !== 'youtube')) : null
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
					const scope = this.plugin.settings.categories.find(c => c.typeValue === column.top.scope)
					const nft = !!scope && isNftCategory(scope)
					// a chain shows as the coloured badge its notes carry
					if (nft && column.top.key.toLowerCase() === 'platforms') renderPlatformLabels(label, { Platforms: [name] })
					else {
						const nameEl = label.createSpan({ cls: 'library-stats-medal-name', text: name })
						if (NAME_FIELDS.some(key => key.toLowerCase() === column.top.key.toLowerCase())) this.plugin.linkName(nameEl, name)
					}
					label.createSpan({ cls: 'library-stats-medal-count', text: nft ? trCount('stats.tokens', count) : `${count} ${trCount('stats.works', count)}` })
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
				bar.createDiv({ cls: 'library-taste-fill' }).setCssProps({ '--library-taste': `${String(Math.max(count > 0 ? 6 : 2, Math.round((count / peak) * 100)))}%` })
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

		const activity = !!cards && this.plugin.settings.showActivity
		if (activity && !box.parentElement) body.prepend(box)
		// With the activity grid the tops fill the first row and the grid the rest of the second, beside the diary and taste.
		// Without it, as many columns as fill two rows (the time column's height); taste counts three cells.
		const blocks = Array.from(box.children)
		const tops = blocks.filter(el => !el.hasClass('library-stats-taste') && !el.hasClass('library-diary-col')).length
		if (activity && cards) {
			const cols = Math.max(2, tops)
			// taste gives up a column so the grid shares its row
			const taste = blocks.find(el => el.hasClass('library-stats-taste'))
			// two columns are enough only while the columns are wide; with many tops it keeps three, or its chart runs over
			const tasteSpan = cols >= 6 ? 3 : cols >= 3 ? 2 : cols
			if (taste && tasteSpan === 2) taste.addClass('is-narrow')
			const used = blocks.reduce((n, el) => n + (el === taste ? tasteSpan : el.hasClass('library-diary-col') ? 1 : 0), 0)
			box.setCssProps({ '--stats-cols': String(cols) })
			this.renderActivity(box, cards, cols - used >= 1 ? cols - used : 0)
			if (box.childElementCount === blocks.length && blocks.length === 0) box.remove()
		} else if (box.parentElement) {
			const cells = blocks.reduce((n, el) => n + (el.hasClass('library-stats-taste') ? 3 : 1), 0)
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

	// The diary as a grid of days, the way GitHub draws contributions: the more logged that day, the stronger the cell.
	// It takes the rest of the second row; the cells stay small, and room left over shows older weeks.
	private renderActivity(box: HTMLElement, cards: CardData[], span: number): void {
		const today = todayIso()
		const counts = new Map<string, number>()
		// the notes behind each day, for its tooltip
		const titles = new Map<string, string[]>()
		let first = today
		for (const card of cards) {
			// a token's or a card's Date is when it was made, not anything the reader did
			const days = isCollectible(card.fm) ? logOf(card.fm).map(entry => entry.date) : activityDays(card.fm)
			for (const date of days) {
				if (date > today) continue
				counts.set(date, (counts.get(date) ?? 0) + 1)
				const names = titles.get(date) ?? []
				if (names.indexOf(card.name) < 0) names.push(card.name)
				titles.set(date, names)
				if (date < first) first = date
			}
		}
		if (counts.size === 0) return
		const end = new Date()
		end.setHours(0, 0, 0, 0)
		const back = Math.round((end.getTime() - new Date(`${first}T00:00:00`).getTime()) / 86400000)
		// as far back as the diary goes: a week, three months, half a year or a year
		const minWeeks = back < 7 ? 1 : back < 31 ? 13 : back < 92 ? 26 : 53

		const panel = box.createDiv({ cls: 'library-stats-col library-profile-panel library-activity' })
		if (span > 0) panel.setCssProps({ '--library-span': String(span) })
		else panel.addClass('is-full')
		const title = panel.createDiv({ cls: 'library-activity-title' })
		const months = panel.createDiv({ cls: 'library-activity-months' })
		const grid = panel.createDiv({ cls: 'library-activity-grid' })
		const gap = 3
		let drawn = 0
		const draw = (): void => {
			if (!panel.isConnected) return
			const width = grid.clientWidth
			if (width <= 0) return
			// the period's weeks at 10 to 18px a cell; the latest weeks only when the room is short, older ones when it is spare
			const cell = Math.max(10, Math.min(18, Math.floor((width + gap) / minWeeks) - gap))
			const weeks = Math.max(1, Math.min(53, Math.floor((width + gap) / (cell + gap))))
			if (weeks === drawn && panel.style.getPropertyValue('--library-cell') === `${String(cell)}px`) return
			drawn = weeks
			panel.setCssProps({ '--library-cell': `${String(cell)}px`, '--library-weeks': String(weeks) })
			const start = new Date(end)
			start.setDate(start.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7)
			const from = todayIso(start)
			let max = 0
			let total = 0
			for (const [date, n] of counts) {
				if (date < from) continue
				max = Math.max(max, n)
				total += n
			}
			title.empty()
			title.createSpan({ cls: 'library-activity-name', text: tr('stats.activity') })
			title.createSpan({ text: ` · ${trCount('stats.activity', total)}` })
			months.empty()
			grid.empty()
			let week = 0
			let month = -1
			let labelled = -3
			for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
				if (day.getDay() === 1 && day > start) week++
				// a month's name over its first whole week, unless the previous name is still too close
				if (day.getDay() === 1 && day.getMonth() !== month) {
					month = day.getMonth()
					if (week - labelled >= 3) {
						labelled = week
						const label = months.createSpan({ cls: 'library-activity-month', text: day.toLocaleDateString(getLanguage() + '-u-nu-latn', { month: 'short' }) })
						label.setCssProps({ '--library-week': String(week + 1) })
					}
				}
				const iso = todayIso(day)
				const n = counts.get(iso) ?? 0
				const level = n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(1, max)) * 4))
				const cell = grid.createDiv({ cls: `library-activity-day is-level-${String(level)}` })
				const names = titles.get(iso) ?? []
				const listed = names.length > 6 ? `${names.slice(0, 6).join(', ')} +${String(names.length - 6)}` : names.join(', ')
				const head = `${relativeDay(iso, today)}: ${trCount('stats.activity', n)}${names.length > 0 ? ` · ${trCount('stats.notes', names.length)}` : ''}`
				setTooltip(cell, listed ? `${head}\n${listed}` : head, { placement: 'top' })
			}
		}
		// kept on the renderer: an observer nothing holds can be collected and stop drawing
		this.activityObserver?.disconnect()
		if (typeof ResizeObserver !== 'undefined') {
			this.activityObserver = new ResizeObserver(() => draw())
			this.activityObserver.observe(panel)
		}
		window.requestAnimationFrame(() => draw())
	}

	private renderVotes(info: HTMLElement, fm: Record<string, unknown>): void {
		const row = info.createDiv({ cls: 'card-rating card-votes' })
		const reaction = toStr(fm.Reaction)
		const part = (line: HTMLElement, icon: string, field: string, cls = ''): void => {
			const span = line.createSpan({ cls: `card-vote${cls}` })
			setIcon(span.createSpan({ cls: 'card-vote-icon' }), icon)
			const value = Number(fm[field])
			if (fm[field] !== undefined && Number.isFinite(value)) span.createSpan({ text: compactNumber(value) })
		}
		part(row, 'thumbs-up', 'Likes', reaction === 'like' ? ' is-like' : '')
		part(row, 'thumbs-down', 'Dislikes', reaction === 'dislike' ? ' is-dislike' : '')
		// views on a line of their own: three counts overflow a narrow card
		if (Number(fm.Views) > 0) part(info.createDiv({ cls: 'card-year card-votes' }), 'eye', 'Views')
	}

	renderCard(grid: HTMLElement, card: CardData): void {
		const { file, fm } = card
		// album covers and NFTs are square, video thumbnails wide
		const cardEl = grid.createDiv({
			cls: card.kind === 'music' || toStr(fm.Source) === 'nft' ? 'library-card is-square' : toStr(fm.Source) === 'youtube' ? 'library-card is-wide' : 'library-card',
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

		const cover = card.cover || coverValue(fm, this.plugin.settings.coverProperty)
		const imgDiv = cardEl.createDiv({ cls: 'card-image' })
		let cardCover = coverSrc(this.app, cover)
		if (cardCover && isCollectible(fm)) cardCover = viaPinata(cardCover)
		// some NFT pictures are short videos
		if (cardCover && /\.(mp4|webm|mov)(\?|$)/i.test(cardCover)) {
			imgDiv.createEl('video', { attr: { src: cardCover, muted: '', loop: '', autoplay: '', playsinline: '', 'aria-label': card.name } })
		} else if (cardCover) {
			const img = imgDiv.createEl('img', { attr: { src: cardCover, alt: card.name, loading: 'lazy', decoding: 'async' } })
			// a token's "image" can be a video at an address with no extension or on an alternate IPFS gateway
			img.addEventListener('error', () => {
				if (!isCollectible(fm)) return
				const curSrc = img.getAttribute('src') || ''
				const ipfsMatch = /\/ipfs\/([^/?#]+(?:\/[^/?#]+)*)/i.exec(curSrc)
				if (ipfsMatch) {
					const ipfsPath = ipfsMatch[1]
					const gateways = ['https://gateway.pinata.cloud/ipfs/', 'https://cloudflare-ipfs.com/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/']
					const nextGw = gateways.find(gw => !curSrc.startsWith(gw))
					if (nextGw) {
						img.replaceWith(createEl('video', { attr: { src: `${nextGw}${ipfsPath}`, muted: '', loop: '', autoplay: '', playsinline: '', 'aria-label': card.name } }))
						return
					}
				}
				img.replaceWith(createEl('video', { attr: { src: viaPinata(curSrc || cardCover), muted: '', loop: '', autoplay: '', playsinline: '', 'aria-label': card.name } }))
			}, { once: false })
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
		if (card.kind === 'book' || card.kind === 'comic') {
			const formats = toStrArray(fm.Format).map(f => f.toLowerCase().trim())
			const hasAudio = formats.some(f => f === 'audiobook' || f === 'аудиокнига' || f === 'аудіокнига')
			const hasEbook = formats.some(f => f === 'ebook' || f === 'e-book' || f === 'электронная' || f === 'електронна' || f === 'digital')
			const hasPaper = formats.some(f => f === 'paper' || f === 'бумажная' || f === 'паперова' || f === 'print')
			if (hasAudio || hasEbook || hasPaper) {
				const badges = imgDiv.createDiv({ cls: 'card-format-badges' })
				if (hasAudio) {
					const b = badges.createSpan({
						cls: 'card-format-badge is-audiobook',
						attr: { 'role': 'img', 'aria-label': tr('format.audiobook'), 'title': tr('format.audiobook') }
					})
					setIcon(b, 'headphones')
				}
				if (hasEbook) {
					const b = badges.createSpan({
						cls: 'card-format-badge is-ebook',
						attr: { 'role': 'img', 'aria-label': tr('format.ebook'), 'title': tr('format.ebook') }
					})
					setIcon(b, 'tablet')
				}
				if (hasPaper) {
					const b = badges.createSpan({
						cls: 'card-format-badge is-paper',
						attr: { 'role': 'img', 'aria-label': tr('format.paper'), 'title': tr('format.paper') }
					})
					setIcon(b, 'book-open')
				}
			}
		}
		if (notStarted(fm, card.kind)) {
			const badge = imgDiv.createSpan({
				cls: 'card-unstarted',
				attr: { 'role': 'img', 'aria-label': tr('card.notStarted') }
			})
			setIcon(badge, 'eye')
		}
		const nftTokensCount = toStrArray(fm.Tokens).length
		const countNum = Math.max(Number(fm.Count) || 1, nftTokensCount)
		const isNft = toStr(fm.Source) === 'nft' || toStr(fm.Type) === 'NFT'
		const isSpam = fm.Spam === true || (isNft && fm.Spam !== false && looksLikeSpam(card.name, toStr(fm.Contract)))
		if (isSpam) {
			imgDiv.createDiv({ cls: 'card-badge-spam', text: tr('nft.spamBadge') })
		}
		if ((toStr(fm.Source) === 'nft' || isCollectible(fm)) && countNum > 1 && this.plugin.settings.nftDisplayMode !== 'all') {
			imgDiv.createSpan({
				cls: 'card-count-badge',
				text: `×${String(countNum)}`,
				attr: { title: `${String(countNum)} items`, 'aria-label': `${String(countNum)} items` }
			})
		}

		const percent = shownProgress(fm, card.kind)
		if (percent !== null && percent < 100) {
			const posterProgress = imgDiv.createDiv({ cls: 'card-poster-progress' })
			posterProgress.createDiv({ cls: 'card-poster-progress-fill' }).setCssProps({ '--library-progress': `${String(percent)}%` })
			const label = `${String(percent)}%`
			setTooltip(posterProgress, label, { placement: 'top' })
			posterProgress.setAttribute('title', label)
			posterProgress.setAttribute('aria-label', label)
		}

		const video = toStr(fm.Source) === 'youtube'

		// covers only: the name stays reachable on hover
		if (!this.plugin.settings.showCardInfo) {
			cardEl.setAttr('title', card.name)
			cardEl.addClass('is-cover-only')
			return
		}
		const info = cardEl.createDiv({ cls: 'card-info' })
		info.createDiv({ cls: 'card-title', text: card.name })

		const author = toStrArray(fm.Author || fm.Creator || fm.Director || fm.Artist).map(linkLabel).join(', ')
		if (author) info.createDiv({ cls: 'card-author', text: author })
		// a video shows the day it came out; a collection the Minted of its note, a token its own
		let dateLabel = ''
		if (video && toStr(fm.Published)) {
			dateLabel = toStr(fm.Published)
		} else if (isNft) {
			dateLabel = card.name.indexOf('#') < 0 ? toStr(fm.Minted) || latestNftMintDate(fm) : latestNftMintDate(fm, card.name)
		} else if (toStr(fm.Year)) {
			dateLabel = toStr(fm.Year)
		}
		if (dateLabel) info.createDiv({ cls: 'card-year', text: dateLabel })

		// a video: likes, dislikes and views where a score would be; your own like or dislike filled
		if (video) this.renderVotes(info, fm)
		// an NFT's star where a score would be: filled for a favorite; it is set in the note
		if (toStr(fm.Source) === 'nft') {
			const on = fm.Favorite === true
			const star = info.createDiv({ cls: 'card-rating card-favorite-row' }).createSpan({ cls: `card-favorite${on ? ' is-on' : ''}`, attr: on ? { 'role': 'img', 'aria-label': tr('header.favorite') } : { 'aria-hidden': 'true' } })
			setIcon(star, 'star')
		}


		const myRating = fm['My Rating'] ?? fm.Rating
		const imdb = fm['Rating IMDB']
		const rt = fm['Rating RT']
		const rawg = fm['Rating RAWG']
		const mc = fm['Rating MC']
		if (!video && (imdb || rt || rawg || mc || myRating)) {
			const parts: string[] = []
			if (imdb) parts.push('IMDb ' + toStr(imdb))
			if (rt) parts.push(RATING_RT_ICON + ' ' + toStr(rt) + '%')
			if (rawg) parts.push('RAWG ' + toStr(rawg))
			if (mc) parts.push('MC ' + toStr(mc))
			if (myRating) parts.push(toStr(myRating))
			info.createDiv({ cls: 'card-rating', text: parts.join(' | ') })
		}

		renderTrophies(info, fm, 'card-trophies')
	}
}

export class LibraryView extends ItemView {
	private plugin: LibraryPlugin
	private renderTimer: number | null = null
	// Paths shown last render: a note ceasing to be one must still trigger the render that drops it.
	// each shown note with its properties as drawn: a change to the note's text alone redraws nothing
	private shown = new Map<string, string>()

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
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const drawn = this.shown.get(file.path)
			if (drawn !== undefined ? drawn !== JSON.stringify(fm ?? null) : this.isLibraryNote(fm)) this.scheduleRender()
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
		// in the tab's header, right to left: each new action goes in front
		if (Object.keys(this.plugin.settings.nftWallets).length > 0) this.addAction('merge', tr('cmd.consolidateNft'), () => void this.plugin.consolidateNftNotes(true))
		this.addAction('link', tr('cmd.rebuildLinks'), () => void this.plugin.rebuildGraphLinks())
		this.addAction('files', tr('cmd.findDuplicates'), () => this.plugin.openDuplicates())
		this.addAction('database', tr('cmd.refreshAll'), () => void this.plugin.refreshAll())
		this.addAction('settings', tr('cmd.openSettings'), () => {
			const setting = (this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting
			setting.open()
			setting.openTabById(this.plugin.manifest.id)
		})
		// the map has its own command; this is the same thing one press away
		this.addAction('network', tr('cmd.libraryMap'), () => void this.plugin.buildLibraryMap())
		// one press, every platform: forces what would otherwise wait for the daily timers
		this.addAction('refresh-cw', tr('cmd.updateAll'), () => void this.plugin.updateAll())
		this.addAction('search', tr('cmd.searchLibrary'), () => this.plugin.openLibrarySearch())
		this.addAction('plus', tr('cmd.addContent'), () => this.plugin.openAddContent())
		this.render()
	}

	private scheduleRender(): void {
		if (this.renderTimer) window.clearTimeout(this.renderTimer)
		this.renderTimer = window.setTimeout(() => {
			// an open menu is not redrawn from under the cursor: the redraw waits until a choice closes it
			if (this.contentEl.querySelector('.library-sort-menu.open')) this.scheduleRender()
			else this.render()
		}, 300)
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
			for (const card of cards) this.shown.set(card.file.path, JSON.stringify(card.fm))
		}

		if (sections.length === 0) {
			root.createEl('p', { text: tr('view.empty') })
			return
		}

		// Not-started may live in Up next alone only while that block is on.
		const settings = this.plugin.settings
		const everything = sections.reduce((all, section) => all.concat(section.cards), [] as CardData[])
		this.r.renderStats(root, everything)

		const upNextOnly = settings.showUpNext && !settings.upNextInCategories
		let rendered = 0
		const upNext: { category: string, card: CardData }[] = []
		const inUpNext = (category: ICategory): boolean => settings.upNextHidden.indexOf(category.name) < 0
		for (const { category, cards } of sections) {
			if (!inUpNext(category)) continue
			for (const card of cards) if (notStarted(card.fm, card.kind)) upNext.push({ category: category.name, card })
		}
		const renderCategory = (category: ICategory, cards: CardData[]): void => {
			// a category kept out of Up next keeps its unstarted titles
			const shown = upNextOnly && inUpNext(category) ? cards.filter(card => !notStarted(card.fm, card.kind)) : cards
			if (shown.length === 0) return
			rendered++
			const chosen = settings.filterState[category.name] ?? {}
			this.renderSection(root, {
				title: categoryLabel(category),
				sortId: category.name,
				defaultSort: { key: 'name', asc: true },
				kind: category.contentType,
				category,
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
		const renderUpNext = (): void => {
			if (!settings.showUpNext || upNext.length === 0) return
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
		// the order set in Settings > Categories, Soon and Up next among them
		const byCategory = new Map(sections.map(section => [section.category, section.cards] as [ICategory, CardData[]]))
		for (const entry of sectionOrder(settings.categories, settings.soonAt, settings.upNextAt)) {
			if (entry === '@soon') { if (settings.showComingSoon) this.r.renderComingSoon(root, everything) }
			else if (entry === '@upNext') renderUpNext()
			else {
				const cards = byCategory.get(entry)
				if (cards) renderCategory(entry, cards)
			}
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

	// Only values some card has; a filter shows with 2+ values (a format with 1) or a chosen one.
	private sectionFilters(toolbar: HTMLElement, filters: NonNullable<SectionSpec['filters']>): void {
		// an NFT's platform is its blockchain
		const nft = filters.all.length > 0 && filters.all.every(card => card.fm.Source === 'nft')
		const groups = FACETS.map(({ facet, label: base }) => {
			const label = nft && facet === 'platform' ? 'filter.chain' : nft && facet === 'artist' ? 'header.collection' : base
			const counts = new Map<string, number>()
			for (const card of filters.all) {
				for (const value of facetValues(card, facet)) counts.set(value, (counts.get(value) ?? 0) + 1)
			}
			const values = [...counts.keys()].sort((a, b) => facet === 'year' ? Number(b) - Number(a) : a.localeCompare(b))
			return { facet, label, counts, values, chosen: filters.chosen[facet] ?? '' }
		// a book's format shows from its first value: the other formats are not marked yet
		}).filter(group => group.counts.size >= (group.facet === 'format' ? 1 : 2) || group.chosen)
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
			if (group.chosen) head.createSpan({ cls: 'library-filter-group-value', text: group.facet === 'format' ? formatLabel(group.chosen) : group.chosen })
			const chevron = head.createSpan({ cls: 'library-filter-group-chevron' })
			setIcon(chevron, 'chevron-right')
			const list = menu.createDiv({ cls: 'library-filter-values' })
			for (const value of ['', ...group.values]) {
				const item = list.createEl('button', {
					cls: 'library-sort-menu-item',
					text: value ? `${group.facet === 'format' ? formatLabel(value) : value} · ${formatNumber(group.counts.get(value) ?? 0)}` : tr('filter.all')
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

	private sectionMeta(row: HTMLElement, cards: CardData[], kind?: ContentType, category?: ICategory): void {
		let totalNftTokens = 0
		if (category?.typeValue === NFT_CATEGORY || category?.name === NFT_CATEGORY) {
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (isTemplateFile(file.path)) continue
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
				if (!fm || (fm.Type !== 'NFT' && toStr(fm.Source) !== 'nft')) continue
				const tLen = toStrArray(fm.Tokens).length
				totalNftTokens += Math.max(tLen, Number(fm.Count) || 1)
			}
		}

		let countText = formatNumber(cards.length)
		let titleAttr = `${countText} ${trCount('stats.works', cards.length)}`
		if (totalNftTokens > 0) {
			if (totalNftTokens !== cards.length) {
				countText = `${formatNumber(cards.length)} (${formatNumber(totalNftTokens)})`
			} else {
				countText = formatNumber(totalNftTokens)
			}
			titleAttr = `${formatNumber(cards.length)} cards, ${formatNumber(totalNftTokens)} total NFTs`
		}

		row.createSpan({
			cls: 'library-section-count',
			text: countText,
			attr: { 'aria-label': titleAttr, title: titleAttr }
		})
		if (kind !== 'movie' && kind !== 'series' && kind !== 'anime' && kind !== 'music' && kind !== 'game' && kind !== 'manual' && kind !== 'book') return
		let minutes = 0
		// of books only the audiobooks have a time: what was listened to
		for (const card of cards) if (kind !== 'book' || isAudiobook(card.fm)) minutes += spentMinutes(card.fm, card.kind)
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
		this.sectionMeta(toolbar, cards, spec.kind, spec.category)
		if (spec.filters) this.sectionFilters(toolbar, spec.filters)
		toolbar.createDiv({ cls: 'library-toolbar-spacer' })

		if (spec.category) {
			const mapBtn = toolbar.createEl('button', {
				cls: 'library-category-map-btn',
				attr: {
					'aria-label': tr('cmd.categoryMap', { category: spec.title }),
					'title': tr('cmd.categoryMap', { category: spec.title })
				}
			})
			setIcon(mapBtn, 'network')
			mapBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				void this.plugin.buildCategoryMap(spec.category!)
			})

			// the category's connected services and sources, pulled again
			const syncBtn = toolbar.createEl('button', {
				cls: 'library-category-map-btn',
				attr: { 'aria-label': tr('cmd.categorySync', { category: spec.title }) }
			})
			setTooltip(syncBtn, tr('cmd.categorySync', { category: spec.title }), { placement: 'top' })
			setIcon(syncBtn, 'refresh-cw')
			syncBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				if (this.plugin.categorySyncing) return
				syncBtn.addClass('is-syncing')
				const done = (): void => { syncBtn.removeClass('is-syncing') }
				void this.plugin.syncCategory(spec.category!).then(done, done)
			})
		}

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

		// tokens have no year, rating or progress: their own keys instead
		const collectibles = cards.length > 0 && cards.every(card => isCollectible(card.fm))
		const sortOptions: { label: string; key: SortKey }[] = collectibles ? [
			{ label: tr('sort.name'), key: 'name' },
			{ label: tr('header.minted'), key: 'minted' },
			{ label: tr('sort.modified'), key: 'modified' },
			{ label: tr('header.favorite'), key: 'favorite' },
		] : [
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
		// Date and Minted are one date on a token: an older choice of Date reads as Minted
		if (collectibles && restored.key === 'date') restored.key = 'minted'
		const fallback = sortOptions.some(o => o.key === spec.defaultSort.key) ? spec.defaultSort : { key: 'date' as SortKey, asc: false }
		const savedSort = sortOptions.some(o => o.key === restored.key) ? restored : fallback
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
					case 'date': {
						if (!a.date && !b.date) return a.name.localeCompare(b.name)
						if (!a.date) return 1
						if (!b.date) return -1
						cmp = a.date - b.date
						break
					}
					case 'modified': cmp = a.file.stat.mtime - b.file.stat.mtime; break
					case 'played': cmp = parseDate(a.fm['Last Played']) - parseDate(b.fm['Last Played']); break
					case 'progress': cmp = progressOf(a) - progressOf(b) || a.name.localeCompare(b.name); break
					case 'chain': cmp = toStrArray(a.fm.Platforms).join().localeCompare(toStrArray(b.fm.Platforms).join()) || a.name.localeCompare(b.name); break
					case 'favorite':
						cmp = Number(a.fm.Favorite === true) - Number(b.fm.Favorite === true)
						if (cmp === 0) return a.name.localeCompare(b.name)
						break
					case 'minted': {
						const mintA = a.date || getNftMintTimestamp(a.fm)
						const mintB = b.date || getNftMintTimestamp(b.fm)
						if (!mintA && !mintB) {
							return a.name.localeCompare(b.name)
						} else if (!mintA) {
							return 1
						} else if (!mintB) {
							return -1
						} else {
							cmp = mintA - mintB
							if (cmp === 0) cmp = a.date - b.date
							if (cmp === 0) cmp = a.name.localeCompare(b.name)
						}
						break
					}
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
