/**
 * The contact page. The address is never written into the HTML as plain text: it is
 * ROT13-scrambled in a data attribute and turned into a mailto link by contact.js, so
 * address harvesters that read the markup (or the rendered text) come away with nothing
 * usable. Without JavaScript the page shows the address reversed, which browsers flip
 * back with CSS but scrapers read backwards.
 */
import type { AppContext } from "../context";
import { assetVersion } from "../pages/assets";
import { escapeHtml, layout, notFoundPage, siteName, templateRequestLinks } from "../pages/html";
import { html } from "../response";

/** a→n, n→a: enough to keep the address out of the markup, reversed by the same function. */
export function rot13(value: string): string {
  return value.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export async function page(app: AppContext): Promise<Response> {
  const { settings } = app;
  const site = escapeHtml(siteName(settings));
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  if (!settings.CONTACT_EMAIL) {
    return html(notFoundPage(settings, "There is no contact page on this site.", version), 404);
  }

  const scrambled = escapeHtml(rot13(settings.CONTACT_EMAIL));
  const reversed = escapeHtml([...settings.CONTACT_EMAIL].reverse().join(""));
  const request = templateRequestLinks(settings);
  const issues = settings.REPO_URL ? `${settings.REPO_URL.replace(/\/$/, "")}/issues` : "";

  const body = `<article class="guide">
  <section class="hero">
    <h1>Contact</h1>
    <p class="lede">Questions, bug reports, takedown requests, or just want to say the site is good? Write to us.</p>
  </section>

  <div class="contact-card" data-contact="${scrambled}">
    <p class="contact-label">Email</p>
    <p class="contact-email">
      <a class="contact-link" href="#" hidden>Loading…</a>
      <span class="contact-reversed">${reversed}</span>
    </p>
    <p class="actions">
      <a class="button primary contact-mailto" href="#" hidden>Open in mail app</a>
      <button type="button" class="secondary contact-copy" hidden>Copy address</button>
    </p>
    <p class="hint contact-hint" aria-live="polite"></p>
  </div>

  <h2 id="faster">Some things have a faster route</h2>
  <ul>
    ${request.form ? `<li><strong>Missing a meme?</strong> <a href="${escapeHtml(request.form)}" rel="noopener" target="_blank">Request a template</a> instead: those go straight into the queue.</li>` : ""}
    ${issues ? `<li><strong>Found a bug, or want a feature?</strong> <a href="${escapeHtml(issues)}" rel="noopener">Open an issue on GitHub</a>, where it can be tracked in the open.</li>` : ""}
    <li><strong>Wondering what we collect?</strong> The <a href="/privacy">privacy page</a> answers most of it.</li>
  </ul>

  <h2 id="takedown">Rights holders</h2>
  <p>${site} hosts meme templates that are widely circulated online, and each template page links its source. If you hold the rights to an image and want it removed, email us with a link to the template page and we will take it down.</p>
</article>`;

  const response = html(
    layout(
      settings,
      {
        title: `Contact | ${siteName(settings)}`,
        description: `How to reach ${siteName(settings)}: email for questions, bug reports and takedown requests, or use the template request form.`,
        canonical: settings.BASE_URL + "/contact",
        scripts: ["contact.js"],
        assetVersion: version,
      },
      body,
    ),
  );
  response.headers.set("cache-control", settings.DEPLOYED ? "public, max-age=600, s-maxage=3600" : "no-cache");
  return response;
}
