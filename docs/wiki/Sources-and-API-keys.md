Every kind of title is searched in open sources that need no key:

| Kind | Sources |
| --- | --- |
| Movies, series | Cinemeta, Wikidata |
| Books | Open Library |
| Games | Steam, Wikidata |
| Anime | MyAnimeList, AniList, Kitsu |
| Comics | Wikidata; AniList for manga, manhwa, and light novels |
| Music | Deezer |

Anime results come from all three sites at once, MyAnimeList's first. A title two sites list shows once.

Settings → Library → Connectors → Anime · Manga decides the name a new anime or manga note gets: English, romaji, or original. A title without a name in that language takes the next one. Titles marked adult appear in search only with Adult titles in search turned on.

An optional key adds a service, listed first in search, or extra data:

| Key | For | Adds |
| --- | --- | --- |
| [OMDb](#omdb) | Movies, series | OMDb results with Rotten Tomatoes scores |
| [TMDB](#tmdb) | Movies, series | Trailers, more stills, season details and ratings, episode images, and its own recommendations |
| [Google Books](#google-books) | Books | Google Books results |
| [RAWG](#rawg) | Games | RAWG results with its rating, the Metacritic score, screenshots, covers for games not on Steam, and its own recommendations |
| [Twitch](#twitch-for-game-trailers) | Games | A YouTube trailer from IGDB for nearly every game |
| [Comic Vine](#comic-vine) | Comics | Comic Vine results with covers and issue counts |

Keys go in Settings → Library → API keys. They stay in the plugin's settings in your vault and go only to their own service. If you sync or share your `.obsidian` folder, they go with it.

Accounts need no keys at all: AniList, MyAnimeList, Kitsu, IMDb, Netflix, PlayStation, Steam, and Nintendo connect with a Connect button; see [[Connected accounts|Connected-accounts]].

A note from RAWG, Comic Vine, or Google Books refreshes only while that service's key is set.

## OMDb

Get a free key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx); OMDb emails it with a link you open once to activate it. Paste it into OMDb API key.

A free key allows 1,000 requests a day. When OMDb reports the limit or is down, Library uses Cinemeta for the next hour.

## TMDB

Create a free account at [themoviedb.org](https://www.themoviedb.org/), then request an API key under [Settings → API](https://www.themoviedb.org/settings/api). Paste the short API Key, not the long Read Access Token, into TMDB API key.

## Google Books

1. In the [Google Cloud console](https://console.cloud.google.com/apis/library/books.googleapis.com), create a project.
2. Enable the Books API.
3. Create an API key under Credentials.
4. Paste it into Google Books API key.

Google's keyless quota is shared by everyone and is usually used up, so Library searches Google Books only with a key.

## RAWG

Create an account at [rawg.io](https://rawg.io/) and get a key at [rawg.io/apidocs](https://rawg.io/apidocs). Paste it into RAWG API key.

Its recommendations are the rest of the series and the top games of the same genre.

## Twitch, for game trailers

Game trailers come from IGDB, which signs in with a Twitch application.

1. At [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps), register an application with the OAuth redirect URL `http://localhost`.
2. Copy its Client ID, and click New Secret for the Client Secret.
3. Paste both into Twitch Client ID and Twitch Client Secret.

Without them, a game's trailer comes from Wikidata when it lists one, or from Steam.

## Comic Vine

Sign in at [comicvine.gamespot.com/api](https://comicvine.gamespot.com/api/) to see your key. Paste it into Comic Vine API key.

## Search limits

Each source gets 4 seconds to answer, and Open Library 16. One that hasn't answered by then is left out of that search, so try again if a title you expect is missing.
