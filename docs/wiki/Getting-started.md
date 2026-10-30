## Install

In Obsidian, open Settings → Community plugins → Browse, search for Library, then install and enable it. Library needs Obsidian 1.8.7 or later and works on desktop and mobile. Some accounts connect only on desktop; see [[Connected accounts|Connected-accounts]].

To install by hand, download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/venvk/obsidian-library-plugin/releases/latest), put them in `.obsidian/plugins/library/` inside your vault, and enable Library in Settings → Community plugins.

## Add a title

Open the Library tab with the library icon in the ribbon or the `Open Library` command. Press + in the tab's header, or run `Add content`, and type a title. Search looks through every kind at once and groups what it finds: movies, series, anime, books, comics, music, then games. A film or series also says what it is when Wikidata knows, such as Miniseries, Short film or Animated film. Search starts once you pause for a second, or at once with Enter, and each kind shows as soon as its sources answer. Titles you already have are left out. Click a kind's heading, or press Enter on it, to fold or unfold it; the folded kinds stay folded the next time. The title you pick goes to the first category of its kind, made if you have none; see [[Sources and API keys|Sources-and-API-keys]] for where each kind looks.

To put a title into a particular category, such as a manual one or the second of two movie categories, run `Add to a category`. It lists your categories, then each kind you have no category for yet, marked "new category".

- Movies, series, games, and comics can be found by their title in another language: `унесённые призраками` finds Spirited Away.
- For movies and series, a year after the title picks between films that share a name: `dune 1984`.

Picking a title that is already in your library opens its note instead of making a second one. The check compares the `URL` property, which book notes don't have, so a book can be added twice.

The new note opens with its cover and properties filled in. All of it is in the note's frontmatter, so you can change any property by hand; see [[Note properties|Frontmatter-reference]].

Manual makes a note with the title you type and no source; you fill in the rest.

Notes also arrive from the accounts you connect: anime and manga lists, IMDb ratings and watchlist, Netflix history, the YouTube videos you watched, and the games you played. They land in the same categories; see [[Connected accounts|Connected-accounts]].

## Categories and folders

A category is one section of the Library tab. A note belongs to the category whose Type value equals the note's `Type` property, capitals included, wherever the note is kept.

The first title of a kind creates its category. These built-in categories are named in your Obsidian language and follow it when you switch languages. Their folders are named in English inside the library folder: `Library/Movies`, `Library/Series`, `Library/Books`, `Library/Comics`, `Library/Games`, `Library/Music`, `Library/Anime`. Manga imported from AniList or MyAnimeList goes to a comics category of its own, created with the first manga. YouTube videos go to a Video category, `Library/Video`, created with the first video.

Settings → Library → Categories lists your categories:

- Library folder: where new categories get their folders, `Library` by default. Change it, and the categories inside it move along.
- A built-in category, the first one of each kind, shows only its folder. Its Type value is fixed: `Movie`, `Series`, `Book`, `Comic`, `Game`, `Music`, `Anime`, or `Video`.
- Add category adds a category of the kind you pick. The first one of a kind is built-in. A second one of the same kind, and every Manual category, is a custom category: it has a name you can change, its kind, and a chevron that opens three more settings:
  - Type value: the `Type` its notes carry. Change it if your notes already use another word.
  - Folder: where new notes of the category go. Left empty, notes go to the vault root.
  - Template: a note that new notes of the category start from; see [[Templates and skipped properties|Templates-and-skipped-properties]].
- Drag a category by its handle to change the order of the sections. On mobile, use the arrows.
- The trash icon removes the category from the Library tab. Its notes stay in your vault.

A second category of the same kind gets a number, such as `Movies 2` with Type value `Movie 2`, so the two stay apart in sorting, filters, and statistics.

When the library folder or a category's folder changes, Library counts the category's notes in the old folder and asks before moving them; subfolders move along, and a note whose new place is taken stays where it is. Old folders left empty go to the trash. Membership follows `Type`, not the folder, so notes you keep elsewhere stay in their category.

Notes in a folder named `Templates`, or in a folder or file whose name starts with `_`, are never shown as cards.

## What next

- [[The Library tab and the note header|Library-tab-and-note-header]]: how the tab and a note look, and what you can do with them.
- [[Progress and statistics|Progress-and-statistics]]: ticking episodes and chapters, your scores, Up next, Soon, and the statistics panel.
- [[Connected accounts|Connected-accounts]]: bring in your lists from other services.
