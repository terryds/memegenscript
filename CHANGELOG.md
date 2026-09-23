# Changelog

## Unreleased

- Meme characters: 51 classic characters (Doge, Wojak, Pepe, Trollface, Gigachad, …) as
  transparent PNG cutouts at `/meme-characters`, downloadable from each character's page
  and served by the API at `GET /characters`, `GET /characters/{id}` and
  `GET /characters/{id}.png?width=`. Template pages link to the characters they contain.
- Guide for AI agents at `/agents`, with the raw markdown at `/llms.txt`.
- `GET /templates?q=` searches names, aliases, tags and descriptions, and returns the
  description with each match. `robots.txt` no longer blocks the API paths; JSON responses
  send `X-Robots-Tag: noindex` instead.
- Privacy page at `/privacy`. Analytics no longer receive the URL hash, where share links
  keep the meme text.
- The library has grown from 209 to more than 450 templates.

## 1.0.0

First public release.

- Meme API compatible with the memegen.link URL scheme (templates, fonts, styles,
  overlays, custom backgrounds, animated GIF/WebP, previews, Swagger docs).
- In-browser canvas editor for every template: draggable, individually styled text
  boxes, image layers, custom backgrounds, undo/redo, PNG/JPG export, share links.
- Server-rendered, SEO-friendly pages: descriptions, aliases and tags for every
  template, full-text search, featured memes, sitemap and robots.
- Runs on Cloudflare Workers with static assets; no origin server.
