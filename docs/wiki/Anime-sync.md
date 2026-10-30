Connect AniList, MyAnimeList, Kitsu, or any of them, in Settings > Library > Connectors > Anime · Manga. Your lists arrive as notes, and your progress and scores go back. Every anime note works with all three sites, whichever one it came from.

General rules for connected accounts, such as when imports run and where tokens are kept, are on [[Connected accounts|Connected-accounts]].

## Connect

No developer app or Client ID is needed: press Connect.

| Site | Desktop | Mobile |
| --- | --- | --- |
| AniList | Sign in on AniList's page in the window that opens. | Your browser opens AniList. Approve access, then copy the whole address the browser lands on, starting with `https://anilist.co/api/v2/oauth/pin#access_token=`, and paste it into the window Library opened. |
| MyAnimeList | Sign in on MyAnimeList's page in the window that opens. | Your browser opens MyAnimeList. Approve access; the browser then tries to open an address starting with `http://localhost/?code=` and fails to load. That is expected: copy the whole address and paste it into the window Library opened. |
| Kitsu | Sign in on Kitsu's site in the window that opens. | Enter your email or username and password. They go straight to Kitsu; Library keeps only the sign-in token. |

After connecting, the first import starts right away. MyAnimeList and Kitsu sign-ins renew on their own; if one is ever lost, the status in settings says Not connected, and Connect brings it back.

## What comes in

| Site | Imports |
| --- | --- |
| AniList | Your anime and manga lists |
| MyAnimeList | Your anime and manga lists |
| Kitsu | Your anime list |

Anime goes to your Anime category. Manga goes to a comics category of its own, made with the first manga. A title already in your library is updated, not added twice.

Progress only moves forward, and a site's score fills `My Rating` only while the note has none. A note you edited since the last sync keeps your progress and score.

Imports run on desktop once a day. Run one now with `Import from AniList`, `Import from MyAnimeList`, or `Import from Kitsu`; these work on mobile too.

## What goes back

| Site | When | Anime | Manga |
| --- | --- | --- | --- |
| AniList | When you run `Push current note to AniList` | Yes | No |
| MyAnimeList | A moment after you change a note; `Push current note to MyAnimeList` sends an open anime note now | Yes | Yes |
| Kitsu | A moment after you change a note; `Push current note to Kitsu` sends the open note now | Yes | No |

What is sent:

- Progress: the number of episodes or chapters watched or read.
- Status: a finished title becomes Completed. `Push current note to AniList` and `Push current note to MyAnimeList` also set the rest from the progress: some progress is Current on AniList and Watching on MyAnimeList, none is Planning or Plan to Watch. The automatic pushes to MyAnimeList and Kitsu set only Completed, so an entry you put On Hold or Dropped on the site stays that way; a title new to your Kitsu list goes in as Current or Planned.
- Score, from `My Rating`. AniList gets it on a 100-point scale (8.5 becomes 85) and shows it in your own score format. MyAnimeList gets a whole number from 1 to 10, and Kitsu the nearest half point. A note without a score leaves the site's score as it is.

## Pull

`Pull progress from AniList`, `Pull progress from MyAnimeList`, and `Pull progress from Kitsu` update the anime notes you already have from your list on that site, and add no new ones. Pull moves progress forward, and a title completed on the site fills the note's progress. It never lowers the progress in a note and never changes `My Rating`.

## Which notes sync

Every anime note with `Source: anilist` syncs. A note added from AniList has the AniList id in `Source ID`, and a note added from MyAnimeList has `mal:` and the MyAnimeList id. Library finds a title's entry on the other sites through AniList, which knows the MyAnimeList id, and through Kitsu's own id mappings.

A title a site doesn't list can't sync there: the push reports, for example, "MyAnimeList has no entry for this anime".

Manga notes have `Source: comics` and `manga:` with the AniList id in `Source ID`; they sync with MyAnimeList.
