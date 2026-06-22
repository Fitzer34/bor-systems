// @ts-nocheck
/* HazardLink — icons + shared presentational components.
   Ported verbatim from claude.ai/design prototype (asset_05). The only changes
   vs. the prototype source: ES imports for React + HL, and `export` in place of
   the prototype's `Object.assign(window, {…})` global registration. */
import React from "react";
import { HL } from "./data";

const I = {
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  droplet: '<path d="M12 2.6S5.5 9.4 5.5 14.3a6.5 6.5 0 0 0 13 0C18.5 9.4 12 2.6 12 2.6Z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  beaker: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-3L14 9.5V3"/><path d="M7 15h10"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  sparkles: '<path d="M12 3l1.6 4.2L18 8.8l-4.4 1.6L12 15l-1.6-4.6L6 8.8l4.4-1.6z"/><path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  chevronUp: '<polyline points="18 15 12 9 6 15"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 6 15 12 9 18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><polyline points="8 12 11 14.5 16 9"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  alertTri: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>',
  arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  trendDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><line x1="11" y1="18" x2="13" y2="18"/>',
  award: '<circle cx="12" cy="9" r="6"/><polyline points="15.5 13 17 22 12 19 7 22 8.5 13"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>',
  creditCard: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="11" x2="12" y2="16"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  "star-fill": '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  rotateCw: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};

export function Icon({ name, size }) {
  const path = I[name] || I.box;
  const fillIcons = ["droplet", "shield", "sparkles", "flag", "star-fill"];
  const filled = fillIcons.includes(name);
  return (
    <svg viewBox="0 0 24 24" width={size || 24} height={size || 24}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: path }} />
  );
}

/* discipline / severity helpers */
export const discMeta = {
  clean:  { label: "Cleaning",    icon: "droplet", pill: "pill-clean" },
  maint:  { label: "Maintenance", icon: "wrench",  pill: "pill-maint" },
  secure: { label: "Security",    icon: "shield",  pill: "pill-secure" },
};
export const sevColor = { crit: "var(--crit)", warn: "var(--warn)", ok: "var(--ok)", muted: "var(--ink-3)", accent: "var(--accent)", secure: "var(--secure)" };
export const softBg = (tone) => ({
  crit: "var(--crit-soft)", warn: "var(--warn-soft)", ok: "var(--ok-soft)", muted: "var(--surface-3)",
  accent: "var(--accent-soft)", clean: "var(--clean-soft)", maint: "var(--maint-soft)", secure: "var(--secure-soft)",
}[tone]);
export const solid = (tone) => ({
  crit: "var(--crit)", warn: "var(--warn)", ok: "var(--ok)", muted: "var(--ink-3)",
  accent: "var(--accent)", clean: "var(--clean)", maint: "var(--maint)", secure: "var(--secure)",
}[tone]);

export function Pill({ tone, children, dot, icon }) {
  return (
    <span className={"pill pill-" + tone}>
      {dot && <span className="pdot" style={{ background: "currentColor" }} />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function PriorityPill({ p }) {
  const map = { High: "crit", Medium: "warn", Low: "muted" };
  return <Pill tone={map[p] || "muted"} dot>{p}</Pill>;
}

/* ===========================================================
   Site filter context — read in every view
   =========================================================== */
export const SiteContext = React.createContext({ site: null, setSite: () => {} });

export function useSiteData() {
  const ctx = React.useContext(SiteContext);
  const site = ctx ? ctx.site : null;
  return React.useMemo(() => {
    if (!site) return HL;
    const N = site.name;
    const firstWord = N.split(/[\s,]/)[0].toLowerCase();
    const partsMatch = (s) =>
      s.toLowerCase().includes(firstWord) ||
      s.toLowerCase().includes("central");
    return {
      ...HL,
      feed:            HL.feed.filter((x)            => x.site === N),
      workOrders:      HL.workOrders.filter((x)      => x.site === N),
      spillAlerts:     HL.spillAlerts.filter((x)     => x.site === N),
      rounds:          HL.rounds.filter((x)          => x.site === N),
      incidents:       HL.incidents.filter((x)       => x.site === N),
      patrols:         HL.patrols.filter((x)         => x.site === N),
      loneWorkers:     HL.loneWorkers.filter((x)     => x.site === N),
      assets:          HL.assets.filter((x)          => x.site === N),
      deviceBuildings: HL.deviceBuildings.filter((x) => x.name === N),
      floorPlanSites:  HL.floorPlanSites.filter((x)  => x.name === N),
      meters:          HL.meters.filter((x)          => x.site === N),
      ppmTasks:        HL.ppmTasks.filter((x)        => x.site === N),
      parts:           HL.parts.filter((x)           => partsMatch(x.site)),
    };
  }, [site]);
}

export function siteOpenCount(siteName) {
  return HL.workOrders.filter((w) => w.site === siteName && w.status !== "Done").length
       + HL.spillAlerts.filter((s) => s.site === siteName && s.state === "new").length
       + HL.ppmTasks.filter((t) => t.site === siteName && t.status === "overdue").length;
}

/* ===========================================================
   Generic add/log modal — for "Add X" / "Log Y" buttons
   =========================================================== */
export function SimpleAddModal({
  title, subtitle, icon = "plus",
  fields = [], submitLabel = "Save", submitIcon = "check",
  successTitle = "Saved", successCopy = "",
  onClose, onSubmit,
}) {
  const [step, setStep]     = React.useState(1);
  const [values, setValues] = React.useState(() =>
    Object.fromEntries(fields.map((f) => [f.id, f.default || ""]))
  );
  const setVal = (id, v) => setValues((s) => ({ ...s, [id]: v }));

  const allFilled = fields
    .filter((f) => f.required !== false)
    .every((f) => (values[f.id] || "").toString().trim() !== "");

  const submit = () => {
    if (!allFilled) return;
    setStep(2);
    onSubmit && onSubmit(values);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name={icon} size={18} /></div>
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          {step === 1 && (
            <div className="ai-fields">
              {fields.map((f) => (
                <div key={f.id} className="ai-field">
                  <label>{f.label}</label>
                  {f.type === "select" ? (
                    <select className="dv-input" value={values[f.id] || ""}
                      onChange={(e) => setVal(f.id, e.target.value)}>
                      <option value="">{f.placeholder || "Select…"}</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea className="dv-input" rows={f.rows || 3}
                      value={values[f.id] || ""}
                      onChange={(e) => setVal(f.id, e.target.value)}
                      placeholder={f.placeholder || ""} />
                  ) : (
                    <input className="dv-input" type={f.type || "text"}
                      value={values[f.id] || ""}
                      onChange={(e) => setVal(f.id, e.target.value)}
                      placeholder={f.placeholder || ""} />
                  )}
                  {f.hint && <div className="ai-hint">{f.hint}</div>}
                </div>
              ))}
            </div>
          )}
          {step === 2 && (
            <div style={{ textAlign:"center", padding:"12px 0" }}>
              <div className="mic-orb" style={{ width:72, height:72 }}><Icon name="checkCircle" size={28} /></div>
              <h3 style={{ margin:"16px 0 4px", fontSize:17, fontFamily:"var(--font-head)" }}>{successTitle}</h3>
              {successCopy && (
                <p style={{ fontSize:13, color:"var(--ink-2)", margin:"0 auto", maxWidth:380, lineHeight:1.55 }}>
                  {successCopy}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="modal-foot">
          {step === 1 ? (
            <React.Fragment>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!allFilled}
                style={{ opacity: allFilled ? 1 : .5 }} onClick={submit}>
                <Icon name={submitIcon} size={15} />{submitLabel}
              </button>
            </React.Fragment>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Local in-view toast (uses existing .toast styles) */
export function useViewToast() {
  const [msg, setMsg] = React.useState(null);
  const timer = React.useRef(null);
  const show = (m) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  };
  const node = msg ? (
    <div className="toast"><Icon name="checkCircle" size={16} />{msg}</div>
  ) : null;
  return { showToast: show, toastNode: node };
}

/* ===========================================================
   Team / discipline switcher context
   =========================================================== */
export const TeamContext = React.createContext({ team: null, setTeam: () => {} });

export const TEAMS = [
  { id: null,     label: "All teams",   icon: "layers",  tone: "muted",  color: "var(--ink-3)" },
  { id: "clean",  label: "Cleaning",    icon: "droplet", tone: "clean",  color: "var(--clean)"  },
  { id: "maint",  label: "Maintenance", icon: "wrench",  tone: "maint",  color: "var(--maint)"  },
  { id: "secure", label: "Security",    icon: "shield",  tone: "secure", color: "var(--secure)" },
];
