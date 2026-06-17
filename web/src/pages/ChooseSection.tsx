import { useNavigate } from "react-router-dom";
import { useSection, type Section } from "../lib/section";
import { useAuth } from "../lib/auth";

/**
 * The landing chooser. On entry the user picks which side of HazardLink they
 * want — Cleaning or Maintenance — and we drop them into that section's home.
 * Reachable any time via the sidebar "Switch" button.
 */
export function ChooseSection() {
  const { setSection } = useSection();
  const { user } = useAuth();
  const nav = useNavigate();

  function pick(s: Section) {
    setSection(s);
    const home = s === "cleaning" ? "/" : s === "maintenance" ? "/maintenance" : "/incidents";
    nav(home, { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold text-slate-900">HazardLink</div>
        {user?.organisationName && <div className="text-slate-500 mt-1">{user.organisationName}</div>}
        <p className="text-slate-600 mt-4 text-lg">What would you like to work on?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl">
        <button
          onClick={() => pick("cleaning")}
          className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm hover:shadow-md hover:border-blue-400 transition"
        >
          <div className="text-5xl mb-3">🧹</div>
          <div className="text-xl font-semibold text-slate-900">Cleaning</div>
          <p className="text-sm text-slate-500 mt-2">Spill alerts, dispatch, cleaner schedules, sensors &amp; floor plans.</p>
        </button>

        <button
          onClick={() => pick("maintenance")}
          className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm hover:shadow-md hover:border-blue-400 transition"
        >
          <div className="text-5xl mb-3">🔧</div>
          <div className="text-xl font-semibold text-slate-900">Maintenance</div>
          <p className="text-sm text-slate-500 mt-2">Jobs, assets, planned maintenance &amp; contractor scheduling.</p>
        </button>

        <button
          onClick={() => pick("security")}
          className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm hover:shadow-md hover:border-blue-400 transition"
        >
          <div className="text-5xl mb-3">🛡️</div>
          <div className="text-xl font-semibold text-slate-900">Security</div>
          <p className="text-sm text-slate-500 mt-2">Incident reports, guard patrols &amp; on-site safety.</p>
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-8">You can switch sides any time from the sidebar.</p>
    </div>
  );
}
