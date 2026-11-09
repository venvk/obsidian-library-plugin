import { App, Modal } from 'obsidian'
import { tr, trCount } from '../i18n'
import type { SetCard } from '../providers/collectibles'

// The cards of a set not in the library yet; a click adds one.
export class MissingModal extends Modal {
	private title: string
	private load: () => Promise<SetCard[]>
	private onPick: (card: SetCard) => void

	constructor(app: App, title: string, load: () => Promise<SetCard[]>, onPick: (card: SetCard) => void) {
		super(app)
		this.title = title
		this.load = load
		this.onPick = onPick
	}

	onOpen(): void {
		this.setTitle(this.title)
		const status = this.contentEl.createDiv({ cls: 'library-cover-status', text: tr('collection.loading') })
		const grid = this.contentEl.createDiv({ cls: 'library-cover-grid' })
		void this.load().then(cards => {
			status.setText(cards.length === 0 ? tr('collection.complete') : trCount('collection.missing', cards.length))
			for (const card of cards) {
				const item = grid.createEl('button', { cls: 'library-cover-item', attr: { 'aria-label': card.name } })
				if (card.image) item.createEl('img', { attr: { src: card.image, alt: '', loading: 'lazy' } })
				item.createDiv({ cls: 'library-cover-size', text: `#${card.number} ${card.name}` })
				item.addEventListener('click', () => {
					item.remove()
					this.onPick(card)
				})
			}
		})
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
