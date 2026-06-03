// HazardLink dashboard — thin Worker wrapper that adds security headers to
// every response while serving the built React SPA via env.ASSETS.
//
// SPA routing is preserved: not_found_handling = "single-page-application" in
// wrangler.toml means env.ASSETS.fetch() returns /index.html for client-side
// routes (e.g. /devices, /ppms, /alerts/:id) so deep links / refreshes work.
//
// Deliberately NO Content-Security-Policy here: the dashboard loads its Vite
// bundle, talks to the Render API, and reports to Sentry, so a strict CSP would
// need careful allow-listing and risks white-screening the app. We ship the
// safe, non-breaking headers (HSTS, nosniff, frame-options, referrer,
// permissions) and leave CSP to a later, tested pass. Clickjacking is covered
// by X-Frame-Options.
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  "X-XSS-Protection": "1; mode=block",
};

export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
