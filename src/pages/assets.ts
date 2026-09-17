/**
 * Cache-busting for the static assets: the URL carries a hash of the files'
 * contents, so browsers can cache them as immutable and still pick up changes.
 */
import { sha1Hex } from "../utils/sha1";

const FILES = ["site.css", "editor.js", "index.js", "pwa.js", "sw.js"];

let cached: Promise<string> | null = null;

async function compute(assets: Fetcher): Promise<string> {
  const contents = await Promise.all(
    FILES.map(async (file) => {
      const response = await assets.fetch(new Request(`https://assets.local/static/${file}`));
      return response.ok ? response.text() : "";
    }),
  );
  return sha1Hex(contents.join("\n--\n")).slice(0, 12);
}

/** Content hash of the static assets (memoized per isolate when deployed). */
export function assetVersion(assets: Fetcher, { memoize = true } = {}): Promise<string> {
  if (!memoize) return compute(assets);
  cached ??= compute(assets).catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}
