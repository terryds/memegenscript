/**
 * Port of `app/utils/meta.py`: API-key authentication, URL tokenization,
 * watermark rules, request tracking, and search — all backed by the optional
 * `REMOTE_TRACKING_URL` service. Without it, behavior matches the Python app
 * with the variable unset.
 */
import type { AppContext } from "../context";
import { ALLOWED_WATERMARKS, DEFAULT_WATERMARK, DISABLED_WATERMARK } from "../settings";
import { fetchJson } from "./http";
import { clean } from "./urls";

// Process-level counters, mirroring the module state in Python (per isolate here).
const state = {
  trackRequests: true,
  remoteTrackingErrors: 0,
};

interface CacheEntry<T> {
  expires: number;
  value: Promise<T>;
}
const memo = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memo.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  if (memo.size > 1000) memo.clear();
  const value = compute();
  memo.set(key, { expires: now + ttlSeconds * 1000, value });
  return value;
}

function cacheTtl(app: AppContext): number {
  return app.settings.DEPLOYED ? 60 * 15 : 5;
}

function getApiKey(app: AppContext): string {
  return app.request.headers.get("x-api-key") || app.params.get("api_key") || "";
}

function getReferer(app: AppContext): string {
  return app.request.headers.get("referer") || app.params.get("referer") || "";
}

export async function authenticate(app: AppContext): Promise<Record<string, unknown>> {
  const api = app.settings.REMOTE_TRACKING_URL ? app.settings.REMOTE_TRACKING_URL + "auth" : "";
  if (!api) return {};

  const apiKey = getApiKey(app);
  if (!apiKey) return {};

  const key = `auth|${apiKey}`;
  return cached(key, cacheTtl(app), async () => {
    const mask = apiKey.slice(0, 2) + "***" + apiKey.slice(-2);
    console.info(`Authenticating with API key: ${mask}`);
    const [status, data] = await fetchJson(api, { headers: { "X-API-KEY": apiKey } });
    if (status >= 500) {
      state.remoteTrackingErrors += 1;
      return {};
    }
    return typeof data === "object" && data ? (data as Record<string, unknown>) : {};
  });
}

export async function tokenize(app: AppContext, url: string): Promise<[string, boolean]> {
  const apiKey = getApiKey(app);
  const token = app.params.get("token");
  const defaultUrl = url
    .replace(`api_key=${apiKey}`, "")
    .replace("?&", "?")
    .replace(/^[?&]+|[?&]+$/g, "");

  if (
    apiKey === "myapikey42" &&
    !url.startsWith("https://api.memegen.link/images/puffin/custom_watermark/sample_image.png")
  ) {
    console.warn(`Example API key used to tokenize: ${url}`);
    return [defaultUrl, true];
  }

  const api = app.settings.REMOTE_TRACKING_URL ? app.settings.REMOTE_TRACKING_URL + "tokenize" : "";
  if (!api) return [url, false];

  if (apiKey || token) {
    return cached(`tokenize|${apiKey}|${token}|${url}`, cacheTtl(app), async () => {
      const body = new URLSearchParams({ url: defaultUrl });
      const [status, data] = await fetchJson(api, {
        method: "POST",
        body,
        headers: { "X-API-KEY": apiKey },
      });
      if (status >= 500 || typeof data !== "object" || !data) {
        state.remoteTrackingErrors += 1;
        return [defaultUrl, false] as [string, boolean];
      }
      const result = String((data as { url?: string }).url ?? url);
      return [result, result !== url] as [string, boolean];
    });
  }

  return [url, false];
}

export async function customWatermarksAllowed(app: AppContext): Promise<boolean> {
  const info = await authenticate(app);
  if (info.image_access) return true;

  const token = app.params.get("token");
  if (token) {
    console.info(`Authenticating with token: ${token}`);
    const [, updated] = await tokenize(app, app.request.url);
    return !updated;
  }
  return false;
}

export async function getWatermark(app: AppContext): Promise<[string, boolean]> {
  const watermark = app.params.get("watermark") ?? "";

  if (await customWatermarksAllowed(app)) {
    if (watermark === DISABLED_WATERMARK) return ["", false];
    return [watermark, false];
  }

  if (watermark) {
    if (watermark === DEFAULT_WATERMARK) {
      console.warn(`Redundant watermark: ${watermark}`);
      return [DEFAULT_WATERMARK, true];
    }
    if (ALLOWED_WATERMARKS.includes(watermark)) return [watermark, false];
    console.warn(`Invalid watermark: ${watermark}`);
    return [DEFAULT_WATERMARK, true];
  }

  return [DEFAULT_WATERMARK, false];
}

export async function track(app: AppContext, lines: string[]): Promise<void> {
  const api = state.trackRequests && app.settings.REMOTE_TRACKING_URL ? app.settings.REMOTE_TRACKING_URL : "";
  if (!api) return;

  const text = lines.join(" ").trim();
  if (text.length < 4) return;
  const referer = getReferer(app) || app.settings.BASE_URL;
  if (app.settings.REMOTE_TRACKING_URL.includes(referer)) return;
  if (["height", "width", "watermark", "token"].some((name) => app.params.has(name))) return;

  const query = new URLSearchParams({ text, referer, result: clean(app.request.url) });
  console.info(`Tracking request: ${query.toString()}`);
  const [status, message] = await fetchJson(`${api}?${query}`, { headers: { "X-API-KEY": getApiKey(app) } });
  if (status !== 200) console.error(`Tracker response ${status}: ${JSON.stringify(message)}`);
  if (status >= 404 && ![414, 421, 520].includes(status)) state.remoteTrackingErrors += 1;

  if (state.remoteTrackingErrors) {
    console.info(`Tracker error count: ${state.remoteTrackingErrors}`);
    if (state.remoteTrackingErrors >= app.settings.REMOTE_TRACKING_ERRORS_LIMIT) {
      state.trackRequests = false;
      console.warn(`Disabled tracking after ${app.settings.REMOTE_TRACKING_ERRORS_LIMIT}+ errors`);
    }
  }
}

export interface SearchResult {
  image_url: string;
  generator?: string;
  confidence?: number;
}

export async function search(app: AppContext, text: string, safe: boolean, mode = ""): Promise<SearchResult[]> {
  const api = app.settings.REMOTE_TRACKING_URL ? app.settings.REMOTE_TRACKING_URL + mode : "";
  if (!api) return [];

  const query = new URLSearchParams({
    text,
    nsfw: safe ? "0" : "1",
    referer: getReferer(app) || app.settings.BASE_URL,
    count: mode ? "5" : "1",
  });
  console.info(`Searching for results: ${JSON.stringify(text)} (safe=${safe})`);
  const [status, data] = await fetchJson(`${api}?${query}`, { headers: { "X-API-KEY": getApiKey(app) } });
  if (status >= 500) {
    state.remoteTrackingErrors += 1;
    return [];
  }
  if (status === 200 && Array.isArray(data)) return data as SearchResult[];
  console.error(`Search response: ${JSON.stringify(data)}`);
  return [];
}

/** Test hook: reset module state. */
export function resetTrackingState(): void {
  state.trackRequests = true;
  state.remoteTrackingErrors = 0;
  memo.clear();
}
