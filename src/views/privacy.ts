/** The privacy page. Keep it in step with what the site really collects (analytics events, logs, caches). */
import type { AppContext } from "../context";
import { assetVersion } from "../pages/assets";
import { escapeHtml, layout, siteName } from "../pages/html";
import { html } from "../response";

const UPDATED = "2026-09-19";

export async function page(app: AppContext): Promise<Response> {
  const { settings } = app;
  const site = escapeHtml(siteName(settings));
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  const cacheHours = Math.ceil(settings.CACHE_TTL / 3600);
  const hours = `${cacheHours} ${cacheHours === 1 ? "hour" : "hours"}`;
  const proxyCache = cacheHours ? ` The fetched image may stay in a cache for up to ${hours}.` : " We do not keep the fetched image.";
  const apiCache = cacheHours
    ? `Rendered images and downloaded custom images stay in Cloudflare's cache for up to ${hours}, then expire. We keep no other copy.`
    : "We do not keep the rendered images or the downloaded custom images.";
  const issues = settings.REPO_URL ? `${settings.REPO_URL.replace(/\/$/, "")}/issues` : "";

  const analytics = settings.GA_MEASUREMENT_ID
    ? `<p>We use Google Analytics to count visits and to learn which features get used. Google sets cookies for this and receives standard data such as your IP address, browser, device, and the pages you open. Besides page views, we record these events:</p>
  <ul>
    <li>A search on the home page, with the search words and the number of results.</li>
    <li>An export from the editor, with the template ID and the method (download, copy, or share link). The meme itself is not sent.</li>
    <li>The “Install” prompt: whether it was accepted, and whether the app was installed.</li>
  </ul>
  <p>We use no advertising features and we do not sell or share this data. To opt out, block analytics in your browser or install <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">Google's opt-out add-on</a>. The site works the same without it. See <a href="https://policies.google.com/privacy" rel="noopener">Google's privacy policy</a> for how Google handles the data.</p>`
    : `<p>This site does not use analytics.</p>`;

  const body = `<article class="guide">
  <section class="hero">
    <h1>Privacy</h1>
    <p class="lede">${site} has no accounts, no ads, and no tracking beyond basic analytics. <strong>Memes you make in the editor stay in your browser.</strong></p>
  </section>

  <h2 id="editor">The editor</h2>
  <p>The editor runs in your browser. The text you type and the images you upload are not sent to our server, and the finished meme is created on your device when you download or copy it.</p>
  <p>Two features do contact the server:</p>
  <ul>
    <li><strong>Image URL.</strong> When you add an image by URL, our server fetches that image for you so the editor can use it.${proxyCache}</li>
    <li><strong>Share link.</strong> A share link stores your text in the part of the URL after the <code>#</code>. Browsers do not send that part to servers, so only the people you give the link to can read it.</li>
  </ul>

  <h2 id="api">The meme API</h2>
  <p>With the API, the meme's text is part of the image URL, and any custom image is given as a URL. Our server has to read both to draw the image. ${apiCache} Anyone who has an image URL can open it, so do not put private information in meme text.</p>

  <h2 id="analytics">Analytics</h2>
  ${analytics}

  <h2 id="logs">Server logs</h2>
  <p>The site runs on Cloudflare Workers. Cloudflare processes every request, which includes your IP address, and we keep short-lived request logs (URL, status, and errors) to find bugs and stop abuse. We do not use these logs to identify people. See <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</p>

  <h2 id="storage">Stored in your browser</h2>
  <ul>
    <li>If you dismiss the “Install” banner, the browser remembers that for 14 days.</li>
    <li>Pages, templates, and recent memes are cached on your device so the site loads fast and works offline. Clearing the site data in your browser removes all of it.</li>
  </ul>

  <h2 id="contact">Questions</h2>
  <p>${issues ? `Open an issue on <a href="${escapeHtml(issues)}" rel="noopener">GitHub</a>. The code is open source, so you can check every statement on this page.` : "Contact the operator of this site."}</p>
  <p class="muted">Last updated <time datetime="${UPDATED}">${UPDATED}</time>.</p>
</article>`;

  const response = html(
    layout(
      settings,
      {
        title: `Privacy | ${siteName(settings)}`,
        description: `What ${siteName(settings)} collects: memes made in the editor stay in your browser, API images are cached for a short time, and analytics are basic.`,
        canonical: settings.BASE_URL + "/privacy",
        assetVersion: version,
      },
      body,
    ),
  );
  response.headers.set("cache-control", settings.DEPLOYED ? "public, max-age=600, s-maxage=3600" : "no-cache");
  return response;
}
