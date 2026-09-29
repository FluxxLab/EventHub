/**
 * The only place the browser reads configuration. Everything here is public by definition
 * (`NEXT_PUBLIC_*` is inlined into the bundle), so no secret may ever live behind that prefix.
 */
const raw = process.env.NEXT_PUBLIC_API_URL;

if (!raw && process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
  // A production build without an API URL would silently talk to localhost; fail loudly instead.
  throw new Error('NEXT_PUBLIC_API_URL must be set for a production build.');
}

/** The PIC Events API, including the version prefix, e.g. `https://api.pic.org.ng/api/v1`. */
export const API_URL = (raw ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');

/*
 * The public event page (`app/e/[id]`): what a shared event link from the delegate app opens.
 */

/**
 * This site's own origin, e.g. `https://events.pic.org.ng`: makes link previews (Open Graph) use
 * absolute URLs. Unset, previews still carry the title, description and cover, but no page URL and
 * no logo fallback image.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || null;

// TODO(store listing): set these (or the env vars) once the app is published; until then the page
// says "coming soon" instead of linking to a store page that does not exist.
/** The delegate app's App Store page. */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || null;
/** The delegate app's Google Play page. */
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL || null;
