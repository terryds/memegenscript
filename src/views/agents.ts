/** The guide for AI agents: `/agents` (HTML), `/llms.txt` and `/agents.md` (markdown). */
import type { AppContext } from "../context";
import { agentGuideMarkdown, renderGuideHtml } from "../docs/agents";
import { Template } from "../models/template";
import { assetVersion } from "../pages/assets";
import { layout, siteName } from "../pages/html";
import { html } from "../response";

function cacheControl(app: AppContext): string {
  return app.settings.DEPLOYED ? "public, max-age=600, s-maxage=3600" : "no-cache";
}

function guide(app: AppContext): string {
  return agentGuideMarkdown(app.settings, Template.filterValid().length);
}

export async function markdown(app: AppContext): Promise<Response> {
  return new Response(guide(app), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": cacheControl(app) },
  });
}

export async function page(app: AppContext): Promise<Response> {
  const { settings } = app;
  const site = siteName(settings);
  const version = await assetVersion(app.env.ASSETS, { memoize: settings.DEPLOYED });
  const title = `Meme API for AI Agents | ${site}`;
  const description = `How AI agents make memes with ${site}: search templates by description, send one request, get an image URL. Free, no API key.`;
  const body = `<article class="guide">
  <section class="hero">
    <span class="badge">free · no API key · llms.txt</span>
    <h1>Memes for AI agents</h1>
    <p class="lede">Every meme is a URL, so an agent that can send one request can make one. Point your agent at <a href="/llms.txt">/llms.txt</a>, or paste the <a href="#instructions-to-give-your-agent">ready-made instructions</a> into its prompt.</p>
  </section>
  ${renderGuideHtml(guide(app)).replace(/^<p class="lede">.*\n/, "")}
</article>`;
  const response = html(
    layout(
      settings,
      {
        title,
        description,
        canonical: settings.BASE_URL + "/agents",
        type: "article",
        head: `<link rel="alternate" type="text/markdown" href="/llms.txt">`,
        structuredData: [{ "@context": "https://schema.org", "@type": "TechArticle", headline: title, description, url: settings.BASE_URL + "/agents" }],
        assetVersion: version,
      },
      body,
    ),
  );
  response.headers.set("cache-control", cacheControl(app));
  return response;
}
