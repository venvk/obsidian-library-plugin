export interface Embed {
	kind: 'youtube' | 'vimeo' | 'video'
	src: string
}

export interface SeasonView {
	name: string
	episodes: number | null
	rating: number | null
	trailer: string | null
}

const YOUTUBE_ID = /^[\w-]{11}$/

// Local copy: this module stays free of obsidian imports.
function toStr(val: unknown): string {
	if (typeof val === 'string') return val
	if (typeof val === 'number' || typeof val === 'boolean') return String(val)
	return ''
}

function youtubeId(url: string): string | null {
	if (YOUTUBE_ID.test(url)) return url
	try {
		const parsed = new URL(url)
		const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
		let id: string | null = null
		if (host === 'youtu.be') {
			id = parsed.pathname.slice(1).split('/')[0] ?? null
		} else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
			const segments = parsed.pathname.split('/').filter(Boolean)
			if (parsed.pathname === '/watch') id = parsed.searchParams.get('v')
			else if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'v' || segments[0] === 'live') {
				id = segments[1] ?? null
			}
		}
		return id && YOUTUBE_ID.test(id) ? id : null
	} catch {
		return null
	}
}

function vimeoId(url: string): string | null {
	try {
		const parsed = new URL(url)
		const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
		if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null
		const match = parsed.pathname.match(/\/(\d+)/)
		return match ? match[1] ?? null : null
	} catch {
		return null
	}
}

export function toEmbed(raw: unknown): Embed | null {
	const url = toStr(raw).trim()
	if (!url) return null
	const youtube = youtubeId(url)
	if (youtube) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${youtube}` }
	const vimeo = vimeoId(url)
	if (vimeo) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vimeo}` }
	// Video file or stream (Steam trailers are HLS) plays in a <video>.
	try {
		const parsed = new URL(url)
		if (parsed.protocol === 'https:' && /\.(m3u8|mp4|webm)$/i.test(parsed.pathname)) return { kind: 'video', src: url }
	} catch {
		// not a URL
	}
	return null
}

// Junk entries dropped: a hand-edited list must not break the header.
export function normalizeSeasons(val: unknown): SeasonView[] {
	if (!Array.isArray(val)) return []
	const list: SeasonView[] = []
	for (const entry of val) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
		const row = entry as Record<string, unknown>
		const number = Number(row.season ?? row.number)
		const episodes = Number(row.episodes)
		const rating = Number(row.rating)
		const name = toStr(row.name).trim() || (Number.isFinite(number) && number > 0 ? `Season ${String(number)}` : '')
		const trailer = toStr(row.trailer).trim()
		if (!name && !(Number.isFinite(episodes) && episodes > 0)) continue
		list.push({
			name: name || '—',
			episodes: Number.isFinite(episodes) && episodes > 0 ? Math.round(episodes) : null,
			rating: Number.isFinite(rating) && rating > 0 ? rating : null,
			trailer: trailer || null
		})
	}
	return list
}

// Obsidian DOM helpers append to `this`: called on the document, they appendChild the document (HierarchyRequestError).
export function createEmbedPlayer(embed: Embed, title: string): HTMLElement {
	const wrapper = createDiv({ cls: 'note-header-player' })
	if (embed.kind === 'video') {
		wrapper.appendChild(createEl('video', {
			attr: { src: embed.src, title, controls: '', preload: 'metadata', playsinline: '' }
		}))
		return wrapper
	}
	const src = embed.src
	const iframe = createEl('iframe', {
		attr: {
			src,
			title,
			allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
			allowfullscreen: 'true',
			referrerpolicy: 'strict-origin-when-cross-origin'
		}
	})
	wrapper.appendChild(iframe)
	return wrapper
}
