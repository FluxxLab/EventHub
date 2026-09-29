import type { NextConfig } from "next";

/**
 * The console is published as static files (`out/`), served by Cloudflare's static assets with no
 * Next.js server: every page renders in the browser. The one page that needs server work, a shared
 * event link's preview (`/e/<id>`), is filled in by the small Worker in `worker/index.js`.
 */
const nextConfig: NextConfig = {
  output: "export",
  // no image server in a static export; images are served as uploaded
  images: { unoptimized: true },
  // a check build can write elsewhere (NEXT_DIST_DIR=.next-check): the export then lands there,
  // not in out/, so it is only set when asked for
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
