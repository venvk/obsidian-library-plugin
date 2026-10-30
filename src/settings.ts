import {
	App,
	Notice,
	Platform,
	PluginSettingTab,
	requireApiVersion,
	Setting,
	setIcon,
	type DropdownComponent,
	type SettingDefinition,
	type SettingDefinitionItem,
} from "obsidian";
import type LibraryPlugin from "./main";
import type { ICategory, IStatsTop, TitleLanguage } from "./constants";
import { isTemplateFile, rankableProperties, toStr, topLabel } from "./util";
import { isContentType, type ContentType } from "./providers/types";
import type { WatchSite } from "./watchSites";
import { TYPE_DEFAULTS, addCategoryTop, categoryLabel, cleanFolder, isBuiltInCategory, isDefaultTypeValue, newCategory } from "./categories";
import { tr } from "./i18n";
import { ANILIST_CLIENT_ID, aniListViewer, anilistAuthUrl, tokenFromInput } from "./anilistSync";
import { codeFromInput, exchangeCode, makeVerifier, malAuthUrl, malClientPair } from "./malSync";
import { PromptModal } from "./ui/promptModal";
import { platformMark } from "./ui/platformIcons";

// YAML sample, not UI text: verbatim in every language.
const FRONTMATTER_EXAMPLE = [
	"---",
	"Type: Movie",
	"URL: https://www.imdb.com/title/tt.....",
	"---",
].join("\n");

type TextKey =
	| "omdbApiKey"
	| "googleBooksApiKey"
	| "rawgApiKey"
	| "tmdbApiKey"
	| "comicVineApiKey"
	| "coverProperty"
	| "skipFields"
	| "twitchClientId"
	| "twitchClientSecret";

// One row; getSettingDefinitions() (1.13+) and display() render the same rows.
interface Row {
	name: string;
	desc?: string;
	render?: (setting: Setting) => void;
	visible?: () => boolean;
	searchable?: boolean;
}

// A group of rows; a group scopes row names — each category is its own (each has "Type value").
interface Section {
	heading?: string;
	group?: boolean;
	rows: Row[];
}

// Rendered via a callback: a declarative row with neither name nor control is skipped.
function note(text: string): Row {
	return {
		name: "",
		searchable: false,
		render: (row) => {
			row.setDesc(text);
		},
	};
}

export class LibrarySettingTab extends PluginSettingTab {
	private plugin: LibraryPlugin;
	private expanded = new Set<ICategory>();
	private dragging: ICategory | null = null;
	// Edits in progress, by starting value: notes move on blur/tab close, not per keystroke.
	private libraryFrom: string | null = null;
	private folderFrom = new Map<ICategory, string>();

	constructor(app: App, plugin: LibraryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// 1.13+: renders these and indexes them for the settings search; no vault scans (called per refresh).
	getSettingDefinitions(): SettingDefinitionItem[] {
		const items: SettingDefinitionItem[] = [];
		for (const section of this.sections()) {
			const definitions = section.rows.map((row) => this.definition(row));
			if (section.heading || section.group) items.push({ type: "group", heading: section.heading, items: definitions });
			else items.push(...definitions);
		}
		return items;
	}

	// Before 1.13: the same rows, drawn by hand.
	display(): void {
		this.draw();
	}

	hide(): void {
		this.commitFolders(false);
		super.hide();
	}

	// A folder edit is done: changed folders offer to move their notes along.
	private commitFolders(redraw: boolean): void {
		const settings = this.plugin.settings;
		if (this.libraryFrom !== null) {
			const from = this.libraryFrom;
			this.libraryFrom = null;
			void this.plugin.moveLibraryFolder(from, settings.libraryFolder).then((followed) => {
				if (redraw && followed > 0) this.refresh();
			});
		}
		for (const [cat, from] of this.folderFrom) void this.plugin.moveCategoryFolder(cat, from, cat.folder);
		this.folderFrom.clear();
	}

	private definition(row: Row): SettingDefinition {
		const base = { name: row.name, desc: row.desc, visible: row.visible, searchable: row.searchable };
		const render = row.render;
		return render ? { ...base, render: (setting: Setting) => render(setting) } : base;
	}

	private draw(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const section of this.sections()) {
			if (section.heading) new Setting(containerEl).setName(section.heading).setHeading();
			for (const row of section.rows) {
				if (row.visible && !row.visible()) continue;
				const setting = new Setting(containerEl);
				if (row.name) setting.setName(row.name);
				if (row.desc) setting.setDesc(row.desc);
				row.render?.(setting);
			}
		}
	}

	// Rows added/removed. "1.13.0" stays a literal: the lint recognizes only that form.
	refresh(): void {
		if (requireApiVersion("1.13.0")) this.update();
		else this.draw();
	}

	private refreshVisibility(): void {
		if (requireApiVersion("1.13.0")) this.refreshDomState();
		else this.draw();
	}

	private sections(): Section[] {
		const settings = this.plugin.settings;
		const categories: Section[] = [
			{ heading: tr("settings.section.categories"), rows: [note(tr("settings.categories.desc")), this.libraryFolderRow()] },
		];
		settings.categories.forEach((cat, index) => {
			categories.push({ group: true, rows: this.categoryRows(cat, index) });
		});
		categories.push({ group: true, rows: [{ name: tr("settings.addCategory"), render: (row) => this.addCategory(row) }] });

		const statsRows: Row[] = [
			note(tr("settings.stats.desc")),
			{
				name: tr("stats.watchTime"),
				desc: tr("stats.watchTime.desc"),
				render: (row) => {
					row.addToggle((toggle) =>
						toggle.setValue(settings.stats.watchTime).onChange(async (value) => {
							settings.stats.watchTime = value;
							await this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: tr("settings.profile.name"),
				desc: tr("settings.profile.desc"),
				render: (row) => {
					row.addToggle((toggle) =>
						toggle.setValue(settings.showProfile).onChange(async (value) => {
							settings.showProfile = value;
							await this.plugin.saveSettings();
						}),
					);
				},
			},
			{
				name: tr("settings.diary.name"),
				desc: tr("settings.diary.desc"),
				render: (row) => {
					row.addToggle((toggle) =>
						toggle.setValue(settings.showDiary).onChange(async (value) => {
							settings.showDiary = value;
							await this.plugin.saveSettings();
						}),
					);
				},
			},
		];
		for (const top of settings.stats.tops) {
			statsRows.push({
				name: topLabel(top, settings.categories),
				render: (row) => {
					row.addExtraButton((button) =>
						button
							.setIcon("trash")
							.setTooltip(tr("dup.remove"))
							.onClick(async () => {
								const at = settings.stats.tops.indexOf(top);
								if (at >= 0) settings.stats.tops.splice(at, 1);
								await this.plugin.saveSettings();
								this.refresh();
							}),
					);
				},
			});
		}
		statsRows.push({ name: tr("settings.stats.addTop"), render: (row) => this.addTop(row) });

		return [
			{
				rows: [
					note(tr("settings.intro")),
					this.textRow("settings.coverProperty", "coverProperty", "Cover"),
					this.textRow("settings.skipFields", "skipFields", "Cast, Gallery, Trailer"),
					{
						name: tr("settings.recs.name"),
						desc: tr("settings.recs.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.showRecommendations).onChange(async (value) => {
									this.plugin.settings.showRecommendations = value;
									await this.plugin.saveSettings();
								}),
							);
						},
					},
					{
						name: tr("settings.upNext.name"),
						desc: tr("settings.upNext.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.showUpNext).onChange(async (value) => {
									this.plugin.settings.showUpNext = value;
									await this.plugin.saveSettings();
								}),
							);
						},
					},
					{
						name: tr("settings.comingSoon.name"),
						desc: tr("settings.comingSoon.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.showComingSoon).onChange(async (value) => {
									this.plugin.settings.showComingSoon = value;
									await this.plugin.saveSettings();
								}),
							);
						},
					},
					{
						name: tr("settings.remoteDelete.name"),
						desc: tr("settings.remoteDelete.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.offerRemoteDelete).onChange(async (value) => {
									this.plugin.settings.offerRemoteDelete = value;
									await this.plugin.saveSettings();
								}),
							);
						},
					},
					{
						name: tr("settings.localCovers.name"),
						desc: tr("settings.localCovers.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.localCovers).onChange(async (value) => {
									this.plugin.settings.localCovers = value;
									await this.plugin.saveSettings();
									this.plugin.coverSweep();
								}),
							);
						},
					},
					{
						name: tr("settings.upNextInCategories.name"),
						desc: tr("settings.upNextInCategories.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(this.plugin.settings.upNextInCategories).onChange(async (value) => {
									this.plugin.settings.upNextInCategories = value;
									await this.plugin.saveSettings();
								}),
							);
						},
					},
				],
			},
			{
				heading: tr("settings.section.keys"),
				rows: [
					this.textRow("settings.omdb", "omdbApiKey", tr("settings.omdb.placeholder")),
					this.textRow("settings.tmdbApiKey", "tmdbApiKey", tr("settings.rawg.placeholder")),
					this.textRow("settings.google", "googleBooksApiKey", tr("settings.google.placeholder")),
					this.textRow("settings.rawg", "rawgApiKey", tr("settings.rawg.placeholder")),
					this.textRow("settings.twitchId", "twitchClientId", tr("settings.rawg.placeholder")),
					this.textRow("settings.twitchSecret", "twitchClientSecret", tr("settings.rawg.placeholder")),
					this.textRow("settings.comicvine", "comicVineApiKey", tr("settings.comicvine.placeholder")),
				],
			},
			{
				heading: `${tr("settings.default.movie")} · ${tr("settings.default.series")}`,
				rows: [
					{ name: "IMDb", desc: tr("settings.imdb.desc"), render: (row) => this.siteAccount(row, "imdb") },
					{ name: "Netflix", desc: tr("settings.netflix.desc"), render: (row) => this.siteAccount(row, "netflix") },
					{ name: "Trakt", desc: tr("settings.trakt.desc"), render: (row) => this.traktAccount(row) },
				],
			},
			{
				heading: "YouTube",
				rows: [{ name: "YouTube", desc: tr("settings.youtube.desc"), render: (row) => this.siteAccount(row, "youtube") }],
			},
			{
				heading: tr("settings.section.anime"),
				rows: [
					{ name: tr("anilist.name"), desc: tr("settings.anilist.desc"), render: (row) => this.anilistAccount(row) },
					{ name: tr("mal.name"), desc: tr("settings.mal.desc"), render: (row) => this.malAccount(row) },
					{ name: tr("kitsu.name"), desc: tr("settings.kitsu.desc"), render: (row) => this.kitsuAccount(row) },
					{
						name: tr("settings.titleLanguage.name"),
						desc: tr("settings.titleLanguage.desc"),
						render: (row) => {
							row.addDropdown((dropdown) => {
								for (const language of ["english", "romaji", "native"] as const) dropdown.addOption(language, tr(`settings.titleLanguage.${language}`));
								dropdown.setValue(settings.titleLanguage).onChange(async (value) => {
									settings.titleLanguage = value as TitleLanguage;
									await this.plugin.saveSettings();
								});
							});
						},
					},
					{
						name: tr("settings.adultTitles.name"),
						desc: tr("settings.adultTitles.desc"),
						render: (row) => {
							row.addToggle((toggle) =>
								toggle.setValue(settings.adultTitles).onChange(async (value) => {
									settings.adultTitles = value;
									await this.plugin.saveSettings();
								}),
							);
						},
					},
				],
			},
			{
				heading: tr("settings.section.games"),
				rows: [
					{ name: "PlayStation", desc: tr("settings.psn.desc"), render: (row) => this.psnAccount(row) },
					{ name: "Steam", desc: tr("settings.steam.desc"), render: (row) => this.steamAccount(row) },
					{ name: "Nintendo Switch", desc: tr("settings.nintendo.desc"), render: (row) => this.nintendoAccount(row) },
				],
			},
			...categories,
			{ heading: tr("stats.title"), rows: statsRows },
			{
				heading: tr("settings.section.example"),
				rows: [
					{
						name: "",
						searchable: false,
						render: (row) => {
							row.setDesc(tr("settings.example.desc"));
							row.infoEl.createEl("pre", { text: FRONTMATTER_EXAMPLE });
						},
					},
				],
			},
		];
	}

	private libraryFolderRow(): Row {
		return {
			name: tr("settings.libraryFolder.name"),
			desc: tr("settings.libraryFolder.desc"),
			render: (row) => {
				row.addText((text) => {
					text
						.setPlaceholder("Library")
						.setValue(this.plugin.settings.libraryFolder)
						.onChange(async (value) => {
							if (this.libraryFrom === null) this.libraryFrom = this.plugin.settings.libraryFolder;
							this.plugin.settings.libraryFolder = cleanFolder(value);
							await this.plugin.saveSettings();
						});
					text.inputEl.addEventListener("change", () => this.commitFolders(true));
				});
			},
		};
	}

	private textRow(prefix: string, key: TextKey, placeholder: string): Row {
		return {
			name: tr(`${prefix}.name`),
			desc: tr(`${prefix}.desc`),
			render: (row) => this.textInput(row, key, placeholder),
		};
	}

	private textInput(row: Setting, key: TextKey, placeholder: string, secret = false): void {
		row.addText((text) => {
			if (secret) text.inputEl.type = "password";
			text
				.setPlaceholder(placeholder)
				.setValue(this.plugin.settings[key])
				.onChange(async (value) => {
					this.plugin.settings[key] = value.trim();
					await this.plugin.saveSettings();
				});
		});
	}

	// Desktop signs in in a modal window; mobile pastes back the token the redirect page shows.
	private anilistAccount(row: Setting): void {
		const connected = this.plugin.settings.anilistToken.trim() !== "";
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-anilist" });
		icon.appendChild(platformMark("anilist"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.anilistToken = "";
					await this.plugin.saveSettings();
					this.refresh();
				} else if (Platform.isDesktopApp) {
					await this.plugin.connectAnilist();
					this.refresh();
				} else {
					window.open(anilistAuthUrl(ANILIST_CLIENT_ID), "_blank");
					new PromptModal(
						this.app,
						"https://anilist.co/api/v2/oauth/pin#access_token=…",
						(value) => void this.anilistConnect(tokenFromInput(value)),
						tr("modal.anilist.title"),
						tr("settings.connect"),
					).open();
				}
			});
		});
	}

	private async anilistConnect(token: string): Promise<void> {
		const viewer = token ? await aniListViewer(token) : null;
		if (!viewer) {
			new Notice(tr("settings.anilist.invalidToken"));
			return;
		}
		this.plugin.settings.anilistToken = token;
		await this.plugin.saveSettings();
		new Notice(tr("settings.anilist.connected", { name: viewer.name }));
		this.refresh();
		void this.plugin.anilistImport(true);
	}

	private malAccount(row: Setting): void {
		const connected = this.plugin.settings.malTokens !== null;
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-mal" });
		icon.appendChild(platformMark("myanimelist"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.malTokens = null;
					await this.plugin.saveSettings();
					this.refresh();
				} else if (Platform.isDesktopApp) {
					await this.plugin.connectMal();
					this.refresh();
				} else {
					const verifier = makeVerifier();
					const { id, secret } = malClientPair(this.plugin.settings);
					window.open(malAuthUrl(id, verifier), "_blank");
					new PromptModal(
						this.app,
						"http://localhost/?code=…",
						(value) => void this.malConnect(id, secret, codeFromInput(value), verifier),
						tr("modal.mal.title"),
						tr("settings.connect"),
					).open();
				}
			});
		});
	}

	private async malConnect(id: string, secret: string, code: string, verifier: string): Promise<void> {
		const tokens = await exchangeCode(id, secret, code, verifier);
		if (!tokens) {
			new Notice(tr("notice.mal.connectFailed"));
			return;
		}
		this.plugin.settings.malTokens = tokens;
		await this.plugin.saveSettings();
		new Notice(tr("notice.mal.connected"));
		this.refresh();
		void this.plugin.malImport(true);
	}

	private kitsuAccount(row: Setting): void {
		const connected = this.plugin.settings.kitsuTokens !== null;
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-kitsu" });
		icon.appendChild(platformMark("kitsu"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.kitsuTokens = null;
					await this.plugin.saveSettings();
				} else {
					// desktop opens the real Kitsu site; the plain form is the mobile path
					await this.plugin.connectKitsu();
				}
				this.refresh();
			});
		});
	}

	private traktAccount(row: Setting): void {
		const connected = this.plugin.settings.traktTokens !== null;
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-trakt" });
		icon.appendChild(platformMark("trakt"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.traktTokens = null;
					this.plugin.settings.traktEcho = {};
					await this.plugin.saveSettings();
				} else {
					await this.plugin.connectTrakt();
				}
				this.refresh();
			});
		});
	}

	private psnAccount(row: Setting): void {
		const connected = this.plugin.settings.psnTokens !== null;
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-playstation" });
		icon.appendChild(platformMark("playstation"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.psnTokens = null;
					await this.plugin.saveSettings();
				} else {
					await this.plugin.connectPsn();
				}
				this.refresh();
			});
		});
	}

	private steamAccount(row: Setting): void {
		const connected = this.plugin.settings.steamId.trim() !== "";
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-steam" });
		icon.appendChild(platformMark("steam"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.steamId = "";
					await this.plugin.saveSettings();
				} else {
					await this.plugin.connectSteam();
				}
				this.refresh();
			});
		});
	}

	private siteAccount(row: Setting, site: WatchSite): void {
		const state = this.plugin.settings.watchSites[site];
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: `library-platform-row-icon is-${site}` });
		icon.appendChild(platformMark(site));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${state.connected ? " is-connected" : ""}` });
		status.setText(tr(state.connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(state.connected ? "settings.disconnect" : "settings.connect"));
			if (!state.connected) button.setCta();
			button.onClick(async () => {
				if (state.connected) {
					state.connected = false;
					await this.plugin.saveSettings();
				} else {
					await this.plugin.connectSite(site);
				}
				this.refresh();
			});
		});
	}

	// Connecting asks first: requests go through a third-party signing service.
	private nintendoAccount(row: Setting): void {
		const connected = this.plugin.settings.nintendoTokens !== null;
		row.settingEl.addClass("library-platform-row");
		const icon = createSpan({ cls: "library-platform-row-icon is-nintendo" });
		icon.appendChild(platformMark("nintendo"));
		row.nameEl.prepend(icon);
		const status = row.nameEl.createSpan({ cls: `library-platform-status${connected ? " is-connected" : ""}` });
		status.setText(tr(connected ? "settings.connected" : "settings.notConnected"));
		row.addButton((button) => {
			button.setButtonText(tr(connected ? "settings.disconnect" : "settings.connect"));
			if (!connected) button.setCta();
			button.onClick(async () => {
				if (connected) {
					this.plugin.settings.nintendoTokens = null;
					await this.plugin.saveSettings();
				} else {
					await this.plugin.connectNintendo();
				}
				this.refresh();
			});
		});
	}

	private categoryRows(cat: ICategory, index: number): Row[] {
		const label = (): string => categoryLabel(cat) || tr("settings.category.name", { index: index + 1 });
		const unfolded = (): boolean => this.expanded.has(cat);
		const builtIn = isBuiltInCategory(cat);
		const rows: Row[] = [
			{ name: label(), render: (row) => this.categoryControls(row, cat, label) },
			{
				name: tr("settings.category.type"),
				visible: () => !builtIn && unfolded(),
				render: (row) => {
					row.settingEl.addClass("library-settings-advanced-row");
					row.addText((text) =>
						text
							.setPlaceholder(tr("settings.category.type.placeholder"))
							.setValue(cat.typeValue)
							.onChange(async (value) => {
								// An empty Type would claim every note that has none.
								if (!value.trim()) return;
								this.retypeCategory(cat, value.trim());
								await this.plugin.saveSettings();
							}),
					);
				},
			},
			{
				name: tr("settings.category.folder"),
				visible: () => !builtIn && unfolded(),
				render: (row) => {
					row.settingEl.addClass("library-settings-advanced-row");
					this.folderInput(row, cat);
				},
			},
			{
				name: tr("settings.category.template"),
				desc: tr("settings.category.template.desc"),
				visible: () => !builtIn && unfolded(),
				render: (row) => {
					row.settingEl.addClass("library-settings-advanced-row");
					row.addText((text) =>
						text
							.setPlaceholder(tr("settings.category.template.placeholder"))
							.setValue(cat.template ?? "")
							.onChange(async (value) => {
								const path = value.trim();
								if (path) cat.template = path;
								else delete cat.template;
								await this.plugin.saveSettings();
							}),
					);
				},
			},
		];
		return rows;
	}

	private folderInput(row: Setting, cat: ICategory): void {
		row.addText((text) => {
			text
				.setPlaceholder(tr("settings.category.folder.placeholder"))
				.setValue(cat.folder)
				.onChange(async (value) => {
					if (!this.folderFrom.has(cat)) this.folderFrom.set(cat, cat.folder);
					cat.folder = value.trim();
					await this.plugin.saveSettings();
				});
			text.inputEl.setAttribute("aria-label", tr("settings.category.folder"));
			text.inputEl.addEventListener("change", () => this.commitFolders(false));
		});
	}

	private categoryControls(row: Setting, cat: ICategory, label: () => string): void {
		const settings = this.plugin.settings;
		const builtIn = isBuiltInCategory(cat);
		if (builtIn) this.folderInput(row, cat);
		if (!builtIn) row.addText((text) =>
			text
				.setPlaceholder(tr("settings.category.name.placeholder"))
				.setValue(cat.name)
				.onChange(async (value) => {
					this.renameCategory(cat, value.trim());
					row.setName(label());
					await this.plugin.saveSettings();
				}),
		);
		if (!builtIn) row.addDropdown((dropdown) => {
			this.addSourceOptions(dropdown);
			dropdown.setValue(cat.contentType).onChange(async (value) => {
				if (!isContentType(value)) return;
				const def = TYPE_DEFAULTS[value];
				const retype = Boolean(def) && (!cat.typeValue || isDefaultTypeValue(cat.typeValue));
				if (retype && def) this.retypeCategory(cat, def);
				cat.contentType = value;
				await this.plugin.saveSettings();
				if (retype) this.refresh();
			});
		});
		// The library shows its sections in this order: a category dropped on
		// another takes its place.
		const list = settings.categories;
		const place = (moved: ICategory, to: number): void => {
			const from = list.indexOf(moved);
			if (from < 0 || to < 0 || to >= list.length || from === to) return;
			list.splice(from, 1);
			list.splice(to, 0, moved);
			void this.plugin.saveSettings();
			this.refresh();
		};
		// Obsidian 1.13 renders a row again into the same element: one handle,
		// and handlers assigned rather than added.
		row.settingEl.querySelector(".library-settings-drag")?.remove();
		const handle = createDiv({ cls: "library-settings-drag", attr: { draggable: "true", "aria-label": tr("settings.category.drag") } });
		setIcon(handle, "grip-vertical");
		row.settingEl.prepend(handle);
		handle.addEventListener("dragstart", (event) => {
			this.dragging = cat;
			if (!event.dataTransfer) return;
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setDragImage(row.settingEl, 16, 16);
		});
		handle.addEventListener("dragend", () => { this.dragging = null; });
		const target = (on: boolean): void => { row.settingEl.toggleClass("is-drop-target", on); };
		row.settingEl.ondragover = (event): void => {
			if (!this.dragging || this.dragging === cat) return;
			event.preventDefault();
			target(true);
		};
		row.settingEl.ondragleave = (): void => target(false);
		row.settingEl.ondrop = (event): void => {
			event.preventDefault();
			target(false);
			const dragged = this.dragging;
			this.dragging = null;
			if (dragged) place(dragged, list.indexOf(cat));
		};
		// Touch screens have no drag and drop: arrows there.
		if (Platform.isMobile) {
			const at = list.indexOf(cat);
			if (at > 0) row.addExtraButton((button) => button.setIcon("arrow-up").setTooltip(tr("settings.category.up")).onClick(() => place(cat, at - 1)));
			if (at < list.length - 1) row.addExtraButton((button) => button.setIcon("arrow-down").setTooltip(tr("settings.category.down")).onClick(() => place(cat, at + 1)));
		}
		if (!builtIn) row.addExtraButton((button) => {
			const setIcon = (): void => {
				button.setIcon(this.expanded.has(cat) ? "chevron-up" : "chevron-down");
			};
			setIcon();
			button.setTooltip(tr("settings.category.advanced")).onClick(() => {
				if (this.expanded.has(cat)) this.expanded.delete(cat);
				else this.expanded.add(cat);
				setIcon();
				this.refreshVisibility();
			});
		});
		row.addExtraButton((button) =>
			button
				.setIcon("trash")
				.setTooltip(tr("dup.remove"))
				.onClick(async () => {
					const at = settings.categories.indexOf(cat);
					if (at >= 0) settings.categories.splice(at, 1);
					this.expanded.delete(cat);
					this.folderFrom.delete(cat);
					if (!settings.categories.some((c) => c.typeValue === cat.typeValue)) {
						settings.stats.tops = settings.stats.tops.filter(
							(top) => !(top.kind === "category" && top.key === cat.typeValue),
						);
					}
					await this.plugin.saveSettings();
					this.refresh();
				}),
		);
	}

	private addCategory(row: Setting): void {
		let addValue = "movie";
		row.addDropdown((dropdown) => {
			this.addSourceOptions(dropdown);
			dropdown.setValue("movie");
			dropdown.onChange((value) => {
				addValue = value;
			});
		});
		row.addButton((button) =>
			button
				.setButtonText(tr("settings.addCategory"))
				.setCta()
				.onClick(async () => {
					const contentType: ContentType = isContentType(addValue) ? addValue : "movie";
					const category = newCategory(contentType, this.plugin.settings);
					this.plugin.settings.categories.push(category);
					addCategoryTop(this.plugin.settings, category.typeValue);
					await this.plugin.saveSettings();
					this.refresh();
				}),
		);
	}

	// Candidates scan the vault: built only when the row is drawn.
	private addTop(row: Setting): void {
		const candidates = this.topCandidates();
		let chosen = 0;
		row.addDropdown((dropdown) => {
			const groups = new Map<string, HTMLElement>();
			candidates.forEach((candidate, index) => {
				let group = groups.get(candidate.group);
				if (!group) {
					group = dropdown.selectEl.createEl("optgroup", { attr: { label: candidate.group } });
					groups.set(candidate.group, group);
				}
				group.createEl("option", { text: candidate.label, attr: { value: String(index) } });
			});
			if (candidates.length === 0) dropdown.addOption("", "—");
			dropdown.setValue(candidates.length > 0 ? "0" : "");
			dropdown.setDisabled(candidates.length === 0);
			dropdown.onChange((value) => {
				chosen = Number(value);
			});
		});
		row.addButton((button) =>
			button
				.setButtonText(tr("settings.stats.addTop"))
				.setCta()
				.setDisabled(candidates.length === 0)
				.onClick(async () => {
					const candidate = candidates[chosen];
					if (!candidate) return;
					this.plugin.settings.stats.tops.push(candidate.top);
					await this.plugin.saveSettings();
					this.refresh();
				}),
		);
	}

	private addSourceOptions(d: DropdownComponent): void {
		const options: Array<[string, string]> = [
			["movie", tr("settings.default.movie") + " — Cinemeta, Wikidata, OMDb"],
			["series", tr("settings.default.series") + " — Cinemeta, Wikidata, OMDb"],
			["book", tr("settings.default.book") + " — Open Library, Google Books"],
			["comic", tr("settings.default.comic") + " — Wikidata, AniList, Comic Vine"],
			["game", tr("settings.default.game") + " — Steam, Wikidata, RAWG"],
			["music", tr("settings.default.music") + " — Deezer"],
			["anime", tr("settings.default.anime") + " — AniList, MyAnimeList"],
			["manual", tr("settings.category.manual")],
		];
		for (const [value, label] of options) d.addOption(value, label);
	}

	private libraryFrontmatter(): Record<string, unknown>[] {
		const types = new Set(this.plugin.settings.categories.map((c) => c.typeValue));
		const list: Record<string, unknown>[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isTemplateFile(file.path)) continue;
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (fm && types.has(toStr(fm.Type))) list.push(fm);
		}
		return list;
	}

	// Sort, filters and the Up next choice are saved under the category name.
	private renameCategory(cat: ICategory, name: string): void {
		const settings = this.plugin.settings;
		const from = cat.name;
		if (!name) return;
		// A name another category already takes gets a number, as a new one does.
		const taken = new Set(settings.categories.filter((c) => c !== cat).map((c) => c.name));
		const base = name;
		for (let n = 2; taken.has(name); n++) name = `${base} ${String(n)}`;
		if (name === from) return;
		cat.name = name;
		if (!from || settings.categories.some((c) => c !== cat && c.name === from)) return;
		for (const state of [settings.sortState, settings.filterState] as Array<Record<string, unknown>>) {
			if (from in state && !(name in state)) state[name] = state[from];
			delete state[from];
		}
		if (settings.upNextCategory === from) settings.upNextCategory = name;
	}

	// A category column is keyed by its Type value, so it moves with the rename.
	private retypeCategory(cat: ICategory, typeValue: string): void {
		for (const top of this.plugin.settings.stats.tops) {
			if (top.kind === "category" && top.key === cat.typeValue) top.key = typeValue;
		}
		cat.typeValue = typeValue;
	}

	private topCandidates(): Array<{ group: string; label: string; top: IStatsTop }> {
		const listed = new Set<string>();
		for (const top of this.plugin.settings.stats.tops) listed.add(`${top.kind}:${top.key.toLowerCase()}`);
		const list: Array<{ group: string; label: string; top: IStatsTop }> = [];
		const offer = (group: string, label: string, top: IStatsTop): void => {
			const id = `${top.kind}:${top.key.toLowerCase()}`;
			if (!top.key || listed.has(id)) return;
			listed.add(id);
			list.push({ group, label, top });
		};
		for (const cat of this.plugin.settings.categories) {
			offer(tr("settings.section.categories"), cat.name || cat.typeValue, { kind: "category", key: cat.typeValue });
		}
		// A platform's totals are chosen here, never shown unasked.
		if (this.plugin.settings.psnStats) offer(tr("settings.stats.groupPlatforms"), tr("stats.psn"), { kind: "platform", key: "playstation" });
		if (this.plugin.settings.malStats) offer(tr("settings.stats.groupPlatforms"), tr("stats.mal"), { kind: "platform", key: "myanimelist" });
		if (this.plugin.settings.nintendoStats) offer(tr("settings.stats.groupPlatforms"), tr("stats.nintendo"), { kind: "platform", key: "nintendo" });
		for (const property of rankableProperties(this.libraryFrontmatter(), this.plugin.settings.coverProperty)) {
			offer(tr("settings.stats.groupProperties"), property, { kind: "property", key: property });
		}
		return list;
	}
}
