import { Link } from "react-router-dom";

/**
 * Privacy notice for ZeroSlip.
 *
 * This is a plain-English starting point — not a substitute for legal review.
 * Before signing the first paying customer, get this reviewed by a UK
 * solicitor familiar with UK GDPR + Data Protection Act 2018.
 */
export function Privacy() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <p className="text-sm text-slate-500">
        <Link to="/" className="underline">Back to ZeroSlip</Link>
      </p>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-slate-500">Last updated: 14 May 2026</p>

      <h2>1. Who we are</h2>
      <p>
        ZeroSlip Ltd. ("ZeroSlip", "we", "us") provides smart
        wet-floor-sign monitoring hardware and a cloud service that alerts
        cleaning teams when a sign has been lifted from its hanger. This
        notice explains what personal data we collect, why we collect it,
        and your rights under UK GDPR.
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — your name, email address, role
          (admin / supervisor / cleaner), and a hashed password.
        </li>
        <li>
          <strong>Operational data</strong> — when you sign in or off duty,
          which alerts you acknowledged, which dispatches you completed,
          and audit-log entries describing actions you took inside the
          product.
        </li>
        <li>
          <strong>Device tokens</strong> — Apple Push (APNs) or Firebase (FCM)
          tokens, so we can send you alert notifications. We never use these
          for marketing.
        </li>
        <li>
          <strong>Technical data</strong> — IP address, device user-agent,
          and crash reports (via Sentry) when something goes wrong. We do
          not collect browser history, contacts, or location.
        </li>
      </ul>

      <h2>3. What we never collect</h2>
      <p>
        We don't sell data. We don't collect payment-card numbers (Stripe
        holds those — we only see the last 4 digits and the masked token).
        We don't collect images, audio, or video from any device.
      </p>

      <h2>4. Legal basis</h2>
      <p>
        We process account and operational data on the basis of
        <em> contract performance</em> (you, or your employer, contracted us
        to provide the service). We process technical data on the basis of
        <em> legitimate interests</em> (keeping the service running, secure,
        and free of bugs).
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Active accounts: for as long as your organisation uses the service.</li>
        <li>Deactivated accounts: 12 months, then anonymised.</li>
        <li>Alert + audit history: 36 months, then aggregated and the
            personally-identifying fields stripped.</li>
        <li>Crash reports: 90 days.</li>
      </ul>

      <h2>6. Where it's stored</h2>
      <p>
        Our application and database run in the European Union (Frankfurt
        region of Render Inc.). Image assets are stored on Cloudflare R2.
        Push delivery uses Apple (Ireland data centres) and Google (EU
        region) infrastructure. No data is intentionally transferred outside
        the UK or EEA without standard contractual clauses in place.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Under UK GDPR you can request a copy of your data, correction of
        anything inaccurate, deletion of your account, or restriction of
        further processing. Email{" "}
        <a href="mailto:privacy@bor-systems.com">privacy@bor-systems.com</a>{" "}
        and we'll respond within one month.
      </p>

      <h2>8. Cookies</h2>
      <p>
        The web dashboard uses a single first-party token in browser
        localStorage to keep you signed in. We do not use third-party
        advertising or analytics cookies.
      </p>

      <h2>9. Changes</h2>
      <p>
        If we make material changes to this notice we will email organisation
        administrators and update the "Last updated" date above. Trivial
        clarifications are made silently.
      </p>

      <h2>10. Complaints</h2>
      <p>
        You can complain to the UK Information Commissioner's Office at{" "}
        <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>{" "}
        if you believe we have mishandled your data. We'd rather you tell us
        first — most issues are misunderstandings we can fix the same day.
      </p>
    </article>
  );
}
