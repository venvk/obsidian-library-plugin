import { App, Modal, Setting } from 'obsidian'
import { tr } from '../i18n'

export class ChaptersModal extends Modal {
	private onSubmit: (chapters: string[] | number) => void
	private initial: string[]

	// initial: the chapters already there, one per line, to edit instead of typing anew
	constructor(app: App, onSubmit: (chapters: string[] | number) => void, initial: string[] = []) {
		super(app)
		this.onSubmit = onSubmit
		this.initial = initial
	}

	onOpen(): void {
		const { contentEl } = this
		this.setTitle(tr(this.initial.length > 0 ? 'header.editChapters' : 'header.addChapters'))
		contentEl.createEl('p', { text: tr('modal.chaptersHint') })
		const input = contentEl.createEl('textarea', { cls: 'library-chapters-input', attr: { rows: '8' } })
		input.value = this.initial.join('\n')
		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText(tr(this.initial.length > 0 ? 'modal.save' : 'modal.manualCreate'))
				.setCta()
				.onClick(() => {
					const lines = input.value.split('\n').map((line) => line.trim()).filter(Boolean)
					const only = lines[0] ?? ''
					const chapters = lines.length === 1 && /^\d+$/.test(only) ? Number(only) : lines
					if ((typeof chapters === 'number' && chapters > 0) || (Array.isArray(chapters) && chapters.length > 0)) {
						this.onSubmit(chapters)
						this.close()
					}
				})
		)
		input.focus()
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
