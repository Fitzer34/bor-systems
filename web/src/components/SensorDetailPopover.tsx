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

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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
  /** Low-battery threshold from org settings, if known. */
  lowBatteryThreshold?: number;
  onClose: () => void;
  /** Optional absolute-positioning style so it anchors near the pin. */
  style?: React.CSSProperties;
  className?: string;
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={"text-sm text-right " + (highlight ? "text-amber-700 font-medium" : "text-slate-900")}>
        {value}
      </span>
    </div>
  );
}

/**
 * Detail card for a single sensor (hanger), opened by tapping its pin or list
 * row. Anchored via `style` when shown over the plan; rendered inline when used
 * elsewhere. Closes on Escape or an outside click.
 */
export function SensorDetailPopover({
  hanger,
  zoneName,
  activeAlertId,
  alertStatus,
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
  // signal and rssi carry the same value from the backend (gateway RSSI proxy);
  // prefer signal, fall back to rssi.
  const sig = hanger.signal ?? hanger.rssi ?? null;

  const statusPill =
    state === "alert" ? "pill-alert" :
    state === "cleaning" ? "pill-info" :
    state === "offline" ? "pill-offline" :
    "pill-online";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Sensor ${hanger.name || hanger.id}`}
      style={style}
      className={"z-20 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-xl p-3 " + className}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{hanger.name || "Wet-floor sign"}</div>
          <div className="text-xs text-slate-500 font-mono truncate">{hanger.id}</div>
        </div>
        <span className={statusPill + " shrink-0"}>{sensorStateLabel(state)}</span>
      </div>

      <div className="divide-y divide-slate-100">
        <Row label="DevEUI" value={<span className="font-mono text-xs">{hanger.devEui || "—"}</span>} />
        <Row label="Zone" value={zoneName || "Unassigned"} />
        <Row
          label="Battery"
          value={hanger.batteryPct != null ? `${hanger.batteryPct}%` : "—"}
          highlight={low}
        />
        <Row
          label="Signal"
          value={sig != null ? `${sig} dBm (${signalLabel(sig)})` : "—"}
        />
        <Row label="Last seen" value={hanger.lastSeenAt ? relativeTime(hanger.lastSeenAt) : "Never"} />
        <Row label="Last lifted" value={hanger.lastLiftedAt ? relativeTime(hanger.lastLiftedAt) : "—"} />
        <Row
          label="Reports via"
          value={hanger.reportsViaGatewayName || "—"}
        />
      </div>

      {activeAlertId && (
        <Link
          to={`/alerts/${activeAlertId}`}
          className={"mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white " +
            (alertStatus === "acknowledged" ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {alertStatus === "acknowledged" ? "View cleaning task" : "View spill alert"}
        </Link>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full text-xs text-slate-500 hover:text-slate-700 py-1"
      >
        Close
      </button>
    </div>
  );
}
