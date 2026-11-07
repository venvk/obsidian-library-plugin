import { App, Modal, Setting } from 'obsidian'
import { tr } from '../i18n'
import { safeUrl } from '../util'

// Covers found for a note, each with its size once loaded; a click or a pasted link becomes the cover.
export class CoverModal extends Modal {
	private load: () => Promise<string[]>
	private onPick: (url: string) => void

	constructor(app: App, load: () => Promise<string[]>, onPick: (url: string) => void) {
		super(app)
		this.load = load
		this.onPick = onPick
	}

	onOpen(): void {
		const { contentEl } = this
		this.setTitle(tr('cover.choose'))
		const grid = contentEl.createDiv({ cls: 'library-cover-grid' })
		const status = grid.createDiv({ cls: 'library-cover-status', text: tr('cover.loading') })
		const pick = (url: string): void => {
			this.close()
			this.onPick(url)
		}
		void this.load().then(urls => {
			status.remove()
			if (urls.length === 0) grid.createDiv({ cls: 'library-cover-status', text: tr('cover.none') })
			for (const url of urls) {
				const item = grid.createEl('button', { cls: 'library-cover-item' })
				const img = item.createEl('img', { attr: { src: url, alt: '', loading: 'lazy' } })
				const size = item.createDiv({ cls: 'library-cover-size' })
				img.addEventListener('load', () => size.setText(`${String(img.naturalWidth)}×${String(img.naturalHeight)}`))
				// a dead link or a 1×1 placeholder is no cover
				img.addEventListener('error', () => item.remove())
				img.addEventListener('load', () => { if (img.naturalWidth < 20) item.remove() })
				item.addEventListener('click', () => pick(url))
			}
		})

		let typed = ''
		new Setting(contentEl)
			.setName(tr('cover.paste'))
			.addText(text => text.onChange(value => { typed = value }))
			.addButton(button => button.setButtonText(tr('cover.use')).setCta().onClick(() => {
				const url = safeUrl(typed.trim())
				if (url) pick(url)
			}))
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
