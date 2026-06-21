import type { CSSProperties } from "react";

// Battery hangers deep-sleep and check in once a DAY (spill alerts are instant
// and separate): 26 h = one daily check-in + 2 h margin. Shared by every
// floor-plan surface so "offline" means the same thing everywhere.
export const ONLINE_WINDOW_MS = 26 * 60 * 60 * 1000;

// Default low-battery line. The Hangers/Devices pages read the org's configured
// threshold from /settings; the floor-plan surfaces fall back to this when they
// don't have it to hand. Pins err on the side of showing the badge.
export const DEFAULT_LOW_BATTERY_PCT = 20;

/** The four visual states a sensor pin can be in, in priority order. */
export type SensorState = "alert" | "cleaning" | "offline" | "ok";

/** Minimal hanger shape the pin logic needs — a structural subset of the
 *  full Hanger returned by GET /hangers, so any caller's row type fits. */
export interface PinHanger {
  id: string;
  status: "active" | "out_of_service" | "decommissioned";
  lastSeenAt: string | null;
  batteryPct?: number | null;
}

/**
 * Resolve a hanger's pin state from its live data + whether it currently has an
 * active spill alert. Alert state always wins: a lifted sign that also reads
 * "offline" must surface the spill, not the silence.
 *
 *  - alert    → sign lifted / live spill (open alert)
 *  - cleaning → alert acknowledged, clean-up in progress
 *  - offline  → active hanger that hasn't phoned home inside the online window
 *  - ok       → on the rack, ready, reporting
 */
export function sensorState(
  hanger: PinHanger,
  alertStatus: "open" | "acknowledged" | undefined,
  now: number = Date.now(),
): SensorState {
  if (alertStatus === "open") return "alert";
  if (alertStatus === "acknowledged") return "cleaning";
  // Lifecycle states (decommissioned / out_of_service) are never "offline" —
  // they're simply not in service, so they read OK (neutral) on the plan.
  if (hanger.status === "active") {
    const fresh =
      hanger.lastSeenAt != null &&
      now - new Date(hanger.lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
    if (!fresh) return "offline";
  }
  return "ok";
}

export function isLowBattery(
  batteryPct: number | null | undefined,
  threshold: number = DEFAULT_LOW_BATTERY_PCT,
): boolean {
  return batteryPct != null && batteryPct <= threshold;
}

/** Human label for a state, reused in tooltips and the side list. */
export function sensorStateLabel(state: SensorState): string {
  switch (state) {
    case "alert": return "Lifted — live spill";
    case "cleaning": return "Cleaning in progress";
    case "offline": return "Offline";
    case "ok": return "On rack — ready";
  }
}

// Status colours map to the app's tokens: emerald/green = ok, red = alert,
// blue = info/cleaning, amber/orange = offline. We keep the literal Tailwind
// classes (matching the rest of the codebase) rather than inventing new ones.
const FILL: Record<SensorState, string> = {
  alert: "bg-red-500",
  cleaning: "bg-blue-500",
  offline: "bg-amber-400",
  ok: "bg-green-500",
};

export interface SensorPinProps {
  state: SensorState;
  /** Friendly name / HGR id for the native tooltip + a11y label. */
  label?: string;
  /** Render the small low-battery badge on the pin. */
  lowBattery?: boolean;
  /** Pixel size of the wet-floor sign. Defaults to a comfortable tap target. */
  size?: number;
  /** Draw a selection ring (when its list row / pin is the active one). */
  selected?: boolean;
  /** Makes the pin tappable. When omitted the pin is purely decorative. */
  onClick?: (e: React.MouseEvent) => void;
  /** Absolute-positioning style (left/top %) supplied by the parent overlay. */
  style?: CSSProperties;
  className?: string;
}

/**
 * A single wet-floor-sign sensor pin. Used as the live marker on every
 * floor-plan surface (the main page, the multi-floor overview, the alert
 * thumbnail) so the states read identically everywhere.
 *
 * The glyph is the classic A-frame "caution / wet floor" sign so the marker
 * reads as a hanger at a glance, not a generic dot. Round footprint (vs the
 * square gateway pins) keeps sensors and gateways visually distinct.
 */
export function SensorPin({
  state,
  label,
  lowBattery = false,
  size = 22,
  selected = false,
  onClick,
  style,
  className = "",
}: SensorPinProps) {
  const interactive = !!onClick;
  const pulse = state === "alert" || state === "cleaning" ? " animate-pulse" : "";
  const ring = selected ? " ring-2 ring-offset-1 ring-slate-900" : " ring-1 ring-white";
  const cursor = interactive ? " cursor-pointer" : "";
  const tip = label ? `${label} — ${sensorStateLabel(state)}` : sensorStateLabel(state);

  return (
    <button
      type="button"
      // When non-interactive we still render a <button> for consistent box
      // sizing but disable it so it's skipped by the tab order / pointer.
      disabled={!interactive}
      onClick={onClick}
      title={tip}
      aria-label={tip}
      className={
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow border-2 border-white flex items-center justify-center leading-none transition" +
        ` ${FILL[state]}${pulse}${ring}${cursor} ` +
        (interactive ? "hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 " : "") +
        className
      }
      style={{ width: size, height: size, ...style }}
    >
      {/* Wet-floor A-frame glyph, white so it reads on every fill colour. */}
      <svg
        viewBox="0 0 24 24"
        width={size * 0.62}
        height={size * 0.62}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-white"
        aria-hidden="true"
      >
        {/* A-frame legs */}
        <path d="M9 4 L4 20" />
        <path d="M15 4 L20 20" />
        {/* Top hinge + a brace so it reads as a folding sign */}
        <path d="M9 4 L15 4" />
        <path d="M6.5 14 L17.5 14" />
      </svg>

      {/* Offline marker: a small "?" so a glance reads "we can't hear it". */}
      {state === "offline" && (
        <span
          className="absolute inset-0 flex items-center justify-center font-bold text-amber-900"
          style={{ fontSize: size * 0.5 }}
          aria-hidden="true"
        >
          ?
        </span>
      )}

      {/* Low-battery badge: a tiny battery glyph clipped to the pin corner. */}
      {lowBattery && (
        <span
          className="absolute -top-1 -right-1 rounded-full bg-white shadow ring-1 ring-amber-300 flex items-center justify-center"
          style={{ width: size * 0.5, height: size * 0.5 }}
          title="Low battery"
          aria-label="Low battery"
        >
          <svg
            viewBox="0 0 24 24"
            width={size * 0.34}
            height={size * 0.34}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-600"
            aria-hidden="true"
          >
            <rect x="2" y="8" width="14" height="8" rx="1.5" />
            <path d="M19 11 L19 13" />
          </svg>
        </span>
      )}
    </button>
  );
}

/**
 * A distinct SQUARE pin for gateways, so they never read as sensors. Only
 * rendered when a gateway has floor coordinates; otherwise it lives in the
 * side list + legend.
 */
export function GatewayPin({
  label,
  online,
  selected = false,
  size = 20,
  onClick,
  style,
}: {
  label?: string;
  online: boolean;
  selected?: boolean;
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
  style?: CSSProperties;
}) {
  const interactive = !!onClick;
  const tip = `${label ?? "Gateway"} — ${online ? "online" : "offline"}`;
  const fill = online ? "bg-slate-700" : "bg-amber-400";
  const ring = selected ? " ring-2 ring-offset-1 ring-slate-900" : " ring-1 ring-white";
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      title={tip}
      aria-label={tip}
      className={
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-[3px] shadow border-2 border-white flex items-center justify-center transition" +
        ` ${fill}${ring} ` +
        (interactive ? "cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 " : "")
      }
      style={{ width: size, height: size, ...style }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-white"
        aria-hidden="true"
      >
        {/* Wi-Fi / gateway glyph */}
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19" r="0.6" fill="currentColor" />
      </svg>
    </button>
  );
}
