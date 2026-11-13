## The Library tab

Open it with the library icon in the ribbon or the `Open Library` command. From top to bottom it shows the statistics panel, then the sections in the order you set in Settings > Library > Categories: one per category, with Soon and Up next among them. While they are on, Soon and Up next are listed there like categories, and you can drag them anywhere in the list, or move them with arrows on a phone. By default Soon comes first and Up next last.

The search button in the tab's header, or the `Search your library` command, finds a note by its title, creator, source id or NFT contract. It searches a second after you stop typing, as soon as you finish a word with a space, or on Enter. Results come in groups by category, ten notes each with the count of all matches in the heading; a click on a heading folds its group, and the folds are remembered.

The buttons in the tab's header add a title (+), search your whole library, run every import now (Update), build the [[library map|Library-blocks-and-map]], and open the plugin's settings.

### A section

The title row of a section holds:

- the fold arrow. A folded section shows one row of cards that scrolls sideways. The fold is remembered.
- the number of titles, and, for movies, series, anime, music, games, and videos, the time you spent on them. Hover over the time to see the exact hours.
- Filter, when at least two titles differ in it: year, genre, the artist for music, country, or platform. Each list shows how many titles have that value, and the button shows how many filters are on. Clear filters turns them all off.
- a canvas button that opens this section's titles on the library map.
- a sync button that runs the category's connected services: MyAnimeList, AniList and Kitsu for anime and manga; Trakt, IMDb and Netflix for films and series; PlayStation, Steam, Nintendo, Epic and EA for games; YouTube for Video; wallets for NFT. It then asks the sources again for every note of the category, and a note changes only when something new came in.
- the sort menu on the right.

Sort a section by:

| Sort | Order |
| --- | --- |
| A-Z | Title |
| Year | First year, then release date |
| Rating | Your score, or the IMDb rating while you haven't scored the title |
| Date | The day the title was added, from `Date` |
| Last modified | When the note last changed |
| Progress | How far you are, finished titles counted as full |
| Last played | `Last Played`; games only |
| Not started | Titles you haven't started first; shown only when the section has some |

Pick the same sort again to reverse it. Sort and filters are remembered per section.

### A card

A card shows the cover (square for music, as album covers are, wide for videos), title, creator, year, and ratings (IMDb, Rotten Tomatoes 🍅, RAWG, Metacritic, and your score). A [[YouTube]] video shows the day it came out instead of the year, and its likes and dislikes, then its views, instead of ratings; your own like or dislike is filled in green or red. Depending on the note it also has:

- platform marks on the cover for games and for titles from Netflix and YouTube;
- trophy counts for PlayStation games;
- a progress bar while the title is unfinished;
- an eye on the cover for a title you haven't started; see [[Up next|Progress-and-statistics#up-next]].

In Settings > Library > General, turn off "Text under covers" and a card shows only the cover, its progress bar and service icons (Netflix, PlayStation, Steam and so on); the title shows on hover.

Click a card, or focus it with Tab and press Enter or Space, to open the note.

### Soon and Up next

Soon lists the next episodes of the series and anime you are watching, with their air dates. Up next gathers the titles you haven't started from every category. Both are explained in [[Progress and statistics|Progress-and-statistics]], and both can be turned off in Settings > Library > General.

## The note header

A library note shows a header above its text: the cover, creator, cast, years, seasons, the next episode's air date, genres, awards from Wikidata, runtime, last played, ratings, your score, and your progress. The header is drawn on screen; the text of the note stays as you wrote it.

The header arranges itself by the width of the note, not of the window, so a split pane or Readable line length narrows it too:

- wide, from about 1000 px: the title, your score and the source ratings in a bar across the top, then the cover, the trailer and the details side by side, then the stills, the description and the rest;
- the usual width: the cover on the left, the title, ratings and details on the right, the trailer below at full width;
- narrow, such as a phone: one column in the order cover, title and ratings, details, description, trailer, stills.

The description is the first lines of the note's Description callout; click it to read it whole. The callout itself stays in the note.

Your score is set with five stars in the header. Each half star is one point out of 10, written to `My Rating`; click your current score again to clear it.

Awards come from Wikidata for albums, movies, series, anime and games. Library finds the title by the IMDb, Wikidata or Steam id in its note, or an album by its title and artist. A long list shows the first six; point at it to see the rest.

Depending on the note it also has:

- platform badges under the title (such as PlayStation, Steam, Switch, Epic Games, EA App) with each platform's playtime; pointing at the time row shows the exact total and per-platform breakdown;
- Mark complete, for movies, videos, games, albums, comics, and manual notes: it turns `Complete` on, and pressed again, off. It works with the note's properties hidden;
- a trailer: Watch trailer plays it inside Obsidian; on desktop it opens in a built-in browser view that names the page, which YouTube now requires, and plays as your account when YouTube is connected. On mobile it uses the old player.
- a row of stills: click one to enlarge it, then use the arrow keys to move through them and Escape to close; missing stills leave no empty frame in the gallery.
- the seasons and episodes, the chapters, or an album's tracks, to tick and rate; episodes that haven't aired yet show their air date; see [[Progress and statistics|Progress-and-statistics]];
- for a PlayStation game, the trophies you earned, and for a Steam game, the achievements you unlocked, each with the date and the share of players who have it. They load when you open the note, once per session, while the account is connected;
- for a YouTube video, the video itself, the like and dislike buttons, the channel's link and Subscribe button, the publish date, the views, and the rewatches; see [[YouTube]].
- a "Choose a cover" button at the top right: it shows covers from every source of the category and, for a book, from its other editions, each with its size in pixels; click one, or paste an image link.
- the title in your language under the original title, from Wikidata, when Obsidian is not in English and a translated title exists.

## Recommendations

Movie, series, anime, game, book, and music notes show a row of similar titles you don't have yet: from AniList for anime, from TMDB or Cinemeta for movies and series, from RAWG or Wikidata for games, from Open Library for books, and from Deezer for music, an album by each related artist. They load when you open the note. Click a cover, or press Enter on it, to add the title.

Settings > Library > General > Show recommendations hides the row and stops those requests.

## Share

The share button in the header, or the `Share current note` command, draws a card image with the cover (wide for a video), title, year, genres, cast, ratings, and your score.

- Pick a network: the image goes to the clipboard and the network opens with a caption, ready for you to paste the image. X, Telegram, WhatsApp, Reddit, Facebook, LinkedIn, VK, Bluesky, and Pinterest are offered.
- Where the system has a share sheet, as on mobile, Share… opens it with the image.
- Copy image, Copy text, and Save image work everywhere. A saved image goes into your vault.

The image is made on your device. Only the caption, with the title, your score, and a link, goes to the network you pick.
