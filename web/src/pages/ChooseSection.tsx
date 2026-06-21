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

  const cards: {
    section: Section;
    title: string;
    accent: string;
    desc: string;
    icon: React.ReactNode;
  }[] = [
    {
      section: "cleaning",
      title: "Cleaning",
      accent: "#0891B2",
      desc: "Spill alerts, dispatch, cleaner schedules, sensors & floor plans.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M3 21h18" /><path d="m8 21 1-7 6-6" /><path d="m14 8 3-3a2.83 2.83 0 0 1 4 4l-3 3" /><path d="m9 14 1 1" />
        </svg>
      ),
    },
    {
      section: "maintenance",
      title: "Maintenance",
      accent: "#D97706",
      desc: "Jobs, assets, planned maintenance & contractor scheduling.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
        </svg>
      ),
    },
    {
      section: "security",
      title: "Security",
      accent: "#4F46E5",
      desc: "Incident reports, guard patrols & on-site safety.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-surface text-slate-800 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold tracking-tight text-slate-900">HazardLink</div>
        {user?.organisationName && <div className="text-slate-500 mt-1">{user.organisationName}</div>}
        <p className="text-slate-600 mt-4 text-lg">What would you like to work on?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-3xl">
        {cards.map((c) => (
          <button
            key={c.section}
            onClick={() => pick(c.section)}
            style={{ ["--accent" as string]: c.accent }}
            className="group rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:shadow-md hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${c.accent}1A`, color: c.accent }}
            >
              {c.icon}
            </div>
            <div className="text-xl font-semibold text-slate-900">{c.title}</div>
            <p className="text-sm text-slate-500 mt-2">{c.desc}</p>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-8">You can switch sides any time from the sidebar.</p>
    </div>
  );
}
