import { App, SuggestModal, TFile, prepareSimpleSearch, setIcon } from 'obsidian'
import { formatNumber, tr } from '../i18n'
import { toStr, toStrArray } from '../util'

// The library's own notes, a group per category in the library's order.
const PER_CATEGORY = 10
// a pause after typing, a finished word, or Enter starts the search
const PAUSE_MS = 1000

export interface LibraryGroup {
	// what the fold is remembered by
	key: string
	label: string
	files: TFile[]
	// albums, videos and tokens have square covers, the rest posters
	square: boolean
}

interface Hit {
	file: TFile
	// the group's place in the list: its heading is found by it
	group: number
	// first of its category: carries the group's heading
	head: boolean
	// how many notes of the category match, shown on a folded heading
	total: number
	folded: boolean
}

export interface LibrarySearchOptions {
	folded: (key: string) => boolean
	toggle: (key: string) => void
	// the note's cover as an image address, null without one
	coverOf: (file: TFile) => string | null
	onPick: (file: TFile) => void
}

export class LibrarySearchModal extends SuggestModal<Hit> {
	private timer: number | null = null
	// the query typed last, what it found, and whether its search ran
	private query = ''
	private found: Hit[][] = []
	private started = false
	// Enter during the pause ends it early
	private go: (() => void) | null = null
	// bumped by every new query; an older one's pause is dropped
	private latest = 0
	// a heading folded or unfolded: kept where it was on screen through the redraw
	private anchor: { group: number; top: number } | null = null
	// what a note is searched by, read once per note while the search is open
	private texts = new Map<TFile, { title: string; all: string }>()

	constructor(app: App, private groups: LibraryGroup[], private options: LibrarySearchOptions) {
		super(app)
		this.setPlaceholder(tr('modal.searchLibrary'))
		// room for every category's share: the modal's own cap would cut the last ones
		this.limit = groups.length * PER_CATEGORY
		this.inputEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' || !this.go) return
			event.preventDefault()
			event.stopImmediatePropagation()
			this.go()
		}, true)
	}

	async getSuggestions(input: string): Promise<Hit[]> {
		const query = input.trim()
		// a heading folded: redraw without jumping to the top
		if (query === this.query && this.started) {
			this.keepPlace()
			return this.shown()
		}
		const turn = ++this.latest
		if (this.timer) window.clearTimeout(this.timer)
		this.query = query
		this.found = []
		this.started = false
		this.go = null
		// the list of the last search would stay up, and Enter would pick from it
		this.resultContainerEl.empty()
		if (query.length < 2) return []

		// a space after the word means it is finished: no need to wait
		if (!/\s$/.test(input)) {
			await new Promise<void>((resolve) => {
				this.go = resolve
				this.timer = window.setTimeout(resolve, PAUSE_MS)
			})
			// an older call still waiting never settles
			if (turn !== this.latest) return new Promise<Hit[]>(() => undefined)
			if (this.timer) window.clearTimeout(this.timer)
			this.go = null
		}
		this.started = true
		this.found = this.search(query)
		return this.shown()
	}

	// The matches of each category: a note found by its title first, then one found by its creator, id or contract.
	private search(query: string): Hit[][] {
		// every word of the query, anywhere in the text
		const match = prepareSimpleSearch(query)
		return this.groups.map((group, index) => {
			const scored: { file: TFile; score: number }[] = []
			for (const file of group.files) {
				const text = this.textOf(file)
				const byTitle = match(text.title)
				const found = byTitle ?? match(text.all)
				// a simple search scores at most 0: a title match is lifted above every other
				if (found) scored.push({ file, score: found.score + (byTitle ? 1000 : 0) })
			}
			scored.sort((a, b) => b.score - a.score)
			return scored.slice(0, PER_CATEGORY).map((hit, i) => ({ file: hit.file, group: index, head: i === 0, total: scored.length, folded: false }))
		})
	}

	private textOf(file: TFile): { title: string; all: string } {
		let text = this.texts.get(file)
		if (!text) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const title = [toStr(fm?.Name), file.basename].filter(Boolean).join(' ')
			text = {
				title,
				all: [
					title, toStr(fm?.Contract), toStr(fm?.['Source ID']), toStr(fm?.['Token ID']),
					toStrArray(fm?.Tokens).join(' '), toStrArray(fm?.Creator).join(' ')
				].filter(Boolean).join(' ')
			}
			this.texts.set(file, text)
		}
		return text
	}

	private shown(): Hit[] {
		const out: Hit[] = []
		this.found.forEach((list, index) => {
			const first = list[0]
			if (!first) return
			if (this.options.folded(this.groups[index]?.key ?? '')) out.push({ ...first, folded: true })
			else out.push(...list)
		})
		return out
	}

	private toggle(group: number): void {
		const head = this.resultContainerEl.querySelector(`.library-suggest-group[data-type="g${String(group)}"]`)
		if (head) this.anchor = { group, top: head.getBoundingClientRect().top }
		this.options.toggle(this.groups[group]?.key ?? '')
		this.inputEl.dispatchEvent(new Event('input'))
	}

	// the list is rebuilt from the top after the returned suggestions render
	private keepPlace(): void {
		const list = this.resultContainerEl
		const scroll = list.scrollTop
		const anchor = this.anchor
		this.anchor = null
		window.setTimeout(() => {
			list.scrollTop = scroll
			const head = anchor ? list.querySelector(`.library-suggest-group[data-type="g${String(anchor.group)}"]`) : null
			if (anchor && head) list.scrollTop += head.getBoundingClientRect().top - anchor.top
		}, 0)
	}

	// a heading folds or unfolds its category and keeps the search open
	selectSuggestion(hit: Hit, evt: MouseEvent | KeyboardEvent): void {
		if (hit.folded) this.toggle(hit.group)
		else super.selectSuggestion(hit, evt)
	}

	renderSuggestion(hit: Hit, el: HTMLElement): void {
		if (hit.head) {
			const head = el.createDiv({ cls: 'library-suggest-group', attr: { 'data-type': `g${String(hit.group)}`, 'aria-expanded': hit.folded ? 'false' : 'true' } })
			setIcon(head.createSpan({ cls: 'library-suggest-group-chevron' }), hit.folded ? 'chevron-right' : 'chevron-down')
			head.createSpan({ text: this.groups[hit.group]?.label ?? '' })
			head.createSpan({ cls: 'library-suggest-group-count', text: formatNumber(hit.total) })
			if (hit.folded) return
			// the heading sits on the first note: a click on it folds, not opens
			head.addEventListener('click', (event) => {
				event.preventDefault()
				event.stopPropagation()
				this.toggle(hit.group)
			})
		}
		const fm = this.app.metadataCache.getFileCache(hit.file)?.frontmatter
		const row = el.createDiv({ cls: this.groups[hit.group]?.square ? 'library-suggest is-square' : 'library-suggest' })
		// a small cover, loaded only when its row is on screen; a note without one keeps the titles in line
		const cover = this.options.coverOf(hit.file)
		const blank = (): HTMLElement => createDiv({ cls: 'library-suggest-cover' })
		if (cover) {
			const img = row.createEl('img', { cls: 'library-suggest-cover', attr: { src: cover, alt: '', loading: 'lazy', decoding: 'async' } })
			img.addEventListener('error', () => img.replaceWith(blank()))
		} else row.appendChild(blank())
		const info = row.createDiv({ cls: 'library-suggest-info' })
		info.createDiv({ cls: 'library-suggest-title', text: toStr(fm?.Name) || hit.file.basename })

		const parts: string[] = []
		if (fm?.Year) parts.push(toStr(fm.Year))
		if (fm?.Contract) parts.push(toStr(fm.Contract))
		else if (fm?.['Source ID']) parts.push(toStr(fm['Source ID']))
		const tokens = toStrArray(fm?.Tokens).length
		if (tokens > 0) parts.push(`${formatNumber(tokens)} ${tr('header.tokens')}`)
		if (parts.length > 0) info.createDiv({ cls: 'library-suggest-meta', text: parts.join(' · ') })
	}

	onChooseSuggestion(hit: Hit): void {
		this.options.onPick(hit.file)
	}
}
