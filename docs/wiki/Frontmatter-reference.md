Each card is a note, and everything Library knows about a title is in the note's frontmatter. You can edit any of it.

A series note:

```yaml
---
Type: Series
Name: Stranger Things
Year: 2016
End Year: 2025
Season: 5
Genre: ["[[Drama.canvas|Drama]]", "[[Horror.canvas|Horror]]"]
Country: ["United States"]
Creator: ["[[The Duffer Brothers.canvas|The Duffer Brothers]]"]
Cast: ["[[Winona Ryder.canvas|Winona Ryder]]", "[[David Harbour.canvas|David Harbour]]"]
Rating IMDB: 8.7
Rating RT: 91
Runtime: 42
My Rating: 9
Cover: https://m.media-amazon.com/images/...
URL: https://www.imdb.com/title/tt4574334/
Trailer: https://www.youtube.com/watch?v=b9EkMc79ZSU
Gallery: ["https://image.tmdb.org/t/p/w780/56v2KjBlU4XaOv9rVYEQypROD7P.jpg"]
Seasons:
  - name: Season 1
    episodes: 8
    rating: 8.0
    episode_list:
      - title: "Chapter One: The Vanishing of Will Byers"
        watched: true
        my_rating: 9
      # ...7 more episodes
Progress: 8/42
Netflix ID: 80057281
Platforms: ["Netflix"]
Date: 01.03.2026
Source: omdb
Source ID: tt4574334
---
```

A game you play on two platforms:

```yaml
---
Type: Game
Name: Elden Ring
Year: 2022
Released: 25.02.2022
Genre: ["[[Action role-playing.canvas|Action role-playing]]"]
Creator: ["[[FromSoftware.canvas|FromSoftware]]"]
Rating MC: 9.4
Platforms: ["PS5", "Steam"]
Playtime PS5: 96.5
Playtime Steam: 12
Playtime: 108.5
Last Played: 14.10.2026
PSN ID: PPSA04609_00
Platinum: 0
Gold: 7
Silver: 9
Bronze: 25
Achievements: 30/42
Progress: 71/100
Date: 03.03.2022
Source: games
Source ID: steam:1245620
---
```

## Properties Library manages

| Property | Meaning |
| --- | --- |
| `Type` | The category the note belongs to. It must equal the category's Type value. |
| `Progress` | `done/total`: episodes, chapters, pages, tracks, or issues; for games, the share of trophies or achievements, and for videos, the share you watched, as `n/100`. Movies have none; see [[Progress and statistics|Progress-and-statistics]]. |
| `Complete` | `true` once you finish a movie, an album, a comic, or a game. Series, anime, and books have none: they are done when their progress is full. |
| `My Rating` | Your score from 1 to 10. With rated episodes, seasons, or chapters, their average. |
| `Log` | The [[diary|Progress-and-statistics#diary]]: one line per episode, season, or chapter you ticked and per title you finished, such as `2026-10-18 S2E5`. |
| `Date` | The day you added the note, as `dd.mm.yyyy`. A game moves it back to the day you first played it. Sorting by date uses it. |
| `Source` | The source family that filled the note. |
| `Source ID` | The title's id at that source. Refresh and sync use it. |

Renaming or removing one of these breaks refresh, statistics, or sync for that note.

## Properties from the sources

| Property | Content | Notes that have it |
| --- | --- | --- |
| `Name` | The title | all |
| `Year` | The first year | all |
| `End Year` | The last year of a finished series | series |
| `Released` | The release date, as `dd.mm.yyyy` | games |
| `Genre` | Links to genres | all |
| `Country` | Countries of production | movies, series, games |
| `Creator` | Links to the director or writer, authors, developers, studios, the artist, or a comic's writers, artists, or publisher | all |
| `Cast` | Links to the top-billed actors | movies, series |
| `Cover` | An image address, or an image in your vault | all |
| `URL` | The title's page at its source | all but books |
| `Rating IMDB`, `Rating RT` | IMDb rating; Rotten Tomatoes score in % | movies, series |
| `Rating RAWG`, `Rating MC` | RAWG rating; Metacritic score on a 10-point scale | games |
| `Rating AniList`, `Rating MAL` | AniList score; MyAnimeList score for notes added from MyAnimeList | anime |
| `Runtime` | Minutes; for series and anime, one episode; for an album or a video, all of it | movies, series, anime, music, videos |
| `Season` | The number of seasons | series |
| `Seasons` | Seasons and their episodes, as in the example. A season's `rating` is the source's score; `watched` and `my_rating` are yours | series, anime |
| `Chapters` | Chapters, with the same `title`, `watched`, and `my_rating` | books |
| `Tracks` | An album's or a single's tracks, with the same `title`, `watched`, and `my_rating`; a one-track single has none | music |
| `ISBN` | The ISBN | books |
| `Trailer` | A trailer link | movies, series, anime, games |
| `Gallery` | Still images or screenshots | movies, series, anime, games |

Settings → Library → General → Skip properties keeps any of these out of notes; see [[Templates and skipped properties|Templates-and-skipped-properties]].

## Properties from connected accounts

| Property | Content | Written by |
| --- | --- | --- |
| `Platforms` | Where you have the title: `PS5`, `PS4`, `Steam`, `Switch`, `Netflix`, `YouTube` | PlayStation, Steam, Nintendo, Netflix, YouTube |
| `Playtime PS5`, `Playtime Steam`, `Playtime Switch`, … | Hours played on that platform | PlayStation, Steam, Nintendo |
| `Playtime` | Hours played on all platforms together | PlayStation, Steam, Nintendo |
| `Last Played` | The day you last played, as `dd.mm.yyyy` | PlayStation, Steam |
| `Platinum`, `Gold`, `Silver`, `Bronze` | Trophies you earned, by grade | PlayStation |
| `Achievements` | Achievements unlocked out of all, such as `30/42` | Steam |
| `PSN ID` | The game's PlayStation id | PlayStation |
| `Nintendo ID` | The game's Nintendo id | Nintendo |
| `Netflix ID` | The title's Netflix id; scores go back to it as thumbs | Netflix |
| `Channel URL`, `Channel ID` | The video's channel on YouTube | YouTube |
| `Published` | The day the video came out, as `dd.mm.yyyy` | YouTube |
| `Last Watched` | The day you last watched the video, once you rewatch it | YouTube |
| `Rewatched` | How many times you watched the video again | YouTube |
| `Views`, `Likes`, `Dislikes` | The video's counts; dislikes are an estimate from Return YouTube Dislike | YouTube |
| `Reaction` | Your `like` or `dislike` on YouTube | YouTube |
| `Subscribed` | Whether you are subscribed to the channel | YouTube |

These can't be skipped. See [[Connected accounts|Connected-accounts]] for what each service changes.

## Source and Source ID

| Category | `Source` | `Source ID` |
| --- | --- | --- |
| Movies, series | `omdb` | The IMDb id, such as `tt4574334` |
| Books | `books` | An Open Library work, such as `/works/OL45883W`, or a Google Books volume id |
| Games | `games` | `steam:` and the Steam app id, a Wikidata item such as `Q20060917`, a RAWG id, `psn:` and the PlayStation id, or `nintendo:` and the Nintendo id |
| Comics | `comics` | A Wikidata item, `manga:` and an AniList id, or a Comic Vine id |
| Anime | `anilist` | The AniList id, or `mal:` and the MyAnimeList id |
| Music | `deezer` | The Deezer album id |
| Video | `youtube` | The YouTube video id, such as `dQw4w9WgXcQ` |

Notes from older versions can have another `Source`, such as `rawg` or `steam`. They still refresh, because Library tells sources apart by the shape of `Source ID`.

## Links

`Genre`, `Creator`, and `Cast` hold links to canvases, such as `[[Drama.canvas|Drama]]`. Opening one, or clicking the name in the note header, in a statistics top, or among your favourite genres, draws the covers of every title with that genre or person, grouped by category, and a canvas made from a link moves to a Canvases folder in your library folder. The canvas is drawn again each time you open it, until you add a card of your own; then Library leaves it as it is. A name that already has a note of its own, not a title's, links that note instead. Names you type by hand become links the next time the note changes. `Rebuild graph links` converts the whole library at once, older `[[Drama]]` links included.

## Cover

Settings → Library → General → Cover property renames the cover field, for example to `image` if you already use that name. Notes keep working after a rename, because Library also reads `Cover` and `Image`. A cover can be an image address, or an image in your vault written as a path or an internal link.

Turn on Settings → Library → General → Keep covers in the vault to keep covers offline. Library downloads each note's cover, one at a time in the background, into a Covers folder in your library folder, and points the cover property at the file, such as `[[Library/Covers/Dune.jpg]]`. New notes get theirs right away. A cover that can't be downloaded stays an address. Turning the setting off leaves the downloaded files and links as they are.

## Refresh

Library fetches a note again:

- when you open it, at most once every 5 minutes;
- when you run `Refresh metadata for current note`, or `Refresh metadata of all notes`, which goes through the library one note at a time;
- once after a plugin update or after you add or change a key, to fill in fields that are new.

A refresh fills only empty fields, so values you edited stay. The source ratings (`Rating IMDB`, `Rating RT`, `Rating MC`, `Rating RAWG`, `Rating AniList`, `Rating MAL`) are updated to their current value; `My Rating` is never touched. A refresh also updates the episode total in `Progress` (movies have no progress) and adds new seasons and episode titles. Fields in Skip properties are never added.

A note from RAWG, Comic Vine, or Google Books refreshes only while that service's key is set.
