Connect an account in Settings > Library > Connectors. Your list arrives as notes, in the first category of each kind in Settings > Library > Categories, and for some services your changes go back.

| Service | Comes in | Goes back | Details |
| --- | --- | --- | --- |
| AniList | Anime and manga lists, with progress and scores | Progress, status, and score, with the Push command | [[Anime and manga sync|Anime-sync]] |
| MyAnimeList | Anime and manga lists, with progress and scores | Progress, status, and score, when you save a note | [[Anime and manga sync|Anime-sync]] |
| Kitsu | Anime list, with progress and ratings | Progress, status, and rating, when you save a note | [[Anime and manga sync|Anime-sync]] |
| IMDb | Ratings, episode ratings, and watchlist | Your scores, episode scores, and titles you haven't started, to the watchlist | [[IMDb and Netflix|IMDb-and-Netflix]] |
| Netflix | Viewing history and thumbs | Your score, as a thumb | [[IMDb and Netflix|IMDb-and-Netflix]] |
| YouTube | Watch history, with the share of each video you watched, your likes, and your subscriptions | Likes, dislikes, and subscriptions, when you press them in a note | [[YouTube]] |
| Trakt | Watch history, ratings, episode ratings, and watchlist | Your scores, ticked episodes, finished movies, and titles you haven't started, to the watchlist | [[Trakt]] |
| PlayStation | Games you played, playtime, last played, trophies | Nothing | [[Game libraries|Game-libraries]] |
| Steam | Your library, playtime, last played, achievements | Nothing | [[Game libraries|Game-libraries]] |
| Nintendo Switch | Games you played and playtime | Nothing | [[Game libraries|Game-libraries]] |

No account needs a key or a developer app of your own.

## Connect

Press Connect next to the service. On desktop, a sign-in window opens inside Obsidian with the service's own page; sign in there as you would in a browser. The window closes by itself once you are in, and the first import starts right away.

- On mobile, AniList and MyAnimeList open your browser and ask you to paste back the address it lands on, and Kitsu asks for your email or username and password. Kitsu gets them directly; Library keeps only the sign-in token Kitsu returns.
- Trakt shows a code to enter on trakt.tv, so it connects on mobile too.
- IMDb, Netflix, YouTube, PlayStation, Steam, and Nintendo connect only in Obsidian on desktop, and their imports run there.
- Nintendo asks first, because its requests pass through a third-party signing service; see [[Game libraries|Game-libraries#nintendo-switch]].

## When it syncs

- Imports run on desktop once a day per service: Library checks a minute after Obsidian starts and then every hour. They also run right after you connect.
- Run one now with the command palette: `Import from AniList`, `Import from MyAnimeList`, `Import from Kitsu`, `Import from Trakt`, `Import Steam library`, `Import PlayStation games and trophies`, `Import Nintendo games`. IMDb, Netflix, and YouTube have no command; they import when you connect, once a day, and when you press Update at the top of the Library tab.
- MyAnimeList, Kitsu, IMDb, Netflix, and Trakt get your changes a moment after you edit a note. IMDb and Netflix only on desktop. AniList gets them when you run `Push current note to AniList`.
- One import runs at a time, so two services never make the same note twice. Pressing Update while one runs says so. YouTube's older history comes in apart from the imports, so it never holds them up. A title on several services ends up in one note.

## What an import changes

- Anime and manga: progress only moves forward, and a score fills `My Rating` only while it is empty. A note you edited since the last sync keeps your progress and score.
- IMDb, Netflix, and Trakt: a score fills `My Rating` only while it is empty. The one exception: when you change a score on IMDb or Trakt, the note follows, as long as it still has the score it got from there before.
- No import writes [[diary|Progress-and-statistics#diary]] lines.
- Games: playtime, last played, trophies, and achievements follow the platform, and so does `Progress`, the share of trophies or achievements you have. `Complete`, once on, stays on.
- An import never deletes a note. A title it finds no note for gets a new one.

## Deleting a note

When you delete a library note, Library asks whether to remove the title from the services that have it: AniList, MyAnimeList, Kitsu, Trakt, IMDb, and Netflix. Turn off any service you want to keep it on, then press Remove; closing the window keeps everything. A service is left out when another note still holds the title. Settings > Library > General > Offer to remove deleted notes from sites turns the question off.

Removing takes away the entry, its score, its progress, and its history. Netflix keeps the thumb, so Library hides the viewing history there (on desktop) and skips the title on later imports.

## Where sign-ins are kept

- Tokens, and the Steam account id, are in the plugin's settings file, `.obsidian/plugins/library/data.json` in your vault. If you sync or share your `.obsidian` folder, they go with it.
- The sign-in window keeps its own session, cookies included, in Obsidian's storage on that computer, outside your vault. IMDb, Netflix, YouTube, and Steam are read through that session, PlayStation renews its sign-in through it, and the next Connect may skip the sign-in form.
- Your password is never stored. Only Kitsu's mobile form handles one, and it goes straight to Kitsu.

## Disconnect

Disconnect, next to the service, removes its token, or for IMDb, Netflix, and YouTube the connection, from the settings and stops its imports and pushes. Notes stay as they are.

The service's own session in the sign-in window stays until it expires. To end it as well, sign out of your other devices or sessions on the service's account page, or change your password there.
