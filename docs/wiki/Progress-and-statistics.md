## Series and anime

A series note's header lists the seasons. Open a season to see its episodes, with titles where the source has them, then tick an episode or the whole season as watched and score it from 1 to 10.

- `Progress` counts the ticked episodes, written as `watched/total`.
- A season's score is the average of its rated episodes. A season without rated episodes can take a score of its own.
- `My Rating` is the average of the rated seasons.
- An episode that hasn't aired yet shows its air date, and Next episode in the header names the next one with its date, such as `S2E5 · Fri, 7 Nov`. Only air dates before the end of the current year are shown.

Anime works the same way, as one season without episode titles.

A series or an anime is done when its progress is full; there is no `Complete` to switch. A finished one (a series with an `End Year`, an anime that finished airing) then hides its progress. A running series at 100% keeps showing it, since new episodes may come.

Until you tick anything, the first episodes up to the `Progress` count show as watched, so a `Progress` typed by hand carries over.

## Books

Chapters come from an edition's table of contents on Open Library. When none is found, Add chapters in the note header takes a chapter count or one title per line. From then on `Progress` counts chapters instead of pages, and the pages you had read carry over as the same share of chapters.

Without chapters, `Progress` counts pages. Change the first number by hand as you read.

A book is done when its progress is full, and then hides it; there is no `Complete` to switch.

## Movies

A movie is watched or not: press Mark complete in the note's header, or turn on `Complete` in its properties, when you have seen it. Movies have no progress. A movie you rate on IMDb or watch on Netflix is marked for you; see [[IMDb and Netflix|IMDb-and-Netflix]].

## Games

A game from PlayStation or Steam gets its progress from your trophies or achievements: `Progress` is the share you have, and `Complete` turns on with the platinum trophy or the last achievement; see [[Game libraries|Game-libraries]]. Otherwise turn on `Complete` when you finish a game. A game from RAWG starts at `0/1`.

## Albums and comics

These have nothing to tick. Edit `Progress` in the note's properties, or press Mark complete in the header when you finish. An album counts its tracks, and a comic its issues, volumes, or chapters.

## Your score

`My Rating` is your score from 1 to 10. For series, anime, and books it follows your episode, season, or chapter scores; elsewhere, type it in the note's properties. Refresh never changes it. Connected accounts fill it only while it is empty; see [[Connected accounts|Connected-accounts]].

## Up next

An eye on a card marks a title you haven't started: not done, no progress yet (the first number of `Progress` is 0), no playtime, and no score of yours. Up next, at the end of the Library tab, gathers these titles from every category, newest first, and folds and sorts like a category. With titles from several categories, the chips above it show one category at a time.

In Settings → Library → General, turn off Up next block to hide it. With Not started in categories turned off, these titles show only in Up next. A category can also put them first with the Not started sort.

## Soon

Soon, near the top of the Library tab, lists the next episodes of the series and anime you are watching, up to 20, soonest first, with their air dates. Episodes airing after the end of the current year are left out. Click one to open its note.

A title counts as watching when you have ticked at least one episode, and, for a series, while it has no `End Year`. Air dates come from Cinemeta for series and from AniList or MyAnimeList for anime, and are checked twice a day.

The arrow next to the title folds it into one row that scrolls sideways. Settings → Library → General → Soon hides it.

## Diary

Ticking an episode, a season, or a chapter in the note header, or marking a title complete, writes the day into the note's `Log` property, one line per event:

```yaml
Log:
  - 2026-10-18 S2E5
  - 2026-10-19
```

A line with only a date is a title you finished. Imports from connected accounts don't write diary lines, so a synced history doesn't all land on today. The diary starts from your first tick; there are no dates before it.

The statistics panel shows your three latest diary lines, newest first. Settings → Library → Statistics → Diary hides them; your notes keep their `Log`.

## Statistics panel

The panel at the top of the Library tab shows the columns you pick in Settings → Library → Statistics. Show statistics, at the top of that tab, hides the whole panel. Add top offers:

- a category: its three highest-rated titles, by your score, or by the IMDb rating while you haven't scored them;
- a property: the three most common values of any property your notes use, such as genres, directors, actors, or a `Shelf` from your [[template|Templates-and-skipped-properties]];
- Top developers and Top channels: the creators of your games and of your [[YouTube]] videos. They have their own columns, so Top directors counts only movies, series, anime, and the other kinds. Both are added for you while Top directors is listed;
- a platform you connected: PlayStation (games, time played, trophy level, and trophies by grade), MyAnimeList (anime and manga on your lists), and Nintendo Switch (games and time played).

Your taste shows your average score and how it compares with other viewers (IMDb, or RAWG and Metacritic for games), a chart of how often you gave each score, your favourite genres (the highest average over at least three titles), and the decade most of your titles come from. It appears once you have scored five titles. Settings → Library → Statistics → Your taste hides it.

Each top, platform, and the diary take one cell of the panel, your taste takes three, and time spent sits on the right. A new column goes into an empty cell before it starts a new row.

Time spent shows the hours you spent on movies, series, anime, games, and videos, per category (click the total in the middle of the chart to see it in days, months, and years, and again for hours), and below it one comparison a day, such as how many times Apollo 11 could have flown to the Moon and back. Turn it off with the Time spent switch.

Time for movies, series, and anime multiplies `Runtime` by the episodes you watched; a finished title counts in full. A note without `Runtime` isn't counted and shows up as "without runtime". Games count their `Playtime`. A video counts its `Runtime` by the share you watched, once more for each rewatch.

The title row of each section shows the same time for its own titles, music included: an album's `Runtime` counts by the share of tracks you played.
