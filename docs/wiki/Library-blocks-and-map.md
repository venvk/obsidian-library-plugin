## Library blocks

A `library` code block shows part of your library inside any note: a daily note, a home page, a list of what to watch next. It looks the same as the Library tab and redraws when your notes change.

````
```library
show: cards
category: Movies
genre: Drama
year: 2024
rating: 8
sort: rating
limit: 12
```
````

Every line is optional. Write only the ones you need.

| Line | What it does |
| --- | --- |
| `show` | `cards` (the default) shows cards. `now` shows what you are in the middle of: started, not finished. `soon` shows the Soon list. `stats` shows the statistics panel. |
| `category` | Only this category. Its name, its Type value, or its name in your Obsidian language all work. |
| `genre` | Only titles with this genre. |
| `year` | Only titles from this year. |
| `rating` | Only titles you scored at least this much. |
| `sort` | `date` (the default, newest first), `rating`, `year`, or `name`. |
| `limit` | How many cards, 24 by default, 200 at most. |

`category`, `genre`, `year`, and `rating` work with `cards` and `now`; `category` also narrows `soon` and the taste and diary of `stats`. When nothing matches, the block says so.

Click a card to open its note.

## Library map

`Build library map`, in the command palette, draws your library as a canvas: the actors and creators that appear in two titles or more, each with the posters of their titles in a ring around them. The 40 busiest people get a place. A title sits in the ring of its busiest person, and a line joins it to the other people it shares, so you can follow one actor from film to film. Click a poster's name to open its note.

The canvas is `Library map.canvas` in your library folder. Each run builds it again from scratch, so changes you make to it by hand are lost; copy it first to keep a version.

The map reads `Creator` and `Cast`, so it grows with your movies, series, and games that have them.

## A category's canvas

The button at the right of a section's heading draws that category as a canvas, as wide as a screen, in groups that say what they are: creator, actor, genre. NFTs group by network.

A person's or a genre's canvas is split the same way: what they created, what they acted in.
