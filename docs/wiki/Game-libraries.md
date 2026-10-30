PlayStation, Steam, and Nintendo Switch connect in Settings → Library → Connectors → Games, and only in Obsidian on desktop. The games you played arrive in your Games category with their playtime, and nothing is sent back.

General rules for connected accounts, such as where sign-ins are kept and what Disconnect does, are on [[Connected accounts|Connected-accounts]].

## One note per game

A game you play on several platforms gets one note. Library finds it by the platform's id or by name, and adds the platform to it:

- `Platforms` lists where you have it: `PS5`, `PS4`, `Steam`, `Switch`.
- `Playtime PS5`, `Playtime Steam`, `Playtime Switch`, and so on hold each platform's hours, and `Playtime` their sum.
- `Last Played` is the day you last played it, as `dd.mm.yyyy`.
- `Date`, the day the game was added, moves back to the day you first played it when the platform knows it.

A new Steam game gets the details from its Steam store page right away. A new PlayStation or Nintendo game starts with what the platform gives, the name, cover, and playtime; genres, creators, and the trailer are looked up afterwards, one game at a time.

Imports run once a day while Obsidian is open on desktop, and right after you connect. Run one now with `Import PlayStation games and trophies`, `Import Steam library`, or `Import Nintendo games`. A large library takes a few minutes.

## PlayStation

Connect signs you in on Sony's own page; Library keeps only the sign-in token. The sign-in renews on its own. If Sony ends it, Library says "PlayStation sign-in has expired: connect again in settings".

The import brings the games you played, and games you own that have trophies, with:

- `PSN ID`, the game's PlayStation id;
- the platform, `PS5` or `PS4`, and its playtime;
- your trophies: `Platinum`, `Gold`, `Silver`, and `Bronze` counts;
- `Progress`, your trophy progress in percent, written as `45/100`;
- `Complete`, turned on when you earn the platinum.

The note header lists the trophies you earned, with the date and the share of players who have each one.

## Steam

Connect signs you in on Steam's own page. Library keeps only your Steam account id and reads your library through the sign-in window's session, so no Web API key is needed and your profile can stay private.

The import brings every game you own, with:

- its Steam store address in `URL`, and Steam in `Platforms` with its playtime;
- `Achievements`, unlocked out of all, such as `12/40`;
- `Progress`, the share of achievements you unlocked, written as `30/100`;
- `Complete`, turned on when you unlock them all.

Games you add from search also carry the Steam address, so the import finds them. A game you added from RAWG, or from Wikidata without a Steam page, may get a second note; `Find & remove duplicates` won't pair them, so delete the one you don't want.

The note header lists the achievements you unlocked, with the date and the share of players who have each one.

When a game is on PlayStation too, its `Progress`, `Last Played`, and `Complete` follow PlayStation, so the two imports never undo each other.

## Nintendo Switch

Nintendo lets only its own app read play activity. Library sends these requests through a third-party signing service, [nxapi-znca-api](https://github.com/samuelthomas2774/nxapi-znca-api), so Connect asks first. Your Nintendo Account token and the data of the Nintendo Switch app pass through that service. Only the sign-in token is kept on your device.

After you agree, sign in on Nintendo's own page. The import brings the games in the Play Activity of the Nintendo Switch app, with:

- `Nintendo ID`, the game's Nintendo id;
- Switch in `Platforms`, and its playtime.

Nintendo has no trophies or achievements, so a Switch game's progress is yours to set: turn on `Complete` when you finish it.

## Statistics

In Settings → Library → Statistics, Add top offers each connected platform:

- PlayStation: games, time played, trophy level, and your platinum, gold, silver, and bronze trophies;
- Nintendo Switch: games and time played.

Time spent on games in the statistics panel and in the section title counts `Playtime`.
