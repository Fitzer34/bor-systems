import { Link } from "react-router-dom";
import {
  useNotificationPreferences,
  useSetNotificationPreference,
  notificationTypeLabel,
  type ChannelPrefs,
} from "../lib/notifications";

/* ─── NotificationPreferences ─────────────────────────────────────────────────
 *
 * A matrix of event-type rows × {In-app, Email, SMS} toggles. Rows come from
 * GET /notifications/preferences (the backend merges the full event catalogue
 * over the user's saved overrides), and each toggle PUTs that one event type's
 * channel. In-app is the always-on baseline (the feed row is written
 * regardless), so its toggle is shown locked on.
 */

type Channel = "inApp" | "email" | "sms";

const CHANNELS: { key: Channel; label: string; sub: string }[] = [
  { key: "inApp", label: "In-app", sub: "Bell & feed" },
  { key: "email", label: "Email", sub: "via Brevo" },
  { key: "sms", label: "SMS", sub: "via Twilio" },
];

export function NotificationPreferences() {
  const { data, isLoading, error } = useNotificationPreferences();
  const setPref = useSetNotificationPreference();

  const prefs = data?.preferences ?? {};
  // Stable, readable ordering of the event types.
  const rows = Object.keys(prefs).sort((a, b) =>
    notificationTypeLabel(a).localeCompare(notificationTypeLabel(b)),
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link to="/notifications" className="text-sm text-blue-700 hover:underline">← Back to notifications</Link>
        <h1 className="text-2xl font-semibold mt-2">Notification preferences</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Choose how you're told about each kind of event. In-app notifications are always on; pick which also
          reach you by email or text.
        </p>
      </div>

      {isLoading && <div className="text-slate-500">Loading…</div>}
      {error && <div className="text-red-600">Could not load preferences.</div>}

      {!isLoading && !error && (
        rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            No notification types to configure.
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3 font-medium">Event</th>
                    {CHANNELS.map((c) => (
                      <th key={c.key} className="p-3 text-center font-medium">
                        <div className="text-slate-700">{c.label}</div>
                        <div className="text-[11px] font-normal text-slate-400">{c.sub}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((eventType) => {
                    const pref: ChannelPrefs = prefs[eventType] ?? { inApp: true, email: false, sms: false };
                    return (
                      <tr key={eventType} className="border-t border-slate-200/80">
                        <td className="p-3 text-slate-800 font-medium">{notificationTypeLabel(eventType)}</td>
                        {CHANNELS.map((c) => (
                          <td key={c.key} className="p-3 text-center">
                            <Toggle
                              on={pref[c.key]}
                              // In-app is the baseline channel; keep it locked on.
                              disabled={c.key === "inApp" || setPref.isPending}
                              label={`${c.label} for ${notificationTypeLabel(eventType)}`}
                              onChange={(next) => setPref.mutate({ eventType, [c.key]: next })}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {setPref.isError && (
        <p className="text-sm text-red-600 mt-3">Couldn't save that change — please try again.</p>
      )}
    </div>
  );
}

function Toggle({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={
        "relative inline-flex h-5 w-9 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50 " +
        (on ? "bg-blue-600" : "bg-slate-300") +
        (disabled ? " opacity-60 cursor-not-allowed" : "")
      }
    >
      <span className={"inline-block h-4 w-4 transform rounded-full bg-white transition " + (on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}
