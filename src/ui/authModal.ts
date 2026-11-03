import { App, Modal, Platform } from 'obsidian'

// Real Chrome version so Google and Apple sign-in pages don't block the webview.
export function resolveUserAgent(custom?: string): string {
	if (custom) return custom
	const proc = (window as unknown as { process?: { versions?: { chrome?: string } } }).process
	const chromeVer = proc?.versions?.chrome || '130.0.0.0'
	if (Platform.isWin) {
		return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`
	}
	if (Platform.isLinux) {
		return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`
	}
	return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`
}

// Sign-in webview (desktop only), own session partition: the next connect may skip the form.
export interface AuthModalOptions {
	title: string
	extract: (url: string) => string | null
	// Nintendo serves a wide layout unless it sees a phone.
	userAgent?: string
	// Some sites keep the token in page storage instead of the redirect URL;
	// poll this expression in the guest page and take a truthy result as the answer.
	pageProbe?: string
}

interface ElectronBrowserWindow {
	loadURL: (url: string) => void
	on: (event: string, cb: () => void) => void
	close: () => void
	isDestroyed: () => boolean
	webContents?: {
		on: (event: string, cb: (e: unknown, url: string) => void) => void
	}
}

interface ElectronRemote {
	BrowserWindow?: {
		new (opts: unknown): ElectronBrowserWindow
		getFocusedWindow?: () => unknown
	}
	webContents?: {
		fromId?: (wcId: number) => {
			setWindowOpenHandler: (handler: (details: { url?: string }) => { action: 'deny' }) => void
		}
	}
}

export class AuthModal extends Modal {
	private authUrl: string
	private onResult: (result: string | null) => void
	private opts: AuthModalOptions
	private done = false
	private timerWin: Window | null = null
	private poll = 0
	private activePopup: ElectronBrowserWindow | null = null

	constructor(app: App, authUrl: string, onResult: (result: string | null) => void, opts: AuthModalOptions) {
		super(app)
		this.authUrl = authUrl
		this.onResult = onResult
		this.opts = opts
	}

	onOpen(): void {
		this.setTitle(this.opts.title)
		this.modalEl.addClass('library-auth-modal')
		// The modal's own window: a webview from the main window takes no input in settings.
		const win = this.contentEl.ownerDocument.win as Window & { createEl: typeof createEl }
		const userAgent = resolveUserAgent(this.opts.userAgent)
		const view = win.createEl('webview' as keyof HTMLElementTagNameMap, {
			cls: 'library-auth-webview',
			attr: {
				partition: 'persist:library-auth',
				allowpopups: 'true',
				src: this.authUrl,
				useragent: userAgent,
			},
		})
		// `window.__authTrail` for a stuck sign-in; token redacted, `extract` still sees the raw URL.
		const trail: string[] = []
		;(window as unknown as Record<string, unknown>).__authTrail = trail
		const arrive = (url: string): void => {
			if (!url) return
			const safe = url.replace(/([?#&]\w*(?:token|code|challenge|verifier)\w*=)[^&#\s]*/gi, '$1…')
			if (trail[trail.length - 1] !== safe) trail.push(safe)
			const result = this.opts.extract(url)
			if (result) this.finish(result)
		}
		const check = (event: Event): void => {
			const detail = event as Event & { url?: string; validatedURL?: string }
			arrive(detail.url ?? detail.validatedURL ?? '')
		}
		// `load-commit` catches the failed localhost hop the other events skip.
		for (const name of ['will-navigate', 'did-start-navigation', 'did-redirect-navigation', 'did-navigate', 'load-commit', 'did-fail-load']) {
			view.addEventListener(name, check)
		}
		const navigateGuest = (targetUrl: string): void => {
			if (!targetUrl) return
			arrive(targetUrl)
			const guest = view as unknown as { loadURL?: (url: string) => void }
			if (typeof guest.loadURL === 'function') {
				guest.loadURL(targetUrl)
			} else {
				view.setAttribute('src', targetUrl)
			}
		}

		// Popups for Google/Apple sign-ins share the partition so cookies carry over.
		const openPopup = (targetUrl: string): void => {
			if (!targetUrl) return
			if (this.activePopup && !this.activePopup.isDestroyed()) {
				this.activePopup.loadURL(targetUrl)
				return
			}
			const electron = (win as unknown as { require?: (mod: string) => { remote?: ElectronRemote } }).require?.('electron')
			const BrowserWindow = electron?.remote?.BrowserWindow
			if (BrowserWindow) {
				const popup = new BrowserWindow({
					width: 520,
					height: 650,
					parent: BrowserWindow.getFocusedWindow ? BrowserWindow.getFocusedWindow() : undefined,
					modal: true,
					webPreferences: {
						partition: 'persist:library-auth',
						nodeIntegration: false,
						contextIsolation: true,
					},
				})
				this.activePopup = popup
				popup.loadURL(targetUrl)
				if (popup.webContents) {
					popup.webContents.on('will-navigate', (_event, url) => arrive(url))
					popup.webContents.on('did-navigate', (_event, url) => arrive(url))
				}
				popup.on('closed', () => {
					this.activePopup = null
					if (!this.done) {
						const guest = view as unknown as { getURL?: () => string; loadURL?: (url: string) => void }
						const currentUrl = guest.getURL ? guest.getURL() : ''
						if (currentUrl && currentUrl.indexOf('/id/api/redirect') === -1) {
							if (typeof guest.loadURL === 'function') {
								guest.loadURL(this.authUrl)
							} else {
								view.setAttribute('src', this.authUrl)
							}
						}
					}
				})
			} else {
				navigateGuest(targetUrl)
			}
		}

		const onNewWindow = (event: Event): void => {
			const detail = event as Event & { url?: string; preventDefault?: () => void }
			if (typeof detail.preventDefault === 'function') {
				detail.preventDefault()
			}
			const targetUrl = detail.url ?? ''
			if (targetUrl) openPopup(targetUrl)
		}
		view.addEventListener('new-window', onNewWindow)

		// Electron 30+ catches guest popups through setWindowOpenHandler.
		view.addEventListener('dom-ready', () => {
			try {
				const guestEl = view as unknown as { getWebContentsId?: () => number }
				if (typeof guestEl.getWebContentsId !== 'function') return
				const id = guestEl.getWebContentsId()
				const electron = (win as unknown as { require?: (mod: string) => { remote?: ElectronRemote } }).require?.('electron')
				const wc = electron?.remote?.webContents?.fromId?.(id)
				if (wc && typeof wc.setWindowOpenHandler === 'function') {
					wc.setWindowOpenHandler((details: { url?: string }) => {
						const targetUrl = details?.url || ''
						if (targetUrl) openPopup(targetUrl)
						return { action: 'deny' }
					})
				}
			} catch {
				// guest contents unreachable
			}
		})

		view.addEventListener('close', () => {
			if (this.done) return
			const guest = view as unknown as { loadURL?: (url: string) => void }
			if (typeof guest.loadURL === 'function') {
				guest.loadURL(this.authUrl)
			} else {
				view.setAttribute('src', this.authUrl)
			}
		})
		view.addEventListener('render-process-gone', () => trail.push('webview crashed'))
		this.timerWin = win
		this.poll = win.setInterval(() => {
			const guest = view as unknown as {
				getURL?: () => string
				executeJavaScript?: (code: string, userGesture: boolean) => unknown
			}
			if (guest.getURL) arrive(guest.getURL())
			if (this.opts.pageProbe && guest.executeJavaScript) {
				// The webview runs the call over IPC: a third callback argument fails
				// structured clone, so only the two-argument promise form delivers.
				const take = (value: unknown): void => {
					if (typeof value === 'string' && value) this.finish(value)
				}
				try {
					const out: unknown = guest.executeJavaScript(this.opts.pageProbe, false)
					if (out && typeof (out as Promise<unknown>).then === 'function') {
						void (out as Promise<unknown>).then(take).catch(() => { /* the guest page went away mid-probe */ })
					}
				} catch { /* the guest page is not ready for scripts yet */ }
			}
		}, 300)
		this.contentEl.appendChild(view)
	}

	onClose(): void {
		if (this.poll && this.timerWin) this.timerWin.clearInterval(this.poll)
		this.poll = 0
		this.timerWin = null
		if (this.activePopup && !this.activePopup.isDestroyed()) {
			try { this.activePopup.close() } catch { /* ignore */ }
			this.activePopup = null
		}
		delete (window as unknown as Record<string, unknown>).__authTrail
		this.contentEl.empty()
		this.finish(null)
	}

	private finish(result: string | null): void {
		if (this.done) return
		this.done = true
		if (this.activePopup && !this.activePopup.isDestroyed()) {
			try { this.activePopup.close() } catch { /* ignore */ }
			this.activePopup = null
		}
		if (result) this.close()
		this.onResult(result)
	}
}
