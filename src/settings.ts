/**
 * Port of `app/settings.py`. Static values live here; values that come from the
 * Worker environment are resolved per request via `resolveSettings()`.
 */
import pkg from "../package.json";

export const PLACEHOLDER = "string"; // Swagger UI placeholder value

export const VERSION = pkg.version.replace(/\.0$/, "");

// Fonts

export const DEFAULT_FONT = "thick";
export const MINIMUM_FONT_SIZE = 7;

// Image rendering

export const ALLOWED_EXTENSIONS = new Set(["gif", "jpg", "jpeg", "png", "webp"]);
export const ANIMATED_EXTENSIONS = new Set(["gif", "webp"]);

export const PLACEHOLDER_SUFFIX = ".img";

export const PREVIEW_SIZE: [number, number] = [300, 300];
export const DEFAULT_SIZE: [number, number] = [600, 600];

export const MAXIMUM_PIXELS = 1920 * 1080;
export const MAXIMUM_FRAMES = 20;
export const MINIMUM_FRAMES = 5;

// Watermarks

export const DISABLED_WATERMARK = "none";
export const DEFAULT_WATERMARK = "Memegenscript";
export const ALLOWED_WATERMARKS = [DEFAULT_WATERMARK];

export const WATERMARK_HEIGHT = 20;
export const WATERMARK_ALPHA = 0.65;

export const PREVIEW_TEXT = "PREVIEW";

// Test images

export const TEST_IMAGES: Array<[string, string[], string]> = [
  ["iw", ["tests code", "in production"], "jpg"],
  ["fry", ["a", "b"], "png"],
  ["fry", ["short line", "longer line of text than the short one"], "png"],
  ["fry", ["longer line of text than the short one", "short line"], "png"],
  ["sparta", ["", "this is a wide image!"], "png"],
  [
    "ski",
    [
      "if you try to put a bunch more text than can possibly fit on a meme",
      "you're gonna have a bad time",
    ],
    "png",
  ],
  ["ds", ["Push this button.", "Push that button.", "can't decide which is worse"], "png"],
  ["spongebob", ["You: Stop talking like that", "Me: Stop talking like that"], "png"],
  ["mouth", ["Sales Team presenting solution that won't work", "Excited Customer", "Me"], "png"],
  ["cmm", ["Many\nextra\nlines\nof\ntext"], "png"],
  ["oprah", ["you get animated text", "and you get animated text"], "gif"],
  ["oprah", ["you get animated text", "and you get animated text"], "webp"],
];

// Analytics

export const REMOTE_TRACKING_ERRORS_LIMIT_DEFAULT = 10;

/** Per-request settings derived from the Worker environment. */
export interface Settings {
  DEBUG: boolean;
  /** e.g. `https://api.example.com` (no trailing slash) */
  BASE_URL: string;
  SERVER_NAME: string;
  SCHEME: string;
  RELEASE_STAGE: "local" | "production";
  DEPLOYED: boolean;
  DEFAULT_STATIC_EXTENSION: string;
  DEFAULT_ANIMATED_EXTENSION: string;
  DEFAULT_SUFFIX: string;
  CACHE_TTL: number;
  REMOTE_TRACKING_URL: string;
  REMOTE_TRACKING_ERRORS_LIMIT: number;
  BUGSNAG_API_KEY: string;
  SITE_NAME: string;
  /** Public source repository, linked from the pages ("" hides the link) */
  REPO_URL: string;
}

export interface EnvVars {
  DEBUG?: string;
  DOMAIN?: string;
  DEFAULT_STATIC_EXTENSION?: string;
  DEFAULT_ANIMATED_EXTENSION?: string;
  CACHE_TTL?: string;
  REMOTE_TRACKING_URL?: string;
  REMOTE_TRACKING_ERRORS_LIMIT?: string;
  BUGSNAG_API_KEY?: string;
  SITE_NAME?: string;
  REPO_URL?: string;
}

export function resolveSettings(env: EnvVars, request: Request): Settings {
  const url = new URL(request.url);
  const DEBUG = (env.DEBUG ?? "false").toLowerCase() === "true";

  let SERVER_NAME: string;
  let SCHEME: string;
  if (env.DOMAIN) {
    SERVER_NAME = env.DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    SCHEME = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(SERVER_NAME) ? "http" : "https";
  } else {
    SERVER_NAME = url.host;
    SCHEME = url.protocol.replace(":", "");
  }
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(SERVER_NAME);
  const RELEASE_STAGE = local ? "local" : "production";
  const DEFAULT_STATIC_EXTENSION = env.DEFAULT_STATIC_EXTENSION || "png";

  return {
    DEBUG,
    BASE_URL: `${SCHEME}://${SERVER_NAME}`,
    SERVER_NAME,
    SCHEME,
    RELEASE_STAGE,
    DEPLOYED: RELEASE_STAGE !== "local" && !DEBUG,
    DEFAULT_STATIC_EXTENSION,
    DEFAULT_ANIMATED_EXTENSION: env.DEFAULT_ANIMATED_EXTENSION || "gif",
    DEFAULT_SUFFIX: "." + DEFAULT_STATIC_EXTENSION,
    CACHE_TTL: Number.parseInt(env.CACHE_TTL ?? "86400", 10) || 0,
    REMOTE_TRACKING_URL: env.REMOTE_TRACKING_URL ?? "",
    REMOTE_TRACKING_ERRORS_LIMIT:
      Number.parseInt(env.REMOTE_TRACKING_ERRORS_LIMIT ?? "", 10) || REMOTE_TRACKING_ERRORS_LIMIT_DEFAULT,
    BUGSNAG_API_KEY: env.BUGSNAG_API_KEY ?? "",
    SITE_NAME: env.SITE_NAME || "Memegenscript",
    REPO_URL: env.REPO_URL ?? "https://github.com/terryds/memegenscript",
  };
}
