import { App, SuggestModal } from 'obsidian'
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
// a word typed and then a pause, or a space, starts the search
const PAUSE_MS = 1000

export interface Found {
	type: ContentType
	result: SearchResult
	// first of its medium: carries the group's heading
	head: boolean
}

export class SearchEverythingModal extends SuggestModal<Found> {
	private timer: number | null = null
	private cache = new Map<string, Found[]>()

	constructor(
		app: App,
		private providerFor: (type: ContentType) => ContentProvider | undefined,
		private onPick: (type: ContentType, result: SearchResult) => void
	) {
		super(app)
		this.setPlaceholder(tr('modal.search.placeholder'))
	}

	async getSuggestions(query: string): Promise<Found[]> {
		const trimmed = query.trim()
		if (trimmed.length < 2) return []
		const cached = this.cache.get(trimmed)
		if (cached) return cached

		// an older call still waiting is dropped: its promise never settles
		if (this.timer) window.clearTimeout(this.timer)
		if (!/\s$/.test(query)) {
			await new Promise<void>((resolve) => { this.timer = window.setTimeout(resolve, PAUSE_MS) })
		}

		const groups = await Promise.all(ORDER.map(async (type): Promise<Found[]> => {
			const provider = this.providerFor(type)
			if (!provider) return []
			try {
				const results = (await provider.search(trimmed, type)).slice(0, PER_MEDIUM)
				return results.map((result, i) => ({ type, result, head: i === 0 }))
			} catch (e) {
				console.error('Library: search error', type, e)
				return []
			}
		}))
		const found = groups.reduce((all, group) => all.concat(group), [] as Found[])
		this.cache.set(trimmed, found)
		return found
	}

	renderSuggestion(found: Found, el: HTMLElement): void {
		if (found.head) el.createDiv({ cls: 'library-suggest-group', text: tr(`settings.default.${found.type}`) })
		const row = el.createDiv({ cls: found.type === 'music' ? 'library-suggest is-square' : 'library-suggest' })
		const { result } = found
		const cover = safeUrl(result.cover)
		if (cover) {
			const img = row.createEl('img', { cls: 'library-suggest-cover' })
			img.addEventListener('error', () => img.remove())
			img.src = cover
		}
		const info = row.createDiv({ cls: 'library-suggest-info' })
		const title = info.createDiv({ cls: 'library-suggest-title', text: result.title })
		if (result.kind) title.createSpan({ cls: 'library-suggest-kind', text: tr(`kind.${result.kind}`) })
		const meta = [result.year ? String(result.year) : '', result.subtitle ?? '']
			.filter(Boolean)
			.join(' · ')
		if (meta) info.createDiv({ cls: 'library-suggest-meta', text: meta })
	}

	onChooseSuggestion(found: Found): void {
		this.onPick(found.type, found.result)
	}
}
