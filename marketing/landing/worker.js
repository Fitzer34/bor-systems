// HazardLink marketing — thin Worker wrapper around the static landing page.
//
// WHY THIS EXISTS
// ---------------
// Served as static assets alone, any failure (a half-finished deploy, a
// runtime error, the asset pipeline choking) would surface Cloudflare's raw
// system error page — e.g. 1104 "Script not found" — which also prints the
// visitor's IP and looks broken/unprofessional.
//
// This wrapper runs on every request (run_worker_first = true in
// wrangler.toml), serves the real page via env.ASSETS, and on ANY error
// returns a branded "We'll be right back" holding page WITH a working link
// and a 503 + Retry-After so the visitor's browser auto-recovers once the
// deploy settles.
//
// NOTE: the one case this cannot cover is the very first bind of a brand-new
// Worker to a brand-new domain (the script genuinely doesn't exist yet, so
// no code — not even this — can run). That only happens once per domain and
// has already passed for hazardlink.ie; normal redeploys swap atomically.

const HOLDING_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="robots" content="noindex" />
  <!-- Auto-retry: when the update finishes, this reload lands on the real site. -->
  <meta http-equiv="refresh" content="15" />
  <title>HazardLink — we'll be right back</title>
  <style>
    :root { --orange:#ff8800; --ink:#0f172a; --grey:#94a3b8; }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--ink);
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      -webkit-font-smoothing: antialiased;
    }
    .card { max-width: 440px; width: 100%; }
    .logo {
      font-size: 1.4rem; font-weight: 800; letter-spacing: -0.02em;
      margin-bottom: 28px;
    }
    .logo .dot { color: var(--orange); }
    .spinner {
      width: 46px; height: 46px; margin: 0 auto 26px;
      border: 4px solid rgba(255,136,0,0.25);
      border-top-color: var(--orange);
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
    h1 { font-size: 1.5rem; margin: 0 0 12px; }
    p { color: var(--grey); line-height: 1.55; margin: 0 0 26px; font-size: 1.02rem; }
    .btn {
      display: inline-block; text-decoration: none;
      background: var(--orange); color: #1a1205; font-weight: 700;
      padding: 13px 22px; border-radius: 10px; font-size: 1rem;
    }
    .btn:active { transform: translateY(1px); }
    .sub { margin-top: 22px; font-size: 0.9rem; color: var(--grey); }
    .sub a { color: #cbd5e1; }
  </style>
</head>
<body>
  <main class="card">
    <div class="logo">Hazard<span class="dot">Link</span></div>
    <div class="spinner" role="status" aria-label="Loading"></div>
    <h1>We'll be right back</h1>
    <p>We're just finishing a quick update to the site. This usually takes less than a minute &mdash; the page will refresh itself automatically.</p>
    <a class="btn" href="https://app.hazardlink.ie">Go to your dashboard</a>
    <div class="sub">Need a hand? <a href="mailto:hello@hazardlink.ie">hello@hazardlink.ie</a></div>
  </main>
</body>
</html>`;

// Security headers applied to every response (assets, 404, holding page).
// The CSP permits the page's own inline <style>/<script> (the demo preview +
// nav-drawer toggle) but blocks any external or injected resources.
// frame-ancestors 'none' supersedes X-Frame-Options for clickjacking defense.
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
  "X-XSS-Protection": "1; mode=block",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "upgrade-insecure-requests",
};

function withSecurity(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function holdingResponse() {
  return withSecurity(new Response(HOLDING_PAGE, {
    status: 503, // temporary — keeps search engines from indexing the holding page
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "15",
      "cache-control": "no-store",
    },
  }));
}

export default {
  async fetch(request, env) {
    try {
      const res = await env.ASSETS.fetch(request);
      // Any server-side failure from the asset pipeline → show the holding page.
      if (res.status >= 500) return holdingResponse();
      return withSecurity(res);
    } catch (_err) {
      return holdingResponse();
    }
  },
};
