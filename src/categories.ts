import { I18N, type ICategory, type ILibrarySettings } from './constants'
import { tr } from './i18n'
import type { ContentType } from './providers/types'

export const TYPE_DEFAULTS: Record<string, string> = {
	movie: 'Movie',
	series: 'Series',
	book: 'Book',
	comic: 'Comic',
	game: 'Game',
	music: 'Music',
	anime: 'Anime',
	manual: 'Manual',
}

export const MEDIA: ContentType[] = ['movie', 'series', 'book', 'comic', 'game', 'music', 'anime', 'manual']

// the video connectors' category (YouTube): fixed like the built-in ones
export const VIDEO_CATEGORY = 'Video'

function isVideo(cat: ICategory): boolean {
	return cat.contentType === 'manual' && cat.typeValue === VIDEO_CATEGORY
}

export function isBuiltInCategory(cat: ICategory): boolean {
	return isVideo(cat) || (cat.contentType !== 'manual' && cat.typeValue === TYPE_DEFAULTS[cat.contentType])
}

export function categoryLabel(cat: ICategory): string {
	if (isVideo(cat)) return tr('settings.default.video')
	return isBuiltInCategory(cat) ? tr(`settings.default.${cat.contentType}`) : cat.name
}

export function isDefaultTypeValue(value: string): boolean {
	return Object.values(TYPE_DEFAULTS).includes(value)
}

// As stored: no empty, '.' or '..' segments, so a hand-edited settings file
// cannot point outside the vault; '' is the vault root.
export function cleanFolder(folder: string): string {
	return folder.split(/[\\/]/).map(part => part.trim()).filter(part => part && part !== '.' && part !== '..').join('/')
}

export function joinFolder(parent: string, name: string): string {
	const root = cleanFolder(parent)
	const child = cleanFolder(name)
	if (!root) return child
	return child ? `${root}/${child}` : root
}

export function isInside(path: string, folder: string): boolean {
	return folder !== '' && (path === folder || path.startsWith(folder + '/'))
}

export function parentFolder(path: string): string {
	const at = path.lastIndexOf('/')
	return at > 0 ? path.slice(0, at) : ''
}

// Legacy: the one parent all category folders share, else the fallback.
export function inferLibraryFolder(categories: ICategory[], fallback: string): string {
	const parents = new Set(categories.map(cat => cleanFolder(cat.folder)).filter(Boolean).map(parentFolder))
	const only = parents.size === 1 ? Array.from(parents)[0] : undefined
	return only ?? fallback
}

// Named in the UI language, filed in an English folder; typeValue kept unique.
export function newCategory(contentType: ContentType, settings: ILibrarySettings): ICategory {
	const base = TYPE_DEFAULTS[contentType] ?? 'Movie'
	const taken = new Set(settings.categories.map(cat => cat.typeValue))
	let typeValue = base
	for (let n = 2; taken.has(typeValue); n++) typeValue = `${base} ${String(n)}`
	// A second category of a kind gets a number: sort, filters and the time
	// chart tell categories apart by name.
	const names = new Set(settings.categories.map(cat => cat.name))
	const label = tr(`settings.default.${contentType}`)
	let name = label
	for (let n = 2; names.has(name); n++) name = `${label} ${String(n)}`
	return {
		name,
		typeValue,
		contentType,
		folder: joinFolder(settings.libraryFolder, I18N.en[`settings.default.${contentType}`] ?? base),
	}
}

export function addCategoryTop(settings: ILibrarySettings, typeValue: string): void {
	const tops = settings.stats.tops
	if (!tops.some(top => top.kind === 'category' && top.key === typeValue)) tops.push({ kind: 'category', key: typeValue })
}
