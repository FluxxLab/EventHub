This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Public event page

Besides the organiser console, this site serves one public, no-login page: **`/e/<edition id>`**,
which the delegate app's Share button links to (when the app's `EXPO_PUBLIC_WEB_URL` points here).
It shows the event (cover, dates, venue, tickets-from price, description) with link previews for
WhatsApp/Slack/X, an "Open in the app" button (`picevents://events/<id>`) and store links.

Env: `NEXT_PUBLIC_API_URL` (required), `NEXT_PUBLIC_SITE_URL` (this site's origin, for absolute
preview URLs), `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` (until set, "coming
soon"). Details, failure behaviour and the universal-link / app-link setup:
[docs/public-event-page.md](docs/public-event-page.md).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3100](http://localhost:3100) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
