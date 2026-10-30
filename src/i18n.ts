import { getLanguage } from 'obsidian'
import { localeMap, I18N, type SupportedLocale } from './constants'

export function tr(key: string, vars?: Record<string, string | number>): string {
	const language: string = getLanguage().toLowerCase()
	// Longest subtag wins: 'zh-tw' → zh-TW, not zh; 'kab' does not match 'ka'.
	const match: string | undefined = Object.keys(localeMap)
		.sort((a, b) => b.length - a.length)
		.find(lang => {
			const l = lang.toLowerCase()
			return language === l || language.startsWith(l + '-')
		})
	const locale: SupportedLocale = (match ? localeMap[match] : undefined) ?? 'en'
	const template: string = I18N[locale]?.[key] ?? I18N.en[key] ?? key
	if (!vars) return template
	return template.replace(/\{(\w+)\}/g, (_, name: string) =>
		vars[name] !== undefined ? String(vars[name]) : ''
	)
}

// Intl.PluralRules is ES2018 in the typings; every Obsidian runtime has it.
interface PluralRulesApi {
	select(count: number): string
	resolvedOptions(): { pluralCategories: string[] }
}

// <key>1 singular, <key>2 plural, <key>5 Slavic/Baltic "many"; a {count} is filled.
export function trCount(key: string, count: number): string {
	let category = count === 1 ? 'one' : 'other'
	let hasFew = false
	try {
		const PluralRules = (Intl as unknown as { PluralRules: new (locale: string) => PluralRulesApi }).PluralRules
		const rules = new PluralRules(getLanguage())
		category = rules.select(count)
		hasFew = rules.resolvedOptions().pluralCategories.indexOf('few') >= 0
	} catch {
		// Unknown language tag: the English rules above stay.
	}
	const vars = { count: formatNumber(count) }
	if (category === 'one') return tr(key + '1', vars)
	if (category === 'two' || category === 'few') return tr(key + '2', vars)
	if (category === 'many' || category === 'zero') return tr(key + '5', vars)
	// With a "few" category, "other" is the genitive plural (5 děl, 10 kūrinių).
	return tr(key + (hasFew ? '5' : '2'), vars)
}

// "today"/"yesterday" in the reader's language; an older day shows its own date.
export function relativeDay(iso: string, today: string): string {
	const dayNumber = (value: string): number => {
		const parts = value.split('-')
		return Math.round(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000)
	}
	const diff = dayNumber(iso) - dayNumber(today)
	// Tr() rather than Intl.RelativeTimeFormat: rare locales (kab, la, dv…) fall back to English there.
	if (diff === 0) return tr('diary.today')
	if (diff === -1) return tr('diary.yesterday')
	const parts = iso.split('-')
	const year = Number(parts[0])
	const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
	if (year !== new Date().getFullYear()) options.year = 'numeric'
	try {
		return new Date(year, Number(parts[1]) - 1, Number(parts[2])).toLocaleDateString(getLanguage() + '-u-nu-latn', options)
	} catch {
		return iso
	}
}

// Reader's grouping/decimal mark (12 345, 0,9), but Latin digits everywhere (-u-nu-latn).
// 1,2 млн, 77 тыс.
export function compactNumber(value: number): string {
	return formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 })
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	try {
		return value.toLocaleString(getLanguage() + '-u-nu-latn', options)
	} catch {
		return String(value)
	}
}
