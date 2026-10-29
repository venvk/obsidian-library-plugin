import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian'
import type { ICategory } from '../constants'
import { tr } from '../i18n'
import type { ContentType } from '../providers/types'

// A medium without a category gets one with its first title.
export type AddChoice = { category: ICategory } | { type: ContentType }

export class PickTypeModal extends FuzzySuggestModal<AddChoice> {
	private choices: AddChoice[]
	private onPick: (choice: AddChoice) => void

	constructor(app: App, choices: AddChoice[], onPick: (choice: AddChoice) => void) {
		super(app)
		this.choices = choices
		this.onPick = onPick
		this.setPlaceholder(tr('modal.pickType'))
	}

	getItems(): AddChoice[] {
		return this.choices
	}

	getItemText(choice: AddChoice): string {
		if ('category' in choice) return `${choice.category.name} (${choice.category.typeValue})`
		return choice.type === 'manual' ? tr('settings.category.manual') : tr(`settings.default.${choice.type}`)
	}

	renderSuggestion(match: FuzzyMatch<AddChoice>, el: HTMLElement): void {
		super.renderSuggestion(match, el)
		if (!('category' in match.item)) el.createSpan({ cls: 'library-pick-new', text: tr('modal.pickType.new') })
	}

	onChooseItem(choice: AddChoice): void {
		this.onPick(choice)
	}
}
