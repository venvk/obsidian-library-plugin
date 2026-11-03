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
		const submit = (): void => {
			const rawLines = input.value.split('\n').map((line) => line.trim())
			while (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop()
			const lines = this.initial.length > 0 ? rawLines : rawLines.filter(Boolean)
			const only = lines[0] ?? ''
			const chapters = lines.length === 1 && /^\d+$/.test(only) ? Number(only) : lines
			if ((typeof chapters === 'number' && chapters > 0) || (Array.isArray(chapters) && chapters.length > 0)) {
				this.onSubmit(chapters)
				this.close()
			}
		}
		input.addEventListener('keydown', (e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				e.preventDefault()
				submit()
			}
		})
		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText(tr(this.initial.length > 0 ? 'modal.save' : 'modal.manualCreate'))
				.setCta()
				.onClick(() => submit())
		)
		input.focus()
	}

	onClose(): void {
		this.contentEl.empty()
	}
}
