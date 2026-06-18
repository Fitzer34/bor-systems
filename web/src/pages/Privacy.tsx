import { Link } from "react-router-dom";

/**
 * Privacy notice for HazardLink.
 *
 * This is a plain-English starting point — not a substitute for legal review.
 * Before signing the first paying customer, get this reviewed by a UK
 * solicitor familiar with UK GDPR + Data Protection Act 2018.
 */
export function Privacy() {
  return (
    <div className="min-h-screen bg-slate-100 py-10 sm:py-14 px-4 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white px-6 py-8 sm:px-10 sm:py-12 shadow-sm text-slate-700 leading-relaxed">
        <p className="text-sm">
          <Link to="/" className="inline-flex items-center gap-1.5 text-blue-700 font-medium hover:underline">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Back to HazardLink
          </Link>
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: 14 May 2026</p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">1. Who we are</h2>
        <p className="mt-2">
          HazardLink Ltd. ("HazardLink", "we", "us") provides smart
          wet-floor-sign monitoring hardware and a cloud service that alerts
          cleaning teams when a sign has been lifted from its hanger. This
          notice explains what personal data we collect, why we collect it,
          and your rights under UK GDPR.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">2. Data we collect</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 marker:text-slate-400">
          <li>
            <strong className="font-semibold text-slate-900">Account data</strong> — your name, email address, role
            (admin / supervisor / cleaner), and a hashed password.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Operational data</strong> — when you sign in or off duty,
            which alerts you acknowledged, which dispatches you completed,
            and audit-log entries describing actions you took inside the
            product.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Device tokens</strong> — Apple Push (APNs) or Firebase (FCM)
            tokens, so we can send you alert notifications. We never use these
            for marketing.
          </li>
          <li>
            <strong className="font-semibold text-slate-900">Technical data</strong> — IP address, device user-agent,
            and crash reports (via Sentry) when something goes wrong. We do
            not collect browser history, contacts, or location.
          </li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">3. What we never collect</h2>
        <p className="mt-2">
          We don't sell data. We don't collect payment-card numbers (Stripe
          holds those — we only see the last 4 digits and the masked token).
          We don't collect images, audio, or video from any device.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">4. Legal basis</h2>
        <p className="mt-2">
          We process account and operational data on the basis of
          <em> contract performance</em> (you, or your employer, contracted us
          to provide the service). We process technical data on the basis of
          <em> legitimate interests</em> (keeping the service running, secure,
          and free of bugs).
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">5. How long we keep it</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 marker:text-slate-400">
          <li>Active accounts: for as long as your organisation uses the service.</li>
          <li>Deactivated accounts: 12 months, then anonymised.</li>
          <li>Alert + audit history: 36 months, then aggregated and the
              personally-identifying fields stripped.</li>
          <li>Crash reports: 90 days.</li>
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">6. Where it's stored</h2>
        <p className="mt-2">
          Our application and database run in the European Union (Frankfurt
          region of Render Inc.). Image assets are stored on Cloudflare R2.
          Push delivery uses Apple (Ireland data centres) and Google (EU
          region) infrastructure. No data is intentionally transferred outside
          the UK or EEA without standard contractual clauses in place.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">7. Your rights</h2>
        <p className="mt-2">
          Under UK GDPR you can request a copy of your data, correction of
          anything inaccurate, deletion of your account, or restriction of
          further processing. Email{" "}
          <a href="mailto:privacy@bor-systems.com" className="text-blue-700 hover:underline">privacy@bor-systems.com</a>{" "}
          and we'll respond within one month.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">8. Cookies</h2>
        <p className="mt-2">
          The web dashboard uses a single first-party token in browser
          localStorage to keep you signed in. We do not use third-party
          advertising or analytics cookies.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">9. Changes</h2>
        <p className="mt-2">
          If we make material changes to this notice we will email organisation
          administrators and update the "Last updated" date above. Trivial
          clarifications are made silently.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">10. Complaints</h2>
        <p className="mt-2">
          You can complain to the UK Information Commissioner's Office at{" "}
          <a href="https://ico.org.uk" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">ico.org.uk</a>{" "}
          if you believe we have mishandled your data. We'd rather you tell us
          first — most issues are misunderstandings we can fix the same day.
        </p>
      </article>
    </div>
  );
}
