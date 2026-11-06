import { App } from 'obsidian'
import { tr } from '../i18n'
import { coverSrc } from '../util'

export class Lightbox {
	private caption: string
	private images: string[]
	private index: number
	private app?: App
	private overlay: HTMLElement | null = null

	constructor(caption: string, images: string[], index: number, app?: App) {
		this.caption = caption
		this.images = images
		this.index = index
		this.app = app
	}

	open(): void {
		if (this.overlay) return
		const doc = activeDocument
		const overlay = doc.body.createDiv({ cls: 'library-lightbox' })
		overlay.addEventListener('click', (e) => {
			if (e.target === overlay) this.close()
		})
		this.overlay = overlay
		this.draw()
		doc.addEventListener('keydown', this.onKey)
	}

	close(): void {
		if (!this.overlay) return
		activeDocument.removeEventListener('keydown', this.onKey)
		this.overlay.remove()
		this.overlay = null
	}

	private draw(): void {
		const overlay = this.overlay
		if (!overlay) return
		overlay.empty()

		const closeBtn = createDiv({ cls: 'library-lightbox-close' })
		closeBtn.setAttribute('role', 'button')
		closeBtn.setAttribute('tabindex', '0')
		closeBtn.setAttribute('aria-label', tr('lightbox.close'))
		closeBtn.setText('✕')
		closeBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			this.close()
		})
		overlay.appendChild(closeBtn)

		if (this.images.length > 1) {
			const prevBtn = createDiv({ cls: 'library-lightbox-nav library-lightbox-prev' })
			prevBtn.setAttribute('role', 'button')
			prevBtn.setAttribute('tabindex', '0')
			prevBtn.setAttribute('aria-label', tr('lightbox.previous'))
			prevBtn.setText('‹')
			prevBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				this.step(-1)
			})
			overlay.appendChild(prevBtn)

			const nextBtn = createDiv({ cls: 'library-lightbox-nav library-lightbox-next' })
			nextBtn.setAttribute('role', 'button')
			nextBtn.setAttribute('tabindex', '0')
			nextBtn.setAttribute('aria-label', tr('lightbox.next'))
			nextBtn.setText('›')
			nextBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				this.step(1)
			})
			overlay.appendChild(nextBtn)
		}

		const raw = this.images[this.index] ?? ''
		let src = (this.app ? coverSrc(this.app, raw) : null) || raw
		if (src.includes('ipfs.filebase.io/ipfs/')) {
			src = src.replace('https://ipfs.filebase.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/')
		}
		if (/\.(mp4|webm|mov)(\?|$)/i.test(src)) {
			const video = createEl('video')
			video.src = src
			video.controls = true
			video.autoplay = true
			video.loop = true
			video.setAttribute('aria-label', this.caption)
			video.addEventListener('click', (e) => e.stopPropagation())
			overlay.appendChild(video)
		} else {
			const img = createEl('img')
			img.src = src
			img.alt = this.caption
			img.addEventListener('click', (e) => {
				e.stopPropagation()
				this.close()
			})
			img.addEventListener('error', () => {
				const video = createEl('video')
				video.src = src
				video.controls = true
				video.autoplay = true
				video.loop = true
				video.setAttribute('aria-label', this.caption)
				video.addEventListener('click', (ev) => ev.stopPropagation())
				img.replaceWith(video)
			}, { once: true })
			overlay.appendChild(img)
		}
	}

	private step(delta: number): void {
		if (this.images.length < 2) return
		this.index = (this.index + delta + this.images.length) % this.images.length
		this.draw()
	}

	private onKey = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			event.preventDefault()
			this.close()
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault()
			this.step(-1)
		} else if (event.key === 'ArrowRight') {
			event.preventDefault()
			this.step(1)
		}
	}
}
