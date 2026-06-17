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
