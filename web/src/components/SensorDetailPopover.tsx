import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { sensorState, sensorStateLabel, isLowBattery, type PinHanger } from "./SensorPin";

// Reuse the Gateways page's signal wording so dBm reads the same across the app.
function signalLabel(rssi: number): string {
  if (rssi >= -45) return "excellent";
  if (rssi >= -55) return "strong";
  if (rssi >= -65) return "good";
  if (rssi >= -75) return "weak";
  return "very weak";
}

// The hanger's "signal" is the reporting gateway's RSSI (dBm). Map it to a
// 0–5 bar count for the at-a-glance "n/5" reading the prototype shows, while
// the dBm value is still available for the title.
function rssiToBars(rssi: number): number {
  if (rssi >= -45) return 5;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  return 1;
}

// Map battery % to the colour the prototype uses: green healthy, amber low.
function batteryColor(pct: number, low: boolean): string {
  if (low) return "text-amber-600";
  if (pct <= 40) return "text-amber-600";
  return "text-emerald-600";
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// "Last lifted" reads like the prototype: "Today 14:31 (live)" when there's an
// active spill, otherwise a calendar-style timestamp.
function liftedTime(iso: string, live: boolean): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hhmm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = sameDay
    ? "Today"
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${day} ${hhmm}${live ? " (live)" : ""}`;
}

/** Small horizontal battery glyph with a proportional fill. */
function BatteryGlyph({ pct, colorClass }: { pct: number; colorClass: string }) {
  const fill = Math.max(0, Math.min(100, pct));
  return (
    <span className={"inline-flex items-center " + colorClass} aria-hidden="true">
      <span className="relative inline-flex items-center">
        <span className="block h-[14px] w-[26px] rounded-[3px] border-[1.5px] border-current p-[2px]">
          <span
            className="block h-full rounded-[1px] bg-current"
            style={{ width: `${fill}%` }}
          />
        </span>
        {/* battery nub */}
        <span className="ml-[1px] h-[6px] w-[2px] rounded-[1px] bg-current" />
      </span>
    </span>
  );
}

/** 5-bar signal-strength glyph; `bars` of 5 are filled. */
function SignalGlyph({ bars, colorClass }: { bars: number; colorClass: string }) {
  const heights = [5, 8, 11, 14, 17];
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className={"w-[3px] rounded-[1px] " + (i < bars ? colorClass + " bg-current" : "bg-slate-200")}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

/** The hanger fields the popover surfaces. A structural superset of PinHanger;
 *  every field beyond id/status/lastSeenAt degrades to "—" when null. */
export interface SensorPopoverHanger extends PinHanger {
  devEui?: string | null;
  name?: string | null;
  zoneId?: string | null;
  batteryPct?: number | null;
  signal?: number | null;
  rssi?: number | null;
  lastLiftedAt?: string | null;
  reportsViaGatewayId?: string | null;
  reportsViaGatewayName?: string | null;
}

export interface SensorDetailPopoverProps {
  hanger: SensorPopoverHanger;
  zoneName?: string | null;
  /** Id of the active alert for this hanger, if any → links to /alerts/:id. */
  activeAlertId?: string | null;
  alertStatus?: "open" | "acknowledged";
  /** Human spill-alert reference (e.g. SP-2041) shown on the CTA. */
  alertRef?: string | null;
  /** Low-battery threshold from org settings, if known. */
  lowBatteryThreshold?: number;
  onClose: () => void;
  /** Optional absolute-positioning style so it anchors near the pin. */
  style?: React.CSSProperties;
  className?: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[7px]">
      <span className="text-[11px] uppercase tracking-wide text-slate-400 shrink-0">{label}</span>
      <span className="text-sm text-right text-slate-900 min-w-0">{value}</span>
    </div>
  );
}

/**
 * Detail card for a single sensor (hanger), opened by tapping its pin or list
 * row. Anchored via `style` when shown over the plan; rendered inline when used
 * elsewhere. Closes on Escape or an outside click. Mirrors the design
 * prototype: a status banner, battery/signal glyphs, the reporting gateway as
 * a chip, and a full-width "Open spill alert" CTA when there's a live spill.
 */
export function SensorDetailPopover({
  hanger,
  zoneName,
  activeAlertId,
  alertStatus,
  alertRef,
  lowBatteryThreshold,
  onClose,
  style,
  className = "",
}: SensorDetailPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    // Defer the outside-click listener a tick so the very click that opened
    // the popover doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  const state = sensorState(hanger, alertStatus);
  const low = isLowBattery(hanger.batteryPct, lowBatteryThreshold);
  const live = state === "alert" || state === "cleaning";
  // signal and rssi carry the same value from the backend (gateway RSSI proxy);
  // prefer signal, fall back to rssi.
  const sig = hanger.signal ?? hanger.rssi ?? null;

  // The accent (banner + dot) follows the pin state.
  const accent =
    state === "alert" ? { dot: "bg-red-500", banner: "bg-red-50 text-red-700", text: "text-red-700" } :
    state === "cleaning" ? { dot: "bg-blue-500", banner: "bg-blue-50 text-blue-700", text: "text-blue-700" } :
    state === "offline" ? { dot: "bg-amber-400", banner: "bg-amber-50 text-amber-700", text: "text-amber-700" } :
    { dot: "bg-emerald-500", banner: "bg-emerald-50 text-emerald-700", text: "text-emerald-700" };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Sensor ${hanger.name || hanger.id}`}
      style={style}
      className={"z-20 w-[300px] max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden " + className}
    >
      {/* Header: status dot + name + close, then id · DevEUI */}
      <div className="px-3.5 pt-3 pb-2.5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className={"mt-1 h-2.5 w-2.5 rounded-full shrink-0 " + accent.dot + (live ? " animate-pulse" : "")} />
            <div className="font-semibold text-[15px] leading-tight text-slate-900 min-w-0">
              {hanger.name || "Wet-floor sign"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="mt-1 ml-[18px] flex items-center gap-1.5 text-xs text-slate-400 font-mono truncate">
          <span className="text-slate-600">{hanger.id}</span>
          {hanger.devEui && <span>· {hanger.devEui}</span>}
        </div>
      </div>

      <div className="px-3.5 py-3">
        {/* Status banner */}
        <div className={"flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium " + accent.banner}>
          <span className={"h-1.5 w-1.5 rounded-full " + accent.dot} />
          {sensorStateLabel(state)}
        </div>

        <div className="mt-2 divide-y divide-slate-100">
          <Row label="Zone" value={zoneName || "Unassigned"} />
          <Row label="Status" value={sensorStateLabel(state)} />
          <Row
            label="Battery"
            value={
              hanger.batteryPct != null ? (
                <span className="inline-flex items-center gap-1.5">
                  <BatteryGlyph pct={hanger.batteryPct} colorClass={batteryColor(hanger.batteryPct, low)} />
                  <span className={"font-medium " + batteryColor(hanger.batteryPct, low)}>{hanger.batteryPct}%</span>
                </span>
              ) : "—"
            }
          />
          <Row
            label="Signal"
            value={
              sig != null ? (
                <span className="inline-flex items-center gap-1.5" title={`${sig} dBm (${signalLabel(sig)})`}>
                  <SignalGlyph bars={rssiToBars(sig)} colorClass="text-emerald-600" />
                  <span className="text-slate-600">{rssiToBars(sig)}/5</span>
                </span>
              ) : "—"
            }
          />
          <Row label="Last seen" value={hanger.lastSeenAt ? relativeTime(hanger.lastSeenAt) : "Never"} />
          <Row
            label="Last lifted"
            value={hanger.lastLiftedAt ? liftedTime(hanger.lastLiftedAt, live) : "—"}
          />
          <Row
            label="Reports via"
            value={
              hanger.reportsViaGatewayName ? (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="0.6" fill="currentColor" />
                    </svg>
                    {hanger.reportsViaGatewayName}
                  </span>
                </span>
              ) : "—"
            }
          />
        </div>

        {activeAlertId && (
          <Link
            to={`/alerts/${activeAlertId}`}
            className={"mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white " +
              (alertStatus === "acknowledged" ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Open spill alert{alertRef ? ` ${alertRef}` : ""}
          </Link>
        )}
      </div>
    </div>
  );
}
