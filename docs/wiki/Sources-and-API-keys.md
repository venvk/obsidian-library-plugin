Every kind of title is searched in open sources that need no key:

| Kind | Sources |
| --- | --- |
| Movies, series | Cinemeta, Wikidata |
| Books | Open Library |
| Games | Steam, Wikidata |
| Anime | MyAnimeList, AniList, Kitsu |
| Comics | Wikidata; AniList for manga, manhwa, and light novels |
| Music | Deezer |
| Collections | TCGdex, Scryfall and YGOPRODeck |

Anime results come from all three sites at once, MyAnimeList's first. A title two sites list shows once.

## Descriptions

A note gets what its title is about as a folded **Description** callout at the end of its text. It comes from the source the note came from: Cinemeta or TMDB for movies and series, MyAnimeList or AniList for anime and manga, Steam or RAWG for games, Open Library or Google Books for books, Comic Vine for comics. Titles found only in Wikidata, music and collectibles have none.

The text is in the source's language, most often English. It is written once: edit it or fold it open, and Library leaves it alone. Delete it and the next refresh brings it back; to keep it out for good, add `Description` to [[Skip properties|Templates-and-skipped-properties]]. Notes made before 2.6.5 get theirs in the background after the update.

## Collections

Trading cards are searched in TCGdex (Pokémon), Scryfall (Magic) and YGOPRODeck (Yu-Gi-Oh!), with no key needed. A card note gets its picture, set (`Series`), number, year, rarity, illustrator and current price (Cardmarket, EUR; USD when only that is known).

Its header shows "N of M collected" for the set and a **Missing cards** button that lists the set's cards not in the library; a click adds one. The header also has Copies (field `Count`) and Condition (Mint, Near mint, Excellent, Good, Played, Poor; field `Condition`). Adding a card that is already in the library raises its Copies instead of making a second note.

Frontmatter fields: `Series`, `Series ID`, `Series Total`, `Number`, `Rarity`, `Price`, `Currency`, `Count`, `Condition`.

Coins, banknotes and tokens come from Numista once you add a [Numista key](#numista). Search by name in the same category. A coin note gets both sides as pictures, its year, issuer, face value (`Value`), metal (`Composition`) and a price in EUR when Numista has one. Copies and Condition work as for cards.

Frontmatter fields: `Issuer`, `Value`, `Composition`, `Price`, `Currency`, `Count`, `Condition`.

Settings > Library > Connectors > Anime · Manga decides the name a new anime or manga note gets: English, romaji, or original. A title without a name in that language takes the next one. Titles marked adult appear in search only with Adult titles in search turned on.

An optional key adds a service, listed first in search, or extra data:

| Key | For | Adds |
| --- | --- | --- |
| [OMDb](#omdb) | Movies, series | OMDb results with Rotten Tomatoes scores |
| [TMDB](#tmdb) | Movies, series | Trailers, more stills, season details and ratings, episode images, and its own recommendations |
| [Google Books](#google-books) | Books | Google Books results |
| [RAWG](#rawg) | Games | RAWG results with its rating, the Metacritic score, screenshots, covers for games not on Steam, and its own recommendations |
| [Twitch](#twitch-for-game-trailers) | Games | A YouTube trailer from IGDB for nearly every game |
| [Comic Vine](#comic-vine) | Comics | Comic Vine results with covers and issue counts |
| [Numista](#numista) | Collections | Coins, banknotes and tokens with their pictures, issuer, value, composition and price |

Keys go in Settings > Library > API keys. They stay in the plugin's settings in your vault and go only to their own service. If you sync or share your `.obsidian` folder, they go with it.

From Obsidian 1.11.4, each key can come from Obsidian's Keychain instead: pick a secret next to the key's field. Library then reads the key from the Keychain each time and keeps only the secret's name in its settings, so the key itself doesn't travel with your `.obsidian` folder. Pick nothing to type the key again.

Accounts need no keys at all: AniList, MyAnimeList, Kitsu, IMDb, Netflix, PlayStation, Steam, and Nintendo connect with a Connect button; see [[Connected accounts|Connected-accounts]].

A note from RAWG, Comic Vine, or Google Books refreshes only while that service's key is set.

## OMDb

Get a free key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx); OMDb emails it with a link you open once to activate it. Paste it into OMDb API key.

A free key allows 1,000 requests a day. When OMDb reports the limit or is down, Library uses Cinemeta for the next hour.

## TMDB

Create a free account at [themoviedb.org](https://www.themoviedb.org/), then request an API key under [Settings > API](https://www.themoviedb.org/settings/api). Paste the short API Key, not the long Read Access Token, into TMDB API key.

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

## Numista

Create a free account at [numista.com](https://en.numista.com/api/) and request an API key there. Paste it into Numista API key. Without the key, the Collection category searches cards only.

## Audiobooks

Searching a book also finds its audiobooks on Audible, Apple Books, LibriVox and the Internet Archive, with no key. A card says **Book** or **Audiobook** and how long it runs.

## IMDb search

With IMDb connected, movie and series searches start with IMDb's own results. See [[IMDb and Netflix|IMDb-and-Netflix]].

IMDb scores come from IMDb itself, current and with no key, so a new film or series gets its score as soon as IMDb has one. A refresh or a category sync updates it.

## Etherscan and OpenSea

Both are optional and only matter for [[NFT]]: Etherscan reads BNB Chain, Polygon and Taiko faster, and OpenSea adds the creator's profile links and more pictures.

## Search limits

Each source gets 4 seconds to answer, and Open Library 16. One that hasn't answered by then is left out of that search, so try again if a title you expect is missing.
