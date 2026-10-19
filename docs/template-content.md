# Writing original template content

Every template page gets its own text in `data/content/<template-id>.json`
(one file per template, so batches of rewrites never conflict). It replaces
the Know Your Meme excerpt from `data/descriptions.json` and the entries in
`data/descriptions.manual.json`. The goal is a page that is clearly more useful
than the Know Your Meme entry for someone who wants to *make* this meme.

```json
{
  "about": "What the image shows and what the joke means (350–900 chars).",
  "origin": "Where it comes from, only facts you are sure of (60–600 chars, optional).",
  "usage": "How to fill the text boxes and what makes it land (250–1100 chars; blank line = new paragraph).",
  "ideas": [["top text", "bottom text"], ["…", "…"]],
  "aka": ["Other names people search for"],
  "tags": ["topics", "for", "related", "searches"]
}
```

## Rules

- **Your own words.** Don't paraphrase Know Your Meme sentence by sentence.
  `npm run check:content` rejects any 7-word run copied from
  `data/descriptions.json` and any 8-word phrase reused across more than three
  templates (boilerplate).
- **Specific, not generic.** Describe what is actually in the image (who, the
  expression, the setting) and the exact joke. A sentence that could sit on any
  other template page ("this versatile meme can be used in many situations")
  adds nothing; cut it.
- **Facts you are sure of.** Name the show, film, game or person and the rough
  year when you know them. If you aren't sure of a detail (an exact date, who
  posted it first), leave it out instead of guessing. Use `data/descriptions.json`
  and the template's `source` page as a fact reference only. `origin` may be
  omitted when nothing reliable is known.
- **`usage` is practical.** Say what goes in each text box (match the number of
  boxes in `assets/templates/<id>/config.yml`), the kind of situation it suits,
  and what makes it funny: contrast, escalation, the punchline position.
- **`ideas` are real captions**: 4–8 of them, each with exactly one string
  per text box (`""` for a box that stays empty), each line short enough to read
  on a phone. Vary the topics (work, school, gaming, sports, relationships,
  internet culture). Nothing hateful, sexual or about real private people.
- **`aka` and `tags`**: keep the useful ones from the existing entry, add the
  names people actually search for. Lowercase tags, no hashtags or usernames.
- Plain text everywhere: no Markdown, no HTML, straight or curly quotes are both fine.

`data/content/potential-megumi.json` is the reference example.
