import { Link } from "react-router-dom";

/**
 * Terms of Service.
 *
 * Plain-English starting point — not a substitute for legal review.
 * Run this past a UK commercial solicitor before the first paying customer.
 */
export function Terms() {
  return (
    <article className="prose mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <p className="text-sm text-slate-500">
        <Link to="/" className="underline">Back to BOR Systems</Link>
      </p>
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-500">Last updated: 14 May 2026</p>

      <h2>1. The deal</h2>
      <p>
        These terms govern your use of the BOR Systems smart wet-floor-sign
        monitoring service ("the Service"), including the cloud dashboard,
        mobile apps, and the hangers themselves. By creating an organisation
        account, or using a device we have shipped you, you accept these
        terms on behalf of your organisation.
      </p>

      <h2>2. Account and access</h2>
      <p>
        You must keep account credentials confidential. Each user must have
        their own account; sharing logins is not permitted. Administrators
        are responsible for the actions of users they create.
      </p>

      <h2>3. Fees</h2>
      <p>
        Pricing is per hanger, billed monthly, and includes both hardware
        rental and the cloud service. Specific pricing is set out in your
        order form. We may change pricing on 60 days' written notice; existing
        prepaid terms are honoured to the end of the paid-up period.
      </p>

      <h2>4. The hangers</h2>
      <p>
        Hangers remain BOR Systems property under any rental plan. You agree
        to install them in line with the supplied instructions, not to
        modify the firmware, and to return them on termination. Reasonable
        wear and tear is expected and not chargeable.
      </p>

      <h2>5. Service level</h2>
      <p>
        We target 99.5% monthly uptime for the cloud dashboard and the
        alert-delivery pipeline. If we miss it in any month we will, on
        request, credit a pro-rata refund to your next invoice. We do not
        promise uptime for downstream services we don't control
        (Apple Push, your WiFi, your mobile carrier).
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        Don't use the Service to monitor anything other than wet-floor
        signs, don't probe it for vulnerabilities (please write to
        <a href="mailto:security@bor-systems.com"> security@bor-systems.com</a>
        instead — we'll thank you), and don't resell access without a
        written reseller agreement.
      </p>

      <h2>7. Liability</h2>
      <p>
        BOR Systems is an aid to your cleaning operation. It does not
        replace your duty of care around slip-and-trip hazards. To the
        maximum extent permitted by law, our liability for any claim
        relating to the Service is capped at the fees you paid us in the
        12 months immediately preceding the claim. We do not exclude
        liability for death, personal injury caused by our negligence, or
        anything else that cannot be excluded under English law.
      </p>

      <h2>8. Data</h2>
      <p>
        Our handling of personal data is described in the{" "}
        <Link to="/privacy" className="underline">Privacy Policy</Link>,
        which forms part of these terms.
      </p>

      <h2>9. Termination</h2>
      <p>
        Either party may terminate for material breach not cured within 30
        days of written notice. On termination you stop using the Service
        and return the hangers; we provide a one-time export of your data
        within 30 days, then delete it.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of England and Wales, and the
        courts of England and Wales have exclusive jurisdiction over any
        dispute.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may revise these terms; we'll notify organisation administrators
        by email at least 30 days before changes take effect. If you don't
        accept the change you may terminate without penalty during that
        notice period.
      </p>

      <h2>12. Contact</h2>
      <p>
        BOR Systems Ltd., contact{" "}
        <a href="mailto:hello@bor-systems.com">hello@bor-systems.com</a>.
      </p>
    </article>
  );
}
