YouTube connects in Settings > Library > Connectors > YouTube, and only in Obsidian on desktop. YouTube has no API for your own watch history, so Library reads your history page the way you would, through the session of the sign-in window.

General rules for connected accounts, such as where sign-ins are kept and what Disconnect does, are on [[Connected accounts|Connected-accounts]].

## Connect

Press Connect and sign in with your Google account in the window that opens. The window closes when YouTube opens, and the first import starts right away. Imports then run once a day while Obsidian is open on desktop, and the Update button at the top of the Library tab runs one now.

If YouTube has signed you out, Library says so, marks YouTube Not connected, and leaves your notes as they are; press Connect again.

## What comes in

Every video you watched becomes a note in the Video category, made with the first one. Shorts are left out.

- The first import brings the last 7 days. Each later import brings every day since the one before, so days with Obsidian closed are caught up.
- Older history comes in the background, one month a day: this month first, then the month before, back to the start of your history. Years of history never land at once, and Update doesn't wait for them.
- A video you watch again on a later day keeps its note and counts a rewatch.

A note holds:

- the title, the channel, the thumbnail, and the video's link;
- `Runtime`, the video's length in minutes, and `Progress`, the share you watched, such as `61/100`. A video watched to 95% or more is marked `Complete`;
- the day you watched it in `Date`, and the day you last watched it in `Last Watched` once you rewatch it;
- the day the video came out, its views, likes, and dislikes;
- your like or dislike, and whether you are subscribed to the channel;
- the video's description, in a folded callout at the end of the note.

YouTube shows no dislike counts, so Library takes likes and an estimate of dislikes from [Return YouTube Dislike](https://returnyoutubedislike.com/), which gets only the video's id. Views come from YouTube itself.

Counts, your like, and your subscription are read again once per session when you open a note. A note that has no counts yet gets them in the background, a few hundred notes a day.

## Time spent

A video counts its length times the share you watched, and once more for each rewatch. The time shows next to the Video section's title and in the statistics panel's time chart. Your most-watched channels have their own column, Top channels; see [[Progress and statistics|Progress-and-statistics#statistics-panel]].

## In the note

The video plays at the top of the note. Next to the YouTube plate:

- the like and dislike buttons, with their counts. Your own like fills green and a dislike red; press one to like or dislike the video on YouTube, and again to take it back.

Next to the channel's name, which opens a canvas of its videos:

- the link icon opens the channel on YouTube;
- Subscribe or Subscribed subscribes to the channel on YouTube, or leaves it. Every note of that channel follows.

The title opens the video on YouTube.
