/** Port of `app/utils/urls.py` plus the URL-building helpers `url_for` provided. */
import { unquote } from "./text";

export const FLAGS: Record<string, boolean> = {
  "0": false,
  "1": true,
  false: false,
  no: false,
  true: true,
  yes: true,
};

/** Is this URL pointing at this service (or the canonical memegen.link)? */
export function isSelf(url: URL, host?: string): boolean {
  const netloc = url.host;
  if (!netloc) return false;
  if (netloc.includes("memegen.link") || netloc.includes("localhost")) return true;
  return Boolean(host && netloc === host);
}

export function schema(value: unknown): value is string {
  return typeof value === "string" && value.includes("://");
}

/** Return the first non-null value among `names` in `data`, else `fallback`. */
export function arg<T>(data: Record<string, unknown> | URLSearchParams, fallback: T, ...names: string[]): T | string {
  for (const name of names) {
    const value = data instanceof URLSearchParams ? data.get(name) : data[name];
    if (value !== null && value !== undefined) return value as T | string;
  }
  return fallback;
}

export function flag(params: URLSearchParams, name: string, fallback: boolean | null = null): boolean | null {
  const value = (params.get(name) ?? "").toLowerCase();
  return value in FLAGS ? FLAGS[value] : fallback;
}

export function add(url: string, params: Record<string, string>): string {
  const joiner = url.includes("?") ? "&" : "?";
  return url + joiner + new URLSearchParams(params).toString();
}

export function tryParse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Rewrite an image URL from another host onto this service, keeping `background`. */
export function normalize(url: string, baseUrl: string): string {
  const original = tryParse(url);
  if (!original) return clean(url);
  const normalized = new URL(baseUrl + original.pathname);
  const background = original.searchParams.get("background");
  if (background !== null) {
    normalized.searchParams.set("background", background);
  }
  return clean(normalized.toString());
}

export function params(values: Record<string, string | undefined | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v) out[k] = v;
  }
  return out;
}

export function clean(url: string): string {
  // Replace percent-encoded characters
  if (url.includes("background=")) {
    url = url.split("%3A").join(":").split("%2F").join("/");
  } else {
    url = unquote(url);
  }

  // Replace invalid regex escape sequences
  url = url.split("\\").join("~b");
  url = url.split("\n").join("~n");

  // Replace spaces with underscores
  url = url.split(" ").join("_");

  // Drop trailing blank lines
  url = url.replace(/(?:\/_)+(\.\w+)(?=$|\?)/, "$1");

  url = url.split("::").join(":");

  return url;
}

/**
 * Equivalent of Sanic's `app.url_for(..., **query)`: joins a path with a query
 * string built via `urlencode(doseq=True)` semantics.
 */
export function buildUrl(
  base: string,
  path: string,
  query: Record<string, string | string[] | undefined | null> | URLSearchParams = {},
): string {
  const search = new URLSearchParams();
  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => search.append(key, value));
  } else {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) search.append(key, item);
      } else {
        search.append(key, value);
      }
    }
  }
  const qs = search.toString();
  return base + path + (qs ? "?" + qs : "");
}

/** Query params minus the given keys, preserving repeated values. */
export function without(params: URLSearchParams, ...keys: string[]): URLSearchParams {
  const out = new URLSearchParams();
  params.forEach((value, key) => {
    if (!keys.includes(key)) out.append(key, value);
  });
  return out;
}
