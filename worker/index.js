/**
 * The console is static files (Next.js `output: "export"` in out/), served by Cloudflare's static
 * assets. This Worker runs only for shared event links, `/e/<edition id>` (wrangler.jsonc,
 * run_worker_first): it serves the event page and writes the event's name, date, place and cover
 * into its link-preview tags, so a link shared in WhatsApp unfurls with the event. The page itself
 * loads the details in the browser. Every other path is served straight from the static files.
 *
 * NEXT_PUBLIC_API_URL is the API with its version prefix, set in the Worker's variables.
 */

const TIME_ZONE = 'Africa/Lagos';

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/e\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) return env.ASSETS.fetch(request);

    const id = safeDecode(match[1]);
    const page = await env.ASSETS.fetch(new Request(new URL('/e', url), request));
    const event = id ? await publicEvent(env, id) : null;
    if (!event) return page;

    const title = `${event.name} · PIC Events`;
    const description = [dateText(event.startsAt), [event.venue, event.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    const image = event.coverUrl || `${url.origin}/pic-logo.png`;
    const tags = [
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'PIC Events'],
      ['property', 'og:title', event.name],
      ['property', 'og:description', description],
      ['property', 'og:url', `${url.origin}/e/${encodeURIComponent(event.id)}`],
      ['property', 'og:image', image],
      ['name', 'twitter:card', event.coverUrl ? 'summary_large_image' : 'summary'],
      ['name', 'twitter:title', event.name],
      ['name', 'twitter:description', description],
      ['name', 'twitter:image', image],
      ['name', 'description', description],
    ]
      .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}">`)
      .join('');

    return new HTMLRewriter()
      .on('title', { element: (el) => void el.setInnerContent(title) })
      .on('meta[name="description"]', { element: (el) => void el.remove() })
      .on('head', { element: (el) => void el.append(tags, { html: true }) })
      .transform(page);
  },
};

export default worker;

/** The edition's public summary, cached at the edge for a minute; null when missing or the API is down. */
async function publicEvent(env, id) {
  const api = (env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (!api) return null;
  try {
    const response = await fetch(`${api}/editions/${encodeURIComponent(id)}/public`, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 60, cacheEverything: true },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const event = await response.json();
    return event && typeof event.name === 'string' ? event : null;
  } catch {
    return null;
  }
}

function dateText(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
