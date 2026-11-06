import { App, FuzzyMatch, FuzzySuggestModal, TFile } from 'obsidian'
import { formatNumber, tr } from '../i18n'
import { toStr, toStrArray } from '../util'

export class LibrarySearchModal extends FuzzySuggestModal<TFile> {
	private files: TFile[]
	private onPick: (file: TFile) => void

	constructor(app: App, files: TFile[], onPick: (file: TFile) => void) {
		super(app)
		this.files = files
		this.onPick = onPick
		this.setPlaceholder(tr('modal.searchLibrary'))
	}

	getItems(): TFile[] {
		return this.files
	}

	getItemText(file: TFile): string {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const name = toStr(fm?.Name) || file.basename
		const contract = toStr(fm?.Contract)
		const sourceId = toStr(fm?.['Source ID'])
		const tokens = toStrArray(fm?.Tokens).join(' ')
		const singleToken = toStr(fm?.['Token ID'])
		const creators = toStrArray(fm?.Creator).join(' ')
		return [name, contract, sourceId, singleToken, tokens, creators, file.basename].filter(Boolean).join(' ')
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
		el.empty()
		const file = match.item
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const name = toStr(fm?.Name) || file.basename
		const row = el.createDiv({ cls: 'library-search-suggestion' })
		const title = row.createDiv({ cls: 'suggestion-title' })
		title.setText(name)

		const subParts: string[] = []
		if (fm?.Type) subParts.push(String(fm.Type))
		if (fm?.Year) subParts.push(String(fm.Year))
		if (fm?.Contract) subParts.push(String(fm.Contract))
		else if (fm?.['Source ID']) subParts.push(String(fm['Source ID']))
		const tokenLen = toStrArray(fm?.Tokens).length
		if (tokenLen > 0) subParts.push(`${formatNumber(tokenLen)} ${tr('header.tokens')}`)

		if (subParts.length > 0) {
			const note = row.createDiv({ cls: 'suggestion-note' })
			note.setText(subParts.join(' · '))
		}
	}

	onChooseItem(file: TFile): void {
		this.onPick(file)
	}
}
