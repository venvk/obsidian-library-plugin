IMDb and Netflix connect in Settings → Library → Connectors → Movies · Series, and only in Obsidian on desktop. Neither has an API for your own history, so Library reads the site the way you would, through the session of the sign-in window.

General rules for connected accounts, such as where sign-ins are kept and what Disconnect does, are on [[Connected accounts|Connected-accounts]].

## Connect

Press Connect and sign in on the site's own page in the window that opens. The window closes when you reach the site's home page (on Netflix, the profile's Browse page), and the first import starts right away.

Imports then run once a day while Obsidian is open on desktop. There is no command to start one by hand. If the site has signed you out, Library shows "Connect IMDb in settings first" (or Netflix) and marks it Not connected; press Connect again.

## IMDb

What comes in:

- Your ratings. A movie or series you rated becomes a note, or updates the one you have. A movie you rated is marked `Complete`.
- Your episode ratings. They tick and score the episode in the series note, made if missing.
- Your watchlist. Each title becomes a note you haven't started.

A score fills `My Rating` only while the note has none. When you change a score on IMDb, the note follows, as long as it still has the score it got from IMDb before.

What goes back, a moment after you change a note:

- `My Rating`, rounded to a whole number from 1 to 10.
- The scores of rated episodes in a series note.
- Titles you haven't started go to your IMDb watchlist, unless you rated them on IMDb. A title leaves the watchlist once you start it.

After you connect, your library goes to IMDb too: notes IMDb doesn't have yet are sent one at a time in the background, a few seconds apart. So connecting rates on IMDb every title you scored in Library, and adds every title you haven't started to the watchlist.

IMDb knows a note by its IMDb id, in `Source ID` (such as `tt4574334`) or in `URL`.

## Netflix

What comes in:

- Your viewing history. A movie you watched becomes a note marked `Complete`. A series becomes a note, and the episodes you watched are ticked. Netflix gives only a title's name and its Netflix ID, so Library looks the ID up on Wikidata for the IMDb id. When Wikidata doesn't know the title, Library searches by name and, among series with the same name, picks the one whose episode titles match what you watched. A title you only rated, never watched, updates a note you have but doesn't make one.
- Anime. When Wikidata gives the title an AniList or MyAnimeList id, it becomes an anime note instead of a series. The episodes you watched count into `Progress`, which only moves forward; Netflix doesn't number them, so every season counts toward one note. An anime already kept as a series note with that `Netflix ID` stays where it is.
- Your thumbs, as scores: thumbs down is 3, thumbs up is 7, and two thumbs up is 9. They fill `My Rating` only while it is empty.

Each note gets the `Netflix ID` and Netflix in `Platforms`.

What goes back, for notes with a `Netflix ID`:

- `My Rating`, as a thumb. A score of 8 or more is two thumbs up, 5 to 7.9 is thumbs up, and below 5 is thumbs down. After you connect, older rated notes are sent one at a time in the background.
- Episodes you untick leave your Netflix viewing history.
- A series with nothing ticked, and not finished, goes to My List.

## A title in both

A note is found by its IMDb id, its Netflix ID, or its name, so a title from both sites ends up in one note. An import adds only what a note lacks, and a wrong `Netflix ID` is replaced.
