## Search finds nothing

Search needs an internet connection. Each source gets 4 seconds to answer, and Open Library 16; one that hasn't answered by then is left out of that search, so try again. For a movie or series that shares its name with others, add the year: `dune 1984`.

## A note doesn't show in the Library tab

Its `Type` must equal a category's Type value exactly, capitals included. Notes in a folder named `Templates`, or in a folder or file whose name starts with `_`, are left out on purpose. A section with filters on shows only the titles that match; the Filter button says how many filters are on.

## A title is in the library twice

Adding a title that is already there opens its note instead, and imports look for an existing note by id and by name before they add one. To clean up older duplicates, run `Find & remove duplicates`: it lists notes that share a `URL` and removes the ones you pick. Book notes have no `URL`, so check books yourself, and a game added from RAWG next to the same game from Steam has two different addresses; delete the one you don't want.

## The cover is missing

Check Settings → Library → General → Cover property: notes may keep the cover under another name. A vault image needs a path or an internal link to a file that exists. Some sources have no cover for older or rare titles; paste any image address into the cover property. To keep covers when you are offline, turn on Keep covers in the vault; see [[Note properties|Frontmatter-reference#cover]].

## A refresh or an import changed my values

A refresh fills only empty fields and updates the source ratings; see the refresh rules in [[Note properties|Frontmatter-reference]]. Imports never overwrite a score you gave, and anime progress only moves forward; game progress follows your trophies and achievements. See [[Connected accounts|Connected-accounts]]. To keep a source field out of your notes for good, add it to Settings → Library → General → Skip properties.

## Can I rename the properties?

Only the cover's, with Cover property. You can leave source fields out with Skip properties, and add your own through a [[category template|Templates-and-skipped-properties]].

## Can I use Library with Bases or Dataview?

Yes. Everything is in frontmatter, so you can filter by `Type` or `Platforms`, sort by `My Rating` or `Playtime`, or show `Progress`; see [[Note properties|Frontmatter-reference]]. `Date`, `Released`, and `Last Played` are text in the form `dd.mm.yyyy`, and `Progress` is text such as `8/42`, so a view treats them as text.

## Connect does nothing, or the sign-in window stays open

The window closes by itself once the service's page shows you are signed in: IMDb's home page, Netflix's Browse page, YouTube, or the service's confirmation. Finish any extra steps the site asks for, such as a code or picking a profile. Close the window to cancel. IMDb, Netflix, YouTube, PlayStation, Steam, and Nintendo connect only on desktop.

## Where are my keys and tokens?

In the plugin's settings file, `.obsidian/plugins/library/data.json` in your vault. Each key and token goes only to its own service. If you sync or share your `.obsidian` folder, they go with it.

The sign-in window keeps the services' sessions in Obsidian's own storage on that computer, outside your vault. Disconnect removes the token from the settings; to end a site's session as well, sign out of your other devices on the site's account page. See [[Connected accounts|Connected-accounts#where-sign-ins-are-kept]].

## Why does Nintendo need a third-party service?

Nintendo lets only its own app read play activity, and checks that requests come from it. Library sends those requests through [nxapi-znca-api](https://github.com/samuelthomas2774/nxapi-znca-api), a signing service, so your Nintendo Account token and the Nintendo Switch app's data pass through it. Library asks before you connect, and nothing goes there unless you do. See [[Game libraries|Game-libraries#nintendo-switch]].

## When does Library go online?

When you search, refresh, sync, or share; when you open a library note, at most once in 5 minutes per note; and once after an update or a key change. Connected accounts import once a day on desktop, and the air dates of the series and anime you are watching are checked twice a day. Covers load from their image addresses. There is no telemetry and no self-update. The README lists every host Library contacts and what it sends. Turning off Show recommendations stops the requests for similar titles.

## Does it work on mobile?

Yes: search, the Library tab, notes, statistics, and sharing work as on desktop. AniList and MyAnimeList connect through your browser, and Kitsu with your email or username and password. Trakt connects with a code, so it works on mobile too. IMDb, Netflix, PlayStation, Steam, and Nintendo connect only on desktop, and the daily imports run there.

## Something else is wrong

Open an [issue](https://github.com/venvk/obsidian-library-plugin/issues/new/choose) with the Library and Obsidian versions and any error that starts with `Library:` in the developer console (Ctrl+Shift+I, or Cmd+Option+I on macOS). Remove keys and tokens before you paste anything.
