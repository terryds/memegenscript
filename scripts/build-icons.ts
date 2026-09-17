/** Render the PWA icons (meme-caption "M" on purple) to PNG with resvg. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUT = join(ROOT, "assets", "static", "icons");

await initWasm(readFileSync(join(ROOT, "node_modules/@resvg/resvg-wasm/index_bg.wasm")));
const impact = readFileSync(join(ROOT, "assets/fonts/Impact.ttf"));

function svg(size: number, { maskable = false } = {}): string {
  const pad = maskable ? size * 0.12 : 0;
  const radius = maskable ? 0 : size * 0.2;
  const fontSize = size * (maskable ? 0.56 : 0.7);
  const stroke = size * 0.035;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2450"/><stop offset="1" stop-color="#0d0b1a"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <rect x="${size * 0.06}" y="${size * 0.06}" width="${size * 0.88}" height="${size * 0.88}" rx="${size * 0.16}" fill="none" stroke="#ffd60a" stroke-width="${size * 0.03}" opacity="${maskable ? 0 : 1}"/>
  <text x="${size / 2}" y="${size / 2 + fontSize * 0.36}" text-anchor="middle" font-family="Impact" font-size="${fontSize}" fill="#ffffff" stroke="#0a0814" stroke-width="${stroke}" paint-order="stroke" stroke-linejoin="round">M</text>
  <circle cx="${size * 0.74}" cy="${size * 0.28 + pad * 0.3}" r="${size * 0.07}" fill="#ff3d8f" stroke="#0a0814" stroke-width="${stroke * 0.6}"/>
</svg>`;
}

const targets: Array<[string, number, boolean]> = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];
for (const [name, size, maskable] of targets) {
  const resvg = new Resvg(svg(size, { maskable }), { fitTo: { mode: "original" }, font: { fontBuffers: [impact], defaultFontFamily: "Impact" } });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT, name), png);
  console.log(`${name}: ${png.length} bytes`);
}
