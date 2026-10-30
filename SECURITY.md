# Security policy

## Report a vulnerability

Report it privately through [GitHub's report form](https://github.com/venvk/obsidian-library-plugin/security/advisories/new), not in a public issue or discussion. Include the Library and Obsidian versions, your platform, what an attacker needs, and the steps or a note that shows the problem. Remove your own keys and tokens from anything you paste.

The report stays private between you and the maintainer until a fix is out. The answer comes in the report's thread, and you are credited in the published advisory unless you'd rather not be.

## Supported versions

Only the latest release gets fixes. Obsidian offers it as an update in Settings > Community plugins; there are no separate security releases for older versions.

## What Library keeps, and where

- API keys, the sign-in tokens of AniList, MyAnimeList, Kitsu, PlayStation, and Nintendo, and your Steam account id are in the plugin's settings file, `.obsidian/plugins/library/data.json` in your vault, like any plugin's settings. Each goes only to its own service.
- On desktop, the sign-in window keeps the services' sessions, cookies included, in Obsidian's own storage on that computer, outside the vault. IMDb, Netflix, and Steam are read through that session.
- Passwords are never stored. Sign-ins happen on the services' own pages; only Kitsu's form on mobile takes a password, and sends it straight to Kitsu.
- Nintendo requests pass through a third-party signing service, [nxapi-znca-api](https://github.com/samuelthomas2774/nxapi-znca-api), which sees the Nintendo Account token and the Nintendo Switch app's data. Library asks before connecting Nintendo.
- There is no telemetry and no self-update. The README lists [every host Library contacts](https://github.com/venvk/obsidian-library-plugin#privacy) and what it sends.

## Worth reporting

- A key, token, account id, or sign-in session reaching anyone but its own service: sent to another host, written into a note, or shown unredacted in the console or an error.
- A note's frontmatter, a template, or a source's or account's answer making Library open a `javascript:` or other non-web link, load a script, or run code.
- A page in the sign-in window, or a page Library reads through it, getting at Obsidian, your vault, or another site's session.
- A request to a host the README's privacy table doesn't list, or more data going to a listed host, including the Nintendo signing service, than the table says.
- A hand-edited settings file or note making Library create, move, or delete files outside the vault or outside the folders it manages.

## Not in scope

- Someone who can already read or edit your vault or `.obsidian` folder reading `data.json`. Keep your vault, and any sync or backup of it, private.
- Weaknesses in the services themselves (AniList, MyAnimeList, Kitsu, IMDb, Netflix, Sony, Valve, Nintendo, the signing service, or the metadata sources). Report those to the service.
- Problems in Obsidian itself. Report those to Obsidian.
