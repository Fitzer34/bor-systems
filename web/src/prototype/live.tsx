// @ts-nocheck
/* Live-org wrapper around the assembled prototype <App/>.
 *
 * The prototype was built against a hardcoded sample (HL). To run it as the
 * real product we: (1) empty every list so a new organisation shows empty
 * states, (2) record the signed-in user for the greeting + account menu, and
 * (3) load the org's real data from the backend and merge it into HL. HL is
 * mutated in place before <App/> renders, so the prototype's components — which
 * read HL synchronously — pick up the real (or empty) data with no changes.
 *
 * This is the seam where each screen gets wired to live data: add a fetch to
 * loadOrg() and map it into the HL shape the relevant view expects. */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { App as PrototypeApp } from "./bundle";
import { resetHLEmpty, hydrateHL, setCurrentUser } from "./data";

/** Public, no-login preview of the EMPTY new-org state — empties HL, no user,
 *  no fetch. Lets the blank states be checked without signing up. */
export function PreviewEmpty() {
  resetHLEmpty();
  return <PrototypeApp />;
}

function initialsOf(name: string): string {
  return (name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join("").toUpperCase() || "?";
}

/** Fetch the org's real data and shape it into the HL structure the prototype
 *  expects. Each entity is best-effort: a failure leaves that list empty rather
 *  than blanking the whole app. Extend this as more screens are wired. */
async function loadOrg() {
  const out: any = {};

  // Sites (the backend models them as "buildings"). Drives the dashboard Sites
  // card, the site picker and the portfolio view.
  try {
    const r: any = await api("/sites/summary");
    out.sites = (r.sites || []).map((s: any) => ({
      id: s.buildingId,
      name: s.buildingName,
      loc: "",
      status: s.openAlerts > 0 ? "warn" : "ok",
      open: s.openAlerts || 0,
    }));
  } catch { /* leave sites empty */ }

  return out;
}

export function PrototypeAppLive() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["hl-org-data"],
    queryFn: loadOrg,
    staleTime: 10_000,
  });

  // Mutate HL synchronously before <App/> renders. Idempotent, so it is safe to
  // run on every render (incl. StrictMode double-invoke).
  resetHLEmpty();
  if (user) {
    setCurrentUser({
      name: user.name,
      email: user.email,
      role: user.role,
      initials: initialsOf(user.name),
    });
  }
  if (data) hydrateHL(data);

  if (isLoading) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center",
                    color: "var(--ink-3)", fontFamily: "var(--font)", fontSize: 14 }}>
        Loading your organisation…
      </div>
    );
  }
  // Even on error we still render the (empty) app rather than a dead end.
  return <PrototypeApp />;
}
