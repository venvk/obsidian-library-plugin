import { App, requestUrl, TFile } from 'obsidian'
import { RATING_RT_ICON } from './constants'
import { tr } from './i18n'
import { coverValue, linkLabel, publicHttpsUrl, sanitizeFilename, toStr, toStrArray } from './util'

const W = 1200
const H = 630
const PAD = 48
const POSTER_W = 340
const POSTER_H = 510
const PLUGIN_URL = 'https://community.obsidian.md/plugins/library'

type Frontmatter = Record<string, unknown>

async function loadCoverBytes(app: App, rawCover: unknown): Promise<ArrayBuffer | null> {
	const s = toStr(rawCover).trim()
	if (!s) return null
	if (/^https?:\/\//i.test(s)) {
		const url = publicHttpsUrl(s)
		if (!url) return null
		const resp = await requestUrl({ url, throw: false })
		return resp.status === 200 ? resp.arrayBuffer : null
	}
	const match = s.match(/\[\[([^\]|]+)/)
	const path = (match?.[1] ?? s).replace(/^!?\[\[|\]\]$/g, '').trim()
	const file = app.metadataCache.getFirstLinkpathDest(path, '')
	if (file) return app.vault.readBinary(file)
	return null
}

function loadImage(bytes: ArrayBuffer): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(new Blob([bytes]))
		const img = new Image()
		img.onload = (): void => {
			URL.revokeObjectURL(url)
			resolve(img)
		}
		img.onerror = (): void => {
			URL.revokeObjectURL(url)
			resolve(null)
		}
		img.src = url
	})
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath()
	ctx.moveTo(x + r, y)
	ctx.arcTo(x + w, y, x + w, y + h, r)
	ctx.arcTo(x + w, y + h, x, y + h, r)
	ctx.arcTo(x, y + h, x, y, r)
	ctx.arcTo(x, y, x + w, y, r)
	ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
	const words = text.split(/\s+/).filter(Boolean)
	const lines: string[] = []
	let line = ''
	let dropped = false
	for (const word of words) {
		const test = line ? `${line} ${word}` : word
		if (ctx.measureText(test).width > maxWidth && line) {
			if (lines.length === maxLines - 1) { dropped = true; break }
			lines.push(line)
			line = word
		} else {
			line = test
		}
	}
	if (line) lines.push(line)
	// Ellipsize the last line when words were dropped or it (one long word) overflows.
	const i = lines.length - 1
	if (i >= 0) {
		let last = lines[i] ?? ''
		if (dropped || ctx.measureText(last).width > maxWidth) {
			while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1)
			lines[i] = last + '…'
		}
	}
	return lines
}

export interface ShareText {
	text: string
	url: string
	redditTitle: string
}

export function shareRatings(fm: Frontmatter): string[] {
	const ext: string[] = []
	const imdb = toStr(fm['Rating IMDB']).trim()
	if (imdb) ext.push(`IMDb ${imdb}`)
	const rt = toStr(fm['Rating RT']).trim()
	if (rt) ext.push(`${RATING_RT_ICON} ${rt}%`)
	const rawg = toStr(fm['Rating RAWG']).trim()
	if (rawg) ext.push(`RAWG ${rawg}`)
	const mc = toStr(fm['Rating MC']).trim()
	if (mc) ext.push(`MC ${mc}`)
	const anilist = toStr(fm['Rating AniList']).trim()
	if (anilist) ext.push(`AniList ${anilist}`)
	return ext
}

export function buildShareText(fm: Frontmatter, name: string): ShareText {
	const year = fm.Year ? ` (${toStr(fm.Year)})` : ''
	const ratingRaw = fm['My Rating'] ?? fm.Rating
	const rating = ratingRaw ? toStr(ratingRaw).trim() : ''
	const ratingPart = rating ? ` — ${tr('share.myRating', { rating })}` : ''
	const url = toStr(fm.URL).trim()
	const headline = `${name}${year}${ratingPart}`
	const text = `${headline}\n\n${tr('share.trackedWith')}\n${PLUGIN_URL}`
	return { text, url, redditTitle: headline }
}

export function shareIntent(network: string, share: ShareText): string {
	const enc = encodeURIComponent
	const text = share.url ? `${share.text}\n${share.url}` : share.text
	switch (network) {
		case 'x':
			return `https://twitter.com/intent/tweet?text=${enc(text)}`
		case 'telegram':
			return share.url
				? `https://t.me/share/url?url=${enc(share.url)}&text=${enc(share.text)}`
				: `https://t.me/share/url?url=${enc(share.text)}`
		case 'reddit':
			return share.url
				? `https://www.reddit.com/submit?url=${enc(share.url)}&title=${enc(share.redditTitle)}`
				: `https://www.reddit.com/submit?title=${enc(share.redditTitle)}`
		case 'whatsapp':
			return `https://wa.me/?text=${enc(text)}`
		case 'facebook':
			// Facebook's sharer only accepts a URL; it ignores prefilled text.
			return `https://www.facebook.com/sharer/sharer.php?u=${enc(share.url || share.text)}`
		case 'linkedin':
			return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(share.url || share.text)}`
		case 'vk':
			return share.url
				? `https://vk.com/share.php?url=${enc(share.url)}&title=${enc(share.redditTitle)}`
				: `https://vk.com/share.php?url=${enc(share.text)}`
		case 'bluesky':
			return `https://bsky.app/intent/compose?text=${enc(text)}`
		case 'pinterest':
			return `https://www.pinterest.com/pin/create/button/?url=${enc(share.url || share.text)}&description=${enc(share.redditTitle)}`
		default:
			return ''
	}
}

// Canvas can't read CSS vars; an unparsable colour keeps the fallback (not an invisible pill).
function themeColor(ctx: CanvasRenderingContext2D, name: string, fallback: string): string {
	ctx.fillStyle = fallback
	const value = getComputedStyle(activeDocument.body).getPropertyValue(name).trim()
	if (value) ctx.fillStyle = value
	return typeof ctx.fillStyle === 'string' ? ctx.fillStyle : fallback
}

export async function renderShareCard(app: App, fm: Frontmatter, name: string, coverProperty = 'Cover'): Promise<Blob | null> {
	const canvas = createEl('canvas')
	canvas.width = W
	canvas.height = H
	const ctx = canvas.getContext('2d')
	if (!ctx) return null

	const accent = themeColor(ctx, '--interactive-accent', '#7c6cff')
	ctx.fillStyle = '#16161c'
	ctx.fillRect(0, 0, W, H)
	ctx.fillStyle = accent
	ctx.fillRect(0, 0, 8, H)

	const posterX = PAD
	const posterY = (H - POSTER_H) / 2
	// album covers are square
	const posterW = toStr(fm.Type).toLowerCase() === 'music' ? POSTER_H : POSTER_W
	const coverBytes = await loadCoverBytes(app, coverValue(fm, coverProperty))
	const img = coverBytes ? await loadImage(coverBytes) : null
	roundRect(ctx, posterX, posterY, posterW, POSTER_H, 16)
	ctx.save()
	ctx.clip()
	if (img && img.width > 0 && img.height > 0) {
		const scale = Math.max(posterW / img.width, POSTER_H / img.height)
		const dw = img.width * scale
		const dh = img.height * scale
		ctx.drawImage(img, posterX + (posterW - dw) / 2, posterY + (POSTER_H - dh) / 2, dw, dh)
	} else {
		ctx.fillStyle = '#24242e'
		ctx.fillRect(posterX, posterY, posterW, POSTER_H)
		ctx.fillStyle = '#5a5a6e'
		ctx.font = '140px sans-serif'
		ctx.textAlign = 'center'
		const type = toStr(fm.Type).toLowerCase()
		const glyph = type === 'book' ? '📖'
			: type === 'game' ? '🎮'
			: type === 'music' ? '🎵'
			: type === 'anime' ? '🎌'
			: type === 'comic' ? '📚'
			: '🎬'
		ctx.fillText(glyph, posterX + posterW / 2, posterY + POSTER_H / 2 + 50)
	}
	ctx.restore()

	const colX = posterX + posterW + PAD
	const colW = W - colX - PAD
	ctx.textAlign = 'left'
	ctx.textBaseline = 'alphabetic'

	ctx.fillStyle = '#f2f2f5'
	ctx.font = 'bold 58px sans-serif'
	const titleLines = wrap(ctx, name, colW, 3)
	let y = posterY + 70
	for (const line of titleLines) {
		ctx.fillText(line, colX, y)
		y += 70
	}

	const meta: string[] = []
	if (fm.Year) meta.push(toStr(fm.Year))
	const genres = toStrArray(fm.Genre).map(linkLabel).slice(0, 3)
	if (genres.length > 0) meta.push(genres.join(' · '))
	if (meta.length > 0) {
		ctx.fillStyle = '#a0a0b0'
		ctx.font = '30px sans-serif'
		y += 14
		wrap(ctx, meta.join('  ·  '), colW, 3).forEach((l) => {
			ctx.fillText(l, colX, y)
			y += 40
		})
	}

	const creator = toStrArray(fm.Creator ?? fm.Director ?? fm.Author ?? fm.Artist).map(linkLabel).join(', ')
	if (creator) {
		ctx.fillStyle = '#8a8a9a'
		ctx.font = '28px sans-serif'
		y += 8
		wrap(ctx, creator, colW, 2).forEach((l) => {
			ctx.fillText(l, colX, y)
			y += 40
		})
	}

	// Cast only while it leaves room above the rating pill.
	const cast = toStrArray(fm.Cast).map(linkLabel).slice(0, 3).join(', ')
	const pillTop = posterY + POSTER_H - 96
	if (cast && y + 48 + 48 <= pillTop) {
		ctx.fillStyle = '#8a8a9a'
		ctx.font = '28px sans-serif'
		y += 8
		wrap(ctx, `${tr('header.cast')}: ${cast}`, colW, 2).forEach((l) => {
			ctx.fillText(l, colX, y)
			y += 40
		})
	}

	const ext = shareRatings(fm)
	if (ext.length > 0) {
		ctx.fillStyle = '#7a7a8a'
		ctx.font = '24px sans-serif'
		y += 12
		ctx.fillText(ext.join('   ·   '), colX, y + 12)
		y += 36
	}

	const ratingRaw = fm['My Rating'] ?? fm.Rating
	const rating = ratingRaw ? toStr(ratingRaw).trim() : ''
	if (rating) {
		const pillY = posterY + POSTER_H - 96
		ctx.fillStyle = accent
		roundRect(ctx, colX, pillY, 260, 84, 42)
		ctx.fill()
		ctx.fillStyle = themeColor(ctx, '--text-on-accent', '#ffffff')
		ctx.font = 'bold 46px sans-serif'
		ctx.textBaseline = 'middle'
		ctx.fillText(`★ ${rating} / 10`, colX + 28, pillY + 44)
		ctx.textBaseline = 'alphabetic'
	}

	ctx.fillStyle = '#5a5a6e'
	ctx.font = '24px sans-serif'
	ctx.textAlign = 'right'
	ctx.fillText(tr('share.trackedWith'), W - PAD, H - 32)

	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob), 'image/png')
	})
}

export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
	const clip = navigator.clipboard
	if (!clip || typeof ClipboardItem === 'undefined' || typeof clip.write !== 'function') {
		return false
	}
	try {
		await clip.write([new ClipboardItem({ 'image/png': blob })])
		return true
	} catch {
		return false
	}
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
	const clip = navigator.clipboard
	if (!clip || typeof clip.writeText !== 'function') return false
	try {
		await clip.writeText(text)
		return true
	} catch {
		return false
	}
}

export async function saveImageToVault(app: App, blob: Blob, baseName: string): Promise<TFile> {
	const bytes = await blob.arrayBuffer()
	const safe = sanitizeFilename(baseName) || 'card'
	const path = await app.fileManager.getAvailablePathForAttachment(`${safe} share.png`)
	return app.vault.createBinary(path, bytes)
}

export function canNativeShare(): boolean {
	return typeof (navigator as Navigator & { share?: unknown }).share === 'function'
}

type ShareStatus = 'shared' | 'unsupported' | 'failed'

// Web Share API: image where canShare allows it (mobile), else text + link.
export async function nativeShare(blob: Blob, share: ShareText, baseName: string): Promise<ShareStatus> {
	const nav = navigator as Navigator & {
		canShare?: (data: { files?: File[] }) => boolean
		share?: (data: { files?: File[]; text?: string; url?: string; title?: string }) => Promise<void>
	}
	if (typeof nav.share !== 'function') return 'unsupported'
	const text = share.url ? `${share.text}\n${share.url}` : share.text
	const safe = sanitizeFilename(baseName) || 'card'
	try {
		if (typeof File === 'function' && typeof nav.canShare === 'function') {
			const file = new File([blob], `${safe}.png`, { type: 'image/png' })
			if (nav.canShare({ files: [file] })) {
				await nav.share({ files: [file], text, title: share.redditTitle })
				return 'shared'
			}
		}
		await nav.share({ text, url: share.url || undefined, title: share.redditTitle })
		return 'shared'
	} catch (e) {
		// AbortError = dismissed; treat as shared.
		if (e instanceof DOMException && e.name === 'AbortError') return 'shared'
		return 'failed'
	}
}
