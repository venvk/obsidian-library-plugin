import { App, requestUrl, TFile } from 'obsidian'
import { RATING_RT_ICON } from './constants'
import { tr } from './i18n'
import { coverValue, isCollectible, isWalletAddress, latestNftMintDate, linkLabel, publicHttpsUrl, sanitizeFilename, toStr, toStrArray } from './util'
import { INITIALS, MARKS, PLATFORM_COLORS, platformFamily } from './ui/platformIcons'

const W = 1200
const H = 630
const PAD = 48
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

	const coverBytes = await loadCoverBytes(app, coverValue(fm, coverProperty))
	const img = coverBytes ? await loadImage(coverBytes) : null

	// Preserve natural aspect ratio without cropping (square is square, rectangle is rectangle)
	const maxImageW = 540
	const maxImageH = 510
	let imageW: number
	let imageH: number

	if (img && img.width > 0 && img.height > 0) {
		const aspect = img.width / img.height
		if (aspect >= maxImageW / maxImageH) {
			imageW = maxImageW
			imageH = Math.round(maxImageW / aspect)
			if (imageH > maxImageH) {
				imageH = maxImageH
				imageW = Math.round(maxImageH * aspect)
			}
		} else {
			imageH = maxImageH
			imageW = Math.round(maxImageH * aspect)
			if (imageW > maxImageW) {
				imageW = maxImageW
				imageH = Math.round(maxImageW / aspect)
			}
		}
	} else {
		const isWide = toStr(fm.Source) === 'youtube'
		const isSquare = toStr(fm.Type).toLowerCase() === 'music' || isCollectible(fm)
		imageW = isSquare ? 510 : isWide ? 540 : 340
		imageH = isWide ? 304 : 510
	}

	const imageX = PAD
	const imageY = Math.round((H - imageH) / 2)

	roundRect(ctx, imageX, imageY, imageW, imageH, 16)
	ctx.save()
	ctx.clip()
	if (img && img.width > 0 && img.height > 0) {
		ctx.drawImage(img, imageX, imageY, imageW, imageH)
	} else {
		ctx.fillStyle = '#24242e'
		ctx.fillRect(imageX, imageY, imageW, imageH)
		ctx.fillStyle = '#5a5a6e'
		ctx.font = '140px sans-serif'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		const type = toStr(fm.Type).toLowerCase()
		const glyph = isCollectible(fm) ? '💎'
			: type === 'book' ? '📖'
			: type === 'game' ? '🎮'
			: type === 'music' ? '🎵'
			: type === 'anime' ? '🎌'
			: type === 'comic' ? '📚'
			: '🎬'
		ctx.fillText(glyph, imageX + imageW / 2, imageY + imageH / 2)
		ctx.textBaseline = 'alphabetic'
	}
	ctx.restore()

	const colX = imageX + imageW + PAD
	const colW = W - colX - PAD
	ctx.textAlign = 'left'
	ctx.textBaseline = 'alphabetic'

	ctx.fillStyle = '#f2f2f5'
	ctx.font = 'bold 58px sans-serif'
	const titleLines = wrap(ctx, name, colW, 3)
	let y = Math.min(imageY + 65, 130)
	for (const line of titleLines) {
		ctx.fillText(line, colX, y)
		y += 68
	}

	const isNft = isCollectible(fm) || toStr(fm.Source) === 'nft' || fm.Type === 'NFT'
	if (isNft) {
		y += 14
		let rowX = colX
		const rowH = 34

		// Blockchain badge in the info block, styled like the note header badge
		let platforms = toStrArray(fm.Platforms)
		if (platforms.length === 0) {
			const fallback = toStr(fm['Source ID']).split(':')[0]
			if (fallback) platforms = [fallback]
		}
		for (const platform of platforms) {
			const family = platformFamily(platform) ?? platform.toLowerCase().replace(/\s+/g, '-')
			const colors = PLATFORM_COLORS[family] ?? { bg: '#3a3a4c', text: '#ffffff' }
			const mark = MARKS[family]
			const initial = INITIALS[family]?.text ?? platform.slice(0, 1).toUpperCase()
			const label = mark?.label ?? INITIALS[family]?.label ?? platform

			ctx.font = 'bold 19px sans-serif'
			const textW = ctx.measureText(label).width
			const iconSize = 18
			const badgeW = Math.round(textW + iconSize + 26)
			if (rowX + badgeW > W - PAD) {
				y += rowH + 8
				rowX = colX
			}

			ctx.save()
			ctx.fillStyle = colors.bg
			roundRect(ctx, rowX, y - 22, badgeW, rowH, 6)
			ctx.fill()
			ctx.restore()

			const iconX = rowX + 10
			const iconY = y - 22 + Math.round((rowH - iconSize) / 2)
			if (mark && typeof Path2D !== 'undefined') {
				ctx.save()
				ctx.fillStyle = colors.text
				ctx.translate(iconX, iconY)
				if (family === 'taiko') {
					const scale = iconSize / 260
					ctx.translate(-20 * scale, -20 * scale)
					ctx.scale(scale, scale)
				} else {
					const scale = iconSize / 24
					ctx.scale(scale, scale)
				}
				ctx.fill(new Path2D(mark.path))
				ctx.restore()
			} else {
				ctx.save()
				ctx.fillStyle = colors.text
				ctx.font = 'bold 14px sans-serif'
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.fillText(initial, iconX + iconSize / 2, y - 22 + rowH / 2)
				ctx.restore()
			}

			ctx.save()
			ctx.fillStyle = colors.text
			ctx.font = 'bold 19px sans-serif'
			ctx.textAlign = 'left'
			ctx.textBaseline = 'middle'
			ctx.fillText(label, iconX + iconSize + 6, y - 22 + rowH / 2)
			ctx.restore()

			rowX += badgeW + 8
		}

		const chips: string[] = []
		chips.push(fm.OAT === true ? 'OAT' : 'NFT')
		const standard = toStr(fm.Standard).trim()
		if (standard) chips.push(standard)
		const count = Number(fm.Count)
		const tokens = toStrArray(fm.Tokens)
		if (count > 1) {
			chips.push(`×${count}`)
		} else if (tokens.length > 1) {
			chips.push(`×${tokens.length}`)
		} else {
			const tokenId = toStr(fm['Token ID']).trim()
			if (tokenId && tokenId.length <= 14) chips.push(`#${tokenId}`)
		}

		if (chips.length > 0) {
			ctx.font = 'bold 19px sans-serif'
			for (const text of chips) {
				const tw = ctx.measureText(text).width
				const chipW = Math.round(tw + 24)
				if (rowX + chipW > W - PAD) {
					y += rowH + 8
					rowX = colX
				}
				ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
				roundRect(ctx, rowX, y - 22, chipW, rowH, 6)
				ctx.fill()
				ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
				ctx.lineWidth = 1
				ctx.stroke()
				ctx.fillStyle = '#e2e2ec'
				ctx.textBaseline = 'middle'
				ctx.fillText(text, rowX + 12, y - 22 + rowH / 2)
				ctx.textBaseline = 'alphabetic'
				rowX += chipW + 8
			}
		}
		y += rowH + 16

		let collection = toStr(fm.Collection).trim()
		if (!collection) {
			const creators = toStrArray(fm.Creator).map(linkLabel).filter(c => !isWalletAddress(c))
			if (creators.length > 0 && creators[0]) collection = creators[0]
		}
		if (collection && collection.toLowerCase() !== name.toLowerCase()) {
			ctx.fillStyle = '#b4b4c6'
			ctx.font = '28px sans-serif'
			const collLabel = tr('header.collection')
			wrap(ctx, `${collLabel}: ${collection}`, colW, 2).forEach((l) => {
				ctx.fillText(l, colX, y)
				y += 38
			})
			y += 6
		}

		const authorRaw = toStrArray(fm.Author ?? fm.Artist).map(linkLabel).filter(c => !isWalletAddress(c))
		const creators = toStrArray(fm.Creator).map(linkLabel).filter(c => !isWalletAddress(c))
		const authorList = authorRaw.length > 0 ? authorRaw : creators.filter(c => c.toLowerCase() !== collection.toLowerCase())
		const author = authorList.join(', ')
		if (author && author.toLowerCase() !== name.toLowerCase()) {
			ctx.fillStyle = '#8a8a9a'
			ctx.font = '28px sans-serif'
			const creatorLabel = tr('header.creator')
			wrap(ctx, `${creatorLabel}: ${author}`, colW, 2).forEach((l) => {
				ctx.fillText(l, colX, y)
				y += 38
			})
			y += 6
		}

		const mintDate = latestNftMintDate(fm) || toStr(fm.Minted) || toStr(fm.Acquired) || toStr(fm.Date)
		if (mintDate) {
			ctx.fillStyle = '#7a7a8a'
			ctx.font = '24px sans-serif'
			const dateLabel = tr('header.minted')
			ctx.fillText(`${dateLabel}: ${mintDate}`, colX, y)
			y += 34
		}

		const ratingRaw = fm['My Rating'] ?? fm.Rating
		const rating = ratingRaw ? toStr(ratingRaw).trim() : ''
		const pillY = 474
		if (fm.Favorite === true) {
			ctx.fillStyle = '#e3b341'
			roundRect(ctx, colX, pillY, 240, 76, 38)
			ctx.fill()
			ctx.fillStyle = '#1e2026'
			ctx.font = 'bold 36px sans-serif'
			ctx.textBaseline = 'middle'
			ctx.fillText('★ Favorite', colX + 28, pillY + 39)
			ctx.textBaseline = 'alphabetic'
		} else if (rating) {
			ctx.fillStyle = accent
			roundRect(ctx, colX, pillY, 260, 84, 42)
			ctx.fill()
			ctx.fillStyle = themeColor(ctx, '--text-on-accent', '#ffffff')
			ctx.font = 'bold 46px sans-serif'
			ctx.textBaseline = 'middle'
			ctx.fillText(`★ ${rating} / 10`, colX + 28, pillY + 44)
			ctx.textBaseline = 'alphabetic'
		}
	} else {
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

		const cast = toStrArray(fm.Cast).map(linkLabel).slice(0, 3).join(', ')
		const pillTop = 474
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
			const pillY = 474
			ctx.fillStyle = accent
			roundRect(ctx, colX, pillY, 260, 84, 42)
			ctx.fill()
			ctx.fillStyle = themeColor(ctx, '--text-on-accent', '#ffffff')
			ctx.font = 'bold 46px sans-serif'
			ctx.textBaseline = 'middle'
			ctx.fillText(`★ ${rating} / 10`, colX + 28, pillY + 44)
			ctx.textBaseline = 'alphabetic'
		}
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
