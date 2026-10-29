import { App, SuggestModal, setIcon } from 'obsidian'
import type { ContentProvider, ContentType, SearchResult } from '../providers/types'
import { tr } from '../i18n'
import { safeUrl } from '../util'

export class AddContentModal extends SuggestModal<SearchResult> {
	private provider: ContentProvider
	private type: ContentType
	private onPick: (result: SearchResult) => void
	private initial: string
	private debounceTimer: number | null = null
	private cache = new Map<string, SearchResult[]>()

	constructor(
		app: App,
		provider: ContentProvider,
		type: ContentType,
		onPick: (result: SearchResult) => void,
		initial = ''
	) {
		super(app)
		this.provider = provider
		this.type = type
		this.onPick = onPick
		this.initial = initial
		this.setPlaceholder(tr('modal.search.placeholder'))
	}

	onOpen(): void {
		void super.onOpen()
		if (!this.initial) return
		this.inputEl.value = this.initial
		this.inputEl.dispatchEvent(new Event('input'))
	}

	async getSuggestions(query: string): Promise<SearchResult[]> {
		const trimmed = query.trim()
		if (trimmed.length < 2) return []
		const cached = this.cache.get(trimmed)
		if (cached) return cached

		await new Promise<void>((resolve) => {
			if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
			this.debounceTimer = window.setTimeout(resolve, 300)
		})

		try {
			const results = await this.provider.search(trimmed, this.type)
			this.cache.set(trimmed, results)
			return results
		} catch (e) {
			console.error('Library: search error', e)
			return []
		}
	}

	renderSuggestion(result: SearchResult, el: HTMLElement): void {
		el.addClass('library-suggest')
		const cover = safeUrl(result.cover)
		if (cover) {
			const img = el.createEl('img', { cls: 'library-suggest-cover' })
			img.addEventListener('error', () => img.remove())
			img.src = cover
		}
		const info = el.createDiv({ cls: 'library-suggest-info' })
		info.createDiv({ cls: 'library-suggest-title', text: result.title })
		const meta = [result.year ? String(result.year) : '', result.subtitle ?? '']
			.filter(Boolean)
			.join(' · ')
		if (meta) info.createDiv({ cls: 'library-suggest-meta', text: meta })
	}

	onChooseSuggestion(result: SearchResult): void {
		this.onPick(result)
	}
}

// Search everywhere: every medium at once, a group per medium, in this order.
const ORDER: ContentType[] = ['movie', 'series', 'anime', 'book', 'comic', 'music', 'game']
const PER_MEDIUM = 6
// a pause after typing, or Enter, starts the search
const PAUSE_MS = 1000

export interface Found {
	type: ContentType
	result: SearchResult
	// first of its medium: carries the group's heading
	head: boolean
	// a folded medium shows its heading alone, with how many it found
	folded?: number
}

export interface SearchEverythingOptions {
	providerFor: (type: ContentType) => ContentProvider | undefined
	// source ids of titles already in the library: left out
	known: Set<string>
	folded: (type: ContentType) => boolean
	toggle: (type: ContentType) => void
	onPick: (type: ContentType, result: SearchResult) => void
}

export class SearchEverythingModal extends SuggestModal<Found> {
	private timer: number | null = null
	// the query typed last, what its search found so far, and whether it started
	private query = ''
	private found = new Map<ContentType, Found[]>()
	private started = false
	// what Enter does until the first answer: ends the pause early, then nothing,
	// so it can't pick a result of the last query
	private go: (() => void) | null = null
	// bumped by every new query; an older search's answers are dropped
	private latest = 0
	// a heading folded or unfolded: kept where it was on screen through the redraw
	private anchor: { type: ContentType; top: number } | null = null

	constructor(app: App, private options: SearchEverythingOptions) {
		super(app)
		this.setPlaceholder(tr('modal.search.placeholder'))
		// Enter during the pause searches at once; with results shown it picks one as usual
		this.inputEl.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' || !this.go) return
			event.preventDefault()
			event.stopImmediatePropagation()
			this.go()
		}, true)
	}

	async getSuggestions(input: string): Promise<Found[]> {
		const query = input.trim()
		// a medium's answer arrived, or a heading folded: redraw without jumping to the top
		if (query === this.query && this.started) {
			this.keepPlace()
			return this.shown()
		}
		const turn = ++this.latest
		if (this.timer) window.clearTimeout(this.timer)
		this.query = query
		this.found = new Map()
		this.started = false
		this.go = null
		// the list of the last search would stay up, and Enter would pick from it
		this.resultContainerEl.empty()
		if (query.length < 2) return []

		// an older call still waiting never settles
		await new Promise<void>((resolve) => {
			this.go = resolve
			this.timer = window.setTimeout(resolve, PAUSE_MS)
		})
		if (turn !== this.latest) return new Promise<Found[]>(() => undefined)
		if (this.timer) window.clearTimeout(this.timer)
		this.go = () => undefined
		this.started = true

		// each medium shows as soon as it answers, in the fixed order
		return new Promise<Found[]>((resolve) => {
			let first = true
			for (const type of ORDER) {
				const provider = this.options.providerFor(type)
				const search = provider ? provider.search(query, type) : Promise.resolve([])
				void search.catch((e: unknown) => {
					console.error('Library: search error', type, e)
					return [] as SearchResult[]
				}).then((results) => {
					if (turn !== this.latest) return
					const fresh = results.filter(result => !this.options.known.has(result.sourceId)).slice(0, PER_MEDIUM)
					this.found.set(type, fresh.map((result, i) => ({ type, result, head: i === 0 })))
					if (first) {
						first = false
						this.go = null
						resolve(this.shown())
					} else {
						this.inputEl.dispatchEvent(new Event('input'))
					}
				})
			}
		})
	}

	private shown(): Found[] {
		const out: Found[] = []
		for (const type of ORDER) {
			const list = this.found.get(type) ?? []
			const first = list[0]
			if (!first) continue
			if (this.options.folded(type)) out.push({ ...first, folded: list.length })
			else out.push(...list)
		}
		return out
	}

	private toggle(type: ContentType): void {
		const head = this.resultContainerEl.querySelector(`.library-suggest-group[data-type="${type}"]`)
		if (head) this.anchor = { type, top: head.getBoundingClientRect().top }
		this.options.toggle(type)
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
			const head = anchor ? list.querySelector(`.library-suggest-group[data-type="${anchor.type}"]`) : null
			if (anchor && head) list.scrollTop += head.getBoundingClientRect().top - anchor.top
		}, 0)
	}

	// a heading folds or unfolds its medium and keeps the search open
	selectSuggestion(found: Found, evt: MouseEvent | KeyboardEvent): void {
		if (found.folded !== undefined) this.toggle(found.type)
		else super.selectSuggestion(found, evt)
	}

	renderSuggestion(found: Found, el: HTMLElement): void {
		if (found.head) {
			const head = el.createDiv({ cls: 'library-suggest-group', attr: { 'data-type': found.type, 'aria-expanded': found.folded === undefined ? 'true' : 'false' } })
			setIcon(head.createSpan({ cls: 'library-suggest-group-chevron' }), found.folded === undefined ? 'chevron-down' : 'chevron-right')
			head.createSpan({ text: tr(`settings.default.${found.type}`) })
			if (found.folded !== undefined) {
				head.createSpan({ cls: 'library-suggest-group-count', text: String(found.folded) })
				return
			}
			// the heading sits on the first title: a click on it folds, not picks
			head.addEventListener('click', (event) => {
				event.preventDefault()
				event.stopPropagation()
				this.toggle(found.type)
			})
		}
		const row = el.createDiv({ cls: found.type === 'music' ? 'library-suggest is-square' : 'library-suggest' })
		const { result } = found
		const cover = safeUrl(result.cover)
		if (cover) {
			const img = row.createEl('img', { cls: 'library-suggest-cover' })
			img.addEventListener('error', () => img.remove())
			img.src = cover
		}
		const info = row.createDiv({ cls: 'library-suggest-info' })
		// a long title is cut short, its kind is not
		const title = info.createDiv({ cls: 'library-suggest-title has-kind' })
		title.createSpan({ cls: 'library-suggest-name', text: result.title })
		if (result.kind) title.createSpan({ cls: 'library-suggest-kind', text: tr(`kind.${result.kind}`) })
		const meta = [result.year ? String(result.year) : '', result.subtitle ?? '']
			.filter(Boolean)
			.join(' · ')
		if (meta) info.createDiv({ cls: 'library-suggest-meta', text: meta })
	}

	onChooseSuggestion(found: Found): void {
		this.options.onPick(found.type, found.result)
	}
}
