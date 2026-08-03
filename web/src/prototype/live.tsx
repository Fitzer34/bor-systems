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
import { api, API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth";
import { App as PrototypeApp } from "./bundle";
import { resetHLEmpty, hydrateHL, setCurrentUser } from "./data";

// Expose the API origin to the assembled prototype code (plain JS, no
// imports) so its fetch handlers build correct URLs in dev AND prod:
// in dev API_BASE is "" (Vite proxies /api), in prod it's the Render origin.
if (typeof window !== "undefined") window.HL_API_BASE = API_BASE || "/api";

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

  // Contractors — drives the Contractor accreditation view (asset_41). The
  // backend row is flat (no per-staff cert data yet), so map defensively into
  // the richer HL shape with safe fallbacks so missing fields never crash the
  // view. Real uuid ids also unlock the "Invite to profile" action there.
  try {
    const r = await api("/contractors");
    const today = new Date().toISOString().slice(0, 10);
    const tierStatus = { blocked: "blocked", on_notice: "expiring", preferred: "compliant", approved: "compliant" };
    out.contractors = (r.contractors || [])
      .filter((c) => c && c.id)
      .map((c) => {
        let status = tierStatus[c.tier] || "compliant";
        // An insurance expiry in the past needs attention even if the tier is fine.
        if (status === "compliant" && c.insuranceExpiry && String(c.insuranceExpiry) < today) status = "expiring";
        return {
          id: String(c.id),
          name: c.name || "Contractor",
          type: c.services || c.accreditation || "Contractor",
          location: c.county || c.region || "—",
          contact: c.contactName || c.name || "—",
          email: c.email || "—",
          phone: c.phone || "—",
          cro: "—",
          insurance: c.insuranceExpiry ? "On file · expires " + c.insuranceExpiry : "—",
          status,
          lastRefresh: c.claimedAt ? "profile claimed by contractor" : "profile not claimed yet",
          pendingUpload: false,
          initials: initialsOf(c.name || "?"),
          staff: [],
        };
      });
  } catch { /* leave contractors empty */ }

  // Live spill alerts — drive the dashboard banner, KPI, live feed and the
  // sidebar count. Escalation countdown approximates from elapsed time.
  try {
    const r: any = await api("/alerts/active");
    const now = Date.now();
    out.spillAlerts = (r.alerts || [])
      .filter((a: any) => a.kind !== "planned_cleaning")
      .map((a: any) => {
        const opened = new Date(a.openedAt).getTime();
        const elapsedSec = Math.max(0, Math.round((now - opened) / 1000));
        const mins = Math.floor(elapsedSec / 60);
        return {
          id: "SP-" + String(a.id).slice(0, 4).toUpperCase(),
          realId: a.id,
          site: a.floorName || "Site",
          siteShort: a.floorName || "",
          location: a.zoneName || "Sensor location",
          hanger: String(a.hangerId || "").slice(0, 6).toUpperCase(),
          state: a.status === "acknowledged" ? "acknowledged" : "new",
          severity: "medium",
          raisedAt: new Date(a.openedAt).toTimeString().slice(0, 5),
          since: mins < 1 ? "now" : mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h",
          escalateInSec: Math.max(0, 300 - elapsedSec),
          escalateTotal: 300,
          liveStatus: a.status === "acknowledged" ? "Acknowledged, being handled" : "Sign deployed",
          liveStatusTone: a.status === "acknowledged" ? "muted" : "warn",
        };
      });
  } catch { /* leave spills empty */ }

  // Work orders — dashboard KPIs + sidebar count (full board lives in the view).
  try {
    const r: any = await api("/jobs");
    const statusLabel = (s: string) =>
      s === "done" || s === "completed" || s === "closed" ? "Done"
      : s === "in_progress" ? "In progress"
      : s === "tendering" ? "Tendering"
      : s === "awarded" || s === "scheduled" ? "Scheduled"
      : "Open";
    out.workOrders = (r.jobs || []).map((j: any) => ({
      id: j.number || "WO-" + String(j.id).slice(0, 4).toUpperCase(),
      realId: j.id,
      title: j.title || "Job",
      asset: j.assetName || "",
      site: j.buildingName || "",
      priority: j.priority ? j.priority.charAt(0).toUpperCase() + j.priority.slice(1) : "Medium",
      status: statusLabel(String(j.status || "logged")),
      statusTone: "accent",
      assignee: j.contractorName || "Unassigned",
      initials: "—",
      source: j.source || "",
    }));
  } catch { /* staff-only; leave empty */ }

  // PPM tasks (minimal shape) — powers the sidebar overdue badge.
  try {
    const r: any = await api("/ppms");
    const today = new Date().toISOString().slice(0, 10);
    out.ppmTasks = (r.ppms || [])
      .filter((p: any) => p.active !== false)
      .map((p: any) => ({
        id: p.id,
        site: (p.building && p.building.name) || "",
        status: p.nextDueDate && p.nextDueDate < today ? "overdue" : "ok",
      }));
  } catch { /* staff-only; leave empty */ }

  // Devices grouped per building — powers the sidebar offline count.
  try {
    const [hr, gr]: any[] = await Promise.all([api("/hangers"), api("/gateways")]);
    const byBuilding: Record<string, { name: string; devices: any[] }> = {};
    const put = (bName: string, dev: any) => {
      const key = bName || "Unassigned";
      (byBuilding[key] = byBuilding[key] || { name: key, devices: [] }).devices.push(dev);
    };
    const fresh = (iso: string | null | undefined, mins: number) =>
      !!iso && Date.now() - new Date(iso).getTime() < mins * 60_000;
    for (const row of hr.hangers || []) {
      const h = row.hanger || row;
      put(row.buildingName || row.building || "", {
        id: h.id, kind: "hanger",
        online: (h.status || "") !== "offline",
      });
    }
    for (const g of gr.gateways || []) {
      put(g.buildingName || "", { id: g.id, kind: "gateway", online: fresh(g.lastSeenAt, 15) });
    }
    out.deviceBuildings = Object.values(byBuilding);
  } catch { /* leave devices empty */ }

  return out;
}

export function PrototypeAppLive() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["hl-org-data"],
    queryFn: loadOrg,
    staleTime: 10_000,
    // Live spills/jobs/devices refresh without a manual reload.
    refetchInterval: 20_000,
  });

  // Empty the demo store ONCE per session, then only merge fresh data over it.
  // Resetting on every render was a data-loss amplifier: loadOrg omits a key
  // when that one sub-fetch fails, so reset + partial hydrate silently blanked
  // that section (e.g. the sites list) until the next successful refetch.
  const didReset = React.useRef(false);
  if (!didReset.current) {
    resetHLEmpty();
    didReset.current = true;
  }
  if (user) {
    setCurrentUser({
      id: user.id,
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
