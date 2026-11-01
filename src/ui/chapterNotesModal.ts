import { App, Modal, Setting } from 'obsidian'
import { tr } from '../i18n'

// Thoughts and quotes on one chapter, typed without leaving the note's reading view.
export class ChapterNotesModal extends Modal {
	private title: string
	private initial: string
	private onSubmit: (notes: string) => void

	constructor(app: App, title: string, initial: string, onSubmit: (notes: string) => void) {
		super(app)
		this.title = title
		this.initial = initial
		this.onSubmit = onSubmit
	}

	onOpen(): void {
		const { contentEl } = this
		this.setTitle(this.title)
		const input = contentEl.createEl('textarea', { cls: 'library-chapters-input', attr: { rows: '10', placeholder: tr('header.chapterNotes') } })
		input.value = this.initial
		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText(tr('modal.save'))
				.setCta()
				.onClick(() => {
					this.onSubmit(input.value)
					this.close()
				})
		)
		input.focus()
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
