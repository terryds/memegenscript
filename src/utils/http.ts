/** Port of `app/utils/http.py`: outbound HTTP with the same failure semantics. */

const TIMEOUT_MS = 10_000;

export async function fetchJson(url: string, init: RequestInit = {}): Promise<[number, unknown]> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await response.text();
    try {
      return [response.status, JSON.parse(text)];
    } catch {
      return [response.status, text];
    }
  } catch (error) {
    const message = (error instanceof Error && error.message) || String(error);
    return [500, message.replace(/^[() ]+|[() ]+$/g, "") || (error as Error)?.constructor?.name || "Error"];
  }
}

export interface Downloaded {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Download an image URL. Mirrors `utils.http.download`: 3xx responses from
 * imgur are treated as errors (they redirect to a "removed" placeholder), and
 * anything but a 200 fails. Results are cached with the Cache API.
 */
export async function download(url: string, cacheTtl = 86400): Promise<Downloaded | null> {
  if (!/^https?:\/\//i.test(url)) {
    console.error(`Invalid URL: ${url}`);
    return null;
  }

  let cache: Cache | null = null;
  const cacheKey = new Request(url, { method: "GET" });
  try {
    cache = (caches as unknown as { default: Cache }).default ?? null;
    const cached = cache ? await cache.match(cacheKey) : undefined;
    if (cached) {
      console.info(`Found cached download for ${url}`);
      return {
        bytes: new Uint8Array(await cached.arrayBuffer()),
        contentType: cached.headers.get("content-type") ?? "",
      };
    }
  } catch {
    cache = null;
  }

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "image/*,*/*;q=0.8" },
    });
    if (response.redirected) {
      if (url.includes("imgur")) {
        console.error(`3xx response from ${url}`);
        return null;
      }
      console.warn(`3xx redirect from ${url}`);
    }
    if (response.status === 200) {
      console.info(`200 response from ${url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "";
      if (cache && cacheTtl > 0) {
        const stored = new Response(bytes, {
          headers: { "content-type": contentType, "cache-control": `public, max-age=${cacheTtl}` },
        });
        await cache.put(cacheKey, stored);
      }
      return { bytes, contentType };
    }
    console.error(`${response.status} response from ${url}`);
  } catch (error) {
    const message = (error instanceof Error && error.message) || String(error);
    console.error(`5xx response from ${url}: ${message}`);
  }
  return null;
}
