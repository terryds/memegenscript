# Plan: refreshing the template library

Status: **approved and shipped (September 2026).** Batches 1–3, the imgflip top-100 bonus
set, Zoolander, Three Kittens Dancing (original night-road footage, still + GIF), Coffin
Dance, and Homer Backs Into the Bushes (GIF) are live. Imports are reproducible from
`data/imports/batch-2026-09.json` via `scripts/import-templates.ts`; descriptions come from
Know Your Meme or `data/descriptions.manual.json`. The `archived: true` flag hides dated
templates from browsing while keeping their URLs working.

## Why

The library is the original memegen set: 209 templates, most from 2010–2016 (advice
animals, rage-era image macros, "Socially Awkward Penguin" and friends). Traffic to a meme
generator follows what people are posting *now*, and every template page is a landing page,
so newer, still-searched formats are the cheapest SEO and usefulness win we have.

## How a template gets added (per template)

1. **Directory** `assets/templates/<id>/` with `default.jpg` (or `.png`; `.gif` when the
   original is animated). Optional extra images become `style=` variants.
2. **`config.yml`** in the same format as the existing ones: `name`, `source` (Know Your Meme
   URL when one exists), `keywords`, `example` lines, and one `text` entry per text box
   with `anchor_x/anchor_y` (top-left, 0–1 of the image) and `scale_x/scale_y` (box size).
   These boxes drive both the API render and the editor's starting layout.
3. **Description**: run `npm run fetch:descriptions` (pulls the Know Your Meme summary for
   templates with a KYM `source`), or add an entry to `data/descriptions.manual.json`.
4. **Verify**: `npm run build:templates`, then render the example through the API
   (`/images/<id>/<example>.png`) and open `/memes/<id>` in the editor. `DEBUG=true` draws
   the text boxes on renders, which makes tuning coordinates quick.
5. **Featured**: optionally add the id to `data/featured.json`.
6. `npm test` (the suite asserts every template has a description), then deploy.

Cost per template is roughly 10–15 minutes, dominated by finding a clean source image and
tuning text boxes. Batches of 10–15 are comfortable.

## Image sourcing and specs

- Source the canonical, clean (caption-free) template image, usually from the Know Your
  Meme entry gallery or the imgflip template page. Cropped screenshots of the original
  scene are fine when no clean version exists.
- JPEG for photos, PNG for cartoons/screenshots with flat colors, GIF only when the format
  is inherently animated. Target 800–1200 px on the long side, under 500 KB. Strip EXIF.
- Keep the original aspect ratio. Multi-panel formats stay as a single image with one text
  box per panel.
- Meme images are used the way every meme generator uses them (fair-use style). We avoid
  templates whose rights holders actively issue takedowns (see "Excluded" below).

## Text-box conventions

| Format                        | Boxes | Layout                                                        |
| ----------------------------- | ----- | ------------------------------------------------------------- |
| Classic caption               | 2     | Top and bottom bands, 100% wide, 20% tall, uppercase, Impact  |
| Labeled panels (Drake-style)  | N     | One box per panel/element, white with black outline           |
| Object labeling (Distracted)  | N     | Boxes sit on the labeled objects, `style: default` (no upper) |
| Speech/sign text (Change My Mind) | 1 | Box on the sign, black text, thin font, rotated if needed     |

## Candidates (not in the library today)

Grouped by priority. Each line: proposed id, name, boxes, layout, source/year.

### Added so far

| id          | Name                      | Boxes | Notes                                                        |
| ----------- | ------------------------- | ----- | ------------------------------------------------------------ |
| `zoolander` | Zoolander Walk-Off Stare  | 2     | Split frame from the red-carpet scene; live                   |
| `kittens`   | Three Kittens Dancing     | 2     | AI kittens keyed onto a dark stage; `default.gif` is animated; live |

### Batch 1: the big ones people still search every day

| id            | Name                                        | Boxes | Layout                          | Notes |
| ------------- | ------------------------------------------- | ----- | ------------------------------- | ----- |
| `bernie`      | Bernie: I Am Once Again Asking              | 1     | Bottom caption                  | 2020; caption completes "I am once again asking for…" |
| `trade`       | Trade Offer                                 | 2     | "I receive" / "You receive"     | 2021, TikTok origin |
| `soyjaks`     | Two Soyjaks Pointing                        | 1     | Label on the pointed-at object  | 2020 |
| `gigachad`    | Gigachad                                    | 2     | Top/bottom                      | 2021 |
| `pikachu`     | Surprised Pikachu                           | 1–2   | Top caption (+ optional bottom) | 2018 |
| `mathlady`    | Confused Math Lady (Nazaré)                 | 2     | Top/bottom                      | 2016, still huge |
| `leo-point`   | Leonardo DiCaprio Pointing                  | 1     | Label on what he points at      | 2019 |
| `leo-cheers`  | Leonardo DiCaprio Cheers                    | 2     | Top/bottom                      | Gatsby, 2013 but evergreen |
| `uno`         | UNO Draw 25                                 | 2     | Text on the card / label on the person | 2019 |
| `bike`        | Bike Fall                                   | 3     | One box per panel               | 2019 |
| `squidward`   | Squidward Looking Out the Window            | 2     | Label window scene / label Squidward | 2019 |
| `monkey`      | Monkey Puppet (Awkward Look)                | 2     | Top/bottom                      | 2019 |
| `clown`       | Clown Applying Makeup                       | 4     | One box per panel               | 2019 |
| `lisa`        | Lisa Simpson's Presentation                 | 1     | Text on the board               | 2019 |
| `shaq`        | Sleeping Shaq (Sleeping vs Wide Awake)      | 2     | One label per panel             | 2019 |
| `newspaper`   | Tom Reading the Newspaper                   | 2     | Label headline / label Tom      | 2020 |
| `swole`       | Swole Doge vs. Cheems                       | 2     | One label per dog               | 2020 (we have single Cheems only) |
| `yesbutno`    | Well Yes, But Actually No                   | 2     | Top setup / pirate line stays   | 2018 |
| `evilkermit`  | Evil Kermit                                 | 2     | "Me:" / "Me to me:"             | 2016 |
| `pablo`       | Sad Pablo Escobar (Waiting)                 | 1–3   | Top caption or per panel        | 2016 |

### Batch 2: formats with strong search volume

| id            | Name                                        | Boxes | Layout                          | Notes |
| ------------- | ------------------------------------------- | ----- | ------------------------------- | ----- |
| `theydontknow`| They Don't Know (Wojak at Party)            | 1     | Thought bubble text             | 2020 |
| `homer-bush`  | Homer Backs Into the Bushes                 | 2     | Top/bottom                      | GIF + still |
| `arthur`      | Arthur's Fist                               | 2     | Top/bottom                      | 2016 |
| `unsettled`   | Unsettled Tom                               | 2     | Top/bottom                      | 2019 |
| `pepe-silvia` | Charlie Conspiracy (Pepe Silvia)            | 2     | Top/bottom                      | 2018 |
| `domino`      | Domino Effect                               | 2     | Label small domino / big domino | 2020 |
| `trophy`      | This Is Where I'd Put My Trophy             | 2     | Top/bottom                      | 2018 |
| `ahshit`      | Ah Shit, Here We Go Again (CJ)              | 2     | Top/bottom                      | 2019 |
| `modern`      | Modern Problems Require Modern Solutions    | 2     | Top/bottom                      | 2019 |
| `babyyoda`    | Baby Yoda Sipping Soup                      | 2     | Top/bottom                      | 2019 |
| `cardboard`   | Guy Holding Cardboard Sign                  | 1     | Text on the sign, rotated       | 2019 |
| `rock`        | The Rock Eyebrow Raise                      | 2     | Top/bottom                      | 2021, GIF |
| `pooh-3`      | Tuxedo Winnie the Pooh (3 panels)           | 3     | One label per panel             | we have the 2-panel |
| `girl-explain`| Girl Explaining                             | 2     | Label her / label the guy       | 2022 |
| `hotdog`      | Hot Dog Guy (We're All Trying to Find the Guy Who Did This) | 2 | Top/bottom          | 2020, I Think You Should Leave |
| `pedro`       | Pedro Pascal Laughing Then Crying           | 2     | One label per panel             | 2023 |
| `homelander`  | Homelander Stare                            | 2     | Top/bottom                      | 2024 |
| `megamind`    | Megamind Peeking ("No ___?")                | 1     | Top caption                     | 2021; caption text is user-supplied |

### Batch 3: the Zoolander request and other movie formats

| id            | Name                                        | Boxes | Layout                          | Notes |
| ------------- | ------------------------------------------- | ----- | ------------------------------- | ----- |
| `zoolander`   | Zoolander Walk-Off Stare                    | 2     | Top/bottom                      | **Confirmed; added first** |
| `bluesteel`   | Zoolander Blue Steel                        | 2     | Top/bottom                      | optional companion |
| `files`       | Zoolander: The Files Are *In* the Computer  | 2     | Top/bottom                      | optional companion |
| `jordan`      | Michael Jordan "And I Took That Personally" | 2     | Top/bottom                      | 2020 |
| `shrek-do`    | Shrek "That'll Do, Donkey"                  | 2     | Top/bottom                      | |
| `dalton`      | Rick Dalton Pointing (same as `leo-point`)  |       |                                 | merge with `leo-point` |
| `hardpills`   | Hard to Swallow Pills                       | 2     | Text on the note / on the pills | 2017 |
| `batman-slap` | Batman Slapping Robin                       | 2     | Speech bubble per character     | evergreen |
| `nick-young`  | Confused Nick Young                         | 2     | Top/bottom                      | 2014, evergreen |
| `blinking`    | Blinking White Guy (Drew Scanlon)           | 2     | Top/bottom                      | GIF |

### Excluded on purpose

- **Chill Guy** (2024): the artist actively files takedowns against commercial use.
- **Skibidi / brainrot video memes**: video-native, no meaningful still template.
- **Political figures from 2024–2025 events**: short shelf life, moderation headaches.
- Anything whose "template" is a real person's private photo without a public meme history.

## Housekeeping while we're at it

- **Featured list**: replace half of the current featured picks with Batch 1 entries once
  they land, so the homepage leads with current formats.
- **Outdated templates**: I suggest keeping all of them (the API is compatible with URLs
  people already have) but adding an `archived: true` option in `config.yml` that hides a
  template from the index, featured, related and sitemap while the API and its editor page
  keep working. Candidates: the four "Sad politician" templates, `prop3`, `bd`, `dsm`.
- **Search tags**: new templates get tags from Know Your Meme automatically; the manual file
  covers the rest.

## Open questions for you

1. ~~Which Zoolander meme?~~ Confirmed: the walk-off stare (`zoolander`).
2. **Batch 1 first?** It's 20 templates, about 4–5 hours of sourcing images and tuning text
   boxes, plus descriptions. I'd ship it as one deploy.
3. **Archiving**: OK with hiding the clearly dated ones from browsing (not from the API)?
4. **Any memes you personally want** beyond this list? IDs are cheap to change before they
   ship; after that they're URLs people share.
