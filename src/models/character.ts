/**
 * Meme characters: transparent PNG cutouts (Doge, Wojak, Pepe, …) that people
 * download or fetch from the API. Metadata comes from the JSON manifest that
 * `scripts/build-characters.ts` compiles from `assets/characters/<id>/config.yml`.
 */
import manifest from "../generated/characters.json";
import type { Settings } from "../settings";
import { Template } from "./template";

export interface CharacterData {
  id: string;
  name: string;
  source: string | null;
  /** Alternate names people know the character by */
  aka: string[];
  keywords: string[];
  /** One or two sentences: who this is and what the character stands for */
  about: string;
  /** IDs of the meme templates the character appears in */
  templates: string[];
  width: number;
  height: number;
}

const MANIFEST = manifest as unknown as Record<string, CharacterData>;

/** Path of the HTML pages; the JSON API lives at `/characters` (see `views/characters.ts`). */
export const CHARACTERS_PATH = "/meme-characters";

export class Character {
  id: string;
  name: string;
  source: string | null;
  aka: string[];
  keywords: string[];
  about: string;
  templateIds: string[];
  width: number;
  height: number;

  constructor(data: CharacterData) {
    this.id = data.id;
    this.name = data.name;
    this.source = data.source;
    this.aka = data.aka;
    this.keywords = data.keywords;
    this.about = data.about;
    this.templateIds = data.templates;
    this.width = data.width;
    this.height = data.height;
  }

  // --- registry -----------------------------------------------------------

  static getOrNull(id: string): Character | null {
    const data = MANIFEST[id];
    return data ? new Character(data) : null;
  }

  static all(): Character[] {
    return Object.keys(MANIFEST)
      .sort()
      .map((id) => new Character(MANIFEST[id]));
  }

  /** Characters that appear in a template, for the editor page's cross-links. */
  static forTemplate(templateId: string): Character[] {
    return Character.all().filter((c) => c.templateIds.includes(templateId));
  }

  // --- properties ---------------------------------------------------------

  /** The templates this character appears in, skipping any that are not browsable. */
  get templates(): Template[] {
    return this.templateIds.map((id) => Template.getOrNull(id)).filter((t): t is Template => t !== null && t.valid && !t.archived);
  }

  /** Path of the cutout in the static assets. */
  get path(): string {
    return `/characters/${this.id}/default.png`;
  }

  /** Everything a person might search by: name, aliases, keywords, description. */
  get searchText(): string {
    return [this.id, this.name, ...this.aka, ...this.keywords, this.about].join(" ").toLowerCase();
  }

  /** Full-text search: every word must appear in `searchText`. */
  matchesText(query: string): boolean {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const haystack = this.searchText;
    return terms.every((term) => haystack.includes(term));
  }

  // --- JSON / URLs --------------------------------------------------------

  toJSON(settings: Settings) {
    return {
      id: this.id,
      name: this.name,
      aliases: this.aka,
      description: this.about,
      keywords: this.keywords,
      width: this.width,
      height: this.height,
      image: this.buildImageUrl(settings),
      templates: this.templates.map((t) => ({ id: t.id, name: t.name, _self: t.buildSelfUrl(settings) })),
      source: this.source,
      page: this.buildPageUrl(settings),
      _self: this.buildSelfUrl(settings),
    };
  }

  buildSelfUrl(settings: Settings): string {
    return `${settings.BASE_URL}/characters/${this.id}`;
  }

  /** The transparent PNG; `?width=` or `?height=` resizes it. */
  buildImageUrl(settings: Settings, { width = 0 } = {}): string {
    const resize = width && width !== this.width ? `?width=${width}` : "";
    return `${settings.BASE_URL}/characters/${this.id}.png${resize}`;
  }

  buildPageUrl(settings: Settings): string {
    return settings.BASE_URL + this.pagePath;
  }

  get pagePath(): string {
    return `${CHARACTERS_PATH}/${this.id}`;
  }
}
