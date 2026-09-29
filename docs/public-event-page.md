# Public event page (`/e/<id>`)

The delegate app's **Share** button sends a web link when `EXPO_PUBLIC_WEB_URL` is set in the
app's environment. That link opens this site's public page, so people without the app (or
without an account) still see the event, and chat apps show a proper preview card.

| | |
| --- | --- |
| URL | `<this site>/e/<edition id>`, e.g. `https://events.pic.org.ng/e/0b6f7c1e-…` |
| Built by | the app's `eventLink()` in `src/lib/event-cta.ts` (`${EXPO_PUBLIC_WEB_URL}/e/${id}`) |
| Code | `app/e/[id]/page.tsx`, `app/e/[id]/not-found.tsx`, `components/public-event/`, `lib/public-event/` |
| Data | `GET /editions/:id/public` (no token; `@Public()` in the API) |
| Sign-in | none: the route sits outside the `(console)` group and its session guard |
| Caching | the API answer is cached by Next for 60 s (`next.revalidate`), so a link going round a WhatsApp group costs one API call a minute, and console edits show within a minute |

`/e/` rather than `/events/` because the console already owns `/events`.

## What it shows

Cover (the edition's uploaded cover, or the PIC mark on navy), status (Upcoming / Happening now /
Ended), name, dates in Lagos time, venue and city, street address, "Tickets from ₦…" / "Free to
attend" / "Registration closed", the organiser's description, then **Open in the PIC Events app**
(`picevents://events/<id>`) and App Store / Google Play links.

- **Draft or unknown edition, or a malformed id:** the API answers 404 and the page is a real 404
  ("We couldn't find this event"), `noindex`.
- **API down, slow (5 s timeout) or answering something unexpected:** the page still renders, says
  the details are temporarily unavailable, and keeps the Open-in-app button and store links.
  `noindex`.

Link previews (Open Graph + Twitter card): title = edition name, description = "dates · venue,
city. First 160 characters of the description", image = the cover (large card) or the PIC logo.

## Environment variables

| Variable | Needed | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes (production) | The API, e.g. `https://api.pic.org.ng/api/v1`. Same variable the console uses; a production build fails without it (unless demo mode). |
| `NEXT_PUBLIC_SITE_URL` | recommended | This site's origin, e.g. `https://events.pic.org.ng`. Gives previews an absolute page URL (`og:url`, canonical) and lets the PIC logo stand in as the preview image when an edition has no cover. |
| `NEXT_PUBLIC_APP_STORE_URL` | when listed | The app's App Store page. Unset: the page shows "Coming soon to the App Store". |
| `NEXT_PUBLIC_PLAY_STORE_URL` | when listed | The app's Google Play page. Unset: "Coming soon to Google Play". |

In the **mobile app**, set `EXPO_PUBLIC_WEB_URL` to the same origin as `NEXT_PUBLIC_SITE_URL`
(no trailing slash). Until it is set, shares carry `picevents://events/<id>`, which only opens for
people who already have the app.

Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) has no API, so the public page shows its "temporarily
unavailable" state there.

## Known limits

- **Cover URLs in previews expire.** Covers stored in our bucket are served as signed URLs (valid
  for roughly 45 minutes to 1 h 45 min). Most chat apps fetch and keep the preview image when the
  link is first posted, so this rarely shows; a preview re-fetched hours later from a cached page
  can lose its image. Fix if it matters: an image route on this site that redirects to a freshly
  signed URL, or a public CDN path for covers only.
- The API's anonymous rate limit applies per IP; the Next server fetches with its own IP, and the
  60 s cache keeps that far below the limit.

## Opening the app straight from the link (universal links / app links)

Today the web page is the landing spot and the button hands over to the app by its URL scheme.
To have `https://<site>/e/<id>` open the app directly when it is installed, both platforms need a
verification file on this site **and** a matching entry in the app. Do not add these files with
placeholder values: a wrong file is cached by iOS and silently disables the feature.

1. **Serve the files** from `public/.well-known/` (Next serves `public/` as-is; both must be JSON
   over HTTPS with no redirect):
   - `apple-app-site-association` (no extension, `Content-Type: application/json`):
     ```json
     { "applinks": { "details": [ { "appIDs": ["<TEAM_ID>.<ios.bundleIdentifier>"], "components": [ { "/": "/e/*" } ] } ] } }
     ```
     `TEAM_ID` is the Apple Developer team id; the bundle id is the app's `ios.bundleIdentifier`.
   - `assetlinks.json`:
     ```json
     [ { "relation": ["delegate_permission/common.handle_all_urls"],
         "target": { "namespace": "android_app", "package_name": "<android.package>",
                     "sha256_cert_fingerprints": ["<Play app signing SHA-256>"] } } ]
     ```
     Take the fingerprint from Play Console → App integrity → App signing (not the upload key),
     or `eas credentials` for EAS-managed keys.
   If headers need forcing, add a `headers()` entry in `next.config.ts` for
   `/.well-known/apple-app-site-association` with `Content-Type: application/json`.
2. **In the app's `app.json`** (neither `ios.bundleIdentifier` nor `android.package` is set yet;
   they are needed for store builds anyway): `ios.associatedDomains: ["applinks:<site host>"]`
   and an `android.intentFilters` entry with `autoVerify: true`, scheme `https`, host `<site host>`,
   `pathPrefix: "/e/"`. Then a new native build (not an OTA update).
3. **Map the path in the app.** The app's route is `events/[id]`, not `e/[id]`; add
   `src/app/+native-intent.tsx` with `redirectSystemPath` rewriting `/e/<id>` to `/events/<id>`
   (see the Expo Router "native intent" docs for SDK 57).

Until then nothing breaks: the link opens this page, and the button opens the app.

## Edition cover endpoints (for the console's cover upload, UI pending designs)

The cover shown here, on the app's event cards and in link previews is per edition. Admin only
(`AccessTier.ADMIN`); same presigned-upload pattern as delegate avatars:

1. `POST /editions/:id/cover-upload` with `{ "contentType": "image/jpeg" | "image/png" | "image/webp" | "image/heic" }`
   → `200 { uploadUrl, key }` (`key` is `edition-covers/<uuid>`; 503 when uploads are not configured).
2. `PUT <uploadUrl>` with the file and the same `Content-Type` header (straight to S3, 5 minutes to start).
3. `PUT /editions/:id/cover` with `{ "coverImage": "<key>" }` (or an `https://` URL for artwork
   hosted elsewhere) → `200 { coverImage, coverUrl }`. The previous uploaded cover object is deleted.
4. `DELETE /editions/:id/cover` → `204`; the app falls back to its shared artwork.

`PATCH /editions/:id` still accepts `coverImage` as before. Reads return `coverUrl` (signed) on
`/editions/home`, `/browse`, `/:id/card` and `/:id/public`.
