import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Top-level product split. HazardLink is one company / one login, but the app
 * is divided into two sides — "cleaning" (the IoT spill-safety product: alerts,
 * dispatch, schedules, sensors) and "maintenance" (the CMMS/FM platform: jobs,
 * assets, PPMs). The user picks one on entry (ChooseSection) and the sidebar
 * shows just that side's tools, with a Switch button to flip.
 */
export type Section = "maintenance" | "cleaning" | "security";
const KEY = "hazardlink.section";

interface SectionState {
  section: Section | null;
  setSection: (s: Section) => void;
}
const Ctx = createContext<SectionState>({ section: null, setSection: () => {} });

export function SectionProvider({ children }: { children: ReactNode }) {
  const [section, setSectionState] = useState<Section | null>(() => {
    const v = localStorage.getItem(KEY);
    return v === "maintenance" || v === "cleaning" || v === "security" ? v : null;
  });
  const setSection = (s: Section) => {
    localStorage.setItem(KEY, s);
    setSectionState(s);
  };
  return <Ctx.Provider value={{ section, setSection }}>{children}</Ctx.Provider>;
}

export function useSection(): SectionState {
  return useContext(Ctx);
}

/* ─── Default team (team dashboard) ────────────────────────────────────────────
 *
 * The team dashboard lets a user pick a default "team" view — one of the three
 * disciplines, or "all". It's a personal preference persisted in localStorage
 * and applied on load. Distinct from `section` (the sidebar's active side):
 * "all" is a dashboard-only lens that section can't hold.
 */
export type Team = Section | "all";
const DEFAULT_TEAM_KEY = "hazardlink.defaultTeam";

export function loadDefaultTeam(): Team | null {
  const v = localStorage.getItem(DEFAULT_TEAM_KEY);
  return v === "all" || v === "cleaning" || v === "maintenance" || v === "security" ? v : null;
}

export function saveDefaultTeam(team: Team): void {
  localStorage.setItem(DEFAULT_TEAM_KEY, team);
}
