# Plan: template library, round 3

Status: **Batches E, F1, F2 and G done (122 templates, library at 454).** Nothing is pending; the
round-2 record is kept further down.

## Done: Batch E, Tobey Maguire pack (17 templates, 2026-09-17)

Imported via `data/imports/batch-2026-09e.json`: `bully-maguire` (GIF + still), `peter-cry`,
`peter-cry-happy`, `dirt-eye`, `pizza-time` (GIF + still), `fix-door` (two fill-in boxes over
the blanks), `franco-staring`, `maguire-face`, `deepfake-tobey`, `tobey-smirk`, `my-back`,
`ripped-mask`, `visible-fear`, `thought-earlier`, `ad-said-3000`, `tobey-dance` (GIF + still),
`spiderman-triple`. Dropped `harry-glare` (same frame as `franco-staring`). Seven without a
Know Your Meme entry got hand-written descriptions. `bully-maguire` and `peter-cry` are featured.

## Batch F: evergreen formats from imgflip pages 5–8

Everything on those pages that we don't have and that isn't excluded. F1 is the higher-ranked
half; F2 the long tail. Boxes are 2 (top/bottom) unless noted.

### Done: F1 (39 templates, 2026-09-17)

Imported via `data/imports/batch-2026-09f1.json`. Custom layouts: `both-buttons` (labels on the
buttons), `cat-looks-inside` (two greentext lines, black, left-aligned), `lois-pills` (bottle
label + Lois), `incoming-call` (caller name), `who-would-win` (header + two columns),
`brain-sleep` (three speech bubbles), `makima` (note), `zero-days` (sign), `free-choice`
(two doors), `horse-drawing`/`soyboy-chad` (side-by-side labels), two-panel tops for `so-far`,
`squid-game`, `homer-back-fat`, `wait-here`. `confused-monkey` and `skinner-letter` are video-
only on imgflip, converted to GIF + still. Dropped "The Night Before" (baked text leaves no
room). Twelve without a Know Your Meme entry got hand-written descriptions.

### Done: F2 (52 templates, 2026-09-17)

Imported via `data/imports/batch-2026-09f2.json`. Custom layouts: `batman-signal` (text in the
signal), `dw-sign` (sign), `fear-no-man` (bottom-middle panel), `cute-cat` (blank right column
per panel), `did-you-mean` (search field + suggestion), `be-honest` (three panels),
`dumbest-man` (empty bubble), `two-wolves` (white strip), `what-did-it-cost` (four panels),
`shipping-label` (label), `first-time` (top only, caption is baked). Video-only on imgflip,
converted to GIF + still: `yelling-beaver`, `shrek-running`, `confused-travolta`;
`shipping-label` is a single frame, kept as PNG. Re-fetched by a better query: `math-is-math`
(first hit was Math Lady), `my-salad` (first hit was the McDonald's variant). Dropped: "They
Hated Jesus" (baked comic), "What Do We Want" (unclear textbox layout), "Big Dog Small Dog"
(same as `swole`). Twenty without a Know Your Meme entry got hand-written descriptions.

## Done: Batch G, SpongeBob pack (14 templates, 2026-09-17)

Imported via `data/imports/batch-2026-09g.json`: `imma-head-out` (top box only, the bottom line
is baked in; featured), `tired-spongebob` (black text in the white band), `krusty-krab`
(side-by-side labels), `burning-paper` (text on the blank paper), `handsome-squidward`,
`krabs-blur`, `squidward-spare`, `went-to-college`, `mayonnaise`, `moments-later` (blank time
card, centered text), `this-is-patrick` (top box shifted off the "Order Here" sign), `chocolate`,
`inner-machinations` (text in the thought cloud), `hes-hot` (text in the two blank left panels).
Dropped "SpongeBob Diapers" (seven panels, no sensible caption slots). Already in the library
before this pack: Mocking SpongeBob, Imagination, Squidward Window, Squidward Chair, Push It
Somewhere Else Patrick, Patrick's Wallet, Stop It Patrick, Ol' Reliable, SpongeBob Yelling.

## Next packs (not planned in detail yet)

Simpsons, Breaking Bad, The Office, Star Wars, Wojak/Pepe, cats & dogs, anime, Marvel, Harry
Potter, gaming, K-pop. Each gets its own spec file and a review pass when its turn comes.

## Excluded on purpose

- Racial or sexual "templates" from the imgflip pages: 5 Black Guys and Blonde, Riley Reid,
  Peter Griffin skin color chart, Coomer, Bush Learning About 9/11.
- Duplicates of what we have (Afraid to Ask Andy, Math Lady, Oprah, Elmo Cocaine, Success
  Kid, Doge, Grumpy Cat, Bernie, Two Guys on a Bus, Buzz Clones, Wolverine, and about 25
  others that appear on those pages).

## Recommendation

One franchise pack per deploy so the featured row and sitemap grow gradually.

---

# Plan: template library, round 2

Status: **Batches B–D approved and imported (September 2026).** 58 of the 63 candidates
shipped; dropped: Matt Damon Meme (same still as Distraught Odysseus), Jimothy (imgflip's
template is an unrelated animal), Odyssey Sirens, Oh Yeah! Oh No, and Brother Ew (video-only
templates with no clean still). Also added on request: Buzz Lightyear Clones. The tables
below are kept as the record of what was considered.

## How templates get added

Every batch is a spec file in `data/imports/` and one command:

```
npx tsx scripts/import-templates.ts data/imports/<batch>.json
npm run fetch:descriptions        # Know Your Meme summaries for new sources
npm run build:templates && npm test
```

Per template the spec gives an imgflip template id (or search query), a Know Your Meme slug,
keywords, an example, and optional text boxes. Templates whose KYM match is wrong or missing
get a hand-written entry in `data/descriptions.manual.json`. Imgflip GIF-only templates have
no still, so those need a manual image (as with Homer and the kittens).

## Done (rounds 1–2)

- Round 1: Batches 1–3 of the previous plan plus 12 imgflip top-100 formats (58 total),
  Coffin Dance, Homer bushes (GIF), Three Kittens Dancing (original footage), Zoolander.
- Round 2 (your requests): Would (Japanese Parliament), Would (Literally Wood), Place Japan
  (the MS Paint mountain drawing, labels blanked for your text), Two Paths, Red Pill or Blue
  Pill, Homelander Disgusted. Two Guys on a Bus was already in the library as `bus`.
- `archived: true` hides dated templates from browsing (8 archived).

## Where the next candidates come from

1. **imgflip's popularity ranking** (pages 1–4) minus what we have: evergreen, high-search
   formats a meme site is expected to have.
2. **imgflip "top new"** (this month): what people are captioning *right now*, mostly 2026
   movie and TV moments.
3. **Know Your Meme's top 20 of 2024 and 2025**: most winners are video, audio, or phrase
   memes with no still, so only the image-based ones qualify.

## Batch B: trending right now (imgflip top-new, September 2026)

Short shelf life but high search volume today; cheap to add, cheap to archive later.

| id                 | Name                                                         | Boxes | Notes |
| ------------------ | ------------------------------------------------------------ | ----- | ----- |
| `deceive`          | Why Would I Deceive You? (Nathan Fielder / Elizabeth Holmes) | 2     | KYM trending entry; two-panel |
| `pattinson-hansen` | Robert Pattinson as Chris Hansen                             | 2     | |
| `beggars`          | Somebody Get These Beggars Outta Here (The Odyssey)          | 2     | Nolan's *The Odyssey* (2026) |
| `odysseus`         | Distraught Odysseus                                          | 2     | same film |
| `sirens`           | Odyssey Sirens                                               | 2–3   | labeling format |
| `doomsday-return`  | X Will Return in Avengers: Doomsday                          | 1     | text on the title card |
| `matt-damon`       | Matt Damon Meme                                              | 2     | |
| `la-peace`         | La Peace                                                     | 2     | |
| `verity`           | Verity Live Reaction                                         | 2     | |
| `lanterns`         | Lanterns Interrogation                                       | 2     | |
| `ignore-it`        | He Tryna Ignore It                                           | 2     | |
| `jimothy`          | Jimothy                                                      | 2     | |

## Batch C: evergreen formats still missing (imgflip pages 2–4)

The first 15 rows are the most-searched; the rest are nice-to-have.

| id                 | Name                                          | Boxes | Notes |
| ------------------ | --------------------------------------------- | ----- | ----- |
| `anime-hiding`     | Anime Girl Hiding from Terminator             | 2     | label each character |
| `reaper-door`      | Grim Reaper Knocking Door                     | 3     | one per door |
| `soldier`          | Soldier Protecting Sleeping Child             | 3     | labeling |
| `train-bus`        | Train Hitting a School Bus                    | 2     | labeling |
| `aj-undertaker`    | AJ Styles & Undertaker                        | 2     | labeling |
| `no-yes`           | No / Yes (Drake-style)                        | 2     | |
| `grandma`          | Grandma Finds the Internet                    | 2     | |
| `nut-button`       | Blank Nut Button                              | 2     | text on the button |
| `imagination`      | Imagination SpongeBob                         | 2     | |
| `where-monkey`     | Where Monkey                                  | 2     | |
| `laughing-leo`     | Laughing Leo                                  | 2     | |
| `wolverine`        | Wolverine Remember                            | 2     | picture frame is an overlay slot |
| `do-something`     | C'mon, Do Something                           | 2     | |
| `yoda`             | Star Wars Yoda                                | 2     | |
| `not-the-same`     | Gus Fring: We Are Not the Same                | 3     | three lines of text |
| `rock-driving`     | The Rock Driving                              | 4     | two-panel dialogue |
| `disappointed`     | Disappointed Black Guy                        | 2     | |
| `tap-sign`         | Don't Make Me Tap the Sign                    | 1     | text on the sign |
| `goose-chase`      | Goose Chase                                   | 2     | |
| `grandma-bed`      | Sure Grandma, Let's Get You to Bed            | 2     | |
| `here-it-comes`    | Here It Comes                                 | 2     | |
| `moe-barney`       | Moe Throws Barney                             | 2     | |
| `car-salesman`     | Car Salesman Slaps Roof of Car                | 2     | |
| `hr`               | Hello Human Resources                         | 2     | |
| `congrats`         | The Office: Congratulations                   | 2     | |
| `not-playing`      | I Don't Want to Play With You Anymore         | 2     | |
| `millionaire`      | Who Wants to Be a Millionaire?                | 5     | question + four answers |
| `second-breakfast` | Second Breakfast                              | 2     | |
| `oh-yeah-oh-no`    | Oh Yeah! Oh No...                             | 2     | |
| `kids-read`        | If Those Kids Could Read They'd Be Very Upset | 2     | |
| `live-reaction`    | Live Reaction                                 | 1     | |
| `dinkleberg`       | Dinkleberg                                    | 1     | |
| `dog-fate`         | Dog Accepting Fate                            | 2     | |
| `gentlemen`        | Gentlemen, It Is With Great Pleasure...       | 1     | |
| `mr-bean`          | Mr. Bean Waiting                              | 2     | |
| `never-ask`        | Never Ask a Woman Her Age                     | 3     | |
| `machine`          | My Body Is a Machine                          | 2     | |
| `jarvis`           | Jarvis (Iron Man)                             | 2     | |
| `power`            | What Gives People Feelings of Power           | 3     | bar chart labels |
| `bugs-no`          | Bugs Bunny "No"                               | 2     | we have the communist variant only |

## Batch D: image-based winners from KYM's 2024–2025 rankings

| id             | Name                                       | Boxes | Notes |
| -------------- | ------------------------------------------ | ----- | ----- |
| `frieren`      | Frieren Looking Up                         | 2     | anime still |
| `doakes`       | James Doakes Reaction Images               | 2     | Dexter screenshots (pick the canonical one) |
| `queen-cry`    | Queen Never Cry                            | 2     | |
| `knee-surgery` | That Feeling When Knee Surgery Is Tomorrow | 1     | Blue Grinch |
| `bro-visited`  | Bro Visited His Friend                     | 2     | two-panel comic |
| `triangle`     | A Circle?? In the Triangle Factory??       | 2     | exploitable two-panel |
| `dikec`        | Yusuf Dikeç (Turkish Pistol Shooter)       | 2     | Olympic photo |
| `sad-hamster`  | Sad Hamster                                | 2     | still from the video |
| `brother-ew`   | Brother, Ew! What's That?                  | 2     | |
| `aura`         | Aura Farming                               | 2     | the boat kid still |
| `great-reset`  | The Great Meme Reset of 2026               | 2     | nostalgia format |

## Excluded on purpose

- Political and real-person edits: J.D. Vance face edits, Kirkification, George Bush 9/11,
  Trump bill signing, "A second plane has just hit".
- Private individuals whose fame is the meme itself: Saori Araki, Hawk Tuah, Lindsay Clancy.
- Video/audio-only: Jet2 Holiday, Horse Race Tests, Italian Brainrot, Chicken Jockey,
  Totr/SDIYBT, 67, Clanker, KSI, Verbalase.
- Chill Guy (active takedowns).

## Recommendation

When additions resume: Batch G one franchise pack per deploy, then new packs (Marvel, Harry
Potter, gaming, K-pop) planned the same way.

## Questions

1. OK with Batch B's short-lived movie memes, knowing several will be archived by next year?
2. Any of Batch C you'd cut? The first 15 rows are the ones people search most.
3. Anything else you personally want, so it ships in the next batch instead of later?
