import {
	Plugin,
	TFile,
	MarkdownView,
	Notice,
	normalizePath,
	setIcon,
	setTooltip,
	Platform,
	getLanguage,
	requestUrl,
	type CachedMetadata,
} from 'obsidian'
import { progressPattern, RATING_RT_ICON, type ICategory, type ILibrarySettings, type IStatsSettings, type IStatsTop, DEFAULT_SETTINGS } from './constants'
import { compactNumber, formatNumber, tr, trCount } from './i18n'
import { LibrarySettingTab } from './settings'
import { ProviderRegistry } from './providers/registry'
import { OmdbProvider } from './providers/omdb'
import { OpenLibraryProvider, findChapters } from './providers/openlibrary'
import { GoogleBooksProvider } from './providers/googlebooks'
import { BookAggregatorProvider } from './providers/bookAggregator'
import { CinemetaEnricher } from './providers/cinemeta'
import { RawgProvider } from './providers/rawg'
import { GameAggregatorProvider } from './providers/gameAggregator'
import { AnimeAggregatorProvider } from './providers/animeAggregator'
import { GameTrailerFinder } from './providers/gameTrailer'
import { DeezerProvider } from './providers/deezer'
import { AnimeProvider } from './providers/anime'
import { MalProvider } from './providers/mal'
import { KitsuProvider } from './providers/kitsu'
import { ComicsProvider } from './providers/comics'
import { ComicsAggregatorProvider } from './providers/comicsAggregator'
import { WikidataComicProvider } from './providers/wikidataComics'
import { MangaProvider } from './providers/manga'
import { SteamProvider } from './providers/steam'
import { WikidataGameProvider } from './providers/wikidataGames'
import { TmdbEnricher } from './providers/tmdb'
import { RottenTomatoesEnricher, idsForNetflix } from './providers/wikidata'
import { isContentType } from './providers/types'
import type { ContentProvider, ContentType, NormalizedMetadata, SearchResult } from './providers/types'
import { PickTypeModal, type AddChoice } from './ui/pickTypeModal'
import { ConfirmModal } from './ui/confirmModal'
import { YOUTUBE_SOURCE, YOUTUBE_TYPE, daysSince, youtubeAct, type YoutubeAction, descriptionCallout, isoDay, pageVideos, videoCover, videoDetails, videoUrl, youtubePage, type VideoDetails, type WatchedVideo } from './youtube'
import { MEDIA, TYPE_DEFAULTS, addCategoryTop, categoryLabel, isBuiltInCategory, cleanFolder, inferLibraryFolder, isInside, joinFolder, newCategory, parentFolder } from './categories'
import { AddContentModal, SearchEverythingModal } from './ui/addContentModal'
import { LibrarySearchModal } from './ui/librarySearchModal'
import { PromptModal } from './ui/promptModal'
import { DuplicateRemovalModal, type DuplicateGroup } from './ui/duplicateModal'
import { ShareModal, shareTargetFromFile } from './ui/shareModal'
import { ANILIST_CLIENT_ID, aniListViewer, anilistAuthUrl, deleteEntry, fetchList, listStatus, pushEntry, toTenPoint, tokenFromRedirect, type AniListEntry } from './anilistSync'
import { recommendationsFor, type Recommendation } from './recommendations'
import { SITE_NAME, SITE_SIGN_IN, imdbHistory, netflixHistory, netflixRate, thumbOf, type NetflixEpisode, imdbRate, imdbRatingDelete, imdbSeason, imdbWatchlistAdd, imdbWatchlistRemove, netflixAddToList, netflixHideEpisodes, netflixHideViewing, seasonIndex, signedInAt, type EpisodeRating, type ImdbEcho, type WatchSite, type WatchedTitle } from './watchSites'
import { earnedAchievements, gameAchievements, ownedGames, playtimeHours, steamAuthUrl, steamIdFromRedirect, steamLanguage, steamSession, type SteamSession } from './steamLibrary'
import { MAL_CLIENT_ID, anilistIdsFor, anilistMangaIdsFor, animeIds, codeFromRedirect, deleteMalEntry, exchangeCode, fetchMalList, isExpired, makeVerifier, mangaIds, malAuthUrl, malClientPair, malIdsFor, malMangaIdsFor, malStatus, pushMalEntry, refreshTokens, type MalEntry } from './malSync'
import { deleteKitsuEntry, externalIdsFor, fetchKitsuList, findKitsuEntry, isKitsuExpired, KITSU_SESSION_PROBE, kitsuIdsFor, kitsuPasswordGrant, kitsuRefreshGrant, kitsuStatus, kitsuViewer, pushKitsuEntry, tokensFromKitsuSession, type KitsuEntry, type KitsuTokens } from './kitsuSync'
import { LibraryView, LIBRARY_VIEW_TYPE } from './view'
import { LibraryBlock } from './libraryBlock'
import { addLog, tickLabel, todayIso } from './diary'
import { libraryMap, linkCanvas } from './libraryMap'
import { albumAwards, type Award } from './music'
import { TraktLoginModal } from './ui/traktLoginModal'
import { RemoteDeleteModal } from './ui/remoteDeleteModal'
import { refreshTraktTokens, traktChanges, traktData, traktExpired, traktHistory, traktRemove, traktSend, type TraktEcho } from './trakt'
import { airingDate, airingLabel, animeSchedules, seriesSchedule, type Airing } from './airing'
import { cleanPsnName, exchangePsnCode, psnEarnedTrophies, psnExpired, psnLanguage, psnOwnedGames, psnPlayedGames, psnTrophyIdsFor, psnTrophySummary, psnTrophyTitles, refreshPsnTokens, type PsnOwnedGame, type PsnPlayedGame, type PsnTrophy, type PsnTrophySummary, type PsnTrophyTitle } from './psn'
import { PsnLoginModal, psnSilentCode } from './ui/psnLoginModal'
import { KitsuLoginModal } from './ui/kitsuLoginModal'
import { AuthModal } from './ui/authModal'
import { SIGNER_PROJECT, codeFromRedirect as nintendoCode, exchangeNintendoCode, nintendoAuth, nintendoPlayLog, type NintendoPlayedGame } from './nintendo'
import { renderTrophies, TROPHY_GRADES, trophyIcon } from './ui/trophyIcons'
import { renderPlatformLabels } from './ui/platformIcons'
import { createEmbedPlayer, toEmbed } from './trailer'
import { applyEpisodeChange, followProgress, hasChapters, mergeSeasons, seasonsOf, setChapters, type EpisodeChange, type TrackKind } from './episodes'
import { ChaptersModal } from './ui/chaptersModal'
import { TrailerModal } from './ui/trailerModal'
import { Lightbox } from './ui/lightbox'
import {
	toStr,
	toStrArray,
	parseWatched,
	editedSince,
	isFinished,
	shownProgress,
	spentTime,
	trackingOf,
	todayDmy,
	sanitizeFilename,
	isTemplateFile,
	isEmptyValue,
	inferContentType,
	runtimeMinutes,
	plausibleRuntime,
	totalRuntimeMinutes,
	watchedRuntimeMinutes,
	formatRuntime,
	coverSrc,
	coverValue,
	sameTitle,
	addPlatform,
	dropPlatforms,
	exactHours,
	dmyOf,
	parseDate,
	within,
	SEARCH_BUDGET_MS,
	safeUrl,
	linkLabel,
	linkTarget,
	NAME_FIELDS,
	toLinks,
	coverKey,
	imageExtension,
	publicHttpsUrl,
	plainCopy
} from './util'

// Genre, Creator and Cast hold [[links]] to a canvas of the titles that share
// the name, or to a note of that name when there is one; the graph draws them.
const LINK_FIELDS = ['Genre', 'Creator', 'Cast']

// let the vault settle before the walk starts
const ENRICH_START_DELAY = 10 * 1000
// iPhone Safari UA: some sign-in pages only fit as a phone-width window.
const PHONE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const SOURCE_SCORES = ['Rating IMDB', 'Rating RT', 'Rating MC', 'Rating RAWG', 'Rating AniList', 'Rating MAL']

// a category, or a medium whose category is created with its first note
type Target = ICategory | ContentType

// A library score as a Netflix thumb: 1 down, 2 up, 3 way up.
function thumbRank(score: number): number {
	return ({ THUMBS_DOWN: 1, THUMBS_UP: 2, THUMBS_WAY_UP: 3 } as const)[thumbOf(score)]
}

function typeOf(target: Target): ContentType {
	return typeof target === 'string' ? target : target.contentType
}

interface FolderMove {
	typeValue: string
	from: string
	to: string
}
const ENRICH_STEP_DELAY = 700

// an anime note: its id on each site, one resolved through AniList
type RemoteSite = 'anilist' | 'mal' | 'kitsu' | 'trakt' | 'imdb' | 'netflix'

// A deleted note, as its cached frontmatter named it.
interface Removal {
	name: string
	// Source|Source ID: another note with the same key keeps the title on the sites
	key: string
	anime: { anilist: number | null; mal: number | null } | null
	manga: { anilist: number | null; mal: number | null } | null
	imdb: string | null
	netflix: number | null
	kind: 'movie' | 'series'
	sites: RemoteSite[]
}

interface AnimeNote {
	file: TFile
	anilist: number | null
	mal: number | null
}

interface ImportRow {
	sourceId: string | null
	altId: string | null
	title: string
	total: number
	progress: number
	score: number
	complete: boolean
}

export default class LibraryPlugin extends Plugin {
	settings!: ILibrarySettings
	private registry = new ProviderRegistry()
	private refreshTimer: number | null = null
	private bannerTimer: number | null = null
	private bannerRetries = 0
	private isRefreshing = false
	private settingTab: LibrarySettingTab | null = null
	private malRefreshing: Promise<string | null> | null = null
	private psnRefreshing: Promise<string | null> | null = null
	private steamImporting = false
	private nintendoImporting = false
	private lookingUp = false
	private psnImporting = false
	private watchImporting = false
	// Notes an import just found or made, before the metadata cache knows the new ones
	private watchNotes = new Map<string, TFile>()
	// shows whose note got its Netflix ID in this import: their viewings tick, nothing to undo yet
	private netflixFresh = new Set<number>()
	// video notes already read afresh this session
	private youtubeFresh = new Set<string>()
	// per show, in this import: a first pass over a note that had the ID before (unticked = unticked by hand)
	private netflixSeeding = new Map<number, boolean>()
	private malImporting = false
	private anilistImporting = false
	// our own MAL write coming back: no echo push
	private malPushing = false
	// The sign-in ran out: said once a session, not on every attempt.
	private psnExpiredSaid = false
	private psnRenewAfter = 0
	// keyed Source:Source ID, fetched once a session
	private recommendations = new Map<string, Promise<Recommendation[]>>()
	// an album's awards, looked up once a session
	private albumAwards = new Map<string, Promise<Award[]>>()
	// sleeps between import steps; unload wakes them so their finally blocks run
	private pauses = new Map<number, () => void>()
	private refreshCooldowns = new Map<string, number>()
	private syncingLinks = new Set<string>()
	private linkTimers = new Map<string, number>()
	private fillingCanvases = new Set<string>()
	private malPushTimers = new Map<string, number>()
	private imdbPushTimers = new Map<string, number>()
	private traktPushTimers = new Map<string, number>()
	private traktPushing = false
	private kitsuPushTimers = new Map<string, number>()
	private kitsuImporting = false
	// our own Kitsu write coming back: no echo push
	private kitsuPushing = false
	private kitsuRefreshing: Promise<string | null> | null = null
	private traktRefreshing: Promise<string | null> | null = null
	private watchPushing = false
	// notes deleted in the last second, offered together for removal from the sites
	private removals: Removal[] = []
	private removalTimer = 0
	private enrichTimer: number | null = null
	private enrichSleepTimer: number | null = null
	private enrichWait: (() => void) | null = null
	private enrichRunning = false
	private enrichAgain = false
	private unloaded = false
	private keySignatures: Record<string, string> = {}
	private lightbox: Lightbox | null = null
	// unfolded seasons per note; screen state only
	private openSeasons = new Map<string, Set<number>>()
	private coverQueue = new Set<string>()
	private completeSeen = new Map<string, boolean>()
	private coverWorking = false
	private coverFailed = new Set<string>()
	private trophyLists = new Map<string, { trophies: PsnTrophy[]; total: number } | null>()
	private openTrophies = new Set<string>()
	private chapterLookups = new Set<string>()

	async onload(): Promise<void> {
		await this.loadSettings()
		const googleBooks = new GoogleBooksProvider(() => this.settings.googleBooksApiKey)
		const openLibrary = new OpenLibraryProvider()
		const tmdb = new TmdbEnricher(() => this.settings.tmdbApiKey)
		// Cinemeta is keyless; TMDB runs first and wins where both have data
		this.registry.register(
			new OmdbProvider(() => this.settings.omdbApiKey, [tmdb, new CinemetaEnricher(), new RottenTomatoesEnricher()])
		)
		this.registry.register(new BookAggregatorProvider(googleBooks, openLibrary))
		const trailers = new GameTrailerFinder(() => ({ id: this.settings.twitchClientId, secret: this.settings.twitchClientSecret }))
		this.registry.register(new GameAggregatorProvider(
			new RawgProvider(() => this.settings.rawgApiKey, trailers),
			new SteamProvider(trailers),
			new WikidataGameProvider()
		))
		this.registry.register(new DeezerProvider())
		this.registry.register(new AnimeAggregatorProvider(new AnimeProvider(() => this.settings), new MalProvider(() => MAL_CLIENT_ID, () => this.settings), new KitsuProvider(() => this.settings)))
		this.registry.register(new ComicsAggregatorProvider(
			new ComicsProvider(() => this.settings.comicVineApiKey),
			new WikidataComicProvider(),
			new MangaProvider(() => this.settings)
		))
		this.settingTab = new LibrarySettingTab(this.app, this)
		this.addSettingTab(this.settingTab)

		this.registerView(LIBRARY_VIEW_TYPE, (leaf) => new LibraryView(leaf, this))
		this.registerMarkdownCodeBlockProcessor('library', (source, el, ctx) => {
			ctx.addChild(new LibraryBlock(el, this, source))
		})
		this.addRibbonIcon('library', tr('view.title'), () => { void this.activateView() })

		const banner = (): void => {
			this.bannerRetries = 0
			if (this.bannerTimer) window.clearTimeout(this.bannerTimer)
			this.bannerTimer = window.setTimeout(() => this.refreshBanner(), 50)
		}
		this.registerEvent(this.app.workspace.on('file-open', (file) => {
			banner()
			if (file instanceof TFile && file.extension === 'canvas') void this.fillLinkCanvas(file)
			else if (file instanceof TFile) {
				void this.youtubeRefresh(file)
				const existing = this.linkTimers.get(file.path)
				if (existing) window.clearTimeout(existing)
				this.linkTimers.set(file.path, window.setTimeout(() => {
					this.linkTimers.delete(file.path)
					void this.syncNote(file)
				}, 400))
			}
		}))
		this.registerEvent(this.app.workspace.on('layout-change', () => { banner() }))
		this.app.workspace.onLayoutReady(() => {
			if (this.unloaded) return
			// registered on layout-ready: startup re-indexes every note changed while the app was closed
			this.registerEvent(
				this.app.metadataCache.on('changed', (file) => {
					if (this.app.workspace.getActiveFile()?.path === file.path) banner()
					if (this.syncingLinks.has(file.path)) return
					if (isTemplateFile(file.path)) return
					const existing = this.linkTimers.get(file.path)
					if (existing) window.clearTimeout(existing)
					this.linkTimers.set(file.path, window.setTimeout(() => {
						this.linkTimers.delete(file.path)
						void this.syncNote(file)
					}, 800))
					const existingPush = this.malPushTimers.get(file.path)
					if (existingPush) window.clearTimeout(existingPush)
					this.malPushTimers.set(file.path, window.setTimeout(() => {
						this.malPushTimers.delete(file.path)
						void this.malPush(file)
					}, 800))
					const existingKitsu = this.kitsuPushTimers.get(file.path)
					if (existingKitsu) window.clearTimeout(existingKitsu)
					this.kitsuPushTimers.set(file.path, window.setTimeout(() => {
						this.kitsuPushTimers.delete(file.path)
						void this.kitsuPush(file)
					}, 800))
					this.armImdbPush(file)
					this.armTraktPush(file)
				})
			)
			this.registerEvent(this.app.metadataCache.on('deleted', (file, prev) => this.noteDeleted(file, prev)))
			this.refreshBanner()
			this.scheduleEnrich(ENRICH_START_DELAY)
			// MAL then AniList: two imports at once could create the same note twice
			this.registerInterval(window.setTimeout(() => this.syncTick(), 60000))
			this.registerInterval(window.setInterval(() => this.syncTick(), 3600000))
			// PSN, Steam, Nintendo in turn: each finds the notes the others wrote
			this.registerInterval(window.setTimeout(() => this.gameSyncTick(), 60000))
			this.registerInterval(window.setTimeout(() => this.watchSyncTick(), 60000))
			this.registerInterval(window.setInterval(() => this.watchSyncTick(), 3600000))
			this.registerInterval(window.setTimeout(() => void this.airingIfDue(), 30000))
			this.seedComplete()
			this.registerInterval(window.setTimeout(() => this.coverSweep(), 20000))
			// notes not yet on Trakt, e.g. a pass cut short by a restart
			this.registerInterval(window.setTimeout(() => void this.traktBackfill(), 90000))
			this.registerInterval(window.setInterval(() => void this.airingIfDue(), 3600000))
			this.registerInterval(window.setInterval(() => this.gameSyncTick(), 3600000))
		})
		this.keySignatures = this.apiKeySignatures()

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				if (this.refreshTimer) window.clearTimeout(this.refreshTimer)
				this.refreshTimer = window.setTimeout(() => { void this.tryRefresh(false) }, 300)
				banner()
			})
		)

		this.addCommand({
			id: 'open',
			name: tr('cmd.openLibrary'),
			callback: () => { void this.activateView() }
		})

		this.addCommand({
			id: 'add-content',
			name: tr('cmd.addContent'),
			callback: () => this.openAddContent()
		})

		this.addCommand({
			id: 'add-to-category',
			name: tr('cmd.addToCategory'),
			callback: () => this.openAddToCategory()
		})

		this.addCommand({
			id: 'refresh-metadata',
			name: tr('cmd.refresh'),
			checkCallback: (checking: boolean) => {
				if (!this.activeLibraryFile()) return false
				if (!checking) void this.tryRefresh(true)
				return true
			}
		})

		this.addCommand({
			id: 'refresh-all-metadata',
			name: tr('cmd.refreshAll'),
			callback: () => { void this.enrichPass(true) }
		})

		this.addCommand({
			id: 'search',
			name: tr('cmd.searchLibrary'),
			callback: () => this.openLibrarySearch()
		})

		this.addCommand({
			id: 'rebuild-graph-links',
			name: tr('cmd.rebuildLinks'),
			callback: () => { void this.rebuildGraphLinks() }
		})

		this.addCommand({
			id: 'find-duplicates',
			name: tr('cmd.findDuplicates'),
			callback: () => this.openDuplicates()
		})

		this.addCommand({
			id: 'share-current',
			name: tr('cmd.share'),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile()
				const target = shareTargetFromFile(this.app, file)
				const isLibrary = !!target && this.settings.categories.some(
					c => c.typeValue === toStr(target.fm.Type)
				)
				if (!isLibrary) return false
				if (!checking && target) new ShareModal(this.app, target.fm, target.name, this.coverProperty()).open()
				return true
			}
		})

		this.addCommand({
			id: 'anilist-push',
			name: tr('cmd.anilistPush'),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile()
				const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined
				if (!fm || toStr(fm.Source) !== 'anilist' || !toStr(fm['Source ID'])) return false
				if (!checking) void this.anilistPushCurrent()
				return true
			}
		})

		this.addCommand({
			id: 'anilist-pull',
			name: tr('cmd.anilistPull'),
			callback: () => { void this.anilistPull() }
		})

		this.addCommand({
			id: 'anilist-import',
			name: tr('cmd.anilistImport'),
			callback: () => { void this.anilistImport(true) }
		})

		this.addCommand({
			id: 'mal-push',
			name: tr('cmd.malPush'),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile()
				const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined
				if (!fm || toStr(fm.Source) !== 'anilist' || !toStr(fm['Source ID'])) return false
				if (!checking) void this.malPushCurrent()
				return true
			}
		})

		this.addCommand({
			id: 'mal-pull',
			name: tr('cmd.malPull'),
			callback: () => { void this.malPull() }
		})

		this.addCommand({
			id: 'mal-import',
			name: tr('cmd.malImport'),
			callback: () => { void this.malImport(true) }
		})

		this.addCommand({
			id: 'kitsu-push',
			name: tr('cmd.kitsuPush'),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile()
				const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined
				if (!fm || toStr(fm.Source) !== 'anilist' || !toStr(fm['Source ID'])) return false
				if (!checking) void this.kitsuPushCurrent()
				return true
			}
		})

		this.addCommand({
			id: 'kitsu-pull',
			name: tr('cmd.kitsuPull'),
			callback: () => { void this.kitsuPull() }
		})

		this.addCommand({
			id: 'build-map',
			name: tr('cmd.libraryMap'),
			callback: () => { void this.buildLibraryMap() }
		})

		this.addCommand({
			id: 'trakt-import',
			name: tr('cmd.traktImport'),
			callback: () => { void this.traktImport(true) }
		})

		this.addCommand({
			id: 'kitsu-import',
			name: tr('cmd.kitsuImport'),
			callback: () => { void this.kitsuImport(true) }
		})

		this.addCommand({
			id: 'steam-import',
			name: tr('cmd.steamImport'),
			callback: () => { void this.steamImport(true) }
		})

		this.addCommand({
			id: 'psn-import',
			name: tr('cmd.psnImport'),
			callback: () => { void this.psnImport(true) }
		})
		this.addCommand({
			id: 'nintendo-import',
			name: tr('cmd.nintendoImport'),
			callback: () => { void this.nintendoImport(true) }
		})
	}

	onunload(): void {
		this.unloaded = true
		if (this.refreshTimer) window.clearTimeout(this.refreshTimer)
		if (this.bannerTimer) window.clearTimeout(this.bannerTimer)
		window.clearTimeout(this.removalTimer)
		for (const timer of this.linkTimers.values()) window.clearTimeout(timer)
		for (const timer of this.malPushTimers.values()) window.clearTimeout(timer)
		for (const timer of this.imdbPushTimers.values()) window.clearTimeout(timer)
		for (const timer of this.kitsuPushTimers.values()) window.clearTimeout(timer)
		for (const timer of this.traktPushTimers.values()) window.clearTimeout(timer)
		this.traktPushTimers.clear()
		this.refreshTimer = null
		this.bannerTimer = null
		this.linkTimers.clear()
		this.malPushTimers.clear()
		this.imdbPushTimers.clear()
		this.kitsuPushTimers.clear()
		this.refreshCooldowns.clear()
		if (this.enrichTimer) window.clearTimeout(this.enrichTimer)
		if (this.enrichSleepTimer) window.clearTimeout(this.enrichSleepTimer)
		for (const [id, wake] of this.pauses) {
			window.clearTimeout(id)
			wake()
		}
		this.pauses.clear()
		this.recommendations.clear()
		this.enrichTimer = null
		this.enrichSleepTimer = null
		const resume = this.enrichWait
		this.enrichWait = null
		if (resume) resume()
		// headers and lightbox live in Obsidian's own DOM: clear them on unload
		this.lightbox?.close()
		this.lightbox = null
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			leaf.view.containerEl.querySelectorAll('.note-header-wrap').forEach(h => h.remove())
		}
	}

	async saveSettings(): Promise<void> {
		// a changed key unlocks data the earlier pass could not fetch: drop its marks and re-walk
		const signatures = this.apiKeySignatures()
		const changed = Object.keys(signatures).filter(type => signatures[type] !== this.keySignatures[type])
		if (changed.length > 0) {
			this.keySignatures = signatures
			this.dropEnrichMarks(changed)
			this.scheduleEnrich(ENRICH_START_DELAY)
		}
		await this.persistSettings()
		this.refreshViews()
	}

	// data.json changed on disk (another device via sync): reload or this session overwrites it
	async onExternalSettingsChange(): Promise<void> {
		try {
			await this.loadSettings()
		} catch (e) {
			console.error('Library: settings reload error', e)
			return
		}
		this.keySignatures = this.apiKeySignatures()
		this.refreshViews()
		// The open tab holds the replaced settings object: an edit there would be lost.
		this.settingTab?.refresh()
	}

	// saves without re-rendering views: for state the view already applied to its own DOM
	async persistSettings(): Promise<void> {
		await this.saveData(this.settings)
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app
		const existing = workspace.getLeavesOfType(LIBRARY_VIEW_TYPE)
		if (existing[0]) {
			void workspace.revealLeaf(existing[0])
			return
		}
		const leaf = workspace.getLeaf('tab')
		await leaf.setViewState({ type: LIBRARY_VIEW_TYPE, active: true })
		void workspace.revealLeaf(leaf)
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(LIBRARY_VIEW_TYPE)) {
			if (leaf.view instanceof LibraryView) leaf.view.render()
		}
	}

	openLibrarySearch(): void {
		const types = new Set(this.settings.categories.map(c => c.typeValue))
		const files = this.app.vault.getMarkdownFiles().filter(f => {
			if (isTemplateFile(f.path)) return false
			const type: unknown = this.app.metadataCache.getFileCache(f)?.frontmatter?.Type
			return typeof type === 'string' && types.has(type)
		})
		new LibrarySearchModal(this.app, files, (file) => {
			void this.app.workspace.getLeaf(false).openFile(file)
		}).open()
	}

	// categories first, then media with none yet
	addChoices(): AddChoice[] {
		const categories = this.settings.categories
		const choices: AddChoice[] = categories.map(category => ({ category }))
		for (const type of MEDIA) {
			if (!categories.some(c => c.contentType === type)) choices.push({ type })
		}
		return choices
	}

	// one search over every medium; a title goes to the first category of its medium, made if missing
	openAddContent(): void {
		const known = new Set<string>()
		for (const file of this.app.vault.getMarkdownFiles()) {
			const id = toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.['Source ID'])
			if (id) known.add(id)
		}
		new SearchEverythingModal(this.app, {
			providerFor: (type) => this.registry.forType(type) ?? undefined,
			known,
			folded: (type) => this.settings.searchFolded.indexOf(type) >= 0,
			toggle: (type) => {
				const folded = this.settings.searchFolded
				this.settings.searchFolded = folded.indexOf(type) >= 0 ? folded.filter(t => t !== type) : [...folded, type]
				void this.persistSettings()
			},
			onPick: (type, result) => {
				void this.createFromResult(this.settings.categories.find(c => c.contentType === type) ?? type, result)
			}
		}).open()
	}

	// a chosen category: the way into a manual one, or into one of two of the same medium
	openAddToCategory(): void {
		new PickTypeModal(this.app, this.addChoices(), (choice) => {
			const target: Target = 'category' in choice ? choice.category : choice.type
			const provider = this.registry.forType(typeOf(target))
			if (!provider) {
				new PromptModal(this.app, tr('modal.search.placeholder'), (title) => {
					void this.createManual(target, title)
				}).open()
				return
			}
			new AddContentModal(this.app, provider, typeOf(target), (result) => {
				void this.createFromResult(target, result)
			}).open()
		}).open()
	}

	private async categoryFor(target: Target): Promise<ICategory> {
		if (typeof target !== 'string') return target
		const existing = this.settings.categories.find(c => c.contentType === target)
		if (existing) return existing
		const category = newCategory(target, this.settings)
		this.settings.categories.push(category)
		addCategoryTop(this.settings, category.typeValue)
		await this.saveSettings()
		new Notice(tr('notice.categoryCreated', { name: categoryLabel(category) }))
		return category
	}

	private activeLibraryFile(): TFile | null {
		const file = this.app.workspace.getActiveFile()
		const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined
		const category = fm ? this.settings.categories.find(c => c.typeValue === toStr(fm.Type)) : undefined
		return file && category && this.registry.forType(category.contentType) ? file : null
	}

	private async createManual(target: Target, title: string): Promise<void> {
		try {
			const category = await this.categoryFor(target)
			const path = await this.uniqueNotePath(title, category.folder)
			const file = await this.app.vault.create(path, await this.templateText(category))
			const tracking = trackingOf(category.contentType)
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				Object.assign(fm, {
					Type: category.typeValue,
					Name: title,
					'My Rating': null,
					...(tracking !== 'progress' ? { Complete: false } : {}),
					...(tracking !== 'watched' ? { Progress: '' } : {}),
					Date: todayDmy(),
				})
			})
			await this.app.workspace.getLeaf(false).openFile(file)
			new Notice(tr('notice.created', { name: title }))
		} catch (e) {
			console.error('Library: create note error', e)
			new Notice(tr('notice.createFailed'))
		}
	}

	private async createFromResult(target: Target, result: SearchResult): Promise<void> {
		const provider = this.registry.forType(typeOf(target))
		if (!provider) return
		new Notice(tr('notice.searching'))
		try {
			const meta = await provider.fetch(result.sourceId, typeOf(target), result.raw)
			if (!meta) {
				new Notice(tr('notice.notFound'))
				return
			}

			const url = toStr(meta.fields.URL)
			if (url) {
				const existing = this.findFileByUrl(url)
				if (existing) {
					new Notice(tr('notice.duplicate'))
					void this.app.workspace.getLeaf(false).openFile(existing)
					return
				}
			}

			// the category is made only now, once a note is sure to follow
			const category = await this.categoryFor(target)
			const file = await this.newNote(category, provider.id, result.sourceId, result.title, meta)
			await this.app.workspace.getLeaf(false).openFile(file)
			new Notice(tr('notice.created', { name: toStr(meta.fields.Name) || result.title }))
		} catch (e) {
			console.error('Library: create note error', e)
			new Notice(tr('notice.createFailed'))
		}
	}

	private async newNote(category: ICategory, source: string, sourceId: string, title: string, meta: NormalizedMetadata, extra: Record<string, unknown> = {}): Promise<TFile> {
		const path = await this.uniqueNotePath(title, category.folder)
		const file = await this.app.vault.create(path, await this.templateText(category))
		// series/anime/books track progress, movies a watched switch (Complete), others both
		const tracking = trackingOf(category.contentType)
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			Object.assign(fm, {
				Type: category.typeValue,
				...(tracking !== 'watched' ? { Progress: meta.progressTotal ? `0/${String(meta.progressTotal)}` : '' } : {}),
				'My Rating': null,
				...(tracking !== 'progress' ? { Complete: false } : {}),
				Date: todayDmy(),
				Source: source,
				'Source ID': sourceId,
			}, extra)
			this.applyMetaFields(fm as Record<string, unknown>, meta)
		})
		return file
	}

	// Steam library into Games: Playtime in hours per owned game; the store API limits requests per minute, so lookups are spaced
	async steamImport(loud = false): Promise<void> {
		if (this.gameImporting()) {
			if (loud) new Notice(tr('notice.steam.importing'))
			return
		}
		if (!Platform.isDesktopApp) { new Notice(tr('notice.steam.desktopOnly')); return }
		const profile = this.settings.steamId.trim()
		if (!profile) { new Notice(tr('notice.steam.notConnected')); return }
		let category = this.settings.categories.find(c => c.contentType === 'game')
		const provider = this.registry.forType('game')
		if (!provider) return
		// with no Games category yet, notes of its default Type still count as known
		const typeValue = category?.typeValue ?? TYPE_DEFAULTS.game ?? 'Game'
		this.steamImporting = true
		let session: SteamSession | null = null
		try {
			if (loud) new Notice(tr('notice.steam.importing'))
			const steam = await steamSession(profile)
			if (!steam) { if (loud) new Notice(tr('notice.steam.failed')); return }
			session = steam
			const games = await ownedGames(steam.token, profile)
			if (!games) { if (loud) new Notice(tr('notice.steam.failed')); return }
			const byUrl = new Map<string, TFile>()
			const gameNotes: TFile[] = []
			for (const file of this.app.vault.getMarkdownFiles()) {
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
				if (!fm || toStr(fm.Type) !== typeValue || isTemplateFile(file.path)) continue
				gameNotes.push(file)
				if (toStr(fm.URL)) byUrl.set(toStr(fm.URL), file)
			}
			// one note per game across platforms: matched by name
			const byName = (name: string): TFile | undefined => gameNotes.find((file) => {
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
				return sameTitle(toStr(fm?.Name) || file.basename, name)
			})
			let created = 0
			let updated = 0
			const today = dmyOf(new Date().toISOString())
			for (const game of games) {
				if (this.unloaded) return
				const url = `https://store.steampowered.com/app/${String(game.appId)}/`
				const hours = playtimeHours(game.minutes)
				const lastPlayed = game.lastPlayed > 0 ? dmyOf(new Date(game.lastPlayed * 1000).toISOString()) : ''
				const existing = byUrl.get(url) ?? byName(game.name)
				try {
					const fm = existing ? this.app.metadataCache.getFileCache(existing)?.frontmatter : undefined
					const listed = existing ? toStrArray(fm?.Platforms).some(value => value.toLowerCase() === 'steam') : false
					// stats only when the game moved: a session under six minutes can leave every number unchanged
					const moved = !existing || !listed || Number(fm?.['Playtime Steam']) !== hours
						|| (lastPlayed !== '' && toStr(fm?.['Last Played']) !== lastPlayed)
						|| lastPlayed === today
					const stats = moved && game.minutes > 0 ? await steam.stats(game.appId) : null
					const pairs: Array<[string, unknown]> = []
					if (lastPlayed) pairs.push(['Last Played', lastPlayed])
					if (stats) {
						pairs.push(['Achievements', `${String(stats.achieved)}/${String(stats.total)}`])
						pairs.push(['Progress', `${String(Math.round((stats.achieved / stats.total) * 100))}/100`])
						if (stats.achieved === stats.total) pairs.push(['Complete', true])
					}
					// a PSN-owned note keeps Progress/Last Played/Complete: the two imports never fight
					const psnOwned = !!fm && 'PSN ID' in fm
					const wanted = pairs.filter(([field]) => !(psnOwned && (field === 'Progress' || field === 'Last Played' || field === 'Complete')))
					if (existing) {
						const unchanged = listed && Number(fm?.['Playtime Steam']) === hours
							&& wanted.every(([field, value]) => toStr(fm?.[field]) === toStr(value))
						if (unchanged) continue
						await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
							for (const [field, value] of wanted) {
								if (field === 'Complete' && current.Complete === true) continue
								current[field] = value
							}
							addPlatform(current, 'Steam', hours)
						})
						updated++
						continue
					}
					const sourceId = 'steam:' + String(game.appId)
					const meta = await provider.fetch(sourceId, 'game') ?? {
						fields: { Name: game.name, URL: url, Cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${String(game.appId)}/header.jpg` },
						progressTotal: null,
						imdbId: null
					}
					if (!category) category = await this.categoryFor('game')
					const extra: Record<string, unknown> = {}
					addPlatform(extra, 'Steam', hours)
					for (const [field, value] of wanted) extra[field] = value
					const file = await this.newNote(category, provider.id, sourceId, toStr(meta.fields.Name) || game.name, meta, extra)
					byUrl.set(url, file)
					gameNotes.push(file)
					created++
					await this.pause(1500)
				} catch (e) {
					console.error('Library: Steam import error', game.appId, e)
				}
			}
			this.settings.steamLastImport = Date.now()
			await this.persistSettings()
			if (loud || created > 0 || updated > 0) new Notice(tr('notice.steam.imported', { created, updated }))
		} finally {
			session?.close()
			this.steamImporting = false
		}
	}

	// hand-typed names become links; the legacy Related property is dropped
	private async syncLinkFields(file: TFile, fields: Record<string, unknown>): Promise<void> {
		const marker = '%%library-links%%'

		const cache = this.app.metadataCache.getFileCache(file)?.frontmatter
		const same = (current: unknown, links: string[]): boolean =>
			Array.isArray(current) && current.length === links.length && current.every((v, i) => String(v) === links[i])
		const patch: Record<string, string[]> = {}
		for (const key of LINK_FIELDS) {
			const links = this.toLinks(fields[key])
			if (links.length > 0 && !same(cache?.[key], links)) patch[key] = links
		}
		const dropRelated = cache?.Related !== undefined
		const changed = Object.keys(patch).length > 0 || dropRelated

		const body = await this.app.vault.read(file)
		const hasLegacy = body.includes(marker)
		if (!changed && !hasLegacy) return

		if (this.syncingLinks.has(file.path)) return
		this.syncingLinks.add(file.path)
		try {
			if (hasLegacy) {
				await this.app.vault.process(file, (data) => {
					const s = String(data)
					const i = s.indexOf(marker)
					return i >= 0 ? s.slice(0, i).replace(/\s+$/, '') + '\n' : s
				})
			}
			if (changed) {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					const current = fm as Record<string, unknown>
					Object.assign(current, patch)
					delete current.Related
				})
			}
		} finally {
			this.syncingLinks.delete(file.path)
		}
	}

	// A title you mark finished goes into its diary; an import's finishes are history, not today.
	private async logFinish(file: TFile, fm: Record<string, unknown>): Promise<void> {
		const done = fm.Complete === true || toStr(fm.Complete) === 'true'
		const before = this.completeSeen.get(file.path)
		this.completeSeen.set(file.path, done)
		if (before !== false || !done || this.anyImporting()) return
		await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => addLog(current, todayIso(), ''))
	}

	// A name links its own note when there is one that isn't a title's.
	private toLinks(value: unknown): string[] {
		return toLinks(value, name => {
			const dest = this.app.metadataCache.getFirstLinkpathDest(name, '')
			const fm = dest?.extension === 'md' ? this.app.metadataCache.getFileCache(dest)?.frontmatter : undefined
			return dest?.extension === 'md' && !(fm && this.kindOf(fm))
		})
	}

	// a cover from the web as an image link, one in the vault as an embed
	private poster(file: TFile, fm: Record<string, unknown>): { path: string; name: string; cover: string } {
		const raw = toStr(coverValue(fm, this.coverProperty())).trim()
		const local = /^!?\[\[([^\]|#]+)/.exec(raw)?.[1]
		const web = safeUrl(raw)
		const cover = web ? `![](${web})` : local ? `![[${local}]]` : ''
		return { path: file.path, name: toStr(fm.Name) || file.basename, cover }
	}

	// A genre's or a person's canvas, drawn when it is opened (a click on an
	// unmade link creates it empty). A canvas you added your own cards to is left alone.
	private async fillLinkCanvas(file: TFile): Promise<void> {
		if (this.fillingCanvases.has(file.path)) return
		this.fillingCanvases.add(file.path)
		try {
			await this.drawLinkCanvas(file)
		} finally {
			this.fillingCanvases.delete(file.path)
		}
	}

	private async drawLinkCanvas(file: TFile): Promise<void> {
		const text = await this.app.vault.read(file)
		try {
			const nodes = text.trim() ? (JSON.parse(text) as { nodes?: { id?: unknown }[] }).nodes ?? [] : []
			if (!nodes.every(node => typeof node.id === 'string' && node.id.startsWith('lib-'))) return
		} catch {
			return
		}
		const sections = new Map<string, { path: string; name: string; cover: string }[]>()
		for (const note of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(note.path)) continue
			const fm = this.app.metadataCache.getFileCache(note)?.frontmatter
			const category = fm ? this.settings.categories.find(c => c.typeValue === toStr(fm.Type)) : undefined
			if (!fm || !category) continue
			const named = NAME_FIELDS.some(key => toStrArray(fm[key]).some(value => linkTarget(value) === file.basename))
			if (!named) continue
			const list = sections.get(category.name) ?? []
			list.push(this.poster(note, fm))
			sections.set(category.name, list)
		}
		if (sections.size === 0) return
		const ordered = this.settings.categories
			.filter(c => sections.has(c.name))
			.map(c => ({ label: c.name, titles: (sections.get(c.name) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }))
		const fresh = JSON.stringify(linkCanvas(file.basename, ordered), null, '\t')
		if (fresh !== text) await this.app.vault.modify(file, fresh)
		// one a link click just made moves out of the vault root into the library
		const folder = `${this.settings.libraryFolder ? `${this.settings.libraryFolder}/` : ''}Canvases`
		if (!text.trim() && file.parent?.path !== folder && !this.app.vault.getAbstractFileByPath(`${folder}/${file.name}`)) {
			await this.ensureFolder(folder)
			await this.app.fileManager.renameFile(file, `${folder}/${file.name}`)
		}
	}

	// A genre or a person shown in Library opens like its link: its note, or its canvas.
	linkName(el: HTMLElement, value: string): void {
		const link = this.toLinks(value)[0]
		const target = link ? /^\[\[([^\]|]+)/.exec(link)?.[1] : undefined
		if (!target) return
		el.classList.add('library-name-link')
		el.setAttribute('role', 'link')
		el.setAttribute('tabindex', '0')
		const open = (event: Event): void => {
			event.preventDefault()
			event.stopPropagation()
			void this.app.workspace.openLinkText(target, '', false)
		}
		el.addEventListener('click', open)
		el.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(event) })
	}

	// A canvas of the library: titles joined by the people they share.
	async buildLibraryMap(): Promise<void> {
		const titles: { path: string; name: string; cover: string; people: string[] }[] = []
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const kind = fm ? this.kindOf(fm) : undefined
			if (!fm || !kind) continue
			const people = [...toStrArray(fm.Creator), ...toStrArray(fm.Cast)].map(linkLabel).filter(Boolean)
			if (people.length === 0) continue
			titles.push({ ...this.poster(file, fm), people })
		}
		const canvas = libraryMap(titles)
		if (canvas.edges.length === 0) {
			new Notice(tr('notice.map.empty'))
			return
		}
		const path = `${this.settings.libraryFolder ? `${this.settings.libraryFolder}/` : ''}Library map.canvas`
		if (this.settings.libraryFolder) await this.ensureFolder(this.settings.libraryFolder)
		const text = JSON.stringify(canvas, null, '\t')
		const existing = this.app.vault.getFileByPath(path)
		const file = existing ? (await this.app.vault.modify(existing, text), existing) : await this.app.vault.create(path, text)
		// a canvas already on screen keeps its old nodes, so close it and open the fresh one
		for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
			if (leaf.getViewState().state?.file === file.path) leaf.detach()
		}
		await this.app.workspace.getLeaf(true).openFile(file)
	}

	private seedComplete(): void {
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (fm) this.completeSeen.set(file.path, fm.Complete === true || toStr(fm.Complete) === 'true')
		}
	}

	private anyImporting(): boolean {
		return this.watchImporting || this.malImporting || this.anilistImporting || this.kitsuImporting || this.gameImporting()
	}

	private async syncNote(file: TFile): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		if (!fm) return
		if (!this.settings.categories.some(c => c.typeValue === toStr(fm.Type))) return
		try {
			await this.logFinish(file, fm)
			await this.syncTracking(file, fm)
			await this.syncLinkFields(file, fm)
			this.queueCover(file)
		} catch (e) {
			console.error('Library: note sync error', file.path, e)
		}
	}

	private kindOf(fm: Record<string, unknown>): ContentType | undefined {
		return this.settings.categories.find(c => c.typeValue === toStr(fm.Type))?.contentType
	}

	// legacy shapes: a Complete from before 2.4.1 fills the progress and goes; a movie's Progress becomes Complete
	private async syncTracking(file: TFile, fm: Record<string, unknown>): Promise<void> {
		const tracking = trackingOf(this.kindOf(fm))
		const match = toStr(fm.Progress).match(progressPattern)
		const watched = match ? Number(match[1]) : 0
		const total = match ? Number(match[2]) : 0
		const complete = fm.Complete === true || toStr(fm.Complete) === 'true'
		const fill = (current: Record<string, unknown>): void => {
			current.Progress = `${String(total)}/${String(total)}`
			const kind = this.trackKind(fm)
			if (kind) followProgress(current, kind)
		}
		let update: ((current: Record<string, unknown>) => void) | null = null
		if (tracking === 'progress') {
			if (!('Complete' in fm) || (complete && total <= 0)) return
			update = (current) => {
				if (complete && watched < total) fill(current)
				delete current.Complete
			}
		} else if (tracking === 'watched') {
			if (!('Progress' in fm)) return
			update = (current) => {
				current.Complete = complete || watched > 0
				delete current.Progress
			}
		} else {
			if (!complete || total <= 0 || watched === total) return
			update = fill
		}
		if (this.syncingLinks.has(file.path)) return
		this.syncingLinks.add(file.path)
		try {
			await this.app.fileManager.processFrontMatter(file, (current) => update?.(current as Record<string, unknown>))
		} finally {
			this.syncingLinks.delete(file.path)
		}
	}

	private async rebuildGraphLinks(): Promise<void> {
		const types = new Set(this.settings.categories.map(c => c.typeValue))
		const files = this.app.vault.getMarkdownFiles().filter(f => {
			if (isTemplateFile(f.path)) return false
			const type: unknown = this.app.metadataCache.getFileCache(f)?.frontmatter?.Type
			return typeof type === 'string' && types.has(type)
		})
		let count = 0
		for (const file of files) {
			await this.syncNote(file)
			count++
		}
		new Notice(tr('notice.linksRebuilt', { count }))
	}

	private findFileByUrl(url: string): TFile | null {
		const types = new Set(this.settings.categories.map(c => c.typeValue))
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || typeof fm.Type !== 'string' || !types.has(fm.Type)) continue
			if (toStr(fm.URL) === url) return file
		}
		return null
	}

	private async anilistPushCurrent(): Promise<void> {
		const token = this.settings.anilistToken.trim()
		if (!token) { new Notice(tr('notice.anilist.noToken')); return }
		const file = this.app.workspace.getActiveFile()
		if (!file) { new Notice(tr('notice.anilist.notAnime')); return }
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const note = fm && toStr(fm.Source) === 'anilist' ? animeIds(toStr(fm['Source ID'])) : null
		if (!fm || !note) {
			new Notice(tr('notice.anilist.notAnime'))
			return
		}
		const mediaId = (await this.idsOn('anilist', [{ file, ...note }]))?.get(file)
		if (!mediaId) { new Notice(tr('notice.anilist.pushFailed')); return }
		const watched = parseWatched(fm.Progress)
		const status = listStatus(isFinished(fm, this.kindOf(fm) ?? 'anime'), watched)
		const rating = Number(toStr(fm['My Rating']))
		const scoreRaw = Number.isFinite(rating) && rating > 0 ? Math.min(100, Math.round(rating * 10)) : null
		const ok = await pushEntry(token, mediaId, watched, status, scoreRaw)
		new Notice(ok
			? tr('notice.anilist.pushed', { name: toStr(fm.Name) || file.basename })
			: tr('notice.anilist.pushFailed'))
	}

	private async anilistPull(): Promise<void> {
		const token = this.settings.anilistToken.trim()
		if (!token) { new Notice(tr('notice.anilist.noToken')); return }
		const viewer = await aniListViewer(token)
		if (!viewer) { new Notice(tr('notice.anilist.pullFailed')); return }
		new Notice(tr('notice.anilist.pulling'))
		const entries = await fetchList(token, viewer.id)
		if (!entries) {
			new Notice(tr('notice.anilist.pullFailed'))
			return
		}
		const ids = await this.idsOn('anilist', this.animeNotes())
		if (!ids) {
			new Notice(tr('notice.anilist.pullFailed'))
			return
		}
		const byId = new Map<number, AniListEntry>()
		for (const e of entries) byId.set(e.mediaId, e)
		const updated = await this.applyPulled(ids, id => {
			const entry = byId.get(id)
			return entry && { progress: entry.progress, complete: entry.status === 'COMPLETED' }
		})
		new Notice(tr('notice.anilist.pulled', { count: updated }))
	}

	// anime notes (Source: anilist) with the id each was added under
	private animeNotes(): AnimeNote[] {
		const out: AnimeNote[] = []
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || toStr(fm.Source) !== 'anilist') continue
			const ids = animeIds(toStr(fm['Source ID']))
			if (ids) out.push({ file, ...ids })
		}
		return out
	}

	// each note's id on one site, else resolved through AniList; null when it cannot answer
	private async idsOn(site: 'anilist' | 'mal', notes: AnimeNote[]): Promise<Map<TFile, number> | null> {
		const other = site === 'mal' ? 'anilist' : 'mal'
		const lookup = notes.filter(note => note[site] === null).map(note => note[other] ?? 0)
		const found = lookup.length === 0 ? new Map<number, number>()
			: site === 'mal' ? await malIdsFor(lookup) : await anilistIdsFor(lookup)
		if (!found) return null
		const out = new Map<TFile, number>()
		for (const note of notes) {
			const id = note[site] ?? found.get(note[other] ?? 0)
			if (id) out.set(note.file, id)
		}
		return out
	}

	private async applyPulled(ids: Map<TFile, number>, entryFor: (id: number) => { progress: number; complete: boolean } | undefined): Promise<number> {
		let updated = 0
		for (const [file, id] of ids) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const entry = entryFor(id)
			if (!fm || !entry) continue
			// forward only: never regress a note that is locally further along
			const match = toStr(fm.Progress).match(progressPattern)
			const noteTotal = match ? Number(match[2]) : 0
			const localWatched = parseWatched(fm.Progress)
			// the note's episode list caps it: ticks past the list would be dropped and pulled again each sync
			const listed = seasonsOf(fm, 'anime').reduce((n, season) => n + season.episodes.length, 0)
			const pulled = Math.max(localWatched, entry.progress)
			const reached = entry.complete ? Math.max(pulled, noteTotal) : pulled
			const newWatched = listed > 0 ? Math.max(localWatched, Math.min(reached, listed)) : reached
			if (newWatched === localWatched && !('Complete' in fm)) continue
			// keep the note's own total: Progress stays watched/total, never "15/12"
			const total = String(Math.max(noteTotal, newWatched, 1))
			try {
				await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
					current.Progress = `${String(newWatched)}/${total}`
					delete current.Complete
					followProgress(current, 'anime')
				})
				updated++
			} catch (e) {
				console.error('Library: pull error', file.path, e)
			}
		}
		return updated
	}

	connectPsn(): Promise<boolean> {
		if (!Platform.isDesktopApp) {
			new Notice(tr('notice.psn.desktopOnly'))
			return Promise.resolve(false)
		}
		return new Promise<boolean>((resolve) => {
			new PsnLoginModal(this.app, (code) => {
				void (async () => {
					const tokens = code ? await exchangePsnCode(code) : null
					if (tokens) {
						this.settings.psnTokens = tokens
						await this.saveSettings()
					}
					if (code) new Notice(tr(tokens ? 'notice.psn.connected' : 'notice.psn.failed'))
					resolve(tokens !== null)
					if (tokens) void this.psnImport(true)
				})()
			}).open()
		})
	}

	connectMal(): Promise<boolean> {
		if (!Platform.isDesktopApp) {
			new Notice(tr('notice.mal.desktopOnly'))
			return Promise.resolve(false)
		}
		return new Promise<boolean>((resolve) => {
			const verifier = makeVerifier()
			const { id, secret } = malClientPair(this.settings)
			new AuthModal(this.app, malAuthUrl(id, verifier), (code) => {
				void (async () => {
					const tokens = code ? await exchangeCode(id, secret, code, verifier) : null
					if (tokens) {
						this.settings.malTokens = tokens
						await this.saveSettings()
					}
					if (code) new Notice(tr(tokens ? 'notice.mal.connected' : 'notice.mal.connectFailed'))
					resolve(tokens !== null)
					if (tokens) void this.malImport(true)
				})()
			}, { title: tr('mal.loginTitle'), extract: codeFromRedirect }).open()
		})
	}

	// AniList: the implicit grant hands the token over in the redirect fragment, no exchange
	connectAnilist(): Promise<boolean> {
		if (!Platform.isDesktopApp) {
			new Notice(tr('notice.anilist.desktopOnly'))
			return Promise.resolve(false)
		}
		return new Promise<boolean>((resolve) => {
			new AuthModal(this.app, anilistAuthUrl(ANILIST_CLIENT_ID), (answer) => {
				void (async () => {
					const token = answer ?? ''
					const viewer = token ? await aniListViewer(token) : null
					if (viewer) {
						this.settings.anilistToken = token
						await this.saveSettings()
					}
					if (answer) new Notice(tr(viewer ? 'settings.anilist.connected' : 'notice.anilist.connectFailed', { name: viewer?.name ?? '' }))
					resolve(viewer !== null)
					if (viewer) void this.anilistImport(true)
				})()
			}, { title: tr('anilist.loginTitle'), extract: tokenFromRedirect }).open()
		})
	}

	// Steam: the window keeps the session the later import reads the library with
	connectSteam(): Promise<boolean> {
		if (!Platform.isDesktopApp) {
			new Notice(tr('notice.steam.desktopOnly'))
			return Promise.resolve(false)
		}
		return new Promise<boolean>((resolve) => {
			new AuthModal(this.app, steamAuthUrl(), (answer) => {
				void (async () => {
					const steamId = answer ?? ''
					if (steamId) {
						this.settings.steamId = steamId
						await this.saveSettings()
					}
					resolve(steamId !== '')
					if (steamId) void this.steamImport(true)
				})()
			}, { title: tr('steam.loginTitle'), extract: steamIdFromRedirect }).open()
		})
	}

	// IMDb, Netflix, YouTube: the window keeps the session the import later reads the site with
	connectSite(site: WatchSite): Promise<boolean> {
		if (!Platform.isDesktopApp) {
			new Notice(tr('notice.site.desktopOnly', { site: SITE_NAME[site] }))
			return Promise.resolve(false)
		}
		return new Promise<boolean>((resolve) => {
			new AuthModal(this.app, SITE_SIGN_IN[site], (answer) => {
				void (async () => {
					if (answer) {
						this.settings.watchSites[site].connected = true
						await this.saveSettings()
					}
					resolve(answer !== null)
					if (answer) void this.watchImport(site, true)
				})()
			}, { title: tr(`site.${site}.loginTitle`), extract: (url) => signedInAt(site, url) }).open()
		})
	}

	// IMDb ratings, watchlist and episode scores; Netflix viewing history and thumbs into Movies and Series.
	// A note found by its IMDb id, Netflix id or name only gains what it lacks; a wrong Netflix id is replaced, your edits win.
	async watchImport(site: WatchSite, loud: boolean): Promise<void> {
		if (this.watchImporting || !Platform.isDesktopApp || !this.settings.watchSites[site].connected) return
		if (site === 'youtube') return this.youtubeImport(loud)
		this.watchImporting = true
		const name = SITE_NAME[site]
		try {
			if (loud) new Notice(tr('notice.site.importing', { site: name }))
			const titles = site === 'imdb' ? await imdbHistory() : await netflixHistory()
			if (titles === 'signed-out') {
				this.settings.watchSites[site].connected = false
				await this.saveSettings()
				new Notice(tr('notice.site.signedOut', { site: name }))
				return
			}
			if (!titles) { if (loud) new Notice(tr('notice.site.failed', { site: name })); return }
			// Netflix gives a name only: Wikidata knows the IMDb id of most Netflix IDs, and an anime's AniList id
			if (site === 'netflix') {
				const known = await idsForNetflix(titles.titles.map(title => title.netflixId ?? 0))
				for (const title of titles.titles) {
					const ids = title.netflixId ? known.get(title.netflixId) : undefined
					title.imdb = ids?.imdb
					title.anime = ids?.anilist ? String(ids.anilist) : ids?.mal ? `${MalProvider.PREFIX}${String(ids.mal)}` : undefined
				}
			}
			let created = 0
			let updated = 0
			for (const title of titles.titles) {
				if (this.unloaded) return
				// deleted here and kept by Netflix: no new note, unless one with that id came back
				if (title.netflixId && this.settings.netflixIgnored.indexOf(title.netflixId) >= 0 && !this.netflixNoteHeld(title.netflixId)) continue
				try {
					const result = await this.importWatched(title)
					if (result === 'created') created++
					else if (result === 'updated') updated++
				} catch (e) {
					console.error('Library: watch import error', title.name, e)
				}
			}
			// an anime note counts its episodes; it has no season list to tick
			const animeSeen = new Map<WatchedTitle, Set<string>>()
			for (const episode of titles.episodes as Array<EpisodeRating | NetflixEpisode>) {
				if (this.unloaded) return
				if (!('rating' in episode) && episode.series.anime && this.watchNotes.has(`anime:${String(episode.series.netflixId)}`)) {
					const seen = animeSeen.get(episode.series) ?? new Set<string>()
					seen.add(`${String(episode.season)}:${episode.title}`)
					animeSeen.set(episode.series, seen)
					continue
				}
				try {
					const result = 'rating' in episode ? await this.importEpisode(episode) : await this.importViewedEpisode(episode)
					if (result === 'created') created++
					else if (result === 'updated') updated++
				} catch (e) {
					console.error('Library: episode import error', episode.series.name, e)
				}
			}
			for (const [series, seen] of animeSeen) {
				if (this.unloaded) return
				if (await this.netflixAnimeProgress(series, seen.size) === 'updated') updated++
			}
			this.settings.watchSites[site].lastImport = Date.now()
			await this.saveSettings()
			if (loud || created > 0 || updated > 0) new Notice(tr('notice.site.imported', { site: name, created, updated }))
		} finally {
			this.watchImporting = false
			this.watchNotes.clear()
			this.netflixFresh.clear()
			this.netflixSeeding.clear()
		}
		void (site === 'imdb' ? this.imdbBackfill() : this.netflixBackfill().then(() => this.netflixUnwatchAll()))
	}

	// YouTube: a note per video, Shorts left out, in the Video category made on first use. The first import brings
	// the last 7 days, later ones every day since the last; a video seen again on a later day counts a rewatch.
	// Then one older month a day, back to the start of the history, so years of it never land at once.
	private async youtubeImport(loud: boolean): Promise<void> {
		this.watchImporting = true
		try {
			if (loud) new Notice(tr('notice.site.importing', { site: 'YouTube' }))
			const notes = this.youtubeNotes()
			const last = this.settings.watchSites.youtube.lastImport
			const days = last > 0 ? Math.max(7, daysSince(last) + 1) : 7
			const fresh: WatchedVideo[] = []
			const seen = new Set<string>()
			let token = ''
			for (let batch = 0; batch < 20; batch++) {
				const page = await youtubePage(token)
				if (page === 'signed-out') {
					this.settings.watchSites.youtube.connected = false
					await this.saveSettings()
					new Notice(tr('notice.site.signedOut', { site: 'YouTube' }))
					return
				}
				if (!page) { if (loud) new Notice(tr('notice.site.failed', { site: 'YouTube' })); return }
				const { videos, lastDay } = pageVideos(page, new Date(), days)
				for (const video of videos) if (!seen.has(video.id)) { seen.add(video.id); fresh.push(video) }
				const windowStart = isoDay(new Date(Date.now() - (days - 1) * 86400000))
				if (!page.next || !lastDay || lastDay <= windowStart || videos.length === 0) break
				token = page.next
			}
			const { created, updated } = await this.youtubeSave(fresh, notes, true)
			// older months start below the first import's week
			if (!this.settings.youtubeBackfill.before) this.settings.youtubeBackfill = { token: '', before: isoDay(new Date(Date.now() - 6 * 86400000)), done: false }
			this.settings.watchSites.youtube.lastImport = Date.now()
			await this.saveSettings()
			if (loud || created > 0 || updated > 0) new Notice(tr('notice.site.imported', { site: 'YouTube', created, updated }))
			await this.youtubeBackfill(notes)
		} finally {
			this.watchImporting = false
		}
	}

	private youtubeNotes(): Map<string, TFile> {
		const byId = new Map<string, TFile>()
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (fm && toStr(fm.Source) === YOUTUBE_SOURCE && !isTemplateFile(file.path)) byId.set(toStr(fm['Source ID']), file)
		}
		return byId
	}

	// One older month of the history: from where the last run stopped back to that month's first day.
	private async youtubeBackfill(notes: Map<string, TFile>): Promise<void> {
		const state = this.settings.youtubeBackfill
		if (state.done || !state.before) return
		const before = new Date(`${state.before}T12:00:00`)
		const monthStart = isoDay(new Date(before.getFullYear(), before.getMonth() - (before.getDate() === 1 ? 1 : 0), 1))
		const found: WatchedVideo[] = []
		let token = state.token
		let reached = false
		for (let batch = 0; batch < 40 && !reached; batch++) {
			const page = await youtubePage(token)
			// a stale continuation: the next run walks from the top again
			if (!page || page === 'signed-out') { state.token = ''; await this.saveSettings(); return }
			const { videos, lastDay } = pageVideos(page)
			for (const video of videos) if (video.day < state.before && video.day >= monthStart && !notes.has(video.id)) found.push(video)
			if (lastDay && lastDay < monthStart) {
				// the page holds the month's end: read again next time
				reached = true
			} else if (!page.next) {
				state.done = true
				reached = true
			} else {
				token = page.next
			}
		}
		const { created } = await this.youtubeSave(found, notes, false)
		// a month longer than the run's batches goes on from where it stopped
		state.token = token
		if (reached && !state.done) state.before = monthStart
		await this.saveSettings()
		if (created > 0) new Notice(tr('notice.site.imported', { site: 'YouTube', created, updated: 0 }))
	}

	// New videos become notes; on `rewatch`, a known one seen on a later day counts a rewatch, and its progress only grows.
	private async youtubeSave(videos: WatchedVideo[], notes: Map<string, TFile>, rewatch: boolean): Promise<{ created: number; updated: number }> {
		let created = 0
		let updated = 0
		const lastSeen = (file: TFile): string => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(toStr(fm?.['Last Watched']) || toStr(fm?.Date))
			return dmy ? `${dmy[3] ?? ''}-${dmy[2] ?? ''}-${dmy[1] ?? ''}` : ''
		}
		// notes of the first builds have no details yet
		const bare = (file: TFile): boolean => !('Views' in (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}))
		const wanted = videos.filter(video => {
			const file = notes.get(video.id)
			return !file || (rewatch && (video.day > lastSeen(file) || bare(file)))
		})
		const details = new Map<string, VideoDetails>()
		for (let i = 0; i < wanted.length && !this.unloaded; i += 40) {
			const batch = await videoDetails(wanted.slice(i, i + 40).map(video => video.id))
			if (batch === 'signed-out') break
			for (const [id, found] of batch) details.set(id, found)
		}
		let category = this.settings.categories.find(c => c.typeValue === YOUTUBE_TYPE)
		for (const video of videos) {
			if (this.unloaded) break
			try {
				// Runtime is the whole video, Progress the watched share in percent
				const length = video.seconds > 0 ? Math.max(1, Math.round(video.seconds / 60)) : 0
				const done = video.percent >= 95
				const found = details.get(video.id)
				const existing = notes.get(video.id)
				if (existing) {
					if (!rewatch) continue
					const fm = this.app.metadataCache.getFileCache(existing)?.frontmatter
					const had = /^(\d+)\/100$/.exec(toStr(fm?.Progress))
					const again = video.day > lastSeen(existing)
					const fill = !!found && bare(existing)
					// progress never moves backwards
					if (!again && !fill && had && video.percent <= Number(had[1])) continue
					await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
						if (length > 0) current.Runtime = length
						if (!had || video.percent > Number(had[1])) current.Progress = `${String(video.percent)}/100`
						// notes of the first build held minutes watched and always Complete
						if (!had) current.Complete = done
						else if (done) current.Complete = true
						if (again) {
							current.Rewatched = (Number(current.Rewatched) || 0) + 1
							current['Last Watched'] = dmyOf(`${video.day}T12:00:00`)
						}
						if (found) this.youtubeDetails(current, found)
					})
					if (fill && found?.description) await this.addDescription(existing, found.description)
					updated++
					continue
				}
				if (!category) category = await this.youtubeCategory()
				const url = videoUrl(video.id)
				const meta: NormalizedMetadata = {
					fields: { Name: video.title, Creator: [video.channel], Cover: videoCover(video.id), URL: url, ...(length > 0 ? { Runtime: length } : {}) },
					progressTotal: null,
					imdbId: null,
				}
				const extra: Record<string, unknown> = { Platforms: ['YouTube'], Progress: `${String(video.percent)}/100`, Complete: done, Date: dmyOf(`${video.day}T12:00:00`) }
				const channel = found?.channelUrl || video.channelUrl
				if (channel) extra['Channel URL'] = channel
				if (found) this.youtubeDetails(extra, found)
				const file = await this.newNote(category, YOUTUBE_SOURCE, video.id, video.title, meta, extra)
				if (found?.description) await this.addDescription(file, found.description)
				notes.set(video.id, file)
				created++
			} catch (e) {
				console.error('Library: YouTube import error', video.id, e)
			}
		}
		return { created, updated }
	}

	private async addDescription(file: TFile, description: string): Promise<void> {
		const callout = descriptionCallout(description)
		await this.app.vault.process(file, text => text.indexOf(callout) >= 0 ? text : `${text.replace(/\s*$/, '')}\n\n${callout}\n`)
	}

	private youtubeDetails(fm: Record<string, unknown>, found: VideoDetails): void {
		if (found.reaction) fm.Reaction = found.reaction
		else delete fm.Reaction
		if (found.subscribed !== null) fm.Subscribed = found.subscribed
		if (found.channelUrl) fm['Channel URL'] = found.channelUrl
		if (found.channelId) fm['Channel ID'] = found.channelId
		if (found.views !== null) fm.Views = found.views
		if (found.likes !== null) fm.Likes = found.likes
		if (found.dislikes !== null) fm.Dislikes = found.dislikes
		if (found.published) {
			fm.Published = dmyOf(`${found.published}T12:00:00`)
			fm.Year = Number(found.published.slice(0, 4))
		}
	}

	// An opened video note reads its like, subscription and date afresh, once a session.
	private async youtubeRefresh(file: TFile): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const id = toStr(fm?.['Source ID'])
		if (!fm || toStr(fm.Source) !== YOUTUBE_SOURCE || this.youtubeFresh.has(id) || !this.settings.watchSites.youtube.connected || !Platform.isDesktopApp) return
		this.youtubeFresh.add(id)
		const details = await videoDetails([id])
		// the session is gone: say so once, as the import would
		if (details === 'signed-out') {
			this.settings.watchSites.youtube.connected = false
			await this.saveSettings()
			new Notice(tr('notice.site.signedOut', { site: 'YouTube' }))
			return
		}
		const found = details.get(id)
		if (!found || this.unloaded) return
		await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => this.youtubeDetails(current, found))
		if (found.description) await this.addDescription(file, found.description)
	}

	// The note's like or channel subscription, sent to YouTube; the notes follow once it took.
	private async youtubeToggle(file: TFile, action: YoutubeAction): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const id = toStr(fm?.['Source ID'])
		if (!fm || !this.settings.watchSites.youtube.connected) { new Notice(tr('notice.site.failed', { site: 'YouTube' })); return }
		if (!await youtubeAct(id, action)) { new Notice(tr('notice.site.failed', { site: 'YouTube' })); return }
		if (action === 'like' || action === 'dislike' || action === 'removelike') {
			await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
				if (action === 'removelike') delete current.Reaction
				else current.Reaction = action
			})
			return
		}
		// every note of the channel
		const channel = toStr(fm['Channel ID']) || toStr(fm['Channel URL'])
		for (const other of this.youtubeNotes().values()) {
			const theirs = this.app.metadataCache.getFileCache(other)?.frontmatter
			if (other !== file && (!channel || (toStr(theirs?.['Channel ID']) || toStr(theirs?.['Channel URL'])) !== channel)) continue
			await this.app.fileManager.processFrontMatter(other, (current: Record<string, unknown>) => { current.Subscribed = action === 'subscribe' })
		}
	}

	private async youtubeCategory(): Promise<ICategory> {
		const category: ICategory = { name: tr('settings.default.video'), typeValue: YOUTUBE_TYPE, contentType: 'manual', folder: joinFolder(this.settings.libraryFolder, 'Video') }
		this.settings.categories.push(category)
		addCategoryTop(this.settings, category.typeValue)
		await this.saveSettings()
		new Notice(tr('notice.categoryCreated', { name: category.name }))
		return category
	}

	// A rated episode ticks and scores the matching episode in its series note, made if missing.
	private async importEpisode(rated: EpisodeRating): Promise<'created' | 'updated' | null> {
		let file = this.noteOfImdb(rated.series.id, 'series')
		const made = !file && await this.importWatched(rated.series) === 'created'
		file = file ?? this.watchNotes.get(`series:${rated.series.id}`) ?? null
		if (!file) return null
		let changed = false
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const seasons = seasonsOf(fm)
			const index = seasonIndex(seasons.map(s => s.name), rated.season)
			const episode = seasons[index]?.episodes[rated.episode - 1]
			if (!episode) return
			if (!episode.watched) { applyEpisodeChange(fm, { season: index, episode: rated.episode - 1, watched: true }); changed = true }
			if (episode.rating === null) { applyEpisodeChange(fm, { season: index, episode: rated.episode - 1, rating: rated.rating }); changed = true }
			const echo = this.settings.imdbEcho[rated.series.id] ?? (this.settings.imdbEcho[rated.series.id] = { r: 0 })
			echo.e = { ...echo.e, [`${String(rated.season)}:${String(rated.episode)}`]: Math.round(rated.rating) }
		})
		return made ? 'created' : changed ? 'updated' : null
	}

	// A Netflix viewing ticks the episode of that name in its season.
	private async importViewedEpisode(viewed: NetflixEpisode): Promise<'updated' | null> {
		const typeValues = this.settings.categories.filter(c => c.contentType === 'series').map(c => c.typeValue)
		const file = this.watchNotes.get(`series:${viewed.series.name.toLowerCase()}`) ?? this.app.vault.getMarkdownFiles().find(f => {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter
			return !!fm && !isTemplateFile(f.path) && typeValues.indexOf(toStr(fm.Type)) >= 0 && sameTitle(toStr(fm.Name) || f.basename, viewed.series.name)
		})
		if (!file) return null
		const plain = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
		let changed = false
		const show = viewed.series.netflixId ?? 0
		const seen = this.settings.netflixSeen[String(show)] ?? {}
		if (!this.netflixSeeding.has(show)) this.netflixSeeding.set(show, !this.settings.netflixSeen[String(show)] && !this.netflixFresh.has(show))
		const seeding = this.netflixSeeding.get(show) === true
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const seasons = seasonsOf(fm)
			const index = seasonIndex(seasons.map(s => s.name), viewed.season)
			const cut = viewed.title.endsWith('...') || viewed.title.endsWith('…')
			const wanted = plain(viewed.title.replace(/(\.\.\.|…)$/, ''))
			const at = seasons[index]?.episodes.findIndex(e => cut ? plain(e.title).startsWith(wanted) : plain(e.title) === wanted) ?? -1
			if (at < 0) return
			const key = `${String(index)}:${String(at)}`
			const known = key in seen
			if (show && viewed.id) seen[key] = viewed.id
			// unticked after Netflix had it, or on a note that had the show before and from a viewing older than
			// the last import (that one would have ticked it): unticked by hand, hidden later
			const old = seeding && viewed.when <= this.settings.watchSites.netflix.lastImport
			if (seasons[index]?.episodes[at]?.watched || known || old) return
			applyEpisodeChange(fm, { season: index, episode: at, watched: true })
			changed = true
		})
		if (show) this.settings.netflixSeen[String(show)] = seen
		return changed ? 'updated' : null
	}

	private noteOfImdb(id: string, kind: 'movie' | 'series'): TFile | null {
		const url = `https://www.imdb.com/title/${id}/`
		const typeValues = this.settings.categories.filter(c => c.contentType === kind).map(c => c.typeValue)
		return this.app.vault.getMarkdownFiles().find(file => {
			if (isTemplateFile(file.path)) return false
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			return !!fm && typeValues.indexOf(toStr(fm.Type)) >= 0 && (toStr(fm['Source ID']) === id || toStr(fm.URL) === url)
		}) ?? null
	}

	// The IMDb id of a movie or series note: its Source ID or its IMDb link.
	private imdbIdOf(fm: Record<string, unknown>): string | null {
		const kind = this.kindOf(fm)
		if (kind !== 'movie' && kind !== 'series') return null
		const own = toStr(fm['Source ID'])
		if (/^tt\d+$/.test(own)) return own
		return /^https:\/\/www\.imdb\.com\/title\/(tt\d+)\//.exec(toStr(fm.URL))?.[1] ?? null
	}

	// What the note says IMDb should hold.
	private imdbWanted(fm: Record<string, unknown>): ImdbEcho {
		const rating = Number(toStr(fm['My Rating']))
		const r = Number.isFinite(rating) && rating >= 1 && rating <= 10 ? Math.round(rating) : 0
		const e: Record<string, number> = {}
		if (this.kindOf(fm) === 'series') {
			const seasons = seasonsOf(fm)
			const names = seasons.map(s => s.name)
			seasons.forEach((season, index) => {
				const numbered = Number(/\d+/.exec(season.name)?.[0])
				const number = seasonIndex(names, numbered) === index ? numbered : index + 1
				season.episodes.forEach((episode, at) => {
					if (episode.rating !== null) e[`${String(number)}:${String(at + 1)}`] = Math.round(episode.rating)
				})
			})
		}
		return { r, e, l: !this.isStarted(fm) }
	}

	private armImdbPush(file: TFile): void {
		if (this.unloaded || !Platform.isDesktopApp || (!this.settings.watchSites.imdb.connected && !this.settings.watchSites.netflix.connected)) return
		const existing = this.imdbPushTimers.get(file.path)
		if (existing) window.clearTimeout(existing)
		this.imdbPushTimers.set(file.path, window.setTimeout(() => {
			this.imdbPushTimers.delete(file.path)
			void this.imdbPush(file).then(() => this.netflixPush(file)).then(() => this.netflixUnwatch(file))
		}, 1500))
	}

	// Episodes unticked here that Netflix has a viewing of: taken off its viewing history; a show left
	// with nothing ticked goes on My List, as not watched yet.
	private async netflixUnwatch(file: TFile, force = false): Promise<void> {
		if (!this.settings.watchSites.netflix.connected || !Platform.isDesktopApp) return
		if (!force && (this.watchImporting || this.watchPushing)) { this.armImdbPush(file); return }
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const show = toStr(fm?.['Netflix ID'])
		const seen = show ? this.settings.netflixSeen[show] : undefined
		if (!fm || !seen) return
		const seasons = seasonsOf(fm)
		const off = Object.keys(seen).filter(key => {
			const [season, episode] = [Number(key.split(':')[0]), Number(key.split(':')[1])]
			const item = seasons[season]?.episodes[episode]
			return !!item && !item.watched
		})
		const id = Number(show)
		const untouched = !isFinished(fm, 'series') && seasons.every(season => season.episodes.every(episode => !episode.watched))
		const list = untouched && this.settings.netflixListed.indexOf(id) < 0
		if (off.length === 0 && !list) return
		this.watchPushing = true
		try {
			const hidden = off.length > 0 ? await netflixHideEpisodes(off.map(key => seen[key] ?? 0)) : []
			for (const key of off) if (hidden.indexOf(seen[key] ?? 0) >= 0) delete seen[key]
			if (list && await netflixAddToList(id)) this.settings.netflixListed.push(id)
			await this.persistSettings()
		} finally {
			this.watchPushing = false
		}
	}

	private async netflixUnwatchAll(): Promise<void> {
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.unloaded || !this.settings.watchSites.netflix.connected) return
			const show = toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.['Netflix ID'])
			if (show && this.settings.netflixSeen[show]) await this.netflixUnwatch(file, true)
		}
	}

	// Library to Netflix: the note's score as a thumb on the title its Netflix ID names.
	private async netflixPush(file: TFile): Promise<void> {
		if (!this.settings.watchSites.netflix.connected) return
		if (this.watchImporting || this.watchPushing) { this.armImdbPush(file); return }
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const id = Number(toStr(fm?.['Netflix ID']))
		const rating = Number(toStr(fm?.['My Rating']))
		if (!fm || !Number.isSafeInteger(id) || id <= 0 || !(rating >= 1 && rating <= 10)) return
		const rank = thumbRank(rating)
		if (this.settings.netflixEcho[String(id)] === rank) return
		this.watchPushing = true
		try {
			if (await netflixRate(id, rating)) {
				this.settings.netflixEcho[String(id)] = rank
				await this.persistSettings()
			}
		} finally {
			this.watchPushing = false
		}
	}

	// Older rated notes reach Netflix one at a time in the background.
	private async netflixBackfill(): Promise<void> {
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.unloaded || !this.settings.watchSites.netflix.connected) return
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const id = toStr(fm?.['Netflix ID'])
			const rating = Number(toStr(fm?.['My Rating']))
			if (!id || !(rating >= 1 && rating <= 10) || this.settings.netflixEcho[id] === thumbRank(rating)) continue
			await this.netflixPush(file)
			await this.pause(3000)
		}
	}

	// Library to IMDb: a new score, a new unwatched title (watchlist), episode scores.
	// Nothing is taken off IMDb when a score is cleared here.
	private async imdbPush(file: TFile): Promise<boolean> {
		if (!this.settings.watchSites.imdb.connected) return false
		// an import or another push in flight: try again shortly
		if (this.watchImporting || this.watchPushing) {
			this.armImdbPush(file)
			return false
		}
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const id = fm ? this.imdbIdOf(fm) : null
		if (!fm || !id) return false
		const want = this.imdbWanted(fm)
		const had: ImdbEcho = this.settings.imdbEcho[id] ?? { r: 0 }
		const sent: ImdbEcho = { r: had.r, l: had.l, e: { ...had.e } }
		this.watchPushing = true
		try {
			if (want.r > 0 && want.r !== had.r && await imdbRate(id, want.r)) sent.r = want.r
			if (want.l && !had.l && had.r === 0 && await imdbWatchlistAdd(id)) sent.l = true
			if (!want.l && had.l && await imdbWatchlistRemove(id)) sent.l = false
			const episodes = Object.keys(want.e ?? {}).filter(key => want.e?.[key] !== had.e?.[key])
			const bySeason = new Map<number, Map<number, string>>()
			for (const key of episodes) {
				const season = Number(key.split(':')[0])
				const episode = Number(key.split(':')[1])
				if (!bySeason.has(season)) bySeason.set(season, await imdbSeason(id, season))
				const episodeId = bySeason.get(season)?.get(episode)
				const value = want.e?.[key]
				if (episodeId && value && await imdbRate(episodeId, value) && sent.e) sent.e[key] = value
			}
		} finally {
			this.watchPushing = false
		}
		this.settings.imdbEcho[id] = sent
		await this.persistSettings()
		return true
	}

	// Older notes reach IMDb one at a time in the background.
	private async imdbBackfill(): Promise<void> {
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.unloaded || !this.settings.watchSites.imdb.connected) return
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const id = fm && !isTemplateFile(file.path) ? this.imdbIdOf(fm) : null
			if (!id || this.settings.imdbEcho[id]) continue
			await this.imdbPush(file)
			await this.pause(3000)
		}
	}

	private async importWatched(title: WatchedTitle): Promise<'created' | 'updated' | null> {
		const url = title.id ? `https://www.imdb.com/title/${title.id}/` : ''
		const typeValues = this.settings.categories.filter(c => c.contentType === title.kind).map(c => c.typeValue)
		// a Netflix id, and a guessed title's name, are looked for among movies and series both
		const watchTypes = this.settings.categories.filter(c => c.contentType === 'movie' || c.contentType === 'series').map(c => c.typeValue)
		const notes = this.app.vault.getMarkdownFiles().filter(file => !isTemplateFile(file.path))
		const fmOf = (file: TFile): Record<string, unknown> | undefined => this.app.metadataCache.getFileCache(file)?.frontmatter
		const byNetflix = title.netflixId ? notes.find(file => {
			const fm = fmOf(file)
			return !!fm && watchTypes.indexOf(toStr(fm.Type)) >= 0 && toStr(fm['Netflix ID']) === String(title.netflixId)
		}) : undefined
		if (!byNetflix && title.anime) return this.importNetflixAnime(title, title.anime)
		// an IMDb id names one title, movie or series
		const imdbUrl = title.imdb ? `https://www.imdb.com/title/${title.imdb}/` : ''
		const byImdb = !byNetflix && title.imdb ? notes.find(file => {
			const fm = fmOf(file)
			return !!fm && watchTypes.indexOf(toStr(fm.Type)) >= 0 && (toStr(fm['Source ID']) === title.imdb || toStr(fm.URL) === imdbUrl)
		}) : undefined
		const existing = byNetflix ?? byImdb ?? (title.imdb ? undefined : notes.find(file => {
			const fm = fmOf(file)
			if (!fm || (title.guessed ? watchTypes : typeValues).indexOf(toStr(fm.Type)) < 0) return false
			if (title.id) return toStr(fm['Source ID']) === title.id || toStr(fm.URL) === url
			return sameTitle(toStr(fm.Name) || file.basename, title.name)
		}))
		// no viewing, no note: not enough to make one, and a series would come in as a movie
		if (!existing && title.guessed) return null
		const watched = title.watched
		const key = `${title.kind}:${title.id || title.name.toLowerCase()}`
		if (existing) {
			this.watchNotes.set(key, existing)
			const fm = this.app.metadataCache.getFileCache(existing)?.frontmatter
			const seen = (title.trakt ? this.settings.traktEcho : this.settings.imdbEcho)[title.id]
			const rerated = !!seen && seen.r > 0 && title.rating !== null && Math.round(title.rating) !== seen.r && Math.round(Number(toStr(fm?.['My Rating']))) === seen.r
			const rate = title.rating !== null && (isEmptyValue(fm?.['My Rating']) || rerated)
			// a guessed title may be a series: only a viewing finishes a movie
			const finish = title.kind === 'movie' && watched && !title.guessed && fm?.Complete !== true
			const link = !!title.netflixId && (toStr(fm?.['Netflix ID']) !== String(title.netflixId) || toStrArray(fm?.Platforms).indexOf('Netflix') < 0)
			this.noteImdbHas(title)
			if (title.listed && (title.watched || (fm && this.isStarted(fm)))) await this.unlist(title)
			if (!rate && !finish && !link) return null
			await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
				if (rate) current['My Rating'] = title.rating
				if (finish) current.Complete = true
				if (link) {
					current['Netflix ID'] = title.netflixId
					addPlatform(current, 'Netflix', null)
				}
			})
			if (link && title.netflixId && toStr(fm?.['Netflix ID']) !== String(title.netflixId)) this.netflixFresh.add(title.netflixId)
			return 'updated'
		}
		const provider = this.registry.forType(title.kind)
		if (!provider) return null
		// Netflix gives only a name: the source's best match for it, else a bare note
		const known = title.id || title.imdb || ''
		const results = known ? [] : await within(provider.search(title.name, title.kind), SEARCH_BUDGET_MS * 2, [] as SearchResult[])
		let sourceId = known || results[0]?.sourceId || ''
		let picked: NormalizedMetadata | null = null
		// two shows of one name (a cartoon and its remake): the one whose episodes Netflix played
		const named = results.filter(result => sameTitle(result.title, title.name)).slice(0, 4)
		if (title.kind === 'series' && title.episodeTitles?.length && named.length > 1) {
			const plain = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
			const played = new Set(title.episodeTitles.map(plain))
			let best = -1
			for (const result of named) {
				const meta = await provider.fetch(result.sourceId, title.kind, result.raw)
				const listed = seasonsOf({ Seasons: meta?.fields.Seasons }).reduce((all, season) => all.concat(season.episodes.map(e => plain(e.title))), [] as string[])
				const hits = listed.filter(name => played.has(name)).length
				if (meta && hits > best) { best = hits; sourceId = result.sourceId; picked = meta }
			}
		}
		// Netflix's name found a note the library already has under another name: link it, no second note
		const same = !known && sourceId ? notes.find(file => {
			const fm = fmOf(file)
			return !!fm && typeValues.indexOf(toStr(fm.Type)) >= 0 && toStr(fm['Source ID']) === sourceId
		}) : undefined
		if (same && title.netflixId) {
			this.watchNotes.set(key, same)
			if (toStr(fmOf(same)?.['Netflix ID']) !== String(title.netflixId)) this.netflixFresh.add(title.netflixId)
			await this.app.fileManager.processFrontMatter(same, (current: Record<string, unknown>) => {
				if (title.rating !== null && isEmptyValue(current['My Rating'])) current['My Rating'] = title.rating
				current['Netflix ID'] = title.netflixId
				addPlatform(current, 'Netflix', null)
			})
			this.noteImdbHas({ ...title, id: '' })
			return 'updated'
		}
		const meta = picked ?? (sourceId ? await provider.fetch(sourceId, title.kind) : null)
		const category = await this.categoryFor(title.kind)
		const extra: Record<string, unknown> = {}
		if (title.rating !== null) extra['My Rating'] = title.rating
		if (title.netflixId) {
			extra['Netflix ID'] = title.netflixId
			extra.Platforms = ['Netflix']
		}
		if (title.kind === 'movie' && watched) extra.Complete = true
		const when = title.when ? dmyOf(title.when) : ''
		if (when) extra.Date = when
		const name = toStr(meta?.fields.Name) || title.name
		const file = await this.newNote(category, provider.id, sourceId, name, meta ?? { fields: { Name: title.name, Year: title.year }, progressTotal: null, imdbId: null }, extra)
		this.watchNotes.set(key, file)
		if (title.netflixId) this.netflixFresh.add(title.netflixId)
		this.noteImdbHas(title)
		if (title.listed && title.watched) await this.unlist(title)
		return 'created'
	}

	// A Netflix anime goes to the anime category, under its AniList (or MyAnimeList) id.
	private async importNetflixAnime(title: WatchedTitle, sourceId: string): Promise<'created' | 'updated' | null> {
		const typeValues = this.settings.categories.filter(c => c.contentType === 'anime').map(c => c.typeValue)
		const ids = animeIds(sourceId)
		const existing = this.app.vault.getMarkdownFiles().find(file => {
			if (isTemplateFile(file.path)) return false
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || typeValues.indexOf(toStr(fm.Type)) < 0) return false
			const own = animeIds(toStr(fm['Source ID']))
			return toStr(fm['Netflix ID']) === String(title.netflixId)
				|| (!!own && ((own.anilist !== null && own.anilist === ids?.anilist) || (own.mal !== null && own.mal === ids?.mal)))
				|| sameTitle(toStr(fm.Name) || file.basename, title.name)
		})
		const key = `anime:${String(title.netflixId)}`
		if (existing) {
			this.watchNotes.set(key, existing)
			const fm = this.app.metadataCache.getFileCache(existing)?.frontmatter
			const rate = title.rating !== null && isEmptyValue(fm?.['My Rating'])
			const link = toStr(fm?.['Netflix ID']) !== String(title.netflixId) || toStrArray(fm?.Platforms).indexOf('Netflix') < 0
			this.noteImdbHas({ ...title, id: '' })
			if (!rate && !link) return null
			await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
				if (rate) current['My Rating'] = title.rating
				current['Netflix ID'] = title.netflixId
				addPlatform(current, 'Netflix', null)
			})
			return 'updated'
		}
		// rated, never viewed: no note, as for movies and series
		if (title.guessed) return null
		const provider = this.registry.forType('anime')
		if (!provider) return null
		const meta = await provider.fetch(sourceId, 'anime')
		const category = await this.categoryFor('anime')
		const extra: Record<string, unknown> = { 'Netflix ID': title.netflixId, Platforms: ['Netflix'] }
		if (title.rating !== null) extra['My Rating'] = title.rating
		// a film is one episode, watched in full
		if (title.kind === 'movie' && title.watched) {
			extra.Progress = `${String(meta?.progressTotal ?? 1)}/${String(meta?.progressTotal ?? 1)}`
			extra.Complete = true
		}
		const when = title.when ? dmyOf(title.when) : ''
		if (when) extra.Date = when
		const name = toStr(meta?.fields.Name) || title.name
		const file = await this.newNote(category, provider.id, sourceId, name, meta ?? { fields: { Name: title.name, Year: title.year }, progressTotal: null, imdbId: null }, extra)
		this.watchNotes.set(key, file)
		this.noteImdbHas({ ...title, id: '' })
		return 'created'
	}

	// Netflix episodes of an anime move its Progress forward, never past the total.
	// ponytail: counts every episode Netflix played, all seasons in one; fine while an AniList entry spans the show
	private async netflixAnimeProgress(title: WatchedTitle, episodes: number): Promise<'updated' | null> {
		const file = this.watchNotes.get(`anime:${String(title.netflixId)}`)
		if (!file || episodes <= 0) return null
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const match = toStr(fm?.Progress).match(progressPattern)
		const total = match ? Number(match[2]) : 0
		const watched = Math.max(parseWatched(fm?.Progress), total > 0 ? Math.min(episodes, total) : episodes)
		if (watched <= parseWatched(fm?.Progress)) return null
		await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
			current.Progress = `${String(watched)}/${String(Math.max(total, watched))}`
			if (total > 0 && watched >= total) current.Complete = true
		})
		return 'updated'
	}

	// A watched title leaves the watchlist of the site it came from.
	private async unlist(title: WatchedTitle): Promise<void> {
		let done = false
		if (title.trakt) {
			const token = await this.traktToken()
			done = !!token && await traktSend(token, title.id, title.kind, { rating: null, list: false, movieWatched: false, episodes: [], episodeRatings: [] })
		} else {
			done = await imdbWatchlistRemove(title.id)
		}
		const echo = (title.trakt ? this.settings.traktEcho : this.settings.imdbEcho)[title.id]
		if (done && echo) echo.l = false
	}

	// What came from a site need not go back to it.
	private noteImdbHas(title: WatchedTitle): void {
		if (title.netflixId && title.rating !== null) this.settings.netflixEcho[String(title.netflixId)] = thumbRank(title.rating)
		if (!/^tt\d+$/.test(title.id)) return
		if (title.trakt) {
			const echo = this.settings.traktEcho[title.id] ?? (this.settings.traktEcho[title.id] = { r: 0 })
			if (title.rating !== null) echo.r = Math.round(title.rating)
			if (title.listed) echo.l = true
			if (title.kind === 'movie' && title.watched) echo.m = true
			return
		}
		const echo = this.settings.imdbEcho[title.id] ?? (this.settings.imdbEcho[title.id] = { r: 0 })
		if (title.rating !== null) echo.r = Math.round(title.rating)
		if (title.listed) echo.l = true
	}

	private isStarted(fm: Record<string, unknown>): boolean {
		const kind = this.kindOf(fm) ?? 'movie'
		const rating = Number(toStr(fm['My Rating']))
		return isFinished(fm, kind) || fm.Complete === true || parseWatched(fm.Progress) > 0 || (rating >= 1 && rating <= 10)
	}

	private airingKey(fm: Record<string, unknown>): string | null {
		const kind = this.kindOf(fm)
		if (kind === 'series') return this.imdbIdOf(fm)
		if (kind !== 'anime' || toStr(fm.Source) !== 'anilist') return null
		const ids = animeIds(toStr(fm['Source ID']))
		if (!ids) return null
		return ids.anilist !== null ? `anilist:${String(ids.anilist)}` : `mal:${String(ids.mal)}`
	}

	airingDates(fm: Record<string, unknown>): Airing[] {
		const key = this.airingKey(fm)
		const now = Date.now()
		const yearEnd = new Date(new Date(now).getFullYear() + 1, 0, 1).getTime()
		return (key ? this.settings.airing[key] ?? [] : []).filter(airing => airing.at > now && airing.at < yearEnd)
	}

	airingFor(fm: Record<string, unknown>): Airing | null {
		return this.airingDates(fm)[0] ?? null
	}

	private airingWatched(fm: Record<string, unknown>): boolean {
		if (parseWatched(fm.Progress) <= 0) return false
		return this.kindOf(fm) !== 'series' || !toStr(fm['End Year']).trim()
	}

	private async airingIfDue(): Promise<void> {
		if (this.unloaded || Date.now() - this.settings.airingChecked < 12 * 3600000) return
		const next: Record<string, Airing[]> = {}
		const anilist: number[] = []
		const mal: number[] = []
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || isTemplateFile(file.path) || !this.airingWatched(fm)) continue
			const key = this.airingKey(fm)
			if (!key || next[key]) continue
			if (key.startsWith('anilist:')) anilist.push(Number(key.slice(8)))
			else if (key.startsWith('mal:')) mal.push(Number(key.slice(4)))
			else {
				if (this.unloaded) return
				const found = await seriesSchedule(key)
				const kept = found === undefined ? this.settings.airing[key] : found
				if (kept && kept.length > 0) next[key] = kept
			}
		}
		const anime = await animeSchedules({ anilist, mal })
		if (this.unloaded) return
		if (anime) {
			for (const [id, airing] of anime.anilist) next[`anilist:${String(id)}`] = airing
			for (const [id, airing] of anime.mal) next[`mal:${String(id)}`] = airing
		} else {
			for (const [key, airing] of Object.entries(this.settings.airing)) if (/^(anilist|mal):/.test(key)) next[key] = airing
		}
		this.settings.airing = next
		this.settings.airingChecked = Date.now()
		await this.persistSettings()
		this.refreshViews()
		this.refreshBanner()
	}

	connectTrakt(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			new TraktLoginModal(this.app, (tokens) => {
				void (async () => {
					if (tokens) {
						this.settings.traktTokens = tokens
						this.settings.traktEcho = {}
						await this.saveSettings()
						void this.traktImport(true)
					}
					resolve(tokens !== null)
				})()
			}).open()
		})
	}

	async traktToken(): Promise<string | null> {
		const tokens = this.settings.traktTokens
		if (!tokens) return null
		if (!traktExpired(tokens)) return tokens.access
		if (!this.traktRefreshing) {
			this.traktRefreshing = (async () => {
				try {
					// refresh tokens are single-use: the new pair is saved at once
					const next = await refreshTraktTokens(tokens.refresh)
					if (!next) return Date.now() < tokens.expiresAt ? tokens.access : null
					this.settings.traktTokens = next
					await this.saveSettings()
					return next.access
				} finally {
					this.traktRefreshing = null
				}
			})()
		}
		return this.traktRefreshing
	}

	private async traktSyncIfDue(): Promise<void> {
		// desktop only: two devices sharing a vault would make the same note twice
		if (!Platform.isDesktopApp || !this.settings.traktTokens || Date.now() - this.settings.traktLastImport < 24 * 3600000) return
		await this.traktImport(false)
	}

	// Trakt into Movies and Series: watched, rated and listed titles, ticked and scored episodes.
	async traktImport(loud: boolean): Promise<void> {
		if (this.watchImporting || !this.settings.traktTokens) return
		this.watchImporting = true
		try {
			const token = await this.traktToken()
			if (!token) { if (loud) new Notice(tr('notice.site.signedOut', { site: 'Trakt' })); return }
			if (loud) new Notice(tr('notice.site.importing', { site: 'Trakt' }))
			const data = await traktData(token)
			if (!data) { if (loud) new Notice(tr('notice.site.failed', { site: 'Trakt' })); return }
			const history = traktHistory(data)
			let created = 0
			let updated = 0
			const count = (result: 'created' | 'updated' | null): void => {
				if (result === 'created') created++
				else if (result === 'updated') updated++
			}
			for (const title of history.titles) {
				if (this.unloaded) return
				try { count(await this.importWatched(title)) } catch (e) { console.error('Library: Trakt import error', title.name, e) }
			}
			const bySeries = new Map<string, { series: WatchedTitle; items: { season: number; episode: number; rating?: number }[] }>()
			for (const [id, seen] of history.watched) {
				bySeries.set(id, { series: seen.series, items: seen.episodes.map(key => ({ season: Number(key.split(':')[0]), episode: Number(key.split(':')[1]) })) })
			}
			for (const rated of history.episodes) {
				const entry = bySeries.get(rated.series.id) ?? { series: { ...rated.series, trakt: true }, items: [] }
				entry.items.push({ season: rated.season, episode: rated.episode, rating: rated.rating })
				bySeries.set(rated.series.id, entry)
			}
			for (const { series, items } of bySeries.values()) {
				if (this.unloaded) return
				try { count(await this.traktEpisodes(series, items)) } catch (e) { console.error('Library: Trakt episode import error', series.name, e) }
			}
			this.settings.traktLastImport = Date.now()
			await this.saveSettings()
			if (loud || created > 0 || updated > 0) new Notice(tr('notice.site.imported', { site: 'Trakt', created, updated }))
		} finally {
			this.watchImporting = false
			this.watchNotes.clear()
		}
		void this.traktBackfill()
	}

	// Ticks and scores a series note's episodes from Trakt; the note is made if missing.
	private async traktEpisodes(series: WatchedTitle, items: { season: number; episode: number; rating?: number }[]): Promise<'created' | 'updated' | null> {
		let file = this.noteOfImdb(series.id, 'series')
		const made = !file && await this.importWatched(series) === 'created'
		file = file ?? this.watchNotes.get(`series:${series.id}`) ?? null
		if (!file) return null
		const echo = this.settings.traktEcho[series.id] ?? (this.settings.traktEcho[series.id] = { r: 0 })
		const seen = new Set(echo.w ?? [])
		let changed = false
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const item of items) {
				const key = `${String(item.season)}:${String(item.episode)}`
				const seasons = seasonsOf(fm)
				const index = seasonIndex(seasons.map(s => s.name), item.season)
				const episode = seasons[index]?.episodes[item.episode - 1]
				seen.add(key)
				if (item.rating) echo.e = { ...echo.e, [key]: Math.round(item.rating) }
				if (!episode) continue
				if (!episode.watched) { applyEpisodeChange(fm, { season: index, episode: item.episode - 1, watched: true }); changed = true }
				if (item.rating && episode.rating === null) { applyEpisodeChange(fm, { season: index, episode: item.episode - 1, rating: item.rating }); changed = true }
			}
		})
		echo.w = [...seen]
		return made ? 'created' : changed ? 'updated' : null
	}

	// What a note says Trakt should hold: IMDb's wants plus ticked episodes and a finished movie.
	private traktWanted(fm: Record<string, unknown>): TraktEcho {
		const base = this.imdbWanted(fm)
		const w: string[] = []
		const kind = this.kindOf(fm)
		if (kind === 'series') {
			const seasons = seasonsOf(fm)
			const names = seasons.map(s => s.name)
			seasons.forEach((season, index) => {
				const numbered = Number(/\d+/.exec(season.name)?.[0])
				const number = seasonIndex(names, numbered) === index ? numbered : index + 1
				season.episodes.forEach((episode, at) => {
					if (episode.watched) w.push(`${String(number)}:${String(at + 1)}`)
				})
			})
		}
		return { r: base.r, l: base.l, e: base.e, w, m: kind === 'movie' && isFinished(fm, 'movie') }
	}

	// Every episode a series note lists, in Trakt's "season:episode" numbering.
	private traktListed(fm: Record<string, unknown>): string[] {
		const out: string[] = []
		if (this.kindOf(fm) !== 'series') return out
		const seasons = seasonsOf(fm)
		const names = seasons.map(s => s.name)
		seasons.forEach((season, index) => {
			const numbered = Number(/\d+/.exec(season.name)?.[0])
			const number = seasonIndex(names, numbered) === index ? numbered : index + 1
			season.episodes.forEach((_, at) => out.push(`${String(number)}:${String(at + 1)}`))
		})
		return out
	}

	// Library to Trakt: a new score, a new unwatched title (watchlist), ticked episodes, episode scores.
	private async traktPush(file: TFile): Promise<void> {
		if (!this.settings.traktTokens) return
		// Trakt is plain HTTP: it waits only for its own import and pushes, never for IMDb's page
		if (this.watchImporting || this.traktPushing) { this.armTraktPush(file); return }
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const id = fm && !isTemplateFile(file.path) ? this.imdbIdOf(fm) : null
		if (!fm || !id) return
		const kind = this.kindOf(fm) === 'movie' ? 'movie' : 'series'
		const want = this.traktWanted(fm)
		const had: TraktEcho = this.settings.traktEcho[id] ?? { r: 0 }
		const change = traktChanges(want, had, kind, this.traktListed(fm))
		const off = (change.unwatched ?? []).map(item => `${String(item.season)}:${String(item.episode)}`)
		if (change.rating === null && change.list === null && !change.movieWatched && !change.movieUnwatched && off.length === 0 && change.episodes.length === 0 && change.episodeRatings.length === 0) return
		const token = await this.traktToken()
		if (!token) return
		this.traktPushing = true
		try {
			if (!await traktSend(token, id, kind, change)) return
			this.settings.traktEcho[id] = {
				r: change.rating ?? had.r,
				l: change.list === null ? had.l : change.list,
				m: (!!had.m && !change.movieUnwatched) || change.movieWatched,
				w: [...new Set([...(had.w ?? []).filter(key => off.indexOf(key) < 0), ...(want.w ?? [])])],
				e: { ...had.e, ...want.e },
			}
			await this.persistSettings()
		} finally {
			this.traktPushing = false
		}
	}

	// A library note left the vault: queue it for the removal offer.
	private noteDeleted(file: TFile, prev: CachedMetadata | null): void {
		const fm = prev?.frontmatter
		if (!this.settings.offerRemoteDelete || !fm || isTemplateFile(file.path)) return
		if (!this.settings.categories.some(c => c.typeValue === toStr(fm.Type))) return
		const source = toStr(fm.Source)
		const sourceId = toStr(fm['Source ID'])
		const anime = source === 'anilist' ? animeIds(sourceId) : null
		const manga = source === 'comics' ? mangaIds(sourceId) : null
		const imdb = this.imdbIdOf(fm)
		const sites: RemoteSite[] = []
		if (anime || manga) {
			if (this.settings.anilistToken.trim()) sites.push('anilist')
			if (this.settings.malTokens) sites.push('mal')
			if (anime && this.settings.kitsuTokens) sites.push('kitsu')
		}
		if (imdb) {
			if (this.settings.traktTokens) sites.push('trakt')
			// IMDb is reached through a page: desktop only
			if (this.settings.watchSites.imdb.connected && Platform.isDesktopApp) sites.push('imdb')
		}
		const netflix = Number(toStr(fm['Netflix ID']))
		const netflixId = Number.isSafeInteger(netflix) && netflix > 0 ? netflix : null
		if (netflixId !== null && this.settings.watchSites.netflix.connected) sites.push('netflix')
		if (sites.length === 0) return
		this.removals.push({ name: toStr(fm.Name) || file.basename, key: sourceId ? `${source}|${sourceId}` : '', anime, manga, imdb, netflix: netflixId, kind: this.kindOf(fm) === 'movie' ? 'movie' : 'series', sites })
		window.clearTimeout(this.removalTimer)
		this.removalTimer = window.setTimeout(() => this.offerRemoval(), 1000)
	}

	private offerRemoval(): void {
		// a title another note still holds stays on the sites: a removed duplicate, or a note deleted on one device only
		const held = new Set<string>()
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm) continue
			if (toStr(fm['Source ID'])) held.add(`${toStr(fm.Source)}|${toStr(fm['Source ID'])}`)
			const imdb = this.imdbIdOf(fm)
			if (imdb) held.add(imdb)
			const netflix = toStr(fm['Netflix ID'])
			if (netflix) held.add(`netflix:${netflix}`)
		}
		// each site keeps what another note still holds
		const items = this.removals.splice(0)
			.map(item => ({ ...item, sites: item.sites.filter(site => !this.stillHeld(site, item, held)) }))
			.filter(item => item.sites.length > 0)
		if (items.length === 0 || this.unloaded) return
		const names: Record<RemoteSite, string> = { anilist: tr('anilist.name'), mal: tr('mal.name'), kitsu: tr('kitsu.name'), trakt: 'Trakt', imdb: 'IMDb', netflix: 'Netflix' }
		const order: RemoteSite[] = ['anilist', 'mal', 'kitsu', 'trakt', 'imdb', 'netflix']
		const sites = order.filter(site => items.some(item => item.sites.includes(site)))
			.map(id => ({ id, name: names[id], desc: id === 'netflix' ? tr('remoteDelete.netflixNote') : '' }))
		new RemoteDeleteModal(this.app, items.map(item => item.name), sites, chosen => {
			void (async () => {
				const done = new Set<string>()
				const failed = new Set<string>()
				for (const item of items) {
					for (const site of item.sites) {
						if (!chosen.has(site) || this.unloaded) continue
						const ok = await this.removeFrom(site, item).catch((e: unknown) => {
							console.error('Library: removal error', site, item.name, e)
							return false
						})
						;(ok ? done : failed).add(site === 'netflix' ? 'Netflix' : names[site])
					}
				}
				await this.persistSettings()
				if (done.size > 0) new Notice(tr('notice.remoteDelete.done', { sites: [...done].join(', ') }))
				if (failed.size > 0) new Notice(tr('notice.remoteDelete.failed', { sites: [...failed].join(', ') }))
			})()
		}).open()
	}

	private netflixNoteHeld(id: number): boolean {
		return this.app.vault.getMarkdownFiles().some(file => toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.['Netflix ID']) === String(id))
	}

	private stillHeld(site: RemoteSite, item: Removal, held: Set<string>): boolean {
		if (site === 'netflix') return item.netflix !== null && held.has(`netflix:${String(item.netflix)}`)
		if (site === 'trakt' || site === 'imdb') return item.imdb !== null && held.has(item.imdb)
		return item.key !== '' && held.has(item.key)
	}

	// One title off one site; true when it is gone there.
	private async removeFrom(site: RemoteSite, item: Removal): Promise<boolean> {
		if (site === 'netflix' && item.netflix !== null) {
			// the score stays on Netflix, and its import would bring the note back: skip the title there
			if (this.settings.netflixIgnored.indexOf(item.netflix) < 0) this.settings.netflixIgnored.push(item.netflix)
			// the viewing history is reached through a page: desktop only
			if (!Platform.isDesktopApp) return true
			while (this.watchImporting || this.watchPushing) await this.pause(1000)
			this.watchPushing = true
			try {
				const ok = await netflixHideViewing(item.netflix)
				if (ok) delete this.settings.netflixSeen[String(item.netflix)]
				return ok
			} finally {
				this.watchPushing = false
			}
		}
		const ids = item.anime ?? item.manga
		const isAnime = item.anime !== null
		if (site === 'anilist' && ids) {
			const token = this.settings.anilistToken.trim()
			const viewer = token ? await aniListViewer(token) : null
			let mediaId = ids.anilist
			if (mediaId === null && ids.mal !== null) mediaId = (await (isAnime ? anilistIdsFor : anilistMangaIdsFor)([ids.mal]))?.get(ids.mal) ?? null
			return !!viewer && mediaId !== null && await deleteEntry(token, viewer.id, mediaId)
		}
		if (site === 'mal' && ids) {
			const token = await this.malToken()
			let malId = ids.mal
			if (malId === null && ids.anilist !== null) malId = (await (isAnime ? malIdsFor : malMangaIdsFor)([ids.anilist]))?.get(ids.anilist) ?? null
			return !!token && malId !== null && await deleteMalEntry(token, malId, isAnime ? 'anime' : 'manga')
		}
		if (site === 'kitsu' && item.anime) {
			const token = await this.kitsuToken()
			const viewer = token ? await kitsuViewer(token) : null
			const kitsuId = await this.kitsuIdFor(item.anime)
			return !!token && !!viewer && kitsuId !== null && await deleteKitsuEntry(token, viewer.id, kitsuId)
		}
		if (site === 'trakt' && item.imdb) {
			const token = await this.traktToken()
			const ok = !!token && await traktRemove(token, item.imdb, item.kind, Object.keys(this.settings.traktEcho[item.imdb]?.e ?? {}))
			if (ok) delete this.settings.traktEcho[item.imdb]
			return ok
		}
		if (site === 'imdb' && item.imdb) {
			const id = item.imdb
			// without an echo nothing is known: try the score and the watchlist both
			const had: ImdbEcho | undefined = this.settings.imdbEcho[id]
			while (this.watchImporting || this.watchPushing) await this.pause(1000)
			this.watchPushing = true
			try {
				const results: boolean[] = []
				if (!had || had.r > 0) results.push(await imdbRatingDelete(id))
				if (!had || had.l) results.push(await imdbWatchlistRemove(id))
				const bySeason = new Map<number, Map<number, string>>()
				for (const key of Object.keys(had?.e ?? {})) {
					const season = Number(key.split(':')[0])
					const episode = Number(key.split(':')[1])
					if (!bySeason.has(season)) bySeason.set(season, await imdbSeason(id, season))
					const episodeId = bySeason.get(season)?.get(episode)
					results.push(!!episodeId && await imdbRatingDelete(episodeId))
				}
				const ok = had ? results.every(Boolean) : results.some(Boolean)
				if (ok) delete this.settings.imdbEcho[id]
				return ok
			} finally {
				this.watchPushing = false
			}
		}
		return false
	}

	private armTraktPush(file: TFile): void {
		if (this.unloaded || !this.settings.traktTokens) return
		const existing = this.traktPushTimers.get(file.path)
		if (existing) window.clearTimeout(existing)
		this.traktPushTimers.set(file.path, window.setTimeout(() => {
			this.traktPushTimers.delete(file.path)
			void this.traktPush(file)
		}, 1500))
	}

	// Older notes reach Trakt one at a time in the background.
	private async traktBackfill(): Promise<void> {
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.unloaded || !this.settings.traktTokens) return
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const id = fm && !isTemplateFile(file.path) ? this.imdbIdOf(fm) : null
			if (!id || this.settings.traktEcho[id]) continue
			await this.traktPush(file)
			await this.pause(1500)
		}
	}

	private async watchSyncIfDue(site: WatchSite): Promise<void> {
		const state = this.settings.watchSites[site]
		if (!Platform.isDesktopApp || !state.connected || Date.now() - state.lastImport < 24 * 3600000) return
		await this.watchImport(site, false)
	}

	private watchSyncTick(): void {
		void this.watchSyncIfDue('imdb').then(() => this.watchSyncIfDue('netflix')).then(() => this.watchSyncIfDue('youtube')).then(() => this.traktSyncIfDue()).catch((e: unknown) => console.error('Library: watch sync error', e))
	}

	// Nintendo: consent first — a third-party signing service carries the requests
	async connectNintendo(): Promise<boolean> {
		if (!Platform.isDesktopApp) {
			new Notice(tr('notice.nintendo.desktopOnly'))
			return false
		}
		const agreed = await new Promise<boolean>((resolve) => {
			new ConfirmModal(this.app, {
				title: tr('nintendo.consent.title'),
				text: tr('nintendo.consent.text', { url: SIGNER_PROJECT }),
				confirm: tr('nintendo.consent.confirm'),
				cancel: tr('nintendo.consent.cancel'),
			}, resolve).open()
		})
		if (!agreed) return false
		const auth = await nintendoAuth()
		return new Promise<boolean>((resolve) => {
			new AuthModal(this.app, auth.url, (code) => {
				void (async () => {
					const tokens = code ? await exchangeNintendoCode(code, auth.verifier) : null
					if (tokens) {
						this.settings.nintendoTokens = tokens
						await this.saveSettings()
					} else if (code) {
						new Notice(tr('notice.nintendo.failed'))
					}
					resolve(tokens !== null)
					if (tokens) void this.nintendoImport(true)
				})()
			}, { title: tr('nintendo.loginTitle'), extract: nintendoCode, userAgent: PHONE_AGENT }).open()
		})
	}

	async nintendoGames(): Promise<NintendoPlayedGame[] | null> {
		const tokens = this.settings.nintendoTokens
		return tokens ? nintendoPlayLog(tokens) : null
	}

	// One game import at a time: each looks for the notes the others write, and
	// two at once would each create the note for a game on both platforms.
	private gameImporting(): boolean {
		return this.psnImporting || this.steamImporting || this.nintendoImporting
	}

	// Switch play activity into Games: one note per game (shared with PSN/Steam); Nintendo reports minutes and only played games
	async nintendoImport(loud: boolean): Promise<void> {
		if (this.gameImporting()) return
		if (!this.settings.nintendoTokens) return
		const provider = this.registry.forType('game')
		if (!provider) return
		this.nintendoImporting = true
		try {
			if (loud) new Notice(tr('notice.nintendo.importing'))
			const games = await this.nintendoGames()
			if (!games) { if (loud) new Notice(tr('notice.nintendo.importFailed')); return }
			let category = this.settings.categories.find(c => c.contentType === 'game')
			const typeValue = category?.typeValue ?? TYPE_DEFAULTS.game ?? 'Game'
			const notes = this.app.vault.getMarkdownFiles().filter(file => !isTemplateFile(file.path)
				&& toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.Type) === typeValue)
			let created = 0
			let updated = 0
			const isSwitch = (value: string): boolean => /switch|nintendo/i.test(value)
			for (const game of games) {
				if (this.unloaded) return
				// the app id in the eShop URI is the stable key
				const titleId = (/apps\/([0-9a-f]{16})/i.exec(game.shopUri ?? '')?.[1] ?? '').toUpperCase()
				const name = game.name.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
				const hours = playtimeHours(game.totalPlayTime)
				const since = game.firstPlayedAt > 0 ? dmyOf(new Date(game.firstPlayedAt * 1000).toISOString()) : ''
				try {
					const existing = notes.find(file => {
						const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
						return (titleId && toStr(fm?.['Nintendo ID']) === titleId) || sameTitle(toStr(fm?.Name) || file.basename, name)
					})
					if (existing) {
						const fm = this.app.metadataCache.getFileCache(existing)?.frontmatter
						const listed = toStrArray(fm?.Platforms).some(value => value === 'Switch')
						if (listed && Number(fm?.['Playtime Switch']) === hours && (!titleId || toStr(fm?.['Nintendo ID']) === titleId)) continue
						await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
							if (titleId) current['Nintendo ID'] = titleId
							const cover = this.fieldTarget('Cover')
							if (game.imageUri && !coverValue(current, this.coverProperty())) current[cover] = game.imageUri
							dropPlatforms(current, isSwitch)
							addPlatform(current, 'Switch', hours)
							if (since && parseDate(since) < parseDate(current.Date)) current.Date = since
						})
						updated++
						continue
					}
					if (!category) category = await this.categoryFor('game')
					const fields: Record<string, unknown> = {}
					if (titleId) fields['Nintendo ID'] = titleId
					if (game.imageUri) fields[this.fieldTarget('Cover')] = game.imageUri
					if (since) fields.Date = since
					addPlatform(fields, 'Switch', hours)
					const note = { fields: { Name: name }, progressTotal: null, imdbId: null }
					const file = await this.newNote(category, provider.id, `nintendo:${titleId || name}`, name, note, fields)
					notes.push(file)
					created++
				} catch (e) {
					console.error('Library: Nintendo import error', name, e)
				}
			}
			this.settings.nintendoStats = {
				games: games.length,
				minutes: games.reduce((sum, game) => sum + game.totalPlayTime, 0),
				updated: Date.now(),
			}
			this.settings.nintendoLastImport = Date.now()
			// saveSettings redraws the view: the statistics column shows the new totals
			await this.saveSettings()
			if (loud || created > 0 || updated > 0) new Notice(tr('notice.nintendo.imported', { created, updated }))
		} finally {
			this.nintendoImporting = false
		}
		await this.psnLookUp(new Map())
	}

	private async nintendoSyncIfDue(): Promise<void> {
		if (!Platform.isDesktopApp || !this.settings.nintendoTokens || this.gameImporting()) return
		if (Date.now() - this.settings.nintendoLastImport < 24 * 3600000) return
		await this.nintendoImport(false)
	}

	async psnData(): Promise<{ owned: PsnOwnedGame[]; played: PsnPlayedGame[]; trophies: PsnTrophyTitle[]; summary: PsnTrophySummary | null } | null> {
		const token = await this.psnToken()
		if (!token) return null
		const [owned, played, trophies, summary] = await Promise.all([psnOwnedGames(token), psnPlayedGames(token), psnTrophyTitles(token), psnTrophySummary(token)])
		if (!played && !trophies && !owned) return null
		return { owned: owned ?? [], played: played ?? [], trophies: trophies ?? [], summary }
	}

	// PSN games into Games: those played, and library games with trophies (apps have none)
	async psnImport(loud: boolean): Promise<void> {
		if (this.gameImporting()) return
		this.psnImporting = true
		let token: string | null = null
		try {
			token = await this.psnToken()
			if (!token) { if (loud) new Notice(tr('notice.psn.noToken')); return }
			const provider = this.registry.forType('game')
			if (!provider) return
			if (loud) new Notice(tr('notice.psn.importing'))
			const data = await this.psnData()
			if (!data) { if (loud) new Notice(tr('notice.psn.failed')); return }
			const played = new Map(data.played.map(game => [game.titleId, game]))
			const ownedIds = data.owned.filter(game => !played.has(game.titleId)).map(game => game.titleId)
			const trophyIds = await psnTrophyIdsFor(token, [...played.keys(), ...ownedIds])
			const trophies = new Map(data.trophies.map(title => [title.npCommunicationId, title]))
			type Entry = { titleId: string; name: string; platform: string; image: string | null; minutes: number | null; lastPlayed: string | null; firstPlayed: string | null }
			const entries: Entry[] = []
			// console when Sony gives none: title id (PS5 = PPSA, PS4 = CUSA), else the trophy list
			const trophyPlatform = (titleId: string): string => {
				if (/^PPSA/i.test(titleId)) return 'PS5'
				if (/^CUSA/i.test(titleId)) return 'PS4'
				const platform = trophies.get(trophyIds.get(titleId) ?? '')?.platform ?? ''
				return (platform.split(',').pop() ?? '').trim().toUpperCase()
			}
			for (const game of data.played) {
				const image = game.images.PORTRAIT_BANNER ?? game.images.MASTER ?? game.imageUrl
				entries.push({ titleId: game.titleId, name: cleanPsnName(game.name), platform: game.category.startsWith('ps5') ? 'PS5' : game.category.startsWith('ps4') ? 'PS4' : trophyPlatform(game.titleId), image, minutes: game.minutes, lastPlayed: game.lastPlayed, firstPlayed: game.firstPlayed })
			}
			for (const game of data.owned) {
				if (played.has(game.titleId) || !trophyIds.has(game.titleId)) continue
				entries.push({ titleId: game.titleId, name: cleanPsnName(game.name), platform: /^PS\d$/i.test(game.platform) ? game.platform.toUpperCase() : trophyPlatform(game.titleId), image: game.imageUrl, minutes: null, lastPlayed: null, firstPlayed: null })
			}
			let category = this.settings.categories.find(c => c.contentType === 'game')
			const typeValue = category?.typeValue ?? TYPE_DEFAULTS.game ?? 'Game'
			const notes = this.app.vault.getMarkdownFiles().filter(file => !isTemplateFile(file.path)
				&& toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.Type) === typeValue)
			let created = 0
			let updated = 0
			// a shared PS4/PS5 note drops its old PlayStation hours once, then takes each version's
			const isPlayStation = (value: string): boolean => /^ps\d|^playstation$/i.test(value)
			const touched = new Set<string>()
			for (const entry of entries) {
				if (this.unloaded) return
				const trophy = trophies.get(trophyIds.get(entry.titleId) ?? '')
				const fields: Record<string, unknown> = { 'PSN ID': entry.titleId }
				if (entry.image) fields[this.fieldTarget('Cover')] = entry.image
				if (entry.lastPlayed) fields['Last Played'] = dmyOf(entry.lastPlayed)
				const since = entry.firstPlayed ? dmyOf(entry.firstPlayed) : ''
				if (trophy) {
					fields.Progress = `${String(trophy.progress)}/100`
					fields.Platinum = trophy.earned.platinum
					fields.Gold = trophy.earned.gold
					fields.Silver = trophy.earned.silver
					fields.Bronze = trophy.earned.bronze
					if (trophy.earned.platinum > 0) fields.Complete = true
				}
				try {
					const existing = notes.find(file => {
						const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
						return toStr(fm?.['PSN ID']) === entry.titleId || sameTitle(toStr(fm?.Name) || file.basename, entry.name)
					})
					if (existing) {
						await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
							for (const key of Object.keys(fields)) {
								if (key === 'Complete' && current.Complete === true) continue
								// a cover kept in the vault stays
								if (key === this.fieldTarget('Cover') && !isEmptyValue(current[key]) && !/^https?:/i.test(toStr(current[key]))) continue
								current[key] = fields[key]
							}
							if (!touched.has(existing.path)) dropPlatforms(current, isPlayStation)
							touched.add(existing.path)
							addPlatform(current, entry.platform || 'PlayStation', entry.minutes === null ? null : playtimeHours(entry.minutes))
							if (since && parseDate(since) < parseDate(current.Date)) current.Date = since
							// legacy fields of an earlier test build
							delete current.Trophies
							delete current['Trophy Progress']
							delete current.Platform
						})
						updated++
						continue
					}
					// the note is made at once from what PSN gave; genres/creators/trailer come later (psnLookUp)
					if (!category) category = await this.categoryFor('game')
					const note = { fields: { Name: entry.name }, progressTotal: null, imdbId: null }
					if (since) fields.Date = since
					addPlatform(fields, entry.platform || 'PlayStation', entry.minutes === null ? null : playtimeHours(entry.minutes))
					const file = await this.newNote(category, provider.id, `psn:${entry.titleId}`, entry.name, note, fields)
					notes.push(file)
					touched.add(file.path)
					created++
				} catch (e) {
					console.error('Library: PlayStation import error', entry.titleId, e)
				}
			}
			this.settings.psnStats = {
				games: entries.length,
				minutes: data.played.reduce((sum, game) => sum + game.minutes, 0),
				level: data.summary?.level ?? 0,
				earned: data.summary?.earned ?? { platinum: 0, gold: 0, silver: 0, bronze: 0 },
				updated: Date.now(),
			}
			await this.saveSettings()
			if (loud || created > 0) new Notice(tr('notice.psn.imported', { created, updated }))
		} finally {
			this.psnImporting = false
		}
		if (!token) return
		// sources know games by English title, Sony in the account language: the note keeps Sony's
		const english = new Map<string, string>()
		for (const game of await psnPlayedGames(token, 'en-US') ?? []) english.set(game.titleId, cleanPsnName(game.name))
		await this.psnLookUp(english)
	}

	// unmatched imported games get genres/creators/year/trailer one at a time in the background; a miss retries next import
	private async psnLookUp(english: Map<string, string>): Promise<void> {
		const provider = this.registry.forType('game')
		if (!provider || this.lookingUp) return
		this.lookingUp = true
		try {
			await this.lookUpImported(provider, english)
		} finally {
			this.lookingUp = false
		}
	}

	private async lookUpImported(provider: ContentProvider, english: Map<string, string>): Promise<void> {
		const pending = this.app.vault.getMarkdownFiles().filter((file) => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			return fm && /^(psn|nintendo):/.test(toStr(fm['Source ID'])) && !isTemplateFile(file.path)
		})
		for (const file of pending) {
			if (this.unloaded) return
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			const names = [english.get(toStr(fm?.['PSN ID'])), toStr(fm?.Name) || file.basename]
				.filter((name, i, all): name is string => !!name && all.indexOf(name) === i)
			try {
				let match: SearchResult | undefined
				for (const name of names) {
					const results = await within(provider.search(name, 'game'), SEARCH_BUDGET_MS * 2, [] as SearchResult[])
					match = results.find(result => sameTitle(result.title, name))
					if (match) break
				}
				const meta = match ? await provider.fetch(match.sourceId, 'game', match.raw) : null
				if (match && meta) {
					const sourceId = match.sourceId
					await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
						current.Source = provider.id
						current['Source ID'] = sourceId
						this.applyMetaPatch(current, meta)
					})
				}
			} catch (e) {
				console.error('Library: game look-up error', file.path, e)
			}
			await this.pause(1500)
		}
	}

	// desktop only: two devices sharing a vault would import at once and make the same game twice
	private async psnSyncIfDue(): Promise<void> {
		if (!Platform.isDesktopApp || !this.settings.psnTokens || this.gameImporting()) return
		const stats = this.settings.psnStats
		if (stats && Date.now() - stats.updated < 24 * 3600000) return
		await this.psnImport(false)
	}

	private async steamSyncIfDue(): Promise<void> {
		if (!Platform.isDesktopApp || !this.settings.steamId.trim() || this.gameImporting()) return
		if (Date.now() - this.settings.steamLastImport < 24 * 3600000) return
		await this.steamImport(false)
	}

	private malSyncIfDue(): Promise<void> {
		if (!Platform.isDesktopApp || !this.settings.malTokens || this.malImporting || this.anilistImporting || this.kitsuImporting) return Promise.resolve()
		if (Date.now() - this.settings.malLastImport < 24 * 3600000) return Promise.resolve()
		return this.malImport(false)
	}

	private anilistSyncIfDue(): Promise<void> {
		if (!Platform.isDesktopApp || !this.settings.anilistToken.trim() || this.anilistImporting || this.malImporting || this.kitsuImporting) return Promise.resolve()
		if (Date.now() - this.settings.anilistLastImport < 24 * 3600000) return Promise.resolve()
		return this.anilistImport(false)
	}

	private kitsuSyncIfDue(): Promise<void> {
		if (!Platform.isDesktopApp || !this.settings.kitsuTokens || this.kitsuImporting || this.malImporting || this.anilistImporting) return Promise.resolve()
		if (Date.now() - this.settings.kitsuLastImport < 24 * 3600000) return Promise.resolve()
		return this.kitsuImport(false)
	}

	// MAL first, AniList after, Kitsu last: interleaved runs could create the same note twice
	private syncTick(): void {
		void this.malSyncIfDue().then(() => this.anilistSyncIfDue()).then(() => this.kitsuSyncIfDue())
	}

	private gameSyncTick(): void {
		// a failed import must not cancel the next one
		const run = (sync: () => Promise<void>) => (): Promise<void> => sync().catch((e: unknown) => console.error('Library: game sync error', e))
		void run(() => this.psnSyncIfDue())().then(run(() => this.steamSyncIfDue())).then(run(() => this.nintendoSyncIfDue()))
	}

	async psnToken(): Promise<string | null> {
		const tokens = this.settings.psnTokens
		if (!tokens) return null
		const renew = Platform.isDesktopApp && tokens.refreshExpiresAt > 0 && Date.now() > tokens.refreshExpiresAt - 3 * 86400000 && Date.now() > this.psnRenewAfter
		if (!psnExpired(tokens) && !renew) return tokens.access
		if (!this.psnRefreshing) {
			this.psnRefreshing = (async () => {
				try {
					let next = renew ? null : await refreshPsnTokens(tokens.refresh)
					if (!next && Platform.isDesktopApp && Date.now() > this.psnRenewAfter) {
						const code = await psnSilentCode()
						next = code ? await exchangePsnCode(code) : null
						if (!next) this.psnRenewAfter = Date.now() + 3600000
					}
					if (!next && !psnExpired(tokens)) return tokens.access
					if (!next) {
						if (!this.psnExpiredSaid) new Notice(tr('notice.psn.expired'))
						this.psnExpiredSaid = true
						return null
					}
					this.settings.psnTokens = next
					await this.saveSettings()
					return next.access
				} finally {
					this.psnRefreshing = null
				}
			})()
		}
		return this.psnRefreshing
	}

	async malToken(): Promise<string | null> {
		const tokens = this.settings.malTokens
		if (!tokens) return null
		if (!isExpired(tokens)) return tokens.access
		if (!this.malRefreshing) this.malRefreshing = this.refreshMalToken(tokens.refresh)
		return this.malRefreshing
	}

	private async refreshMalToken(refresh: string): Promise<string | null> {
		try {
			const { id, secret } = malClientPair(this.settings)
			const next = await refreshTokens(id, secret, refresh)
			if (!next) return null
			this.settings.malTokens = next
			await this.saveSettings()
			return next.access
		} finally {
			this.malRefreshing = null
		}
	}

	async kitsuToken(): Promise<string | null> {
		const tokens = this.settings.kitsuTokens
		if (!tokens) return null
		if (!isKitsuExpired(tokens)) return tokens.access
		if (!this.kitsuRefreshing) this.kitsuRefreshing = this.refreshKitsuToken(tokens.refresh)
		return this.kitsuRefreshing
	}

	private async refreshKitsuToken(refresh: string): Promise<string | null> {
		try {
			const next = await kitsuRefreshGrant(refresh)
			if (!next) return null
			this.settings.kitsuTokens = next
			await this.saveSettings()
			return next.access
		} finally {
			this.kitsuRefreshing = null
		}
	}

	// Kitsu runs the password grant only (no OAuth apps), so desktop signs in on
	// the real site inside the auth window and the session is read back from its
	// storage; mobile keeps the plain form — no webview there.
	connectKitsu(): Promise<boolean> {
		if (Platform.isDesktopApp) {
			return new Promise<boolean>((resolve) => {
				new AuthModal(this.app, 'https://kitsu.app/', (answer) => {
					void (async () => {
						const tokens = answer ? tokensFromKitsuSession(answer) : null
						if (!tokens) {
							if (answer) new Notice(tr('notice.kitsu.connectFailed'))
							resolve(false)
							return
						}
						resolve(await this.kitsuFinishConnect(tokens))
					})()
				}, { title: tr('kitsu.loginTitle'), extract: () => null, pageProbe: KITSU_SESSION_PROBE }).open()
			})
		}
		return new Promise((resolve) => {
			new KitsuLoginModal(this.app, (username, password) => {
				void this.kitsuConnect(username, password, resolve)
			}).open()
		})
	}

	private async kitsuConnect(username: string, password: string, done: (ok: boolean) => void): Promise<void> {
		const tokens = await kitsuPasswordGrant(username, password)
		if (!tokens) {
			new Notice(tr('notice.kitsu.connectFailed'))
			done(false)
			return
		}
		done(await this.kitsuFinishConnect(tokens))
	}

	private async kitsuFinishConnect(tokens: KitsuTokens): Promise<boolean> {
		try {
			// A session read back from the webview may already be past its date;
			// the refresh saves the new tokens itself, the fresh path saves here.
			const expired = isKitsuExpired(tokens)
			const access = expired ? await this.refreshKitsuToken(tokens.refresh) : tokens.access
			if (!access) {
				new Notice(tr('notice.kitsu.connectFailed'))
				return false
			}
			const viewer = await kitsuViewer(access)
			if (!viewer) {
				new Notice(tr('notice.kitsu.connectFailed'))
				return false
			}
			if (!expired) {
				this.settings.kitsuTokens = tokens
				await this.saveSettings()
			}
			new Notice(tr('notice.kitsu.connected', { name: viewer.name }))
			void this.kitsuImport(true)
			return true
		} catch (e) {
			console.error('Library: Kitsu connect error', e)
			new Notice(tr('notice.kitsu.connectFailed'))
			return false
		}
	}

	// The note's Kitsu id: its own side first, the other side via mappings.
	private async kitsuIdFor(ids: { anilist: number | null; mal: number | null }): Promise<number | null> {
		if (ids.anilist !== null) {
			const map = await kitsuIdsFor('anilist', [ids.anilist])
			const id = map?.get(ids.anilist) ?? null
			if (id !== null) return id
		}
		if (ids.mal !== null) {
			const map = await kitsuIdsFor('mal', [ids.mal])
			return map?.get(ids.mal) ?? null
		}
		return null
	}

	// one note → Kitsu: progress, status and score, creating the entry when new
	private async kitsuPushNote(file: TFile, loud: boolean, sendProgress = true): Promise<boolean> {
		const token = await this.kitsuToken()
		const name = tr('kitsu.name')
		if (!token) {
			if (loud) new Notice(tr('notice.site.signedOut', { site: name }))
			return false
		}
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		const note = fm && toStr(fm.Source) === 'anilist' ? animeIds(toStr(fm['Source ID'])) : null
		if (!fm || !note) {
			if (loud) new Notice(tr('notice.anilist.notAnime'))
			return false
		}
		const viewer = await kitsuViewer(token)
		if (!viewer) {
			if (loud) new Notice(tr('notice.kitsu.pushFailed'))
			return false
		}
		const kitsuId = await this.kitsuIdFor(note)
		if (kitsuId === null) {
			if (loud) new Notice(tr('notice.kitsu.noId'))
			return false
		}
		const watched = parseWatched(fm.Progress)
		const rating = Number(toStr(fm['My Rating']))
		const score = Number.isFinite(rating) && rating > 0 ? rating : 0
		const finished = isFinished(fm, this.kindOf(fm) ?? 'anime')
		const existing = await findKitsuEntry(token, viewer.id, kitsuId)
		// an existing entry only gets a status when the note is finished: never downgrade
		const status = existing ? (finished ? 'completed' : null) : kitsuStatus(finished, watched)
		const ok = await pushKitsuEntry(token,
			{ entryId: existing?.entryId ?? null, kitsuId, userId: viewer.id },
			{ progress: sendProgress ? watched : null, status, rating: score > 0 ? score : null })
		if (loud) {
			new Notice(ok
				? tr('notice.kitsu.pushed', { name: toStr(fm.Name) || file.basename })
				: tr('notice.kitsu.pushFailed'))
		}
		return ok
	}

	private async kitsuPushCurrent(): Promise<void> {
		const file = this.app.workspace.getActiveFile()
		const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined
		if (!file || !fm || toStr(fm.Source) !== 'anilist' || !toStr(fm['Source ID'])) {
			new Notice(tr('notice.anilist.notAnime'))
			return
		}
		await this.kitsuPushNote(file, true)
	}

	// send progress and rating to Kitsu unless they match what we last pushed (the echo)
	private async kitsuPush(file: TFile): Promise<void> {
		// a push or import in flight would drop this edit: re-arm the debounce
		if (this.kitsuImporting || this.kitsuPushing) {
			this.kitsuPushTimers.set(file.path, window.setTimeout(() => {
				this.kitsuPushTimers.delete(file.path)
				void this.kitsuPush(file)
			}, 800))
			return
		}
		if (!this.settings.kitsuTokens) return
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		if (!fm || toStr(fm.Source) !== 'anilist') return
		const progress = toStr(fm.Progress)
		const rating = Number(toStr(fm['My Rating']))
		const score = Number.isFinite(rating) && rating > 0 ? rating : 0
		const echo = this.settings.kitsuEcho[file.path]
		if (echo && echo.p === progress && echo.r === score) return
		this.kitsuPushing = true
		try {
			// a score edit alone must not send back a progress Kitsu may have moved past
			const ok = await this.kitsuPushNote(file, false, !echo || echo.p !== progress)
			if (ok) {
				this.settings.kitsuEcho[file.path] = { p: progress, r: score }
				await this.saveSettings()
			}
		} catch (e) {
			console.error('Library: Kitsu push error', file.path, e)
		} finally {
			this.kitsuPushing = false
		}
	}

	private async kitsuPull(): Promise<void> {
		const token = await this.kitsuToken()
		const name = tr('kitsu.name')
		if (!token) { new Notice(tr('notice.site.signedOut', { site: name })); return }
		new Notice(tr('notice.kitsu.pulling'))
		const viewer = await kitsuViewer(token)
		const entries = viewer ? await fetchKitsuList(token, viewer.id) : null
		const ids = entries && await this.kitsuIdsForNotes(this.animeNotes())
		if (!entries || !ids) {
			new Notice(tr('notice.kitsu.pullFailed'))
			return
		}
		const byKitsu = new Map<number, KitsuEntry>()
		for (const e of entries) byKitsu.set(e.kitsuId, e)
		const updated = await this.applyPulled(ids, kitsuId => {
			const entry = byKitsu.get(kitsuId)
			return entry && { progress: entry.progress, complete: entry.status === 'completed' }
		})
		new Notice(tr('notice.kitsu.pulled', { count: updated }))
	}

	// each anime note's Kitsu id: an AniList id first, a MAL id as fallback
	private async kitsuIdsForNotes(notes: AnimeNote[]): Promise<Map<TFile, number> | null> {
		const anilistIds: number[] = []
		const malIds: number[] = []
		for (const note of notes) {
			if (note.anilist !== null) anilistIds.push(note.anilist)
			if (note.mal !== null) malIds.push(note.mal)
		}
		const fromAnilist = await kitsuIdsFor('anilist', anilistIds)
		const fromMal = await kitsuIdsFor('mal', malIds)
		if (!fromAnilist || !fromMal) return null
		const out = new Map<TFile, number>()
		for (const note of notes) {
			let id = note.anilist !== null ? fromAnilist.get(note.anilist) : undefined
			if (!id && note.mal !== null) id = fromMal.get(note.mal)
			if (id) out.set(note.file, id)
		}
		return out
	}

	private async malPushCurrent(): Promise<void> {
		const token = await this.malToken()
		if (!token) { new Notice(tr('notice.mal.noToken')); return }
		const file = this.app.workspace.getActiveFile()
		const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined
		const note = fm && toStr(fm.Source) === 'anilist' ? animeIds(toStr(fm['Source ID'])) : null
		if (!file || !fm || !note) {
			new Notice(tr('notice.anilist.notAnime'))
			return
		}
		const ids = await this.idsOn('mal', [{ file, ...note }])
		if (!ids) { new Notice(tr('notice.mal.pushFailed')); return }
		const malId = ids.get(file)
		if (!malId) { new Notice(tr('notice.mal.noMalId')); return }
		const watched = parseWatched(fm.Progress)
		const rating = Number(toStr(fm['My Rating']))
		const ok = await pushMalEntry(token, malId, 'anime', watched, malStatus(isFinished(fm, this.kindOf(fm) ?? 'anime'), watched),
			Number.isFinite(rating) ? rating : null)
		new Notice(ok
			? tr('notice.mal.pushed', { name: toStr(fm.Name) || file.basename })
			: tr('notice.mal.pushFailed'))
	}

	private async malPull(): Promise<void> {
		const token = await this.malToken()
		if (!token) { new Notice(tr('notice.mal.noToken')); return }
		new Notice(tr('notice.mal.pulling'))
		const entries = await fetchMalList(token)
		const ids = entries && await this.idsOn('mal', this.animeNotes())
		if (!entries || !ids) {
			new Notice(tr('notice.mal.pullFailed'))
			return
		}
		const byMal = new Map<number, MalEntry>()
		for (const e of entries) byMal.set(e.malId, e)
		const updated = await this.applyPulled(ids, malId => {
			const entry = byMal.get(malId)
			return entry && { progress: entry.progress, complete: entry.status === 'completed' }
		})
		new Notice(tr('notice.mal.pulled', { count: updated }))
	}

	// send progress and rating to MAL unless they match what we last pushed (the echo)
	private async malPush(file: TFile): Promise<void> {
		// a push or import in flight would drop this edit: re-arm the debounce
		if (this.malImporting || this.malPushing) {
			this.malPushTimers.set(file.path, window.setTimeout(() => {
				this.malPushTimers.delete(file.path)
				void this.malPush(file)
			}, 800))
			return
		}
		if (!this.settings.malTokens) return
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		if (!fm) return
		const isAnime = toStr(fm.Source) === 'anilist'
		if (!isAnime && toStr(fm.Source) !== 'comics') return
		const ids = isAnime ? animeIds(toStr(fm['Source ID'])) : mangaIds(toStr(fm['Source ID']))
		if (!ids) return
		const progress = toStr(fm.Progress)
		const rating = Number(toStr(fm['My Rating']))
		const score = Number.isFinite(rating) && rating > 0 ? rating : 0
		const echo = this.settings.malEcho[file.path]
		if (echo && echo.p === progress && echo.r === score) return
		const token = await this.malToken()
		if (!token) return
		let malId = ids.mal
		if (malId === null && ids.anilist !== null) {
			const map = isAnime
				? await malIdsFor([ids.anilist])
				: await malMangaIdsFor([ids.anilist])
			malId = (map && map.get(ids.anilist)) ?? null
		}
		if (malId === null) return
		// only a finished note sets status: never overwrite an on-hold or dropped entry
		const status = isFinished(fm, this.kindOf(fm) ?? (isAnime ? 'anime' : 'comic')) ? 'completed' : null
		this.malPushing = true
		try {
			const chapters = parseWatched(progress)
			const ok = await pushMalEntry(token, malId, isAnime ? 'anime' : 'manga', chapters, status, score > 0 ? score : null)
			if (ok) {
				this.settings.malEcho[file.path] = { p: progress, r: score }
				await this.saveSettings()
			}
		} catch (e) {
			console.error('Library: MyAnimeList push error', file.path, e)
		} finally {
			this.malPushing = false
		}
	}

	async malImport(loud: boolean): Promise<void> {
		if (this.malImporting || this.anilistImporting || this.kitsuImporting) {
			if (loud) new Notice(tr('notice.mal.importing'))
			return
		}
		this.malImporting = true
		try {
			const token = await this.malToken()
			if (!token) { if (loud) new Notice(tr('notice.mal.noToken')); return }
			if (loud) new Notice(tr('notice.mal.importing'))
			const [anime, manga] = await Promise.all([fetchMalList(token), fetchMalList(token, 'manga')])
			if (!anime || !manga) { if (loud) new Notice(tr('notice.mal.importFailed')); return }
			const a = await this.importMalEntries(anime, 'anime')
			const m = await this.importMalEntries(manga, 'manga')
			this.settings.malStats = { anime: a.created + a.updated, manga: m.created + m.updated, updated: Date.now() }
			this.settings.malLastImport = Date.now()
			this.pruneEcho()
			await this.saveSettings()
			// new categories/notes may exist: refresh the open tab and walk for covers
			this.settingTab?.refresh()
			this.scheduleEnrich(ENRICH_STEP_DELAY)
			if (loud || a.created + m.created > 0) new Notice(tr('notice.mal.imported', { created: a.created + m.created, updated: a.updated + m.updated }))
		} finally {
			this.malImporting = false
		}
	}

	async anilistImport(loud: boolean): Promise<void> {
		if (this.anilistImporting || this.malImporting || this.kitsuImporting) {
			if (loud) new Notice(tr('notice.mal.importing'))
			return
		}
		const token = this.settings.anilistToken.trim()
		if (!token) { if (loud) new Notice(tr('notice.anilist.noToken')); return }
		this.anilistImporting = true
		try {
			if (loud) new Notice(tr('notice.mal.importing'))
			const viewer = await aniListViewer(token)
			if (!viewer) { if (loud) new Notice(tr('notice.anilist.importFailed')); return }
			const [anime, manga] = await Promise.all([
				fetchList(token, viewer.id, 'ANIME'),
				fetchList(token, viewer.id, 'MANGA')
			])
			if (!anime || !manga) { if (loud) new Notice(tr('notice.anilist.importFailed')); return }
			const rows = (entries: AniListEntry[], kind: 'anime' | 'manga'): ImportRow[] => entries
				.filter(entry => entry.status !== 'PLANNING')
				.map(entry => ({
					// manga notes live under "manga:<id>", what a MAL import writes
					sourceId: kind === 'anime' ? String(entry.mediaId) : `${MangaProvider.PREFIX}${String(entry.mediaId)}`,
					altId: kind === 'anime' && entry.idMal !== null ? `${MalProvider.PREFIX}${String(entry.idMal)}` : null,
					title: entry.title,
					total: entry.total,
					progress: entry.progress,
					score: toTenPoint(entry.score, viewer.scoreFormat),
					complete: entry.status === 'COMPLETED'
				}))
			const a = await this.importRows(rows(anime, 'anime'), 'anime')
			const m = await this.importRows(rows(manga, 'manga'), 'manga')
			this.settings.anilistLastImport = Date.now()
			this.pruneEcho()
			await this.saveSettings()
			// new categories/notes may exist: refresh the open tab and walk for covers
			this.settingTab?.refresh()
			this.scheduleEnrich(ENRICH_STEP_DELAY)
			if (loud || a.created + m.created > 0) new Notice(tr('notice.mal.imported', { created: a.created + m.created, updated: a.updated + m.updated }))
		} finally {
			this.anilistImporting = false
		}
	}

	async kitsuImport(loud: boolean): Promise<void> {
		const name = tr('kitsu.name')
		if (this.kitsuImporting || this.malImporting || this.anilistImporting) {
			if (loud) new Notice(tr('notice.site.importing', { site: name }))
			return
		}
		this.kitsuImporting = true
		try {
			const token = await this.kitsuToken()
			if (!token) { if (loud) new Notice(tr('notice.site.signedOut', { site: name })); return }
			if (loud) new Notice(tr('notice.site.importing', { site: name }))
			const viewer = await kitsuViewer(token)
			const entries = viewer ? await fetchKitsuList(token, viewer.id) : null
			if (!entries) { if (loud) new Notice(tr('notice.site.failed', { site: name })); return }
			// map Kitsu ids back to AniList's so rows land on the note's own Source ID
			const anilistOf = await externalIdsFor(entries.map(e => e.kitsuId), 'anilist')
			if (!anilistOf) { if (loud) new Notice(tr('notice.site.failed', { site: name })); return }
			const rows: ImportRow[] = entries.map((entry) => {
				const anilist = anilistOf.get(entry.kitsuId) ?? null
				return {
					// an entry Kitsu knows alone still updates notes, matched by title
					sourceId: anilist !== null ? String(anilist) : null,
					altId: null,
					title: entry.title,
					total: entry.total,
					progress: entry.progress,
					score: Math.round(entry.rating),
					complete: entry.status === 'completed'
				}
			})
			const a = await this.importRows(rows, 'anime')
			this.settings.kitsuLastImport = Date.now()
			this.pruneEcho()
			await this.saveSettings()
			// new categories/notes may exist: refresh the open tab and walk for covers
			this.settingTab?.refresh()
			this.scheduleEnrich(ENRICH_STEP_DELAY)
			if (loud || a.created + a.updated > 0) new Notice(tr('notice.site.imported', { site: name, created: a.created, updated: a.updated }))
		} finally {
			this.kitsuImporting = false
		}
	}

	// Update: anime sites first, one after the other (they write the same notes), then games
	async updateAll(): Promise<void> {
		if (this.settings.malTokens) await this.malImport(true)
		if (this.settings.anilistToken.trim()) await this.anilistImport(true)
		if (this.settings.kitsuTokens) await this.kitsuImport(true)
		if (this.settings.traktTokens) await this.traktImport(true)
		if (this.settings.psnTokens) await this.psnImport(true)
		if (this.settings.steamId.trim()) await this.steamImport(true)
		if (this.settings.nintendoTokens) await this.nintendoImport(true)
		for (const site of ['imdb', 'netflix', 'youtube'] as const) if (this.settings.watchSites[site].connected) await this.watchImport(site, true)
	}

	private pruneEcho(): void {
		const paths = new Set(this.app.vault.getMarkdownFiles().map((file) => file.path))
		for (const path of Object.keys(this.settings.malEcho)) {
			if (!paths.has(path)) delete this.settings.malEcho[path]
		}
		for (const path of Object.keys(this.settings.kitsuEcho)) {
			if (!paths.has(path)) delete this.settings.kitsuEcho[path]
		}
		if (this.watchImporting) return
		const imdb = new Set<string>()
		const netflix = new Set<string>()
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm) continue
			const id = this.imdbIdOf(fm)
			if (id) imdb.add(id)
			const netflixId = toStr(fm['Netflix ID'])
			if (netflixId) netflix.add(netflixId)
		}
		for (const id of Object.keys(this.settings.imdbEcho)) if (!imdb.has(id)) delete this.settings.imdbEcho[id]
		for (const id of Object.keys(this.settings.traktEcho)) if (!imdb.has(id)) delete this.settings.traktEcho[id]
		for (const id of Object.keys(this.settings.netflixEcho)) if (!netflix.has(id)) delete this.settings.netflixEcho[id]
	}

	private async importMalEntries(entries: MalEntry[], kind: 'anime' | 'manga'): Promise<{ created: number; updated: number }> {
		const anilistOf = entries.length === 0 ? new Map<number, number>()
			: kind === 'anime' ? await anilistIdsFor(entries.map(e => e.malId)) : await anilistMangaIdsFor(entries.map(e => e.malId))
		const anilist = anilistOf ?? new Map<number, number>()
		const rows: ImportRow[] = entries.map((entry) => {
			const alId = anilist.get(entry.malId) ?? null
			// a manga note keeps AniList's id; one MAL cannot name waits for the next import
			const sourceId = kind === 'anime'
				? `${MalProvider.PREFIX}${String(entry.malId)}`
				: alId === null ? null : `${MangaProvider.PREFIX}${String(alId)}`
			return {
				sourceId,
				altId: kind === 'anime' && alId !== null ? String(alId) : null,
				title: entry.title,
				total: entry.total,
				progress: entry.progress,
				score: entry.score,
				complete: entry.status === 'completed'
			}
		})
		return this.importRows(rows, kind)
	}

	private async importRows(rows: ImportRow[], kind: 'anime' | 'manga'): Promise<{ created: number; updated: number }> {
		const source = kind === 'anime' ? 'anilist' : 'comics'
		let category = kind === 'anime'
			? this.settings.categories.find(c => c.contentType === 'anime')
			: this.settings.categories.find(c => c.typeValue === this.settings.malMangaType)
		if (!category) {
			if (kind === 'anime') {
				category = await this.categoryFor('anime')
			} else {
				// manga gets its own category: content type comic, named for the medium
				category = newCategory('comic', this.settings)
				category.name = tr('settings.mal.mangaCategory')
				category.folder = joinFolder(this.settings.libraryFolder, category.name)
				this.settings.malMangaType = category.typeValue
				this.settings.categories.push(category)
				addCategoryTop(this.settings, category.typeValue)
				await this.saveSettings()
				new Notice(tr('notice.categoryCreated', { name: categoryLabel(category) }))
			}
		}
		const notes = this.app.vault.getMarkdownFiles().filter(file =>
			!isTemplateFile(file.path) && toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.Type) === category.typeValue)
		const bySourceId = new Map<string, TFile>()
		for (const file of notes) bySourceId.set(toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.['Source ID']), file)
		let created = 0
		let updated = 0
		for (const row of rows) {
			if (this.unloaded) return { created, updated }
			const sourceId = row.sourceId
			let existing = sourceId ? bySourceId.get(sourceId) : undefined
			if (!existing && row.altId) existing = bySourceId.get(row.altId)
			if (!existing) existing = notes.find(file => {
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
				return sameTitle(toStr(fm?.Name) || file.basename, row.title)
			})
			const existingFm = existing ? this.app.metadataCache.getFileCache(existing)?.frontmatter : undefined
			const progressStr = toStr(existingFm?.Progress)
			const match = progressStr.match(progressPattern)
			// keep the note's own total: a source leaves it empty and "12/1" is nonsense
			const total = Math.max(row.total, match ? Number(match[2]) : 0, 1)
			const watched = Math.max(parseWatched(existingFm?.Progress), row.progress)
			const rating = Number(toStr(existingFm?.['My Rating']))
			const score = Number.isFinite(rating) && rating > 0 ? rating : 0
			const progress = `${String(watched)}/${String(total)}`
			try {
				if (existing) {
					// a note edited since the last sync keeps its progress and rating; the list fills gaps
					if (editedSince(this.settings.malEcho[existing.path], progressStr, score)) continue
					await this.app.fileManager.processFrontMatter(existing, (current: Record<string, unknown>) => {
						current.Progress = progress
						if (row.complete) current.Complete = true
						if (row.score > 0 && score === 0) current['My Rating'] = row.score
					})
					// record it so the next import can tell their edit from this write
					this.settings.malEcho[existing.path] = { p: progress, r: score || row.score }
					updated++
					continue
				}
				if (!sourceId) continue
				const extra: Record<string, unknown> = { Name: row.title }
				if (row.score > 0) extra['My Rating'] = row.score
				extra.Progress = progress
				if (row.complete) extra.Complete = true
				const file = await this.newNote(category, source, sourceId, row.title, { fields: { Name: row.title }, progressTotal: null, imdbId: null }, extra)
				bySourceId.set(sourceId, file)
				this.settings.malEcho[file.path] = { p: progress, r: row.score }
				created++
			} catch (e) {
				console.error('Library: list import error', sourceId ?? row.title, e)
			}
		}
		return { created, updated }
	}

	findDuplicates(): DuplicateGroup[] {
		const types = new Set(this.settings.categories.map(c => c.typeValue))
		const urlMap = new Map<string, TFile[]>()

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm || typeof fm.Type !== 'string' || !types.has(fm.Type)) continue
			const url = toStr(fm.URL).trim()
			if (!url) continue
			const list = urlMap.get(url) || []
			list.push(file)
			urlMap.set(url, list)
		}

		const groups: DuplicateGroup[] = []
		for (const [url, files] of urlMap) {
			if (files.length > 1) {
				groups.push({ url, files })
			}
		}
		return groups
	}

	openDuplicates(): void {
		const groups = this.findDuplicates()
		if (groups.length === 0) {
			new Notice(tr('dup.none'))
			return
		}
		new DuplicateRemovalModal(this.app, groups, (removed) => {
			new Notice(tr('dup.removed', { count: removed }))
			this.refreshViews()
		}).open()
	}

	coverProperty(): string {
		return this.settings.coverProperty.trim() || 'Cover'
	}

	private fieldTarget(key: string): string {
		return key === 'Cover' ? this.coverProperty() : key
	}

	private skipped(key: string): boolean {
		const names = this.settings.skipFields.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
		return names.indexOf(key.toLowerCase()) >= 0 || names.indexOf(this.fieldTarget(key).toLowerCase()) >= 0
	}

	// the category template's text: a new note starts as a copy of it
	private async templateText(category: ICategory): Promise<string> {
		const path = category.template?.trim()
		if (!path) return ''
		const template = this.app.metadataCache.getFirstLinkpathDest(path, '')
		if (!template || template.extension !== 'md') {
			new Notice(tr('notice.templateMissing', { path }))
			return ''
		}
		return this.app.vault.read(template)
	}

	private applyMetaFields(fm: Record<string, unknown>, meta: NormalizedMetadata): void {
		const fields: Record<string, unknown> = meta.fields
		for (const [key, value] of Object.entries(fields)) {
			if (isEmptyValue(value) || this.skipped(key)) continue
			const target = this.fieldTarget(key)
			if (!isEmptyValue(fm[target])) continue
			fm[target] = LINK_FIELDS.indexOf(key) >= 0 ? this.toLinks(value) : value
		}
	}

	// Covers into <library>/Covers, one note at a time; the note then links the file.
	coverSweep(): void {
		if (!this.settings.localCovers) return
		for (const file of this.app.vault.getMarkdownFiles()) this.queueCover(file)
	}

	private queueCover(file: TFile): void {
		if (!this.settings.localCovers || this.unloaded) return
		this.coverQueue.add(file.path)
		void this.coverWork()
	}

	private async coverWork(): Promise<void> {
		if (this.coverWorking) return
		this.coverWorking = true
		try {
			for (const path of this.coverQueue) {
				this.coverQueue.delete(path)
				if (this.unloaded || !this.settings.localCovers) break
				const file = this.app.vault.getFileByPath(path)
				if (file) await this.localizeCover(file)
			}
		} finally {
			this.coverWorking = false
		}
	}

	private async localizeCover(file: TFile): Promise<void> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
		if (!fm || isTemplateFile(file.path) || !this.settings.categories.some(c => c.typeValue === toStr(fm.Type))) return
		const key = coverKey(fm, this.coverProperty())
		const remote = key ? toStr(fm[key]) : ''
		const url = publicHttpsUrl(remote)
		if (!key || !url || this.coverFailed.has(url)) return
		try {
			const resp = await requestUrl({ url, throw: false })
			const type = Object.keys(resp.headers).find(name => name.toLowerCase() === 'content-type')
			const ext = imageExtension(type ? resp.headers[type] ?? '' : '')
			if (resp.status !== 200 || !ext || resp.arrayBuffer.byteLength === 0) {
				this.coverFailed.add(url)
				return
			}
			const dir = joinFolder(this.settings.libraryFolder, 'Covers')
			await this.ensureFolder(dir)
			const base = sanitizeFilename(file.basename) || 'Cover'
			let path = `${dir}/${base}.${ext}`
			for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = `${dir}/${base} ${String(n)}.${ext}`
			await this.app.vault.createBinary(path, resp.arrayBuffer)
			await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
				if (toStr(current[key]) === remote) current[key] = `[[${path}]]`
			})
		} catch (e) {
			this.coverFailed.add(url)
			console.error('Library: cover download error', file.path, e)
		}
	}

	private async ensureFolder(dir: string): Promise<void> {
		let path = ''
		for (const part of dir.split('/').filter(Boolean)) {
			path = path ? `${path}/${part}` : part
			if (this.app.vault.getAbstractFileByPath(path)) continue
			try {
				await this.app.vault.createFolder(path)
			} catch (e) {
				console.error('Library: folder create error', e)
			}
		}
	}

	async moveLibraryFolder(from: string, to: string): Promise<number> {
		const oldRoot = cleanFolder(from)
		const newRoot = cleanFolder(to)
		this.settings.libraryFolder = newRoot
		const moves: FolderMove[] = []
		if (oldRoot && oldRoot !== newRoot) {
			for (const category of this.settings.categories) {
				const folder = cleanFolder(category.folder)
				if (!isInside(folder, oldRoot)) continue
				category.folder = joinFolder(newRoot, folder.slice(oldRoot.length + 1))
				moves.push({ typeValue: category.typeValue, from: folder, to: category.folder })
			}
		}
		await this.saveSettings()
		await this.offerMove(moves)
		return moves.length
	}

	async moveCategoryFolder(category: ICategory, from: string, to: string): Promise<void> {
		const oldFolder = cleanFolder(from)
		category.folder = cleanFolder(to)
		await this.saveSettings()
		if (oldFolder && oldFolder !== category.folder) {
			await this.offerMove([{ typeValue: category.typeValue, from: oldFolder, to: category.folder }])
		}
	}

	private async offerMove(moves: FolderMove[]): Promise<void> {
		const plan = this.movePlan(moves)
		if (plan.length === 0) return
		const agreed = await new Promise<boolean>((resolve) => {
			new ConfirmModal(this.app, {
				title: tr('modal.moveNotes.title'),
				text: tr('modal.moveNotes.count', { count: formatNumber(plan.length) }),
				confirm: tr('modal.moveNotes.move'),
				cancel: tr('modal.moveNotes.keep'),
			}, resolve).open()
		})
		if (agreed) await this.runMoves(plan, moves)
	}

	private movePlan(moves: FolderMove[]): Array<{ file: TFile; target: string }> {
		const plan: Array<{ file: TFile; target: string }> = []
		if (moves.length === 0) return plan
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue
			const type = toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.Type)
			const folder = parentFolder(file.path)
			const move = moves.find(m => m.typeValue === type && isInside(folder, m.from))
			// With the new folder inside the old one, a note already in it stays.
			if (!move || (isInside(move.to, move.from) && isInside(folder, move.to))) continue
			plan.push({ file, target: normalizePath(joinFolder(move.to, file.path.slice(move.from.length + 1))) })
		}
		return plan
	}

	// moves via the file manager, so links follow the user's link settings
	private async runMoves(plan: Array<{ file: TFile; target: string }>, moves: FolderMove[]): Promise<void> {
		let moved = 0
		let kept = 0
		for (const { file, target } of plan) {
			if (this.app.vault.getAbstractFileByPath(target)) { kept++; continue }
			try {
				await this.ensureFolder(parentFolder(target))
				await this.app.fileManager.renameFile(file, target)
				moved++
			} catch (e) {
				console.error('Library: move note error', file.path, e)
				kept++
			}
		}
		for (const move of moves) await this.trashIfEmpty(move.from)
		new Notice(tr('notice.notesMoved', { count: formatNumber(moved) }))
		if (kept > 0) new Notice(tr('notice.notesNotMoved', { count: formatNumber(kept) }))
	}

	private async trashIfEmpty(path: string): Promise<void> {
		let current = path
		while (current) {
			const folder = this.app.vault.getFolderByPath(current)
			if (!folder || await this.holdsFiles(current)) return
			try {
				await this.app.fileManager.trashFile(folder)
			} catch (e) {
				console.error('Library: folder trash error', current, e)
				return
			}
			current = parentFolder(current)
		}
	}

	// Asks the disk, not the vault index: the index leaves out hidden files,
	// and those would go to the trash with the folder.
	private async holdsFiles(path: string): Promise<boolean> {
		const listed = await this.app.vault.adapter.list(path)
		if (listed.files.some(file => !file.endsWith('/.DS_Store'))) return true
		for (const sub of listed.folders) if (await this.holdsFiles(sub)) return true
		return false
	}

	private async uniqueNotePath(title: string, categoryFolder: string): Promise<string> {
		const folder = cleanFolder(categoryFolder)
		const base = sanitizeFilename(title)
		const dir = folder ? normalizePath(folder) : ''
		await this.ensureFolder(dir)
		const build = (name: string): string => normalizePath(dir ? `${dir}/${name}.md` : `${name}.md`)
		let candidate = build(base)
		let counter = 2
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = build(`${base} (${String(counter)})`)
			counter++
		}
		return candidate
	}

	// new metadata reaches existing notes only by re-fetching: one walk per plugin version, one note at a time
	private scheduleEnrich(delay: number): void {
		if (this.unloaded) return
		// a running walk finishes, then starts over: a key entered mid-walk reaches passed notes
		if (this.enrichRunning) {
			this.enrichAgain = true
			return
		}
		if (this.enrichTimer) window.clearTimeout(this.enrichTimer)
		this.enrichTimer = window.setTimeout(() => {
			this.enrichTimer = null
			void this.enrichPass(false)
		}, delay)
	}

	private async enrichPass(force: boolean): Promise<void> {
		if (this.enrichRunning) {
			if (force) new Notice(tr('notice.searching'))
			return
		}
		this.enrichRunning = true
		let updated = 0
		let marked = 0
		try {
			if (force) new Notice(tr('notice.searching'))
			const files = this.app.vault.getMarkdownFiles()
			let complete = true
			for (const file of files) {
				if (this.unloaded) return
				if (isTemplateFile(file.path)) continue
				const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
				if (!fm) continue
				const category = this.settings.categories.find(c => c.typeValue === toStr(fm.Type))
				if (!category) continue
				if (!force && this.settings.enrichMarks[file.path] === this.manifest.version) continue
				const provider = this.registry.forType(category.contentType)
				const sourceId = toStr(fm['Source ID'])
				// no Source ID, no provider, or Open Library (nothing to fetch by id): no request
				const fetches = !!provider && !!sourceId && provider.refreshable?.(sourceId) !== false
				// offline every fetch would fail: leave the rest unmarked for the next launch
				if (fetches && !navigator.onLine) {
					complete = false
					break
				}
				// the walk also brings each note to the current link format (Genre/Creator/Cast links, no Related)
				await this.syncNote(file)
				if (this.unloaded) return

				// only a fetched note is marked: a failed request (quota, outage) retries next pass.
				// The mark goes in before the pause, so a key entered during it clears it too.
				let ok = true
				if (fetches && provider) {
					for (let i = 0; i < 10 && this.isRefreshing && !this.unloaded; i++) {
						await this.enrichSleep(500)
					}
					if (this.unloaded) return
					ok = await this.enrichNote(file, category.contentType, provider, sourceId)
				}
				if (ok) {
					if (fetches) updated++
					this.settings.enrichMarks[file.path] = this.manifest.version
					marked++
					if (marked % 10 === 0) await this.persistSettings()
				}
				if (fetches) {
					await this.enrichSleep(ENRICH_STEP_DELAY)
					if (this.unloaded) return
				}
			}
			if (complete && this.pruneEnrichMarks(files)) marked++
			if (marked > 0) await this.persistSettings()
		} catch (e) {
			console.error('Library: metadata pass error', e)
		} finally {
			this.enrichRunning = false
			if (this.enrichAgain && !this.unloaded) {
				this.enrichAgain = false
				this.scheduleEnrich(ENRICH_STEP_DELAY)
			}
		}
		if (force) new Notice(tr('notice.refreshedAll', { count: String(updated) }))
	}

	private pruneEnrichMarks(files: TFile[]): boolean {
		const present = new Set(files.map(file => file.path))
		let pruned = false
		for (const path of Object.keys(this.settings.enrichMarks)) {
			if (present.has(path)) continue
			delete this.settings.enrichMarks[path]
			pruned = true
		}
		return pruned
	}

	private async enrichNote(
		file: TFile,
		contentType: ICategory['contentType'],
		provider: ContentProvider,
		sourceId: string
	): Promise<boolean> {
		try {
			const meta = await provider.fetch(sourceId, contentType)
			if (!meta) return false
			await this.app.fileManager.processFrontMatter(file, (current) => {
				this.applyMetaPatch(current as Record<string, unknown>, meta)
			})
			return true
		} catch (e) {
			console.error('Library: metadata pass error', e)
			return false
		}
	}

	private pause(ms: number): Promise<void> {
		return new Promise<void>(resolve => {
			const id = window.setTimeout(() => {
				this.pauses.delete(id)
				resolve()
			}, ms)
			this.pauses.set(id, resolve)
		})
	}

	// its own timer: sharing the walk's would let a key change cancel this sleep and hang the walk
	private enrichSleep(ms: number): Promise<void> {
		return new Promise<void>(resolve => {
			this.enrichWait = resolve
			this.enrichSleepTimer = window.setTimeout(() => {
				this.enrichSleepTimer = null
				this.enrichWait = null
				resolve()
			}, ms)
		})
	}

	// key signature per content type: only the types a changed key serves re-walk
	private apiKeySignatures(): Record<string, string> {
		const s = this.settings
		const video = `${s.omdbApiKey}|${s.tmdbApiKey}`
		return {
			movie: video,
			series: video,
			book: s.googleBooksApiKey,
			googlebook: s.googleBooksApiKey,
			comic: s.comicVineApiKey,
			game: `${s.rawgApiKey}|${s.twitchClientId}|${s.twitchClientSecret}`
		}
	}

	private dropEnrichMarks(types: string[]): void {
		for (const file of this.app.vault.getMarkdownFiles()) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter
			if (!fm) continue
			const category = this.settings.categories.find(c => c.typeValue === toStr(fm.Type))
			if (category && types.includes(category.contentType)) delete this.settings.enrichMarks[file.path]
		}
	}

	private async tryRefresh(force: boolean): Promise<void> {
		if (this.isRefreshing) return
		const file = this.app.workspace.getActiveFile()
		if (!(file instanceof TFile)) return

		const cache = this.app.metadataCache.getFileCache(file)
		const fm: Record<string, unknown> | undefined = cache?.frontmatter
		if (!fm) return

		const category = this.settings.categories.find(c => c.typeValue === toStr(fm.Type))
		if (!category) return
		const provider = this.registry.forType(category.contentType)
		if (!provider) return
		const sourceId = toStr(fm['Source ID'])

		if (!force) {
			// at most every five minutes, and never a note its source cannot look up
			const last = this.refreshCooldowns.get(file.path)
			if (last && Date.now() - last < 5 * 60 * 1000) return
			if (sourceId && provider.refreshable?.(sourceId) === false) return
		}
		this.refreshCooldowns.set(file.path, Date.now())

		this.isRefreshing = true
		try {
			if (!sourceId) {
				await this.adoptNote(file, fm, category, provider, force)
				return
			}

			const meta = await provider.fetch(sourceId, category.contentType)
			if (!meta) {
				if (force) new Notice(tr('notice.notFound'))
				return
			}

			await this.app.fileManager.processFrontMatter(file, (current) => {
				this.applyMetaPatch(current as Record<string, unknown>, meta)
			})

			if (force) new Notice(tr('notice.refreshed', { name: toStr(meta.fields.Name) || file.basename }))
		} catch (e) {
			console.error('Library: refresh error', e)
			if (force) {
				new Notice(tr('notice.refreshError'))
			}
		} finally {
			this.isRefreshing = false
		}
	}

	// no Source ID to look up by: search the source by the note's name and adopt a confident match
	private async adoptNote(
		file: TFile,
		fm: Record<string, unknown>,
		category: ICategory,
		provider: ContentProvider,
		force: boolean
	): Promise<void> {
		const name = toStr(fm.Name) || file.basename
		const year = Number(fm.Year) || 0
		const results = await within(provider.search(name, category.contentType), SEARCH_BUDGET_MS * 2, [] as SearchResult[])
		// one unambiguous hit only: a remake shares the title ("Dune" 1984/2021)
		const matches = results.filter(result =>
			sameTitle(result.title, name) && (!year || result.year === null || result.year === year)
		)
		const [match] = matches
		if (!match || matches.length > 1) {
			if (force) {
				new AddContentModal(
					this.app,
					provider,
					category.contentType,
					(result) => { void this.attachSource(file, category, provider, result) },
					name
				).open()
			}
			return
		}
		await this.attachSource(file, category, provider, match)
	}

	private async attachSource(
		file: TFile,
		category: ICategory,
		provider: ContentProvider,
		result: SearchResult
	): Promise<void> {
		const meta = await provider.fetch(result.sourceId, category.contentType, result.raw)
		if (!meta) {
			new Notice(tr('notice.notFound'))
			return
		}
		await this.app.fileManager.processFrontMatter(file, (current) => {
			const cur = current as Record<string, unknown>
			cur.Source = provider.id
			cur['Source ID'] = result.sourceId
			this.applyMetaPatch(cur, meta)
		})
		new Notice(tr('notice.refreshed', { name: toStr(meta.fields.Name) || file.basename }))
	}

	// refresh never overwrites a value already in the note: hand edits win
	private applyMetaPatch(current: Record<string, unknown>, meta: NormalizedMetadata): void {
		const fields: Record<string, unknown> = meta.fields
		for (const [key, value] of Object.entries(fields)) {
			if (isEmptyValue(value) || this.skipped(key)) continue
			const target = this.fieldTarget(key)
			// any known cover property counts as present, so a rename does not duplicate it
			const present = key === 'Cover' ? coverValue(current, this.coverProperty()) : current[target]
			if (key === 'Seasons' && !isEmptyValue(present)) current[target] = mergeSeasons(present, value)
			// A Steam trailer stream gives way once a YouTube one is found.
			else if (key === 'Trailer' && /steamstatic\.com\//.test(toStr(present)) && /youtube\.com\//.test(toStr(value))) current[target] = value
			else if (isEmptyValue(present)) current[target] = LINK_FIELDS.indexOf(key) >= 0 ? this.toLinks(value) : value
			// a junk runtime from an earlier pass must not shadow a plausible one
			else if (key === 'Runtime' && plausibleRuntime(present) === null && plausibleRuntime(value) !== null) current[target] = value
			// a source's own score moves: refresh brings the current one, not the first
			else if (SOURCE_SCORES.indexOf(key) >= 0) current[target] = value
		}
		if (typeof meta.fields.Season === 'number' && meta.fields.Season > Number(current.Season || 0) && !this.skipped('Season')) {
			current.Season = meta.fields.Season
		}
		// A PlayStation game's progress is PlayStation's own percentage.
		if (meta.progressTotal && !hasChapters(current) && trackingOf(this.kindOf(current)) !== 'watched' && !current['PSN ID']) {
			const watched = parseWatched(current.Progress)
			current.Progress = `${String(watched)}/${String(meta.progressTotal)}`
		}
	}

	private refreshBanner(): void {
		if (this.unloaded) return
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if (!view || !view.file) return
		const sizer = view.containerEl.querySelector('.markdown-preview-sizer')
		if (!(sizer instanceof HTMLElement)) return
		sizer.querySelectorAll('.note-header-wrap').forEach(h => h.remove())

		const fm = this.app.metadataCache.getFileCache(view.file)?.frontmatter
		if (!fm) return
		if (!this.settings.categories.some(c => c.typeValue === toStr(fm.Type))) return

		// the properties panel can appear a beat late: retry until the header anchors in mod-header
		if (!this.insertNoteHeader(view.file, sizer, fm) && this.bannerRetries < 5) {
			this.bannerRetries += 1
			if (this.bannerTimer) window.clearTimeout(this.bannerTimer)
			this.bannerTimer = window.setTimeout(() => this.refreshBanner(), 80)
		}
	}

	// anchors in `mod-header` (survives section re-renders); false when it fell back to a sizer child
	private insertNoteHeader(file: TFile, root: HTMLElement, fm: Record<string, unknown>): boolean {
		root.querySelectorAll('.note-header-wrap').forEach(h => h.remove())
		const header = this.buildNoteHeader(file, fm)
		const props = root.querySelector('.metadata-container')
		const title = root.querySelector('.mod-header .inline-title')
		const modHeader = root.querySelector('.mod-header')
		if (props) {
			props.insertAdjacentElement('afterend', header)
		} else if (title) {
			title.insertAdjacentElement('afterend', header)
		} else if (modHeader) {
			modHeader.appendChild(header)
		} else if (root.childElementCount > 0) {
			// pre-1.13 renderers take a plain sizer child; an empty sizer has not rendered yet
			root.insertBefore(header, root.firstChild)
		} else {
			return false
		}
		return true
	}

	private buildNoteHeader(file: TFile, fm: Record<string, unknown>): HTMLElement {
		const cover = coverValue(fm, this.coverProperty())
		const name = toStr(fm.Name) || file.basename
		const creators = toStrArray(fm.Creator || fm.Director || fm.Author || fm.Artist)
		const cast = toStrArray(fm.Cast)
		const year = fm.Year ? toStr(fm.Year) : ''
		const endYear = fm['End Year'] ? toStr(fm['End Year']) : ''
		const season = fm.Season ? toStr(fm.Season) : ''
		const ratingIMDB = fm['Rating IMDB'] ? toStr(fm['Rating IMDB']) : ''
		const ratingRT = fm['Rating RT'] ? toStr(fm['Rating RT']) + '%' : ''
		const ratingRawg = fm['Rating RAWG'] ? toStr(fm['Rating RAWG']) : ''
		const ratingMc = fm['Rating MC'] ? toStr(fm['Rating MC']) : ''
		const myRating = fm['My Rating'] ? toStr(fm['My Rating']) : ''
		const kind = this.kindOf(fm)
		const progressPercent = shownProgress(fm, kind)
		const complete = trackingOf(kind) !== 'progress' && fm.Complete === true
		const url = safeUrl(fm.URL)

		const header = createDiv()
		header.classList.add('note-header')

		const imgSide = createDiv()
		imgSide.classList.add('note-header-cover')
		const headerCover = coverSrc(this.app, cover)
		if (headerCover) {
			const img = createEl('img')
			img.src = headerCover
			imgSide.appendChild(img)
		}
		header.appendChild(imgSide)

		const infoSide = createDiv()
		infoSide.classList.add('note-header-info')

		const titleEl = createDiv()
		titleEl.classList.add('note-header-title')
		if (url) {
			const a = createEl('a')
			a.href = url
			a.setAttribute('target', '_blank')
			a.setAttribute('rel', 'noopener noreferrer')
			a.classList.add('external-link')
			a.setText(name)
			titleEl.appendChild(a)
		} else {
			titleEl.setText(name)
		}

		const shareBtn = createEl('button')
		shareBtn.classList.add('note-header-share')
		shareBtn.setAttribute('aria-label', tr('share.title'))
		setIcon(shareBtn, 'share-2')
		shareBtn.addEventListener('click', (e) => {
			e.preventDefault()
			new ShareModal(this.app, fm, name, this.coverProperty()).open()
		})
		const video = toStr(fm.Source) === YOUTUBE_SOURCE
		if (video) {
			const reaction = toStr(fm.Reaction)
			for (const kind of ['like', 'dislike'] as const) {
				const on = reaction === kind
				const button = titleEl.createEl('button', { cls: `note-header-reaction is-${kind}${on ? ' is-on' : ''}`, attr: { 'aria-label': tr(kind === 'like' ? 'header.liked' : 'header.disliked'), 'aria-pressed': on ? 'true' : 'false' } })
				setIcon(button, kind === 'like' ? 'thumbs-up' : 'thumbs-down')
				const total = Number(fm[kind === 'like' ? 'Likes' : 'Dislikes'])
				if (fm[kind === 'like' ? 'Likes' : 'Dislikes'] !== undefined && Number.isFinite(total)) button.createSpan({ text: compactNumber(total) })
				button.addEventListener('click', (e) => {
					e.preventDefault()
					button.disabled = true
					void this.youtubeToggle(file, on ? 'removelike' : kind).then(() => { button.disabled = false })
				})
			}
		}
		titleEl.appendChild(shareBtn)
		infoSide.appendChild(titleEl)
		const badges = createDiv({ cls: 'note-header-badges' })
		renderPlatformLabels(badges, fm)
		renderTrophies(badges, fm, 'note-header-trophies')
		if (badges.childElementCount > 0) infoSide.appendChild(badges)

		const addRow = (label: string, value: string, separator = ': ', title = ''): void => {
			if (!value) return
			const row = createDiv()
			row.classList.add('note-header-row')
			const b = createEl('b')
			b.setText(label + separator)
			row.appendChild(b)
			row.appendText(value)
			if (title) setTooltip(row, title, { placement: 'top' })
			infoSide.appendChild(row)
		}

		// each name opens its canvas; the link as written decides where
		const addNames = (label: string, values: string[]): void => {
			if (values.length === 0) return
			const row = infoSide.createDiv({ cls: 'note-header-row' })
			row.createEl('b', { text: label + ': ' })
			values.forEach((value, i) => {
				if (i > 0) row.appendText(', ')
				this.linkName(row.createSpan({ text: linkLabel(value) }), value)
			})
		}

		addNames(tr('header.creator'), creators)
		// the channel: its canvas by name, the channel itself on YouTube, and the subscription
		if (video && infoSide.lastElementChild && creators.length > 0) {
			const row = infoSide.lastElementChild as HTMLElement
			const channel = safeUrl(fm['Channel URL'])
			if (channel) {
				const go = row.createEl('a', { cls: 'note-header-youtube', href: channel, attr: { 'aria-label': tr('header.openYoutube'), target: '_blank', rel: 'noopener noreferrer' } })
				setIcon(go, 'external-link')
			}
			const subscribed = fm.Subscribed === true
			const sub = row.createEl('button', { cls: `note-header-pill is-subscribe${subscribed ? ' is-on' : ''}`, attr: { 'aria-pressed': subscribed ? 'true' : 'false' } })
			setIcon(sub.createSpan(), subscribed ? 'bell-ring' : 'bell-plus')
			sub.createSpan({ text: tr(subscribed ? 'header.subscribed' : 'header.subscribe') })
			sub.addEventListener('click', (e) => {
				e.preventDefault()
				sub.disabled = true
				void this.youtubeToggle(file, subscribed ? 'unsubscribe' : 'subscribe').then(() => { sub.disabled = false })
			})
		}
		if (video && toStr(fm.Published)) addRow(tr('header.published'), toStr(fm.Published))
		if (video && Number(fm.Views) > 0) addRow(tr('header.views'), formatNumber(Number(fm.Views)))
		if (video && Number(fm.Rewatched) > 0) addRow(tr('header.rewatched'), String(Number(fm.Rewatched)))
		addNames(tr('header.cast'), cast)
		const yearsStr = year + (endYear ? '–' + endYear : '')
		if (yearsStr && !video) addRow(tr('header.years'), yearsStr)
		if (season) addRow(tr('header.seasons'), season)
		const airing = this.airingFor(fm)
		if (airing) addRow(tr('header.nextEpisode'), airingLabel(airing))

		addNames(tr('header.genre'), toStrArray(fm.Genre))
		if (kind === 'music') this.addAwards(infoSide, fm, name)
		const countries = toStrArray(fm.Country)
		if (countries.length > 0) addRow(tr('filter.country'), countries.join(', '))

		const runtime = runtimeMinutes(fm.Runtime)
		if (runtime !== null) addRow(tr('header.runtime'), formatRuntime(totalRuntimeMinutes(fm, runtime, kind)))
		if (typeof fm.Playtime === 'number' && fm.Playtime > 0) addRow(tr('stats.psn.time'), spentTime(fm.Playtime * 60), ': ', exactHours(fm.Playtime * 60))
		if (fm['Last Played']) addRow(tr('header.lastPlayed'), toStr(fm['Last Played']))

		if (ratingIMDB) addRow('IMDb', ratingIMDB)
		if (ratingRT) addRow(RATING_RT_ICON, ratingRT, ' ')
		if (ratingRawg) addRow('RAWG', ratingRawg)
		if (ratingMc) addRow('MC', ratingMc)
		if (myRating) addRow(tr('header.myRating'), myRating)

		if (progressPercent !== null) {
			const progRow = createDiv()
			progRow.classList.add('note-header-row')
			const b = createEl('b')
			b.setText(tr('header.progress') + ': ')
			progRow.appendChild(b)
			progRow.appendText(String(progressPercent) + '%')
			// how much of the progress is already on the clock
			const watchedMinutes = watchedRuntimeMinutes(fm, kind)
			if (watchedMinutes > 0) progRow.appendText(' · ' + formatRuntime(watchedMinutes))
			const bar = createDiv()
			bar.classList.add('note-header-progress-bar')
			const fill = createDiv()
			fill.classList.add('note-header-progress-fill')
			fill.setCssStyles({ width: String(progressPercent) + '%' })
			bar.appendChild(fill)
			progRow.appendChild(bar)
			infoSide.appendChild(progRow)
		}

		if (complete) {
			const doneRow = createDiv()
			doneRow.classList.add('note-header-row', 'note-header-complete')
			doneRow.setText(tr('header.complete'))
			infoSide.appendChild(doneRow)
		}

		header.appendChild(infoSide)

		const wrap = createDiv()
		wrap.classList.add('note-header-wrap')
		wrap.appendChild(header)
		this.buildMediaBlock(wrap, fm, name)
		this.buildSeasonsBlock(wrap, fm, file)
		this.buildTrophiesBlock(wrap, fm, file)
		this.buildRecommendations(wrap, fm)
		return wrap
	}

	// an album's awards from Wikidata, a row that appears once they arrive
	private addAwards(infoSide: HTMLElement, fm: Record<string, unknown>, name: string): void {
		const artist = linkLabel(toStrArray(fm.Creator)[0] ?? '')
		if (!artist) return
		const key = `${name}\u0000${artist}`
		let pending = this.albumAwards.get(key)
		if (!pending) {
			pending = albumAwards(name, artist).catch(() => [] as Award[])
			this.albumAwards.set(key, pending)
		}
		const row = infoSide.createDiv({ cls: 'note-header-row' })
		void pending.then(awards => {
			if (awards.length === 0 || this.unloaded) { row.remove(); return }
			row.createEl('b', { text: tr('header.awards') + ': ' })
			row.appendText(awards.map(award => award.year ? `${award.name} (${String(award.year)})` : award.name).join(', '))
		})
	}

	private buildRecommendations(wrap: HTMLElement, fm: Record<string, unknown>): void {
		if (!this.settings.showRecommendations) return
		const source = toStr(fm.Source)
		const sourceId = toStr(fm['Source ID'])
		if (!source || !sourceId) return
		const key = `${source}:${sourceId}`
		let pending = this.recommendations.get(key)
		if (!pending) {
			const category = this.settings.categories.find(c => c.typeValue === toStr(fm.Type))
			const known = new Set<string>()
			for (const file of this.app.vault.getMarkdownFiles()) {
				const id = toStr(this.app.metadataCache.getFileCache(file)?.frontmatter?.['Source ID'])
				if (id) known.add(id)
			}
			pending = recommendationsFor(source, sourceId, toStr(fm.Name), toStrArray(fm.Genre).map(linkLabel), {
				tmdb: this.settings.tmdbApiKey.trim(),
				rawg: this.settings.rawgApiKey.trim()
			}, category?.contentType === 'series', known).catch(() => [] as Recommendation[])
			this.recommendations.set(key, pending)
		}
		const box = wrap.createDiv({ cls: 'library-recs' })
		void pending.then(recs => {
			if (recs.length === 0 || this.unloaded) { box.remove(); return }
			box.createDiv({ cls: 'library-recs-title', text: tr('recs.title') })
			const row = box.createDiv({ cls: 'library-recs-row' })
			for (const rec of recs) {
				const card = row.createDiv({ cls: 'library-rec', attr: { role: 'button', tabindex: '0', title: tr('recs.add') } })
				const cover = safeUrl(rec.cover)
				const art = card.createDiv({ cls: 'library-rec-cover' })
				if (cover) art.createEl('img', { attr: { src: cover, alt: rec.title, loading: 'lazy' } })
				card.createDiv({ cls: 'library-rec-title', text: rec.title })
				if (rec.year) card.createDiv({ cls: 'library-rec-year', text: String(rec.year) })
				const add = (): void => { void this.addRecommendation(rec) }
				card.addEventListener('click', add)
				card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add() } })
			}
		})
	}

	// the normal path opens the existing note instead when the title is already there
	private async addRecommendation(rec: Recommendation): Promise<void> {
		const sourceId = typeof rec.sourceId === 'string' ? rec.sourceId : await rec.sourceId()
		if (!sourceId) { new Notice(tr('notice.notFound')); return }
		await this.createFromResult(rec.type, {
			provider: '', sourceId, title: rec.title, year: rec.year, cover: rec.cover, subtitle: null, raw: undefined
		})
	}

	private buildMediaBlock(wrap: HTMLElement, fm: Record<string, unknown>, name: string): void {
		// a video note plays the video itself
		const trailer = toStr(fm.Trailer).trim() || (toStr(fm.Source) === YOUTUBE_SOURCE ? toStr(fm.URL).trim() : '')
		const gallery = toStrArray(fm.Gallery)
			.map(value => safeUrl(value))
			.filter((value): value is string => value !== null)
		if (!trailer && gallery.length === 0) return

		const media = createDiv()
		media.classList.add('note-header-media')

		if (trailer) {
			const embed = toEmbed(trailer)
			const href = safeUrl(trailer)
			if (embed) {
				media.appendChild(createEmbedPlayer(embed, tr('header.trailer')))
			} else if (href) {
				const row = createDiv()
				row.classList.add('note-header-row')
				const link = createEl('a')
				link.href = href
				link.setText(tr('header.watchTrailer'))
				link.classList.add('external-link')
				link.setAttribute('target', '_blank')
				link.setAttribute('rel', 'noopener noreferrer')
				row.appendChild(link)
				media.appendChild(row)
			}
		}

		if (gallery.length > 0) {
			const strip = createDiv()
			strip.classList.add('note-header-gallery')
			for (let i = 0; i < gallery.length; i++) {
				const url = gallery[i]
				if (!url) continue
				const link = createEl('a')
				link.href = url
				link.setAttribute('target', '_blank')
				link.setAttribute('rel', 'noopener noreferrer')
				const img = createEl('img')
				img.src = url
				img.alt = ''
				img.setAttribute('loading', 'lazy')
				link.appendChild(img)
				// plain clicks enlarge in place; modifier clicks keep the browser's save
				link.addEventListener('click', (event) => {
					if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
					event.preventDefault()
					this.lightbox?.close()
					this.lightbox = new Lightbox(name, gallery, i)
					this.lightbox.open()
				})
				strip.appendChild(link)
			}
			media.appendChild(strip)
		}

		wrap.appendChild(media)
	}

	// which list a note tracks: seasons of episodes, or a book's chapters
	private trackKind(fm: Record<string, unknown>): TrackKind | null {
		const contentType = this.settings.categories.find(c => c.typeValue === toStr(fm.Type))?.contentType
		if (contentType === 'series' || contentType === 'anime' || contentType === 'book' || contentType === 'music') return contentType
		return null
	}

	private buildSeasonsBlock(wrap: HTMLElement, fm: Record<string, unknown>, file: TFile): void {
		// A template is copied into new notes: nothing may be ticked or looked up in it.
		if (isTemplateFile(file.path)) return
		const kind = this.trackKind(fm)
		const trackable = kind !== null
		const book = kind === 'book'
		// a book's chapters or an album's tracks: one flat list
		const flat = book || kind === 'music'
		const seasons = seasonsOf(fm, kind ?? 'series')
		if (book && seasons.length === 0) {
			// Open Library notes are never refetched: a book looks its TOC up on open, once a session
			if (!this.chapterLookups.has(file.path)) {
				this.chapterLookups.add(file.path)
				void this.lookUpChapters(file, fm).then((titles) => {
					if (titles.length > 0 && !this.unloaded) void this.addChapters(file, titles)
				})
			}
			const add = createEl('button')
			add.classList.add('note-header-add-chapters')
			add.setText(tr('header.addChapters'))
			add.addEventListener('click', (e) => {
				e.preventDefault()
				void this.findOrTypeChapters(file, fm)
			})
			wrap.appendChild(add)
			return
		}
		// a music note made before tracks were kept fetches them once a session
		if (kind === 'music' && seasons.length === 0 && !this.chapterLookups.has(file.path)) {
			this.chapterLookups.add(file.path)
			void this.lookUpTracks(file, fm)
		}
		if (seasons.length === 0) return
		const open = this.openSeasons.get(file.path) ?? new Set<number>()
		this.openSeasons.set(file.path, open)
		const airs = new Map<string, number>()
		if (!flat) {
			const names = seasons.map(season => season.name)
			for (const airing of this.airingDates(fm)) {
				const index = airing.s === null ? (seasons.length === 1 ? 0 : -1) : seasonIndex(names, airing.s)
				if (index >= 0) airs.set(`${String(index)}:${String(airing.e - 1)}`, airing.at)
			}
		}
		const change = (c: EpisodeChange): void => { if (kind) void this.changeEpisodes(file, c, kind) }

		const block = createDiv()
		block.classList.add('note-header-seasons')
		seasons.forEach((season, index) => {
			const row = createDiv()
			row.classList.add('note-header-season')
			if (trackable) row.appendChild(this.watchedBox(season.watched, (watched) => change({ season: index, watched })))

			const name = createDiv()
			name.classList.add('note-header-season-name')
			// Providers name untitled seasons "Season N" in English.
			name.setText(book ? tr('header.chapters') : flat ? tr('header.tracklist') : season.name.replace(/^Season (\d+)$/, (_, n: string) => tr('header.season', { number: n })))
			row.appendChild(name)

			if (season.episodes.length > 0) {
				const episodes = createDiv()
				episodes.classList.add('note-header-season-episodes')
				const seen = season.episodes.filter(e => e.watched).length
				const total = flat ? String(season.episodes.length) : trCount('header.episodes', season.episodes.length)
				episodes.setText(trackable && seen > 0 && !season.watched ? `${String(seen)} / ${total}` : total)
				row.appendChild(episodes)
			}

			if (season.sourceRating !== null) {
				const rating = createDiv()
				rating.classList.add('note-header-season-rating')
				rating.setText(String(season.sourceRating))
				row.appendChild(rating)
			}

			const trailer = season.trailer
			if (trailer) {
				const button = createEl('button')
				button.classList.add('note-header-season-trailer')
				button.setText(tr('header.trailer'))
				button.addEventListener('click', (e) => {
					e.preventDefault()
					new TrailerModal(this.app, season.name, trailer).open()
				})
				row.appendChild(button)
			}

			if (trackable) {
				// a season rated through its episodes shows their average, no hand-typed rating
				if (!flat) row.appendChild(this.ratingInput(season.rating, season.ratedByEpisodes, (rating) => change({ season: index, rating })))
				const toggle = createEl('button')
				toggle.classList.add('note-header-season-toggle', 'clickable-icon')
				toggle.setAttribute('aria-label', tr('header.episodeList'))
				toggle.setAttribute('aria-expanded', open.has(index) ? 'true' : 'false')
				setIcon(toggle, open.has(index) ? 'chevron-up' : 'chevron-down')
				toggle.addEventListener('click', (e) => {
					e.preventDefault()
					if (open.has(index)) open.delete(index)
					else open.add(index)
					this.refreshBanner()
				})
				row.appendChild(toggle)
			}
			block.appendChild(row)

			if (!trackable || !open.has(index)) return
			const list = createDiv()
			list.classList.add('note-header-episodes')
			season.episodes.forEach((episode, e) => {
				const item = createDiv()
				item.classList.add('note-header-episode')
				item.appendChild(this.watchedBox(episode.watched, (watched) => change({ season: index, episode: e, watched })))
				const label = createDiv()
				label.classList.add('note-header-episode-name')
				const number = String(e + 1)
				label.setText(episode.title ? `${number}. ${episode.title}` : flat && !book ? `${number}.` : tr(book ? 'header.chapter' : 'header.episode', { number }))
				item.appendChild(label)
				const at = airs.get(`${String(index)}:${String(e)}`)
				if (at !== undefined) {
					item.classList.add('is-upcoming')
					item.createDiv({ cls: 'note-header-episode-date', text: airingDate(at) })
				}
				item.appendChild(this.ratingInput(episode.rating, false, (rating) => change({ season: index, episode: e, rating })))
				list.appendChild(item)
			})
			block.appendChild(list)
		})
		wrap.appendChild(block)
	}

	// A PlayStation or Steam game lists what was earned, fetched on open once a session.
	private buildTrophiesBlock(wrap: HTMLElement, fm: Record<string, unknown>, file: TFile): void {
		if (isTemplateFile(file.path)) return
		const psnId = toStr(fm['PSN ID'])
		if (psnId && this.settings.psnTokens) {
			this.awardsBlock(wrap, `psn:${psnId}`, tr('header.trophies'), async () => {
				const token = await this.psnToken()
				return token ? psnEarnedTrophies(token, psnId, psnLanguage(getLanguage())) : null
			})
		}
		const appId = Number(/^steam:(\d+)$/.exec(toStr(fm['Source ID']))?.[1] ?? /store\.steampowered\.com\/app\/(\d+)/.exec(toStr(fm.URL))?.[1])
		if (appId > 0 && Platform.isDesktopApp && this.settings.steamId.trim()) {
			this.awardsBlock(wrap, `steam:${String(appId)}`, tr('header.achievements'), () => this.steamAwards(appId))
		}
	}

	private async steamAwards(appId: number): Promise<{ trophies: PsnTrophy[]; total: number } | null> {
		const session = await steamSession(this.settings.steamId.trim())
		if (!session) return null
		try {
			const defs = await gameAchievements(session.token, appId, steamLanguage(getLanguage()))
			const unlocks = defs ? await session.unlocks(appId) : null
			if (!defs || !unlocks) return null
			return { trophies: earnedAchievements(appId, defs, unlocks), total: defs.length }
		} finally {
			session.close()
		}
	}

	private awardsBlock(wrap: HTMLElement, titleId: string, label: string, load: () => Promise<{ trophies: PsnTrophy[]; total: number } | null>): void {
		if (!this.trophyLists.has(titleId)) {
			this.trophyLists.set(titleId, null)
			void load().catch((e: unknown) => {
				console.error('Library: awards error', titleId, e)
				return null
			}).then(list => {
				if (!list) { this.trophyLists.delete(titleId); return }
				this.trophyLists.set(titleId, list)
				if (list.trophies.length > 0) this.refreshBanner()
			})
		}
		const list = this.trophyLists.get(titleId)
		if (!list || list.trophies.length === 0) return
		const open = this.openTrophies.has(titleId)
		const block = wrap.createDiv({ cls: 'note-header-seasons note-header-trophy-list' })
		const row = block.createDiv({ cls: 'note-header-season' })
		row.createDiv({ cls: 'note-header-season-name', text: label })
		row.createDiv({ cls: 'note-header-season-episodes', text: `${String(list.trophies.length)} / ${String(list.total)}` })
		const toggle = row.createEl('button', { cls: 'note-header-season-toggle clickable-icon', attr: { 'aria-label': label, 'aria-expanded': open ? 'true' : 'false' } })
		setIcon(toggle, open ? 'chevron-up' : 'chevron-down')
		toggle.addEventListener('click', (e) => {
			e.preventDefault()
			if (open) this.openTrophies.delete(titleId)
			else this.openTrophies.add(titleId)
			this.refreshBanner()
		})
		if (!open) return
		const items = block.createDiv({ cls: 'note-header-trophies-earned' })
		for (const trophy of list.trophies) {
			const grade = TROPHY_GRADES.find(g => g.key === trophy.grade)
			const item = items.createDiv({ cls: 'note-header-trophy-item' })
			const icon = safeUrl(trophy.iconUrl)
			if (icon) item.createEl('img', { cls: 'note-header-trophy-image', attr: { src: icon, alt: '', loading: 'lazy' } })
			const text = item.createDiv({ cls: 'note-header-trophy-text' })
			const title = text.createDiv({ cls: 'note-header-trophy-name' })
			if (grade) title.appendChild(trophyIcon(grade.color))
			title.createSpan({ text: trophy.name })
			if (trophy.detail) text.createDiv({ cls: 'note-header-trophy-detail', text: trophy.detail })
			const side = item.createDiv({ cls: 'note-header-trophy-side' })
			side.createDiv({ text: new Date(trophy.earnedAt).toLocaleDateString(getLanguage() + '-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }) })
			if (trophy.rate !== null) side.createDiv({ cls: 'note-header-trophy-rate', text: tr('header.trophyRate', { rate: formatNumber(trophy.rate) }) })
		}
	}

	private watchedBox(checked: boolean, onChange: (watched: boolean) => void): HTMLElement {
		const box = createEl('input')
		box.type = 'checkbox'
		box.checked = checked
		box.classList.add('note-header-watched')
		box.setAttribute('aria-label', tr('header.watched'))
		box.addEventListener('click', (e) => e.stopPropagation())
		box.addEventListener('change', () => onChange(box.checked))
		return box
	}

	private ratingInput(value: number | null, computed: boolean, onChange: (rating: number | null) => void): HTMLElement {
		const input = createEl('input')
		input.type = 'number'
		input.min = '1'
		input.max = '10'
		input.step = '0.1'
		input.placeholder = '—'
		input.classList.add('note-header-my-rating')
		input.setAttribute('aria-label', tr('header.myRating'))
		if (value !== null) input.value = String(value)
		input.disabled = computed
		input.addEventListener('change', () => {
			const n = Number(input.value)
			onChange(input.value.trim() === '' || !Number.isFinite(n) ? null : Math.max(1, Math.min(10, n)))
		})
		return input
	}

	private async changeEpisodes(file: TFile, change: EpisodeChange, kind: TrackKind): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				const label = tickLabel(fm, change, kind)
				applyEpisodeChange(fm, change, kind)
				if (label !== null) addLog(fm, todayIso(), label)
			})
		} catch (e) {
			console.error('Library: episode update error', file.path, e)
		}
	}

	private async lookUpTracks(file: TFile, fm: Record<string, unknown>): Promise<void> {
		const sourceId = toStr(fm['Source ID'])
		const provider = this.registry.forType('music')
		if (!sourceId || !provider || this.skipped('Tracks')) return
		const tracks = (await provider.fetch(sourceId, 'music'))?.fields.Tracks
		if (!Array.isArray(tracks) || tracks.length === 0 || this.unloaded) return
		// Progress so far counts the first tracks as played until one is ticked
		await this.app.fileManager.processFrontMatter(file, (current: Record<string, unknown>) => {
			if (!Array.isArray(current.Tracks) || current.Tracks.length === 0) current.Tracks = tracks
		})
	}

	private lookUpChapters(file: TFile, fm: Record<string, unknown>): Promise<string[]> {
		const sourceId = toStr(fm['Source ID'])
		return findChapters({
			isbn: toStr(fm.ISBN),
			work: /^\/works\/[\w.-]+$/.test(sourceId) ? sourceId : '',
			title: toStr(fm.Name) || file.basename,
			author: toStrArray(fm.Creator || fm.Author).map(linkLabel)[0] ?? ''
		})
	}

	private async findOrTypeChapters(file: TFile, fm: Record<string, unknown>): Promise<void> {
		new Notice(tr('notice.searching'))
		const titles = await this.lookUpChapters(file, fm)
		if (titles.length > 0) {
			await this.addChapters(file, titles)
			return
		}
		new Notice(tr('notice.noChapters'))
		new ChaptersModal(this.app, (chapters) => { void this.addChapters(file, chapters) }).open()
	}

	private async addChapters(file: TFile, chapters: string[] | number): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				setChapters(fm as Record<string, unknown>, chapters)
			})
		} catch (e) {
			console.error('Library: chapters update error', file.path, e)
		}
	}

	private async loadSettings(): Promise<void> {
		const saved: unknown = await this.loadData()
		const data = saved && typeof saved === 'object' ? (saved as Partial<ILibrarySettings>) : null
		// a copy: the defaults' arrays and maps must not become the live settings
		const defaults = plainCopy(DEFAULT_SETTINGS)
		this.settings = Object.assign({}, defaults, data)
		if (!Array.isArray(this.settings.categories)) this.settings.categories = []
		this.settings.categories = this.settings.categories.filter(cat => !!cat && typeof cat === 'object')
		if (!this.settings.sortState || typeof this.settings.sortState !== 'object') this.settings.sortState = {}
		if (!this.settings.filterState || typeof this.settings.filterState !== 'object') this.settings.filterState = {}
		if (!Array.isArray(this.settings.searchFolded)) this.settings.searchFolded = []
		this.settings.searchFolded = this.settings.searchFolded.filter((type): type is string => typeof type === 'string')
		if (typeof this.settings.statsCollapsed !== 'boolean') this.settings.statsCollapsed = false
		if (typeof this.settings.showUpNext !== 'boolean') this.settings.showUpNext = true
		if (typeof this.settings.upNextCollapsed !== 'boolean') this.settings.upNextCollapsed = false
		if (typeof this.settings.showComingSoon !== 'boolean') this.settings.showComingSoon = true
		if (typeof this.settings.localCovers !== 'boolean') this.settings.localCovers = false
		if (!['english', 'romaji', 'native'].includes(this.settings.titleLanguage)) this.settings.titleLanguage = 'english'
		if (typeof this.settings.adultTitles !== 'boolean') this.settings.adultTitles = false
		if (typeof this.settings.offerRemoteDelete !== 'boolean') this.settings.offerRemoteDelete = true
		if (!Array.isArray(this.settings.netflixIgnored)) this.settings.netflixIgnored = []
		if (!this.settings.netflixSeen || typeof this.settings.netflixSeen !== 'object') this.settings.netflixSeen = {}
		if (!Array.isArray(this.settings.netflixListed)) this.settings.netflixListed = []
		const trakt = this.settings.traktTokens
		if (trakt && (typeof trakt.access !== 'string' || typeof trakt.refresh !== 'string' || typeof trakt.expiresAt !== 'number')) this.settings.traktTokens = null
		if (!this.settings.traktEcho || typeof this.settings.traktEcho !== 'object') this.settings.traktEcho = {}
		if (typeof this.settings.traktLastImport !== 'number') this.settings.traktLastImport = 0
		if (typeof this.settings.comingSoonCollapsed !== 'boolean') this.settings.comingSoonCollapsed = false
		if (typeof this.settings.showDiary !== 'boolean') this.settings.showDiary = true
		if (typeof this.settings.showStats !== 'boolean') this.settings.showStats = true
		if (typeof this.settings.showProfile !== 'boolean') this.settings.showProfile = true
		if (!this.settings.airing || typeof this.settings.airing !== 'object' || Object.values(this.settings.airing).some(value => !Array.isArray(value))) {
			this.settings.airing = {}
			this.settings.airingChecked = 0
		}
		if (typeof this.settings.airingChecked !== 'number') this.settings.airingChecked = 0
		if (typeof this.settings.upNextCategory !== 'string') this.settings.upNextCategory = ''
		if (typeof this.settings.steamLastImport !== 'number') this.settings.steamLastImport = 0
		const backfill = (this.settings.youtubeBackfill && typeof this.settings.youtubeBackfill === 'object' ? this.settings.youtubeBackfill : {}) as Partial<ILibrarySettings['youtubeBackfill']>
		this.settings.youtubeBackfill = { token: typeof backfill.token === 'string' ? backfill.token : '', before: typeof backfill.before === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(backfill.before) ? backfill.before : '', done: backfill.done === true }
		if (!this.settings.nintendoTokens || typeof this.settings.nintendoTokens !== 'object') this.settings.nintendoTokens = null
		if (typeof this.settings.nintendoLastImport !== 'number') this.settings.nintendoLastImport = 0
		if (!this.settings.imdbEcho || typeof this.settings.imdbEcho !== 'object') this.settings.imdbEcho = {}
		if (!this.settings.netflixEcho || typeof this.settings.netflixEcho !== 'object') this.settings.netflixEcho = {}
		const sites = (this.settings.watchSites && typeof this.settings.watchSites === 'object' ? this.settings.watchSites : {}) as Partial<ILibrarySettings['watchSites']>
		this.settings.watchSites = { imdb: { connected: false, lastImport: 0 }, netflix: { connected: false, lastImport: 0 }, youtube: { connected: false, lastImport: 0 } }
		for (const site of ['imdb', 'netflix', 'youtube'] as const) {
			const saved = sites[site]
			if (saved && typeof saved === 'object') this.settings.watchSites[site] = { connected: saved.connected === true, lastImport: typeof saved.lastImport === 'number' ? saved.lastImport : 0 }
		}
		if (typeof this.settings.upNextInCategories !== 'boolean') this.settings.upNextInCategories = true
		if (typeof this.settings.skipFields !== 'string') this.settings.skipFields = ''
		if (!this.settings.psnTokens || typeof this.settings.psnTokens !== 'object') this.settings.psnTokens = null
		if (!this.settings.enrichMarks || typeof this.settings.enrichMarks !== 'object') this.settings.enrichMarks = {}
		// categories earlier builds kept out of statistics: showTop, stats.rating, showRated
		const unrated = new Set<string>()
		for (const cat of this.settings.categories) {
			if (!cat.contentType) cat.contentType = inferContentType(cat.typeValue)
			// 'googlebook' and 'steam' were separate categories before their sources merged.
			if (cat.contentType === 'googlebook') cat.contentType = 'book'
			if ((cat.contentType as string) === 'steam') cat.contentType = 'game'
			if (!isContentType(cat.contentType)) cat.contentType = inferContentType(cat.typeValue)
			cat.folder = typeof cat.folder === 'string' ? cleanFolder(cat.folder) : ''
			// An empty Type would claim every note that has none.
			if (typeof cat.typeValue !== 'string' || !cat.typeValue.trim()) cat.typeValue = TYPE_DEFAULTS[cat.contentType] ?? 'Manual'
			const legacy = cat as ICategory & { showTop?: unknown; showRated?: unknown; stats?: { rating?: unknown } }
			if (legacy.showTop === false || legacy.showRated === false || legacy.stats?.rating === false) unrated.add(cat.typeValue)
			delete legacy.showTop
			delete legacy.showRated
			delete legacy.stats
			if (cat.collapsed !== true) delete cat.collapsed
			if (isBuiltInCategory(cat)) delete cat.template
		}
		this.settings.stats = this.loadStats(data?.stats, defaults.stats, unrated)
		// Settings from before the library folder: the parent its categories share.
		if (typeof data?.libraryFolder !== 'string') this.settings.libraryFolder = inferLibraryFolder(this.settings.categories, defaults.libraryFolder)
		this.settings.libraryFolder = cleanFolder(this.settings.libraryFolder)
	}

	// key by key: an older settings file has no stats block or an older shape
	private loadStats(saved: unknown, defaults: IStatsSettings, unrated: Set<string>): IStatsSettings {
		const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
		const stats: IStatsSettings = {
			watchTime: typeof raw.watchTime === 'boolean' ? raw.watchTime : defaults.watchTime,
			tops: []
		}
		const add = (kind: IStatsTop['kind'], key: unknown): void => {
			if (typeof key !== 'string' || !key.trim()) return
			const name = key.trim()
			if (stats.tops.some(top => top.kind === kind && top.key.toLowerCase() === name.toLowerCase())) return
			stats.tops.push({ kind, key: name })
		}
		if (Array.isArray(raw.tops)) {
			for (const top of raw.tops) {
				const entry = (top && typeof top === 'object' ? top : {}) as Record<string, unknown>
				if (entry.kind === 'category' || entry.kind === 'property' || entry.kind === 'platform') add(entry.kind, entry.key)
			}
			return stats
		}
		// builds before the list: the chosen properties, then every category whose best-rated switch was on
		const properties: unknown[] = Array.isArray(raw.properties) ? raw.properties : defaults.tops.map(top => top.key)
		for (const property of properties) add('property', property)
		for (const cat of this.settings.categories) {
			if (!unrated.has(cat.typeValue)) add('category', cat.typeValue)
		}
		return stats
	}
}
