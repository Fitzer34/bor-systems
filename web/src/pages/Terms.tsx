import { Link } from "react-router-dom";

/**
 * Terms of Service.
 *
 * Plain-English starting point — not a substitute for legal review.
 * Run this past a UK commercial solicitor before the first paying customer.
 */
export function Terms() {
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
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">Terms of Service</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: 14 May 2026</p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">1. The deal</h2>
        <p className="mt-2">
          These terms govern your use of the HazardLink smart wet-floor-sign
          monitoring service ("the Service"), including the cloud dashboard,
          mobile apps, and the hangers themselves. By creating an organisation
          account, or using a device we have shipped you, you accept these
          terms on behalf of your organisation.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">2. Account and access</h2>
        <p className="mt-2">
          You must keep account credentials confidential. Each user must have
          their own account; sharing logins is not permitted. Administrators
          are responsible for the actions of users they create.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">3. Fees</h2>
        <p className="mt-2">
          Pricing is per hanger, billed monthly, and includes both hardware
          rental and the cloud service. Specific pricing is set out in your
          order form. We may change pricing on 60 days' written notice; existing
          prepaid terms are honoured to the end of the paid-up period.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">4. The hangers</h2>
        <p className="mt-2">
          Hangers remain HazardLink property under any rental plan. You agree
          to install them in line with the supplied instructions, not to
          modify the firmware, and to return them on termination. Reasonable
          wear and tear is expected and not chargeable.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">5. Service level</h2>
        <p className="mt-2">
          We target 99.5% monthly uptime for the cloud dashboard and the
          alert-delivery pipeline. If we miss it in any month we will, on
          request, credit a pro-rata refund to your next invoice. We do not
          promise uptime for downstream services we don't control
          (Apple Push, your WiFi, your mobile carrier).
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">6. Acceptable use</h2>
        <p className="mt-2">
          Don't use the Service to monitor anything other than wet-floor
          signs, don't probe it for vulnerabilities (please write to
          <a href="mailto:security@bor-systems.com" className="text-blue-700 hover:underline"> security@bor-systems.com</a>
          instead — we'll thank you), and don't resell access without a
          written reseller agreement.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">7. Liability</h2>
        <p className="mt-2">
          HazardLink is an aid to your cleaning operation. It does not
          replace your duty of care around slip-and-trip hazards. To the
          maximum extent permitted by law, our liability for any claim
          relating to the Service is capped at the fees you paid us in the
          12 months immediately preceding the claim. We do not exclude
          liability for death, personal injury caused by our negligence, or
          anything else that cannot be excluded under English law.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">8. Data</h2>
        <p className="mt-2">
          Our handling of personal data is described in the{" "}
          <Link to="/privacy" className="text-blue-700 hover:underline">Privacy Policy</Link>,
          which forms part of these terms.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">9. Termination</h2>
        <p className="mt-2">
          Either party may terminate for material breach not cured within 30
          days of written notice. On termination you stop using the Service
          and return the hangers; we provide a one-time export of your data
          within 30 days, then delete it.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">10. Governing law</h2>
        <p className="mt-2">
          These terms are governed by the laws of England and Wales, and the
          courts of England and Wales have exclusive jurisdiction over any
          dispute.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">11. Changes</h2>
        <p className="mt-2">
          We may revise these terms; we'll notify organisation administrators
          by email at least 30 days before changes take effect. If you don't
          accept the change you may terminate without penalty during that
          notice period.
        </p>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">12. Contact</h2>
        <p className="mt-2">
          HazardLink Ltd., contact{" "}
          <a href="mailto:hello@bor-systems.com" className="text-blue-700 hover:underline">hello@bor-systems.com</a>.
        </p>
      </article>
    </div>
  );
}
