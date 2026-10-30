Trakt connects in Settings → Library → Connectors → Movies · Series. It works on desktop and on mobile, because nothing has to come back to Obsidian: you approve the sign-in on Trakt's own page.

General rules for connected accounts, such as where sign-ins are kept and what Disconnect does, are on [[Connected accounts|Connected-accounts]].

## Connect

Press Connect. A window shows a short code and an Open trakt.tv button. Open the page, sign in to Trakt if it asks, and enter the code. The window closes by itself once Trakt confirms, and the first import starts right away. The code works for 10 minutes; after that, close the window and press Connect again.

Imports then run once a day while Obsidian is open on desktop. Run one by hand with `Import from Trakt`, on desktop or mobile.

## What comes in

- Movies and series you watched. A movie becomes a note marked `Complete`. A series becomes a note, and the episodes you watched are ticked.
- Your ratings of movies and series. They fill `My Rating` only while it is empty. When you change a score on Trakt, the note follows, as long as it still has the score it got from Trakt before.
- Your episode ratings. They tick the episode in the series note and score it while it has no score.
- Your watchlist. Each title becomes a note you haven't started.

Trakt knows a title by its IMDb id, so a title without one on Trakt is left out. A note is found by its IMDb id, in `Source ID` (such as `tt4574334`) or in `URL`, so a title you also rated on IMDb ends up in the same note.

An import doesn't write [[diary|Progress-and-statistics#diary]] entries, so a synced history doesn't all land on today.

## What goes back

A moment after you change a note, on desktop or mobile:

- `My Rating`, rounded to a whole number from 1 to 10.
- Episodes you ticked, into your Trakt history, and the scores of rated episodes. Episodes you untick leave the history.
- A movie you marked complete, into your Trakt history.
- Titles you haven't started, to your Trakt watchlist, unless Trakt already has a score or a watch for them. A title leaves the watchlist once you watch it.

Episodes and movies sent this way get the day you sent them as their watch date, because a note doesn't keep the day you watched them.

After you connect, your library goes to Trakt too: notes Trakt doesn't have yet are sent one at a time in the background, a second and a half apart. If Obsidian closes before it finishes, it carries on a minute and a half after the next start. So connecting rates on Trakt every title you scored in Library, and adds every title you haven't started to the watchlist.

## Disconnect

Disconnect removes the Trakt sign-in from the settings and forgets what was already sent, so a later Connect sends your library again. Notes stay as they are.
