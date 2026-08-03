// @ts-nocheck
/* AUTO-GENERATED — do not edit by hand. Regenerate: node web/src/prototype/assemble.mjs
   The entire claude.ai/design prototype, assembled verbatim from _source/ in load order. */
import React from "react";
import * as ReactDOMFull from "react-dom";
import { createRoot } from "react-dom/client";
const ReactDOM = Object.assign({}, ReactDOMFull, { createRoot });
import { HL } from "./data";
import {
  Icon, Pill, PriorityPill, discMeta, sevColor, softBg, solid,
  SiteContext, useSiteData, siteOpenCount, SimpleAddModal, useViewToast,
  TeamContext, TEAMS,
} from "./primitives";
if (typeof window !== "undefined") { window.React = React; window.HL = HL; }

/* ════════════════════ asset_07_0bb65b22.js ════════════════════ */
;
/* HazardLink — shared live device store.
   Holds newly-added gateways and hangers so the Devices view and the
   Floor-plan editor can share state. A tiny React hook (useHLLive)
   re-renders any subscriber on change. */

(function () {
  if (window.HL_LIVE) return; // idempotent
  const store = {
    /* Added hangers: { id, devEUI, type:"Hanger", site, building, floorLabel, zone,
       battery, signal, online, gateway, addedAt, placed: {siteId,floorIdx,x,y} | null } */
    addedHangers: [],
    /* Added gateways: { id, type:"Gateway", site, building, room, ssid, online,
       battery:null, signal, hangersHeard, addedAt } */
    addedGateways: [],
    /* Map from hanger id -> gateway id it reports through. For both seed pins and added ones. */
    hangerToGateway: {},
    subs: new Set(),
    bump() { this.subs.forEach((fn) => fn()); },
    addHanger(h) { this.addedHangers.push(h); this.bump(); },
    addGateway(g) { this.addedGateways.push(g); this.bump(); },
    placeHanger(id, siteId, floorIdx, x, y) {
      const h = this.addedHangers.find((x) => x.id === id);
      if (!h) return;
      h.placed = { siteId, floorIdx, x, y };
      this.bump();
    },
    setHangerGateway(hangerId, gatewayId) {
      this.hangerToGateway[hangerId] = gatewayId;
      this.bump();
    },
    /* Lookup: which gateway does a hanger report through?
       Falls back to the first gateway in the same building. */
    gatewayForHanger(hangerId, buildingName) {
      if (this.hangerToGateway[hangerId]) return this.hangerToGateway[hangerId];
      const allGateways = [
        ...HL.deviceBuildings.flatMap((b) =>
          b.devices.filter((d) => d.type === "Gateway").map((d) => ({ ...d, building: b.name }))),
        ...this.addedGateways.map((g) => ({ ...g, building: g.building || g.site })),
      ];
      const inBuilding = allGateways.filter((g) => g.building === buildingName && g.online !== false);
      return (inBuilding[0] && inBuilding[0].id) || (allGateways[0] && allGateways[0].id);
    },
    /* Convenience: how many hangers does a given gateway hear?
       Counts seed hangers in the same building + added hangers explicitly
       mapped to this gateway. */
    hangersHeardBy(gatewayId, buildingName) {
      const seed = HL.deviceBuildings
        .find((b) => b.name === buildingName);
      const seedHangers = seed ? seed.devices.filter((d) => d.type === "Hanger" && d.online).length : 0;
      const added = this.addedHangers.filter((h) =>
        (this.hangerToGateway[h.id] || this.gatewayForHanger(h.id, h.building)) === gatewayId
      ).length;
      return seedHangers + added;
    },
  };
  window.HL_LIVE = store;

  window.useHLLive = function () {
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => {
      store.subs.add(force);
      return () => store.subs.delete(force);
    }, []);
    return store;
  };
})();

/* ════════════════════ asset_06_dedd1cfa.js ════════════════════ */
;
/* HazardLink — QR codes + Scanner modal (visual mocks) */

/* ---------- pseudo-random number generator ---------- */
function _qrHash(s) {
  s = s || "x";
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function _qrRng(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- QRCode SVG ---------- */
/* Visual mock: deterministic 21×21 grid with proper finder patterns
   and timing lines. Doesn't encode anything — for prototype display only. */
function QRCode({ value, size, fg, bg, padding }) {
  size    = size || 56;
  fg      = fg   || "#0d1526";
  bg      = bg   || "#ffffff";
  padding = padding != null ? padding : 0;

  const N = 21;
  const inner = size - padding * 2;
  const cell  = inner / N;
  const rand  = _qrRng(_qrHash(value));

  // 0 = empty, 1 = filled
  const grid = new Uint8Array(N * N);
  const set  = (x, y, v) => { if (x>=0 && x<N && y>=0 && y<N) grid[y*N+x] = v ? 1 : 0; };
  const isFinderArea  = (x, y) =>
       (x <= 7 && y <= 7) || (x >= N - 8 && y <= 7) || (x <= 7 && y >= N - 8);
  const isTiming = (x, y) => (x === 6 || y === 6);

  // 1. random fill outside reserved areas
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!isFinderArea(x, y) && !isTiming(x, y)) {
        if (rand() < 0.50) grid[y*N+x] = 1;
      }
    }
  }

  // 2. finder patterns (7x7 with hollow ring + 3x3 centre)
  const drawFinder = (ox, oy) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge   = (x === 0 || x === 6 || y === 0 || y === 6);
        const centre = (x >= 2 && x <= 4 && y >= 2 && y <= 4);
        set(ox + x, oy + y, edge || centre ? 1 : 0);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(N - 7, 0);
  drawFinder(0, N - 7);

  // 3. timing patterns (alternating between finders)
  for (let i = 8; i < N - 8; i++) {
    set(i, 6, i % 2 === 0 ? 1 : 0);
    set(6, i, i % 2 === 0 ? 1 : 0);
  }

  // 4. a small alignment-pattern-ish square bottom-right for realism
  const ax = N - 5, ay = N - 5;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const onEdge = (x === 0 || x === 2 || y === 0 || y === 2);
      const centre = (x === 1 && y === 1);
      set(ax + x, ay + y, onEdge || centre ? 1 : 0);
    }
  }

  // render — group adjacent cells into row runs to keep the DOM small
  const runs = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      if (!grid[y*N+x]) { x++; continue; }
      let run = 1;
      while (x + run < N && grid[y*N+x+run]) run++;
      runs.push(
        <rect key={y*N+x}
          x={padding + x * cell}
          y={padding + y * cell}
          width={cell * run}
          height={cell}
        />
      );
      x += run;
    }
  }

  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}
      shapeRendering="crispEdges" style={{ display: "block" }}>
      <rect width={size} height={size} fill={bg} />
      <g fill={fg}>{runs}</g>
    </svg>
  );
}

/* ---------- QR card with id label below ---------- */
function QRWithLabel({ value, label, size }) {
  size = size || 220;
  return (
    <div className="qr-with-label">
      <div className="qr-big" style={{ width: size, height: size }}>
        <QRCode value={value} size={size - 20} padding={0} />
      </div>
      <div className="qr-id-mono">{label || value}</div>
    </div>
  );
}

/* ===========================================================
   Scanner modal — camera viewfinder mock + simulate scan
   =========================================================== */

/* test targets used by the Simulate Scan action and pickable list.
   Kept generic — any visible part/asset id will resolve, the views
   look up by id from live HL data. */
const _SCAN_TARGETS = [
  { kind:"part",  id:"P-0654",   name:"Condensate drain kit",          note:"Northgate · out of stock" },
  { kind:"part",  id:"P-0987",   name:"Pleated air filter, 600×600",   note:"Aviva plant room · low" },
  { kind:"part",  id:"P-1042",   name:"V-belt — A85",                  note:"Central stores · in stock" },
  { kind:"part",  id:"P-1234",   name:"Fire alarm battery, 12V 7Ah",   note:"Lee Valley · low" },
  { kind:"asset", id:"AST-0142", name:"Cold store refrigeration unit", note:"Northgate Logistics Hub" },
  { kind:"asset", id:"AST-0098", name:"Rooftop HVAC unit 3",           note:"Aviva Office Tower" },
  { kind:"asset", id:"AST-0203", name:"Fire alarm panel",              note:"Lee Valley Medical Centre" },
];

function ScannerModal({ onClose, onResolve, defaultTarget }) {
  // phase: idle | scanning | found
  const [phase,  setPhase]  = React.useState("idle");
  const [hit,    setHit]    = React.useState(null);

  // close on Escape
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && phase !== "scanning") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  const runScan = (target) => {
    if (phase === "scanning") return;
    setHit(target);
    setPhase("scanning");
    setTimeout(() => {
      setPhase("found");
      setTimeout(() => { onResolve(target); }, 700);
    }, 1100);
  };

  const primaryTarget = defaultTarget || _SCAN_TARGETS[0];
  const otherTargets  = _SCAN_TARGETS.filter((t) => t.id !== primaryTarget.id).slice(0, 4);

  return (
    <div className="overlay" onClick={(e) => { if (phase !== "scanning") onClose(); }}>
      <div className="modal scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico" style={{ background:"linear-gradient(135deg, #0d9488, #2563EB)" }}>
            <Icon name="scan" size={20} />
          </div>
          <div>
            <h3>Scan QR or barcode</h3>
            <p>Camera-based scanner · iOS / Android app · web demo</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding:"16px 18px 18px" }}>
          <div className={"scanner-viewport " + phase}>
            <div className="vp-feed" />
            <div className="vp-noise" />
            <div className="vp-vignette" />
            <div className="vp-frame">
              <span className="vp-corner vp-tl" />
              <span className="vp-corner vp-tr" />
              <span className="vp-corner vp-bl" />
              <span className="vp-corner vp-br" />
              {phase !== "found" && <div className="vp-scanline" />}
            </div>
            {phase === "found" && hit && (
              <div className="vp-found">
                <div className="vp-found-card">
                  <div className="vp-found-ok"><Icon name="checkCircle" size={20} /></div>
                  <div className="vp-found-id">{hit.id}</div>
                  <div className="vp-found-nm">{hit.name}</div>
                </div>
              </div>
            )}
          </div>

          <div className="scanner-prompt">
            <Icon name="scan" size={14} />
            <span>Point at a part or asset QR / barcode</span>
          </div>

          <button className="btn btn-primary scanner-sim"
            onClick={() => runScan(primaryTarget)}
            disabled={phase !== "idle"}>
            <Icon name={phase === "scanning" ? "scan" : phase === "found" ? "checkCircle" : "scan"} size={15} />
            {phase === "scanning" ? "Scanning…" : phase === "found" ? "Found — opening…" : "Simulate scan"}
          </button>

          {phase === "idle" && (
            <div className="scanner-list">
              <div className="scanner-list-cap">Try one of these test codes</div>
              {otherTargets.map((t) => (
                <button key={t.id} className="scanner-row" onClick={() => runScan(t)}>
                  <div className="scanner-qr">
                    <QRCode value={t.id} size={36} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="scanner-row-id">{t.id}</div>
                    <div className="scanner-row-nm">{t.name}<small> · {t.note}</small></div>
                  </div>
                  <Pill tone={t.kind === "part" ? "muted" : "accent"}>
                    {t.kind === "part" ? "Part" : "Asset"}
                  </Pill>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { QRCode, QRWithLabel, ScannerModal, _SCAN_TARGETS });

/* ════════════════════ asset_04_7e8e725d.jsx ════════════════════ */
;
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-omelette-chrome=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">
          {children}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});

/* ════════════════════ asset_12_4d4435ee.js ════════════════════ */
;
/* HazardLink — Roles & permissions
   Admin-controlled matrix that decides what each role sees and can do.
   - Persisted to localStorage
   - 'Preview as role' switcher in the top bar actually hides non-permitted
     sidebar sections so the admin sees the world through that role's eyes. */

const ROLE_LIST = [
  { id:"admin",       label:"Admin",       tone:"secure", icon:"shield",
    desc:"Full system access. Cannot be restricted.", locked:true },
  { id:"supervisor",  label:"Supervisor",  tone:"accent", icon:"award",
    desc:"Site-level access. Can approve and report." },
  { id:"field staff", label:"Field staff", tone:"clean",  icon:"user",
    desc:"On-the-floor mobile users. Minimal access." },
];

const ROLE_COUNTS = { "admin": 0, "supervisor": 0, "field staff": 0 };

const MODULE_GROUPS = [
  { id:"ops",      label:"Operations",  icon:"layers", items:[
    { id:"dashboard",   label:"Dashboard",        icon:"grid" },
    { id:"scheduling",  label:"Scheduling",       icon:"calendar" },
    { id:"cleaning",    label:"Cleaning",         icon:"droplet" },
    { id:"spills",      label:"Spill alerts",     icon:"alertTri" },
    { id:"floorplan",   label:"Floor plans",      icon:"mapPin" },
    { id:"devices",     label:"Devices",          icon:"monitor" },
    { id:"security",    label:"Security",         icon:"shield" },
    { id:"visitors",    label:"Visitors",         icon:"users" },
    { id:"sds",         label:"Safety sheets",    icon:"beaker" },
  ]},
  { id:"maint",    label:"Maintenance", icon:"wrench", items:[
    { id:"maint-overview", label:"Overview",          icon:"gauge" },
    { id:"maintenance",    label:"Work orders",       icon:"wrench" },
    { id:"ppm",            label:"PPM schedule",      icon:"clock" },
    { id:"meters",         label:"Meters",            icon:"activity" },
    { id:"parts",          label:"Parts & inventory", icon:"package" },
    { id:"competency",     label:"Competency",        icon:"award" },
    { id:"compliance",     label:"Compliance",        icon:"checkCircle" },
    { id:"slas",           label:"SLAs",              icon:"clock" },
    { id:"permits",        label:"Permits",           icon:"shield" },
  ]},
  { id:"manage",   label:"Manage",      icon:"box", items:[
    { id:"assets",      label:"Assets",        icon:"box" },
    { id:"contractors", label:"Contractors",   icon:"user" },
    { id:"clientportal",label:"Client portal", icon:"layers" },
    { id:"forms",       label:"Forms",         icon:"file" },
    { id:"timesheets",  label:"Timesheets",    icon:"clock" },
    { id:"billing",     label:"Billing",       icon:"creditCard" },
  ]},
  { id:"insights", label:"Insights",    icon:"chart", items:[
    { id:"automations", label:"Automations", icon:"sparkles" },
    { id:"reports",     label:"Reports",     icon:"chart" },
    { id:"audit",       label:"Audit log",   icon:"activity" },
  ]},
  { id:"admin",    label:"Admin",       icon:"cog", items:[
    { id:"users",     label:"Users",    icon:"users" },
    { id:"settings",  label:"Settings", icon:"cog" },
  ]},
];

const SENSITIVE_ACTIONS = [
  { id:"approve_permits",    label:"Approve permits",             desc:"Sign off permits-to-work and lockout/tagout" },
  { id:"approve_quotes",     label:"Approve quotes & POs",        desc:"Approve contractor quotes and purchase orders" },
  { id:"edit_compliance",    label:"Edit compliance records",     desc:"Add or amend compliance and inspection records" },
  { id:"manage_devices",     label:"Manage devices / hardware",   desc:"Pair, configure or remove site devices" },
  { id:"manage_automations", label:"Manage automations",          desc:"Create, edit or pause automation rules" },
  { id:"export_reports",     label:"Export reports",              desc:"Download CSV / PDF exports of reports" },
  { id:"manage_users",       label:"Manage users",                desc:"Invite, edit and deactivate users" },
  { id:"manage_billing",     label:"Manage billing & financials", desc:"Edit billing details and view financials" },
  { id:"delete_records",     label:"Delete records",              desc:"Permanently delete work orders, assets, etc." },
];

/* Sensible default matrix per the brief */
const DEFAULT_PERMS = {
  "admin": { modules:"*", actions:"*" },
  "supervisor": {
    modules: {
      dashboard:true, scheduling:true, cleaning:true, spills:true, floorplan:true,
      devices:true, security:true, visitors:true, sds:true,
      "maint-overview":true, maintenance:true, ppm:true, meters:true, parts:true,
      competency:true, compliance:true, slas:true, permits:true,
      assets:true, contractors:true, clientportal:true, forms:true, timesheets:true,
      billing:false,
      automations:false, reports:true, audit:true,
      users:false, settings:false,
    },
    actions: {
      approve_permits:true, approve_quotes:true, edit_compliance:true,
      manage_devices:true, manage_automations:false, export_reports:true,
      manage_users:false, manage_billing:false, delete_records:false,
    },
  },
  "field staff": {
    modules: {
      dashboard:true, scheduling:true, cleaning:true, spills:true, floorplan:true,
      devices:false, security:false, visitors:false, sds:true,
      "maint-overview":false, maintenance:false, ppm:false, meters:false, parts:false,
      competency:false, compliance:false, slas:false, permits:false,
      assets:false, contractors:false, clientportal:false, forms:true, timesheets:false,
      billing:false,
      automations:false, reports:false, audit:false,
      users:false, settings:false,
    },
    actions: {
      approve_permits:false, approve_quotes:false, edit_compliance:false,
      manage_devices:false, manage_automations:false, export_reports:false,
      manage_users:false, manage_billing:false, delete_records:false,
    },
  },
};

const PERMS_LS_KEY    = "hl.permissions.v1";
const PREVIEW_LS_KEY  = "hl.previewRole.v1";

function readStoredPerms() {
  try {
    const raw = localStorage.getItem(PERMS_LS_KEY);
    if (!raw) return DEFAULT_PERMS;
    const p = JSON.parse(raw);
    return {
      "admin": DEFAULT_PERMS.admin,
      "supervisor": {
        modules: { ...DEFAULT_PERMS.supervisor.modules, ...((p && p.supervisor && p.supervisor.modules) || {}) },
        actions: { ...DEFAULT_PERMS.supervisor.actions, ...((p && p.supervisor && p.supervisor.actions) || {}) },
      },
      "field staff": {
        modules: { ...DEFAULT_PERMS["field staff"].modules, ...((p && p["field staff"] && p["field staff"].modules) || {}) },
        actions: { ...DEFAULT_PERMS["field staff"].actions, ...((p && p["field staff"] && p["field staff"].actions) || {}) },
      },
    };
  } catch (e) { return DEFAULT_PERMS; }
}
function writeStoredPerms(p) {
  try { localStorage.setItem(PERMS_LS_KEY, JSON.stringify({ supervisor:p.supervisor, "field staff":p["field staff"] })); } catch (e) {}
}
function readStoredPreviewRole() {
  try { const v = localStorage.getItem(PREVIEW_LS_KEY); return v || null; } catch (e) { return null; }
}
function writeStoredPreviewRole(v) {
  try { if (v) localStorage.setItem(PREVIEW_LS_KEY, v); else localStorage.removeItem(PREVIEW_LS_KEY); } catch (e) {}
}

const PermissionsContext = React.createContext({
  perms: DEFAULT_PERMS,
  setPerms: () => {},
  previewRole: null,
  setPreviewRole: () => {},
});

/* True if a role should be allowed to see this nav item id. Unknown ids
   (assistant, team, notifications, portfolio, site, wo, user) are visible. */
function isModuleAllowed(perms, role, moduleId) {
  if (!role || role === "admin") return true;
  const m = perms[role] && perms[role].modules;
  if (!m || m === "*") return true;
  if (!(moduleId in m)) return true;
  return !!m[moduleId];
}
function isActionAllowed(perms, role, actionId) {
  if (!role || role === "admin") return true;
  const a = perms[role] && perms[role].actions;
  if (!a || a === "*") return true;
  return !!a[actionId];
}

/* ===========================================================
   Preview-as-role banner (rendered above content)
   =========================================================== */
function PreviewBanner() {
  const { previewRole, setPreviewRole } = React.useContext(PermissionsContext);
  if (!previewRole) return null;
  const meta = ROLE_LIST.find((r) => r.id === previewRole);
  return (
    <div className="preview-banner">
      <div className="preview-banner-ico"><Icon name="eye" size={15} /></div>
      <div className="preview-banner-txt">
        <b>Previewing as {meta.label}</b>
        <span>Sidebar hides anything this role can't see. Their experience exactly.</span>
      </div>
      <button className="btn btn-sm preview-banner-exit" onClick={() => setPreviewRole(null)}>
        <Icon name="x" size={13} />Exit preview
      </button>
    </div>
  );
}

/* ===========================================================
   Preview-as-role switcher (rendered in the top bar)
   =========================================================== */
function PreviewRoleSwitcher() {
  const { previewRole, setPreviewRole } = React.useContext(PermissionsContext);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const current = previewRole
    ? ROLE_LIST.find((r) => r.id === previewRole)
    : null;

  return (
    <div className="preview-switcher" ref={ref}>
      <button className={"preview-btn" + (previewRole ? " on" : "")} onClick={() => setOpen((o) => !o)} title="Preview the app as a different role">
        <Icon name="eye" size={14} />
        <span className="preview-btn-lbl">{current ? "Previewing as " + current.label : "Preview as role"}</span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="preview-menu">
          <div className="preview-menu-cap">See the app as another role sees it</div>
          <button className={"preview-menu-row" + (!previewRole ? " on" : "")}
            onClick={() => { setPreviewRole(null); setOpen(false); }}>
            <span className="prev-ico"><Icon name="shield" size={14} /></span>
            <div className="prev-body">
              <div className="prev-name">Admin (you)</div>
              <div className="prev-sub">No preview · full access</div>
            </div>
            {!previewRole && <Icon name="check" size={14} />}
          </button>
          {ROLE_LIST.filter((r) => r.id !== "admin").map((r) => {
            const on = previewRole === r.id;
            return (
              <button key={r.id} className={"preview-menu-row" + (on ? " on" : "")}
                onClick={() => { setPreviewRole(r.id); setOpen(false); }}>
                <span className="prev-ico" style={{ background:softBg(r.tone), color:solid(r.tone) }}>
                  <Icon name={r.icon} size={14} />
                </span>
                <div className="prev-body">
                  <div className="prev-name">{r.label}</div>
                  <div className="prev-sub">{r.desc}</div>
                </div>
                {on && <Icon name="check" size={14} />}
              </button>
            );
          })}
          <div className="preview-menu-foot">
            <Icon name="info" size={11} />
            <span>Changes to permissions apply at each user's next sign-in.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   The Settings tab — Roles & permissions
   =========================================================== */
function RolesPermissionsSettings({ showToast }) {
  const { perms, setPerms } = React.useContext(PermissionsContext);
  const [selRole, setSelRole] = React.useState("supervisor");
  const [draft, setDraft]     = React.useState(perms);

  // Re-sync the draft when the upstream perms change (e.g. on first load).
  React.useEffect(() => { setDraft(perms); }, [perms]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(perms);
  const role = ROLE_LIST.find((r) => r.id === selRole);
  const isAdmin = selRole === "admin";

  const setModule = (id, val) => {
    setDraft((d) => ({
      ...d,
      [selRole]: { ...d[selRole], modules: { ...d[selRole].modules, [id]: val } },
    }));
  };
  const setAction = (id, val) => {
    setDraft((d) => ({
      ...d,
      [selRole]: { ...d[selRole], actions: { ...d[selRole].actions, [id]: val } },
    }));
  };

  const groupBulk = (group, val) => {
    setDraft((d) => {
      const next = { ...d[selRole].modules };
      group.items.forEach((it) => { next[it.id] = val; });
      return { ...d, [selRole]: { ...d[selRole], modules: next } };
    });
  };

  const reset = () => setDraft(DEFAULT_PERMS);
  const cancel = () => setDraft(perms);
  const save = () => {
    setPerms(draft);
    writeStoredPerms(draft);
    showToast("Permissions saved · applies at next sign-in");
  };

  /* Counts for the live preview */
  const visibleModules = isAdmin
    ? MODULE_GROUPS.flatMap((g) => g.items)
    : MODULE_GROUPS.flatMap((g) => g.items.filter((it) => draft[selRole].modules[it.id]));
  const enabledActions = isAdmin
    ? SENSITIVE_ACTIONS
    : SENSITIVE_ACTIONS.filter((a) => draft[selRole].actions[a.id]);

  return (
    <div className="settings-card">
      <div className="rp-shell">
        {/* Left: role chooser */}
        <div className="card rp-roles">
          <div className="rp-roles-head">
            <div className="panel-label" style={{ margin:0 }}>Roles</div>
            <span className="rp-foot-hint">3 total</span>
          </div>
          {ROLE_LIST.map((r) => {
            const on = r.id === selRole;
            return (
              <button key={r.id} className={"rp-role-card" + (on ? " on" : "")}
                onClick={() => setSelRole(r.id)}>
                <span className="rp-role-ico" style={{ background:softBg(r.tone), color:solid(r.tone) }}>
                  <Icon name={r.icon} size={16} />
                </span>
                <div className="rp-role-body">
                  <div className="rp-role-name">
                    {r.label}
                    {r.locked && <span className="rp-lock"><Icon name="lock" size={10} />Locked</span>}
                  </div>
                  <div className="rp-role-sub">{r.desc}</div>
                </div>
                <div className="rp-role-count">
                  <b>{ROLE_COUNTS[r.id]}</b>
                  <span>{ROLE_COUNTS[r.id] === 1 ? "user" : "users"}</span>
                </div>
              </button>
            );
          })}
          <div className="rp-roles-foot">
            <Icon name="info" size={11} />
            <span>Changes apply at each user's next sign-in.</span>
          </div>
        </div>

        {/* Middle: matrix */}
        <div className="rp-matrix">
          <div className="card card-pad rp-role-banner">
            <span className="rp-role-ico lg" style={{ background:softBg(role.tone), color:solid(role.tone) }}>
              <Icon name={role.icon} size={18} />
            </span>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="rp-banner-name">{role.label}</div>
              <div className="rp-banner-sub">
                {isAdmin
                  ? "Admin has full access to every module and sensitive action. This is enforced and cannot be edited."
                  : "Decide what " + role.label.toLowerCase() + " users see in the nav and what sensitive things they can do."}
              </div>
            </div>
            {isAdmin
              ? <Pill tone="secure" dot>Full access</Pill>
              : <button className="btn btn-sm" onClick={reset} title="Reset to recommended defaults">
                  <Icon name="rotateCw" size={12} />Reset defaults
                </button>}
          </div>

          {/* Module visibility */}
          <div className="card rp-section">
            <div className="rp-section-head">
              <div>
                <div className="rp-section-title">Module visibility</div>
                <div className="rp-section-sub">Tick a section to give {role.label.toLowerCase()} users the sidebar entry. Untick to hide it from them entirely.</div>
              </div>
            </div>
            {MODULE_GROUPS.map((g) => {
              const items = g.items;
              const checkedCount = isAdmin
                ? items.length
                : items.filter((it) => draft[selRole].modules[it.id]).length;
              const allOn  = checkedCount === items.length;
              const allOff = checkedCount === 0;
              return (
                <div className="rp-group" key={g.id}>
                  <div className="rp-group-head">
                    <div className="rp-group-label">
                      <Icon name={g.icon} size={13} />{g.label}
                    </div>
                    <div className="rp-group-meta">
                      <span className="rp-count-chip">{checkedCount}/{items.length}</span>
                      {!isAdmin && (
                        <React.Fragment>
                          <button className="rp-mini" disabled={allOn}  onClick={() => groupBulk(g, true)}>All</button>
                          <button className="rp-mini" disabled={allOff} onClick={() => groupBulk(g, false)}>None</button>
                        </React.Fragment>
                      )}
                    </div>
                  </div>
                  <div className="rp-mod-grid">
                    {items.map((it) => {
                      const checked = isAdmin ? true : !!draft[selRole].modules[it.id];
                      return (
                        <label key={it.id} className={"rp-mod" + (checked ? " on" : "") + (isAdmin ? " locked" : "")}>
                          <input type="checkbox" checked={checked} disabled={isAdmin}
                            onChange={(e) => setModule(it.id, e.target.checked)} />
                          <span className="rp-mod-tick"><Icon name="check" size={11} /></span>
                          <Icon name={it.icon} size={13} />
                          <span className="rp-mod-lbl">{it.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sensitive actions */}
          <div className="card rp-section">
            <div className="rp-section-head">
              <div>
                <div className="rp-section-title">Sensitive actions</div>
                <div className="rp-section-sub">Even within a visible module, these specific actions are gated. Off by default for safety.</div>
              </div>
            </div>
            <div className="rp-action-list">
              {SENSITIVE_ACTIONS.map((a) => {
                const on = isAdmin ? true : !!draft[selRole].actions[a.id];
                return (
                  <div className={"rp-action-row" + (on ? " on" : "")} key={a.id}>
                    <div className="rp-action-body">
                      <div className="rp-action-name">{a.label}</div>
                      <div className="rp-action-sub">{a.desc}</div>
                    </div>
                    {isAdmin
                      ? <span className="rp-full-tag">Full access</span>
                      : <Toggle on={on} onChange={(v) => setAction(a.id, v)} />}
                  </div>
                );
              })}
            </div>
          </div>

          {!isAdmin && (
            <div className="settings-actions">
              <button className="btn" onClick={cancel} disabled={!dirty} style={{ opacity: dirty ? 1 : .55 }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save} disabled={!dirty} style={{ opacity: dirty ? 1 : .55 }}>
                <Icon name="check" size={14} />Save changes
              </button>
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div className="rp-preview-wrap">
          <div className="card rp-preview">
            <div className="rp-preview-head">
              <div>
                <div className="rp-preview-title">What this role sees</div>
                <div className="rp-preview-sub">Live preview as you toggle</div>
              </div>
              <span className="rp-role-ico" style={{ background:softBg(role.tone), color:solid(role.tone) }}>
                <Icon name={role.icon} size={13} />
              </span>
            </div>

            <div className="rp-preview-stats">
              <div className="rp-pstat">
                <b>{visibleModules.length}</b>
                <span>of {MODULE_GROUPS.reduce((s, g) => s + g.items.length, 0)} modules</span>
              </div>
              <div className="rp-pstat">
                <b>{enabledActions.length}</b>
                <span>of {SENSITIVE_ACTIONS.length} actions</span>
              </div>
            </div>

            <div className="rp-preview-nav">
              {MODULE_GROUPS.map((g) => {
                const vis = isAdmin
                  ? g.items
                  : g.items.filter((it) => draft[selRole].modules[it.id]);
                if (vis.length === 0) return null;
                return (
                  <div className="rp-nav-group" key={g.id}>
                    <div className="rp-nav-label">{g.label}</div>
                    {vis.map((it) => (
                      <div className="rp-nav-item" key={it.id}>
                        <Icon name={it.icon} size={13} />
                        <span>{it.label}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {visibleModules.length === 0 && (
                <div className="rp-preview-empty">
                  <Icon name="alertTri" size={14} />
                  This role has no modules. They'll see nothing in the nav.
                </div>
              )}
            </div>

            {enabledActions.length > 0 && (
              <div className="rp-preview-actions">
                <div className="rp-nav-label">Can also</div>
                {enabledActions.map((a) => (
                  <div className="rp-preview-action" key={a.id}>
                    <Icon name="check" size={11} />{a.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  PermissionsContext,
  DEFAULT_PERMS,
  readStoredPerms,
  writeStoredPerms,
  readStoredPreviewRole,
  writeStoredPreviewRole,
  isModuleAllowed,
  isActionAllowed,
  RolesPermissionsSettings,
  PreviewBanner,
  PreviewRoleSwitcher,
  ROLE_LIST,
  ROLE_COUNTS,
  MODULE_GROUPS,
  SENSITIVE_ACTIONS,
});

/* ════════════════════ asset_21_08c7d203.js ════════════════════ */
;
/* HazardLink — notifications data, types and storage hook.
   Loaded before chrome.jsx so the bell can use useNotifs(). */

const NOTIF_TYPES = {
  spills:      { label:"Spills",      icon:"droplet",     tone:"crit",   color:"var(--crit)",   soft:"var(--crit-soft)"   },
  maintenance: { label:"Maintenance", icon:"wrench",      tone:"maint",  color:"var(--maint)",  soft:"var(--maint-soft)"  },
  compliance:  { label:"Compliance",  icon:"checkCircle", tone:"warn",   color:"var(--warn)",   soft:"var(--warn-soft)"   },
  security:    { label:"Security",    icon:"shield",      tone:"secure", color:"var(--secure)", soft:"var(--secure-soft)" },
  billing:     { label:"Billing",     icon:"creditCard",  tone:"accent", color:"var(--accent)", soft:"var(--accent-soft)" },
  system:      { label:"System",      icon:"cog",         tone:"muted",  color:"var(--ink-3)",  soft:"var(--surface-3)"   },
};

/* Items are written in newest-first order. Each has:
     id, type (key of NOTIF_TYPES), severity (crit|warn|muted|accent),
     title, context, time (relative string), bucket (today|earlier),
     view  — the page the row links to,
     action — optional { label, icon, tone } used on the full page */
const NOTIF_ITEMS = [];

const NOTIF_TYPE_ORDER = ["spills","maintenance","compliance","security","billing","system"];

/* localStorage keys */
const NOTIF_READ_KEY  = "hl.notifs.read.v1";
const NOTIF_PREFS_KEY = "hl.notifs.prefs.v1";

const DEFAULT_NOTIF_PREFS = {
  spills:      { inapp:true, email:true,  sms:true  },
  maintenance: { inapp:true, email:true,  sms:false },
  compliance:  { inapp:true, email:true,  sms:false },
  security:    { inapp:true, email:true,  sms:true  },
  billing:     { inapp:true, email:true,  sms:false },
  system:      { inapp:true, email:false, sms:false },
};

const NOTIF_CHANNELS = [
  { id:"inapp", label:"In-app",  sub:"Bell + page",   icon:"bell" },
  { id:"email", label:"Email",   sub:"via Brevo",     icon:"send" },
  { id:"sms",   label:"SMS",     sub:"via Twilio",    icon:"phone" },
];

function readNotifRead() {
  try {
    const raw = localStorage.getItem(NOTIF_READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch(e) { return new Set(); }
}
function writeNotifRead(set) {
  try { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set])); } catch(e) {}
  window.dispatchEvent(new CustomEvent("notifs:changed"));
}
function readNotifPrefs() {
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOTIF_PREFS };
    const parsed = JSON.parse(raw);
    // merge so newly added types fall back to defaults
    const out = { ...DEFAULT_NOTIF_PREFS };
    for (const k of Object.keys(DEFAULT_NOTIF_PREFS)) {
      out[k] = { ...DEFAULT_NOTIF_PREFS[k], ...(parsed[k] || {}) };
    }
    return out;
  } catch(e) { return { ...DEFAULT_NOTIF_PREFS }; }
}
function writeNotifPrefs(prefs) {
  try { localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs)); } catch(e) {}
  window.dispatchEvent(new CustomEvent("notifs:changed"));
}

/* Hook — both the topbar bell and the full page subscribe to the same
   storage-backed state via a custom event so they stay in sync. */
function useNotifs() {
  const [readSet, setReadSet]   = React.useState(() => readNotifRead());
  const [prefs,   setPrefsState] = React.useState(() => readNotifPrefs());

  React.useEffect(() => {
    const sync = () => {
      setReadSet(readNotifRead());
      setPrefsState(readNotifPrefs());
    };
    window.addEventListener("notifs:changed", sync);
    window.addEventListener("storage",         sync);
    return () => {
      window.removeEventListener("notifs:changed", sync);
      window.removeEventListener("storage",         sync);
    };
  }, []);

  const markRead = React.useCallback((id) => {
    const s = new Set(readNotifRead());
    s.add(id);
    writeNotifRead(s);
    setReadSet(s);
  }, []);
  const markUnread = React.useCallback((id) => {
    const s = new Set(readNotifRead());
    s.delete(id);
    writeNotifRead(s);
    setReadSet(s);
  }, []);
  const markAllRead = React.useCallback(() => {
    const s = new Set(NOTIF_ITEMS.map((n) => n.id));
    writeNotifRead(s);
    setReadSet(s);
  }, []);
  const setPref = React.useCallback((type, channel, val) => {
    const cur  = readNotifPrefs();
    const next = { ...cur, [type]: { ...cur[type], [channel]: !!val } };
    writeNotifPrefs(next);
    setPrefsState(next);
  }, []);
  const resetPrefs = React.useCallback(() => {
    writeNotifPrefs({ ...DEFAULT_NOTIF_PREFS });
    setPrefsState({ ...DEFAULT_NOTIF_PREFS });
  }, []);

  const items       = NOTIF_ITEMS;
  const unreadCount = items.filter((n) => !readSet.has(n.id)).length;

  return {
    items, readSet, prefs, unreadCount,
    markRead, markUnread, markAllRead,
    setPref, resetPrefs,
  };
}

/* Small reusable row used in both the dropdown and the full page. */
function NotifRow({ item, unread, onClick, trailing }) {
  const meta = NOTIF_TYPES[item.type] || NOTIF_TYPES.system;
  return (
    <button className={"notif-row" + (unread ? " unread" : "")} onClick={onClick}>
      <span className="notif-ico" style={{ background: meta.soft, color: meta.color }}>
        <Icon name={meta.icon} size={15} />
      </span>
      <span className="notif-body">
        <span className="notif-title">
          {unread && <span className="notif-unread-dot" />}
          {item.title}
        </span>
        <span className="notif-context">{item.context}</span>
      </span>
      <span className="notif-meta">
        <span className="notif-type-tag" style={{ color: meta.color }}>{meta.label}</span>
        <span className="notif-time">{item.time}</span>
        {trailing}
      </span>
    </button>
  );
}

Object.assign(window, {
  NOTIF_TYPES, NOTIF_ITEMS, NOTIF_TYPE_ORDER,
  DEFAULT_NOTIF_PREFS, NOTIF_CHANNELS,
  useNotifs, NotifRow,
});

/* ════════════════════ asset_51_709e47f7.js ════════════════════ */
;
/* HazardLink — app chrome: sidebar + topbar */

function Sidebar({ view, go, counts }) {
  const { perms, previewRole } = React.useContext(PermissionsContext);

  // When previewing as a non-admin role, filter out modules that role can't see.
  const canSee = (id) => (typeof isModuleAllowed === "function")
    ? isModuleAllowed(perms, previewRole, id)
    : true;

  // Sub-views that map onto a sidebar item for the active highlight.
  const activeId =
    view === "wo"   ? "maintenance" :
    view === "user" ? "users"       :
    view;

  // Two fixed rows, then THE three parts of the product — Cleaning,
  // Maintenance, Security — each carrying its discipline colour, with one
  // business/admin drawer underneath. A brand-new customer sees six rows.
  const pinnedTop = [
    { id: "dashboard", label: "Dashboard",      icon: "grid" },
    { id: "assistant", label: "Ask HazardLink", icon: "sparkles" },
  ];
  // Kept so older references don't break; no longer rendered separately.
  const pinnedDevices = null;

  const groups = [
    {
      id: "clean",
      label: "Cleaning",
      icon: "droplet",
      tint: "#2dd4bf", /* brighter teal for the dark sidebar */
      items: [
        { id: "spills",     label: "Spill alerts",         icon: "alertTri", count: counts.spills },
        { id: "floorplan",  label: "Floor plans",          icon: "mapPin" },
        { id: "devices",    label: "Devices",              icon: "monitor",  count: counts.devices },
        { id: "cleaning",   label: "Rounds & inspections", icon: "droplet" },
        { id: "scheduling", label: "Scheduling",           icon: "calendar", count: counts.unassigned },
        { id: "sds",        label: "Safety sheets",        icon: "beaker" },
      ],
    },
    {
      id: "maint",
      label: "Maintenance",
      icon: "wrench",
      tint: "#fbbf24", /* brighter amber for the dark sidebar */
      items: [
        { id: "maint-overview", label: "Overview",            icon: "gauge" },
        { id: "maintenance",    label: "Work orders",         icon: "wrench",      count: counts.maint },
        { id: "ppm",            label: "PPM schedule",        icon: "clock",       count: counts.ppmOverdue },
        { id: "assets",         label: "Assets",              icon: "box" },
        { id: "parts",          label: "Parts and inventory", icon: "package" },
        { id: "meters",         label: "Meters",              icon: "activity" },
        { id: "contractors",    label: "Contractors",         icon: "user",        count: counts.blocked },
        { id: "compliance",     label: "Compliance",          icon: "checkCircle", count: counts.compliance },
        { id: "slas",           label: "SLAs",                icon: "clock",       count: counts.slaBreach },
        { id: "permits",        label: "Permits",             icon: "flag",        count: counts.permitsPending },
        { id: "competency",     label: "Competency",          icon: "award" },
      ],
    },
    {
      id: "secure",
      label: "Security",
      icon: "shield",
      tint: "#818cf8", /* brighter indigo for the dark sidebar */
      items: [
        { id: "security", label: "Patrols & incidents", icon: "shield" },
        { id: "visitors", label: "Visitors",            icon: "users" },
      ],
    },
    {
      id: "admin",
      label: "Business & admin",
      icon: "cog",
      items: [
        { id: "reports",       label: "Reports",       icon: "chart" },
        { id: "clientportal",  label: "Client portal", icon: "layers" },
        { id: "billing",       label: "Billing",       icon: "creditCard", count: counts.billingOverdue },
        { id: "timesheets",    label: "Timesheets",    icon: "clock" },
        { id: "forms",         label: "Forms",         icon: "file" },
        { id: "automations",   label: "Automations",   icon: "sparkles",   count: counts.automations },
        { id: "audit",         label: "Audit log",     icon: "activity" },
        { id: "team",          label: "Team",          icon: "users" },
        { id: "users",         label: "Users",         icon: "user" },
        { id: "notifications", label: "Notifications", icon: "bell" },
        { id: "settings",      label: "Settings",      icon: "cog" },
      ],
    },
  ];

  // Permission-filter each group and drop any group with no visible items.
  const visibleGroups = groups
    .map((g) => ({ ...g, visibleItems: g.items.filter((n) => canSee(n.id)) }))
    .filter((g) => g.visibleItems.length > 0);

  const activeGroupId = (visibleGroups.find((g) =>
    g.visibleItems.some((it) => it.id === activeId)
  ) || {}).id;

  // Manual open/closed overrides, persisted. A group not in the map
  // defaults to open only if it contains the active page.
  const LS_KEY = "hl.sidebar.openGroups.v2";
  const [manual, setManual] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  });

  const isGroupOpen = (g) => (g.id in manual) ? !!manual[g.id] : g.id === activeGroupId;

  const toggleGroup = (gid) => {
    const cur = (gid in manual) ? !!manual[gid] : gid === activeGroupId;
    const next = { ...manual, [gid]: !cur };
    setManual(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const Item = (n) => {
    const active = activeId === n.id;
    return (
      <button key={n.id}
        className={"nav-item" + (active ? " active" : "")}
        onClick={() => go(n.id)}>
        <Icon name={n.icon} size={18} />
        <span className="nav-item-lbl">{n.label}</span>
        {n.count != null && <span className="nav-count">{n.count}</span>}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Icon name="shield" size={19} /></div>
        <div>
          <div className="brand-name">HazardLink</div>
          <div className="brand-sub">Site command centre</div>
        </div>
      </div>

      {pinnedTop.filter((n) => canSee(n.id)).map(Item)}

      <div className="nav-divider" aria-hidden="true" />

      {visibleGroups.map((g) => {
        const open = isGroupOpen(g);
        const containsActive = g.visibleItems.some((it) => it.id === activeId);
        const sumCount = g.visibleItems.reduce(
          (s, it) => s + (typeof it.count === "number" ? it.count : 0), 0);
        const showParentCount = !open && sumCount > 0;
        const showActiveDot   = !open && containsActive;
        return (
          <div key={g.id} className={"nav-group" + (open ? " open" : "")}>
            <button
              type="button"
              className={"nav-parent" + (showActiveDot ? " has-active" : "")}
              aria-expanded={open}
              aria-controls={`navgrp-${g.id}`}
              onClick={() => toggleGroup(g.id)}>
              <span style={{ display:"inline-flex", color: g.tint || "inherit" }}>
                <Icon name={g.icon} size={18} />
              </span>
              <span className="nav-parent-lbl">{g.label}</span>
              {showActiveDot && (
                <span className="nav-active-dot" aria-label="current section" />
              )}
              {showParentCount && <span className="nav-count">{sumCount}</span>}
              <span className="nav-chev" aria-hidden="true">
                <Icon name="chevronDown" size={14} />
              </span>
            </button>
            <div
              id={`navgrp-${g.id}`}
              className="nav-group-items"
              role="group"
              hidden={!open}>
              {g.visibleItems.map(Item)}
            </div>
          </div>
        );
      })}

      <div className="sidebar-foot">
        <div className="site-mini">
          <span className="dot" />
          <div className="txt">
            <b>0 sites live</b>
            All systems operational
          </div>
        </div>
      </div>
    </aside>
  );
}

const crumbs = {
  dashboard: ["Dashboard"],
  portfolio: ["Sites", "Portfolio"],
  site: ["Sites", "Site"],
  scheduling: ["Operations", "Scheduling"],
  cleaning: ["Operations", "Cleaning"],
  spills: ["Operations", "Spill alerts"],
  floorplan: ["Operations", "Floor plans"],
  devices: ["Operations", "Devices"],
  security: ["Operations", "Security"],
  visitors: ["Operations", "Visitors"],
  sds: ["Operations", "Safety data sheets"],
  "maint-overview": ["Maintenance", "Overview"],
  compliance:        ["Maintenance", "Compliance"],
  slas:              ["Maintenance", "SLAs"],
  permits:           ["Maintenance", "Permits"],
  maintenance: ["Maintenance", "Work orders"],
  wo: ["Maintenance", "Work orders", "Work order"],
  ppm: ["Maintenance", "PPM schedule"],
  meters: ["Maintenance", "Meters"],
  parts: ["Maintenance", "Parts and inventory"],
  timesheets: ["Manage", "Timesheets"],
  competency: ["Maintenance", "Competency"],
  assets: ["Manage", "Assets"],
  contractors: ["Manage", "Contractors"],
  clientportal: ["Manage", "Client portal"],
  forms: ["Manage", "Forms"],
  assistant: ["Manage", "Assistant"],
  billing: ["Manage", "Billing"],
  automations: ["Manage", "Automations"],
  team: ["Manage", "Team"],
  reports: ["Manage", "Reports"],
  audit: ["Manage", "Audit log"],
  users: ["Admin", "Users"],
  user: ["Admin", "Users", "Profile"],
  profile: ["Account", "My profile"],
  settings: ["Admin", "Settings"],
  notifications: ["Admin", "Notifications"],
};

function SitePicker({ go }) {
  const { site, setSite } = React.useContext(SiteContext);
  const [open, setOpen]   = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref               = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  React.useEffect(() => { if (!open) setQuery(""); }, [open]);

  const sites = HL.sites;
  const totalOpen = sites.reduce((s, x) => s + siteOpenCount(x.name), 0);
  const q = query.trim().toLowerCase();
  const filteredSites = q
    ? sites.filter((s) => s.name.toLowerCase().includes(q) || s.loc.toLowerCase().includes(q))
    : sites;

  const pickAll = () => {
    setSite(null);
    setOpen(false);
    if (go) go("portfolio");
  };
  const pickSite = (s) => {
    setSite(s);
    setOpen(false);
    if (go) go("site");
  };

  return (
    <div className="site-picker" ref={ref}>
      <button className="site-select site-select-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="mapPin" size={15} />
        <span className="sp-label">{site ? site.name : "All sites"}</span>
        {site && <span className="sp-loc">{site.loc}</span>}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="site-menu site-menu-search-shell">
          <div className="site-menu-search">
            <Icon name="search" size={14} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites by name or town…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (q === "") pickAll();
                  else if (filteredSites.length >= 1) pickSite(filteredSites[0]);
                }
              }} />
          </div>
          <div className="site-menu-list">
            <button className={"site-menu-row" + (!site ? " on" : "")} onClick={pickAll}>
              <div className="sm-ico sm-ico-all"><Icon name="layers" size={14} /></div>
              <div className="sm-body">
                <div className="sm-name">All sites · portfolio</div>
                <div className="sm-loc">Every location combined</div>
              </div>
              <div className="sm-count">{`${totalOpen} open`}</div>
              {!site && <Icon name="check" size={14} />}
            </button>
            <div className="site-menu-divider" />
            {filteredSites.length === 0 && (
              <div style={{ padding:"20px 14px", textAlign:"center", color:"var(--ink-3)", fontSize:13 }}>
                No sites match "{query}"
              </div>
            )}
            {filteredSites.map((s) => {
              const c = siteOpenCount(s.name);
              const isOn = site && site.id === s.id;
              return (
                <button key={s.id} className={"site-menu-row" + (isOn ? " on" : "")}
                  onClick={() => pickSite(s)}>
                  <div className="sm-ico"><Icon name="mapPin" size={14} /></div>
                  <div className="sm-body">
                    <div className="sm-name">{s.name}</div>
                    <div className="sm-loc">{s.loc}</div>
                  </div>
                  <div className={"sm-count" + (c > 0 ? " has" : "")}>
                    {c === 0 ? "All clear" : `${c} open`}
                  </div>
                  {isOn && <Icon name="check" size={14} />}
                </button>
              );
            })}
          </div>
          <div className="site-menu-foot">
            <Icon name="search" size={11} />
            <span>{filteredSites.length} site{filteredSites.length === 1 ? "" : "s"} listed · Enter to pick</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamSwitcher() {
  const { team, setTeam } = React.useContext(TeamContext);
  const [open, setOpen]   = React.useState(false);
  const [defaultTeam, setDefaultTeam] = React.useState(() =>
    (typeof readDefaultTeam === "function" ? readDefaultTeam() : null)
  );
  const ref               = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const current = TEAMS.find((t) => t.id === team) || TEAMS[0];
  const toggleDefault = (id, e) => {
    e.stopPropagation();
    const next = defaultTeam === id ? null : id;
    setDefaultTeam(next);
    if (typeof writeDefaultTeam === "function") writeDefaultTeam(next);
  };

  return (
    <div className="team-switcher" ref={ref}>
      <button className={"team-btn team-" + current.tone + (team ? " on" : "")} onClick={() => setOpen((o) => !o)}>
        <span className="team-dot" style={{ background: current.color }} />
        <span className="team-ico" style={{ color: current.color }}><Icon name={current.icon} size={15} /></span>
        <span className="team-label">{current.label}</span>
        {defaultTeam && team === defaultTeam && (
          <span className="team-default-star" title="This is your default team"><Icon name="star-fill" size={11} /></span>
        )}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="team-menu">
          <div className="team-menu-cap">Focus the dashboard on one team</div>
          {TEAMS.map((t) => {
            const on = t.id === team;
            const isDefault = defaultTeam === t.id && t.id !== null;
            return (
              <div key={t.id || "all"} className={"team-menu-row" + (on ? " on" : "")}>
                <button className="team-menu-pick" onClick={() => { setTeam(t.id); setOpen(false); }}>
                  <span className="team-ico-lg" style={{ background: t.id ? softBg(t.tone) : "var(--surface-3)", color: t.color }}>
                    <Icon name={t.icon} size={15} />
                  </span>
                  <div className="team-menu-body">
                    <div className="team-menu-label">{t.label}</div>
                    <div className="team-menu-sub">
                      {t.id === null   ? "Combined view across every team"
                     : t.id === "clean"  ? "Rounds, spills, inspections, signs"
                     : t.id === "maint"  ? "Work orders, PPM, parts, meters"
                     : "Patrols, incidents, lone-workers"}
                    </div>
                  </div>
                  {on && <Icon name="check" size={14} />}
                </button>
                {t.id !== null && (
                  <button
                    className={"team-default-toggle" + (isDefault ? " on" : "")}
                    onClick={(e) => toggleDefault(t.id, e)}
                    title={isDefault ? "Default team — unstar to clear" : "Make this my default team"}>
                    <Icon name={isDefault ? "star-fill" : "star"} size={13} />
                  </button>
                )}
              </div>
            );
          })}
          {defaultTeam && (
            <div className="team-menu-foot">
              <Icon name="star-fill" size={11} />
              <span>{(TEAMS.find((t) => t.id === defaultTeam) || {}).label} loads by default on sign-in.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Renders the role-preview chip ONLY while a preview is active — the entry
   point moved into the account menu to keep the top bar calm. */
function PreviewActiveChip() {
  const { previewRole } = React.useContext(PermissionsContext);
  if (!previewRole) return null;
  return <PreviewRoleSwitcher />;
}

/* Account-menu items for role preview (admins). Toggling off is one click. */
function AcctPreviewItems({ onDone }) {
  const { previewRole, setPreviewRole } = React.useContext(PermissionsContext);
  const roles = (typeof ROLE_LIST !== "undefined" ? ROLE_LIST : []).filter((r) => r.id !== "admin");
  return (
    <React.Fragment>
      {roles.map((r) => (
        <button key={r.id} className="acct-menu-item" role="menuitem"
          onClick={() => { setPreviewRole(previewRole === r.id ? null : r.id); onDone(); }}>
          <Icon name="eye" size={15} />
          <span>{previewRole === r.id ? "Exit " + r.label.toLowerCase() + " preview" : "Preview as " + r.label.toLowerCase()}</span>
          <Icon name="chevronRight" size={13} />
        </button>
      ))}
    </React.Fragment>
  );
}

function TopBar({ view, onAI, onScan, go }) {
  const { site, setSite } = React.useContext(SiteContext);
  const staticPath = crumbs[view] || ["Dashboard"];
  const basePath = view === "site"
    ? ["Sites", site ? site.name : "Site"]
    : staticPath;
  /* If a site is scoped and we're not on the site overview itself, prefix
     the breadcrumb with the site name so the active scope is always visible. */
  const path = (site && view !== "site" && view !== "portfolio")
    ? [site.name, ...basePath]
    : basePath;
  return (
    <header className="topbar">
      <div className="crumb">
        {path.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={14} />}
            {i === 0 && site && view !== "site" && view !== "portfolio"
              ? <span className="crumb-site"><Icon name="mapPin" size={11} />{c}</span>
              : (i === path.length - 1 ? <b>{c}</b> : <span>{c}</span>)}
          </React.Fragment>
        ))}
      </div>

      {site && (
        <button className="scope-chip"
          onClick={() => setSite(null)}
          title="Return to All sites — unscope this view">
          <span className="scope-dot" />
          <span className="scope-lbl">Scoped to</span>
          <b className="scope-name">{site.name}</b>
          <span className="scope-clear"><Icon name="x" size={11} /></span>
        </button>
      )}

      <div style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <TeamSwitcher />
        {/* One site (or none yet) needs no site picker — it appears once a
            second site exists. */}
        {(HL.sites || []).length > 1 && <SitePicker go={go} />}
        {/* Role preview lives in the account menu now; the chip only shows
            while a preview is actually running, so you can always exit it. */}
        <PreviewActiveChip />
      </div>

      <div className="topbar-spacer" />

      <div className="search">
        <Icon name="search" size={15} />
        Search jobs, assets, sites…
        <kbd>⌘K</kbd>
      </div>

      <button className="scan-btn" onClick={onScan} title="Scan QR or barcode">
        <Icon name="scan" size={16} />
        Scan
      </button>

      <NotifBell go={go} />

      <AccountMenu go={go} />
    </header>
  );
}

function NotifBell({ go }) {
  const { items, readSet, unreadCount, markRead, markAllRead } = useNotifs();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const today   = items.filter((n) => n.bucket === "today");
  const earlier = items.filter((n) => n.bucket === "earlier");
  const badgeTxt = unreadCount > 9 ? "9+" : String(unreadCount);

  const openItem = (n) => {
    markRead(n.id);
    setOpen(false);
    if (go && n.view) go(n.view);
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className={"icon-btn" + (open ? " on" : "")} title="Notifications"
        onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={18} />
        {unreadCount > 0 && <span className="badge">{badgeTxt}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <div className="nph-title">
              <h3>Notifications</h3>
              {unreadCount > 0
                ? <span className="nph-count">{unreadCount} unread</span>
                : <span className="nph-count nph-count-clear">All caught up</span>}
            </div>
            <button className="nph-action" onClick={markAllRead} disabled={unreadCount === 0}>
              <Icon name="check" size={13} />Mark all read
            </button>
          </div>

          <div className="notif-panel-list">
            {today.length > 0 && (
              <React.Fragment>
                <div className="notif-group-label">Today</div>
                {today.map((n) => (
                  <NotifRow key={n.id} item={n}
                    unread={!readSet.has(n.id)}
                    onClick={() => openItem(n)} />
                ))}
              </React.Fragment>
            )}
            {earlier.length > 0 && (
              <React.Fragment>
                <div className="notif-group-label">Earlier</div>
                {earlier.map((n) => (
                  <NotifRow key={n.id} item={n}
                    unread={!readSet.has(n.id)}
                    onClick={() => openItem(n)} />
                ))}
              </React.Fragment>
            )}
            {items.length === 0 && (
              <div className="notif-empty">
                <Icon name="checkCircle" size={26} />
                <div>No notifications</div>
                <small>You're all caught up.</small>
              </div>
            )}
          </div>

          <div className="notif-panel-foot">
            <button className="nph-see-all" onClick={() => { setOpen(false); go && go("notifications"); }}>
              See all notifications
              <Icon name="arrowRight" size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ go }) {
  /* Signed-in user is the first record in the canonical Users seed
     (Aoife Kelly — admin, all sites). Falls back to literals if that
     file hasn't loaded yet. */
  const ME = (typeof HL !== "undefined" && HL.currentUser) ||
    (typeof HL_USERS_INITIAL !== "undefined" && HL_USERS_INITIAL[0]) || {
    name: "Aoife Kelly", email: "aoife.kelly@hazardlink.ie",
    role: "admin", initials: "AK",
  };
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const btnRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current && btnRef.current.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const goAndClose = (v) => { setOpen(false); if (go) go(v); };

  /* Notification preferences live below the feed on the notifications
     page \u2014 jump there and scroll the pref card into view. */
  const goPrefs = () => {
    setOpen(false);
    if (go) go("notifications");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el       = document.querySelector(".pref-card");
      const scroller = document.querySelector(".content");
      if (el && scroller) scroller.scrollTop = Math.max(0, el.offsetTop - 20);
    }));
  };

  const signOut = () => {
    setOpen(false);
    /* Real auth: clear the session token and return to the login screen. */
    try { localStorage.removeItem("bor.token"); } catch (e) {}
    if (typeof window !== "undefined") window.location.assign("/login");
  };

  return (
    <div className="acct-menu-wrap" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className={"avatar avatar-btn" + (open ? " on" : "")}
        aria-label={`Account menu for ${ME.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${ME.name} \u00b7 Admin`}
        onClick={() => setOpen((o) => !o)}>
        {ME.initials}
      </button>

      {open && (
        <div className="acct-menu" role="menu" aria-label="Account">
          <div className="acct-menu-head">
            <div className="acct-av" aria-hidden="true">{ME.initials}</div>
            <div className="acct-id">
              <div className="acct-name">{ME.name}</div>
              <div className="acct-role">{ME.role === "admin" ? "Admin — Full system access" : ME.role === "supervisor" ? "Supervisor" : "Field staff"}</div>
              <div className="acct-email">{ME.email}</div>
            </div>
          </div>

          <div className="acct-menu-list">
            <button className="acct-menu-item" role="menuitem"
              onClick={() => goAndClose("profile")}>
              <Icon name="user" size={15} />
              <span>My profile</span>
              <Icon name="chevronRight" size={13} />
            </button>
            <button className="acct-menu-item" role="menuitem"
              onClick={() => { window.__settingsInitialTab = "security"; goAndClose("settings"); }}>
              <Icon name="lock" size={15} />
              <span>Account & security</span>
              <Icon name="chevronRight" size={13} />
            </button>
            <button className="acct-menu-item" role="menuitem"
              onClick={goPrefs}>
              <Icon name="bell" size={15} />
              <span>Notification preferences</span>
              <Icon name="chevronRight" size={13} />
            </button>
            {ME.role === "admin" && <AcctPreviewItems onDone={() => setOpen(false)} />}
          </div>

          <div className="acct-menu-foot">
            <button className="acct-menu-item acct-menu-signout" role="menuitem"
              onClick={signOut}>
              <Icon name="arrowLeft" size={15} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Sidebar, TopBar, SitePicker, TeamSwitcher, NotifBell, AccountMenu });

/* ════════════════════ asset_28_b4163f08.js ════════════════════ */
;
/* HazardLink — Dashboard view */

function FeedPanel({ item, onClose, go }) {
  const d = discMeta[item.disc];
  const p = item.panel || {};
  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div className="feed-ico" style={{ background: softBg(item.disc), color: solid(item.disc), width:36, height:36, borderRadius:9, display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name={d.icon} size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{item.title}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{item.site} · {item.time}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
            <Pill tone={item.disc} icon={d.icon}>{d.label}</Pill>
            {p.type && <Pill tone={item.sev === "crit" ? "crit" : item.sev === "warn" ? "warn" : "muted"}>{p.type}</Pill>}
            {item.live && <Pill tone="crit">Live</Pill>}
          </div>

          {/* Cleaning panel */}
          {item.disc === "clean" && (
            <div>
              {p.score != null && (
                <div className="card card-pad" style={{ marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14 }}>Inspection result</div>
                    <div style={{ fontSize:12.5, color:"var(--ink-3)", marginTop:3 }}>{p.areas} areas checked</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:30, fontWeight:800, color: p.score >= 90 ? "var(--ok)" : "var(--warn)", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>{p.score}%</div>
                    <div style={{ marginTop:6 }}><Pill tone={p.score >= 90 ? "ok" : "warn"} dot>{p.score >= 90 ? "Passed" : "Minor issues"}</Pill></div>
                  </div>
                </div>
              )}
              {p.action && <p style={{ margin:0, fontSize:13.5, lineHeight:1.6, color:"var(--ink-2)" }}>{p.action}</p>}
              {p.product && <div className="info-row" style={{ marginTop:12 }}><span className="k">Product</span><span className="v">{p.product}</span></div>}
              {p.verifier && <div className="info-row"><span className="k">Verified by</span><span className="v">{p.verifier}</span></div>}
            </div>
          )}

          {/* Maintenance panel */}
          {item.disc === "maint" && (
            <div>
              {p.asset    && <div className="info-row"><span className="k">Asset</span><span className="v">{p.asset}</span></div>}
              {p.woStatus && <div className="info-row"><span className="k">Status</span><span className="v">{p.woStatus}</span></div>}
              {p.cost     && <div className="info-row"><span className="k">Cost</span><span className="v">{p.cost}</span></div>}
              {p.contractor && <div className="info-row"><span className="k">Contractor</span><span className="v">{p.contractor}</span></div>}
              {item.wo    && <div className="info-row"><span className="k">Work order</span><span className="v" style={{ color:"var(--accent-ink)" }}>{item.wo}</span></div>}
              {p.action   && <p style={{ margin:"14px 0 0", fontSize:13, lineHeight:1.6, color:"var(--ink-2)" }}>{p.action}</p>}
              {item.wo && (
                <button className="btn btn-primary" style={{ marginTop:16, width:"100%" }} onClick={() => { go("wo"); onClose(); }}>
                  <Icon name="arrowRight" size={15} />View work order
                </button>
              )}
            </div>
          )}

          {/* Security panel */}
          {item.disc === "secure" && (
            <div>
              {p.worker     && <div className="info-row"><span className="k">Worker</span><span className="v">{p.worker} · {p.role}</span></div>}
              {p.lastSeen   && <div className="info-row"><span className="k">Last seen</span><span className="v">{p.lastSeen}</span></div>}
              {p.reporter   && <div className="info-row"><span className="k">Reporter</span><span className="v">{p.reporter}</span></div>}
              {p.severity   && <div className="info-row"><span className="k">Severity</span><span className="v">{p.severity}</span></div>}
              {p.guard      && <div className="info-row"><span className="k">Guard</span><span className="v">{p.guard}</span></div>}
              {p.checkpoint && <div className="info-row"><span className="k">Checkpoint</span><span className="v">{p.checkpoint}</span></div>}
              {p.tour       && <div className="info-row"><span className="k">Patrol</span><span className="v">{p.tour}</span></div>}
              {p.action     && <p style={{ margin:"14px 0 0", fontSize:13, lineHeight:1.6, color:"var(--ink-2)" }}>{p.action}</p>}
              {(item.sev === "crit" || item.sev === "warn") && (
                <div style={{ marginTop:18 }}>
                  <div className="panel-label">Attached photos</div>
                  <div className="proof-grid">
                    {["Scene photo", "Wide view"].map((lbl, i) => (
                      <div className="proof" key={i}>
                        <span className="pcam"><Icon name="camera" size={15} /></span>
                        <span className="plabel">{lbl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button className="btn" style={{ marginTop:16, width:"100%" }} onClick={() => { go("security"); onClose(); }}>
                <Icon name="shield" size={15} />Open security log
              </button>
            </div>
          )}
        </div>
      </aside>
    </React.Fragment>
  );
}

function KPI({ k, onClick }) {
  return (
    <div className="kpi" onClick={onClick} style={onClick ? { cursor:"pointer" } : null}>
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background:softBg(k.tone), color:solid(k.tone) }}>
          <Icon name={k.icon} size={16} />
        </div>
        <span className="kpi-label">{k.label}</span>
        {k.live && <span className="feed-live" style={{ marginLeft:"auto" }}><span className="blip" />Live</span>}
      </div>
      <div className="kpi-val" style={k.valColor ? { color: k.valColor } : null}>{k.value}{k.unit && <small>{k.unit}</small>}</div>
      <div className="kpi-foot">
        {k.trend && (
          <span className={"trend " + (k.up ? "trend-up" : "trend-down")}>
            <Icon name={k.up ? "trendUp" : "trendDown"} size={13} />{k.trend}
          </span>
        )}
        {k.foot}
      </div>
    </div>
  );
}

/* ---------- Active spills banner (front-and-centre) ---------- */
function _mmss(sec) {
  if (sec <= 0) return "0:00";
  return Math.floor(sec / 60) + ":" + (sec % 60).toString().padStart(2, "0");
}

function ActiveSpillsCard({ liveSpills, go }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [escEnds] = React.useState(() => {
    const m = {};
    liveSpills.forEach((s) => { m[s.id] = Date.now() + (s.escalateInSec || 300) * 1000; });
    return m;
  });

  React.useEffect(() => {
    if (liveSpills.length === 0) return;
    const t = setInterval(force, 1000);
    return () => clearInterval(t);
  }, [liveSpills.length]);

  if (liveSpills.length === 0) {
    return (
      <div className="card spill-banner spill-banner-clear">
        <div className="sb-head">
          <div className="sb-ico sb-ico-clear"><Icon name="checkCircle" size={17} /></div>
          <div>
            <h3>Active spills</h3>
            <div className="sb-sub">All sites clear — every smart sign is back on the rack.</div>
          </div>
          <button className="btn" style={{ marginLeft:"auto" }} onClick={() => go("spills")}>
            View spill log<Icon name="chevronRight" size={14} />
          </button>
        </div>
      </div>
    );
  }

  const siteCount = new Set(liveSpills.map((s) => s.site)).size;

  return (
    <div className="card spill-banner">
      <div className="sb-head">
        <div className="sb-ico"><Icon name="alertTri" size={17} /></div>
        <div>
          <h3>Active spills <span className="sb-count">{liveSpills.length}</span></h3>
          <div className="sb-sub">
            <span className="feed-live"><span className="blip" />Live</span>
            <span className="sb-sep" />
            <span>{liveSpills.length} hazard{liveSpills.length !== 1 ? "s" : ""} being signed across {siteCount} site{siteCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginLeft:"auto" }} onClick={() => go("spills")}>
          View all alerts<Icon name="chevronRight" size={14} />
        </button>
      </div>

      <div className="sb-grid">
        {liveSpills.map((s) => {
          const remaining = Math.max(0, escEnds[s.id] - Date.now());
          const sec = Math.ceil(remaining / 1000);
          const totalMs = (s.escalateTotal || 300) * 1000;
          const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
          const escalated = remaining <= 0;
          const sevTone = s.severity === "high" ? "crit" : s.severity === "medium" ? "warn" : "muted";
          const timerColor = escalated || pct < 25 ? "var(--crit)"
                            : pct < 50 ? "var(--warn)" : "var(--accent)";

          return (
            <button key={s.id} className="sb-card" onClick={() => go("spills")}>
              <div className="sb-card-top">
                <span className="sb-id">
                  <span className={"sb-dot sb-" + sevTone} />
                  {s.id}
                </span>
                <span className="sb-since">{s.since || "now"}</span>
              </div>
              <div className="sb-loc">{s.location}</div>
              <div className="sb-site">
                <Icon name="mapPin" size={11} />
                {s.siteShort || s.site}
                <span className="sb-sep" />
                <span className="sb-hanger">Hanger {s.hanger}</span>
              </div>
              <div className={"sb-status sb-status-" + (s.liveStatusTone || "muted")}>
                <span className={"sb-st-dot sb-st-" + (s.liveStatusTone || "muted")} />
                {s.liveStatus || "Sign deployed"}
              </div>
              <div className="sb-timer">
                <div className="sb-bar"><i style={{ width: pct + "%", background: timerColor }} /></div>
                <span className="sb-clock" style={{ color: timerColor }}>
                  {escalated ? "Escalated" : "Esc " + _mmss(sec)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeedItem({ item, onClick }) {
  const d = discMeta[item.disc];
  return (
    <div className="feed-item" style={{ cursor:"pointer" }} onClick={() => onClick && onClick(item)}>
      <div className="feed-rail">
        <div className="feed-ico" style={{ background:softBg(item.disc), color:solid(item.disc) }}>
          <Icon name={d.icon} size={17} />
        </div>
      </div>
      <div className="feed-body">
        <div className="feed-title">
          {item.title}
          {item.live && <span className="feed-live"><span className="blip" />Live</span>}
        </div>
        <div className="feed-meta">
          <span style={{ color:solid(item.sev === "muted" ? "muted" : item.sev), fontWeight:600 }}>{item.site}</span>
          <span className="sep" />
          <span>{item.detail}</span>
          {item.wo && <><span className="sep" /><span style={{ fontWeight:600, color:"var(--accent-ink)" }}>{item.wo}</span></>}
        </div>
      </div>
      <div className="feed-time">{item.time}</div>
    </div>
  );
}

function DisciplineCard({ d, go }) {
  const dest = d.id === "maint" ? "maintenance" : d.id === "clean" ? "cleaning" : "security";
  return (
    <div className="card disc-card">
      <div className="disc-head">
        <div className="disc-ico" style={{ background:softBg(d.id), color:solid(d.id) }}>
          <Icon name={d.icon} size={17} />
        </div>
        <div className="disc-name">{d.name}<small>{d.desc}</small></div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={() => go(dest)}>
          Open<Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div className="disc-stats">
        {d.stats.map((s, i) => (
          <div className="disc-stat" key={i}><div className="n">{s.n}</div><div className="l">{s.l}</div></div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Maintenance hero (team view) ---------- */
function MaintenanceHero({ workOrders, ppmTasks, go }) {
  const order = { High: 0, Medium: 1, Low: 2 };
  const open = workOrders.filter((w) => w.status !== "Done");
  const featured = [...open].sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9)).slice(0, 3);
  const ppmDue = ppmTasks.filter((t) => t.status === "overdue" || t.bucket === "this-week").length;

  if (open.length === 0) {
    return (
      <div className="card spill-banner spill-banner-clear" style={{ marginBottom: 18 }}>
        <div className="sb-head">
          <div className="sb-ico sb-ico-clear"><Icon name="checkCircle" size={17} /></div>
          <div>
            <h3>Maintenance backlog</h3>
            <div className="sb-sub">Backlog clear — every job is done.</div>
          </div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => go("maintenance")}>
            View work orders<Icon name="chevronRight" size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card maint-banner" style={{ marginBottom: 18 }}>
      <div className="sb-head">
        <div className="sb-ico" style={{ background: "var(--maint)" }}><Icon name="wrench" size={17} /></div>
        <div>
          <h3>Open work orders <span className="sb-count" style={{ background: "var(--maint)" }}>{open.length}</span></h3>
          <div className="sb-sub">
            <span>Top {featured.length} by priority</span>
            <span className="sb-sep" />
            <span>{ppmDue} PPM due this week</span>
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => go("maintenance")}>
          View all work<Icon name="chevronRight" size={14} />
        </button>
      </div>

      <div className="sb-grid">
        {featured.map((w) => {
          const sevTone = w.priority === "High" ? "crit" : w.priority === "Medium" ? "warn" : "muted";
          return (
            <button key={w.id} className="sb-card" onClick={() => go("maintenance")}>
              <div className="sb-card-top">
                <span className="sb-id"><span className={"sb-dot sb-" + sevTone} />{w.id}</span>
                <span className="sb-since">{w.priority}</span>
              </div>
              <div className="sb-loc">{w.title}</div>
              <div className="sb-site">
                <Icon name="mapPin" size={11} />{w.site}
                <span className="sb-sep" />
                <span className="sb-hanger">{w.asset}</span>
              </div>
              <div className="sb-status">
                <span className="sb-st-dot sb-st-accent" />
                {w.status} · {w.assignee}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Security hero (team view) ---------- */
function SecurityHero({ patrols, loneWorkers, incidents, go }) {
  const inProgress = patrols.filter((p) => p.status === "in-progress");
  const overdueLW = loneWorkers.filter((w) => w.status === "overdue").length;
  const featured  = [...inProgress, ...patrols.filter((p) => p.status !== "in-progress")].slice(0, 3);
  const openInc   = incidents.filter((i) => i.status === "Open").length;

  return (
    <div className="card secure-banner" style={{ marginBottom: 18 }}>
      <div className="sb-head">
        <div className="sb-ico" style={{ background: "var(--secure)" }}><Icon name="shield" size={17} /></div>
        <div>
          <h3>Patrols and lone-workers <span className="sb-count" style={{ background: "var(--secure)" }}>{patrols.length}</span></h3>
          <div className="sb-sub">
            <span className="feed-live"><span className="blip" style={{ background:"var(--secure)" }} />Live</span>
            <span className="sb-sep" />
            <span>{inProgress.length} patrol{inProgress.length === 1 ? "" : "s"} in progress</span>
            <span className="sb-sep" />
            <span>{loneWorkers.length} lone-worker{loneWorkers.length === 1 ? "" : "s"} active</span>
            {openInc > 0 && <React.Fragment><span className="sb-sep" /><span style={{ color:"var(--warn)" }}>{openInc} open incident{openInc === 1 ? "" : "s"}</span></React.Fragment>}
            {overdueLW > 0 && <React.Fragment><span className="sb-sep" /><span style={{ color:"var(--crit)" }}>{overdueLW} overdue check-in</span></React.Fragment>}
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => go("security")}>
          Open security<Icon name="chevronRight" size={14} />
        </button>
      </div>

      <div className="sb-grid">
        {featured.map((p) => {
          const total = p.checkpoints.length;
          const done  = p.checkpoints.filter((c) => c.scanned).length;
          const live  = p.status === "in-progress";
          return (
            <button key={p.id} className="sb-card" onClick={() => go("security")}>
              <div className="sb-card-top">
                <span className="sb-id">
                  <span className={"sb-dot " + (live ? "sb-warn" : "sb-muted")} />
                  {p.guard}
                </span>
                <span className="sb-since">{p.started}</span>
              </div>
              <div className="sb-loc">{done}/{total} checkpoints</div>
              <div className="sb-site">
                <Icon name="mapPin" size={11} />{p.site}
              </div>
              <div className="sb-status">
                <span className={"sb-st-dot " + (live ? "sb-st-accent" : "sb-st-ok")} />
                {live ? "In progress" : "Patrol complete"}
              </div>
              <div className="sb-timer">
                <div className="sb-bar"><i style={{ width: ((done / total) * 100) + "%", background: live ? "var(--secure)" : "var(--ok)" }} /></div>
                <span className="sb-clock" style={{ color: live ? "var(--secure)" : "var(--ok)" }}>{Math.round((done / total) * 100)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard({ go, feed }) {
  const D = useSiteData();
  const { site, setSite } = React.useContext(SiteContext);
  const { team }          = React.useContext(TeamContext);
  const { kpis, disciplines, sites } = HL;
  const [panel, setPanel] = React.useState(null);

  // live spills (state === "new") drive both the banner and the top of the feed
  const liveSpills = D.spillAlerts.filter((a) => a.state === "new");

  // synthesise feed items from live spills and pull them to the top.
  // drop the existing live-cleaning entry (f1) so we don't show the same Aisle 4 spill twice.
  const spillFeed = liveSpills.map((a) => ({
    id: "spillfeed-" + a.id,
    disc: "clean",
    sev: a.severity === "high" ? "crit" : a.severity === "medium" ? "warn" : "muted",
    live: true,
    title: "Spill detected — " + a.location,
    site: a.site,
    detail: (a.liveStatus || "Sign deployed") + " · Hanger " + a.hanger,
    time: a.since || "now",
    isSpill: true,
  }));
  // honour the site filter on the dashboard feed too
  const baseFeed = site ? D.feed : feed;
  const combinedFeed = [
    ...spillFeed,
    ...baseFeed.filter((f) => !(f.live && f.disc === "clean")),
  ];
  // filter by team (focused dashboard shows only that discipline's feed)
  const enrichedFeed = team
    ? combinedFeed.filter((f) => f.disc === team)
    : combinedFeed;

  const handleFeedClick = (item) => {
    if (item.isSpill) { go("spills"); return; }
    setPanel(item);
  };

  /* ---------- KPI rows per team ---------- */
  const spillsKpi = {
    id: "ks",
    label: "Active spills",
    value: String(liveSpills.length),
    icon: "alertTri",
    tone: liveSpills.length > 0 ? "crit" : "ok",
    live: liveSpills.length > 0,
    valColor: liveSpills.length > 0 ? "var(--crit)" : "var(--ok)",
    foot: liveSpills.length === 0 ? "All sites clear" : "signs on the floor right now",
  };

  // Cleaning team KPIs
  const doneR    = D.rounds.filter((r) => r.status === "done").length;
  const totalR   = D.rounds.length;
  const scored   = D.rounds.filter((r) => r.score);
  const avgScore = scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : 0;
  const signsOut = (D.floorPlanSites || []).flatMap((s) => s.floors)
                    .flatMap((f) => f.pins).filter((p) => p.state === "deployed").length;

  // Maintenance team KPIs
  const openCount = D.workOrders.filter((w) => w.status !== "Done").length;
  const partsLow  = (D.parts || []).filter((p) => p.status === "low" || p.status === "out").length;

  // Security team KPIs
  const openInc       = (D.incidents || []).filter((i) => i.status === "Open").length;
  const checkpointsDue = (D.patrols || []).filter((p) => p.status === "in-progress")
                          .reduce((n, p) => n + p.checkpoints.filter((c) => !c.scanned).length, 0);
  const loneActive    = (D.loneWorkers || []).length;

  let topKpis, heroNode, greetingMain, greetingSub, primaryAction;

  if (team === "clean") {
    greetingMain  = "Cleaning team — Friday afternoon";
    greetingSub   = "Rounds, spills, inspections and smart signs across " + (site ? site.name : (sites.length + " sites")) + ".";
    primaryAction = { label: "New round", icon: "plus", to: "cleaning" };
    heroNode      = <ActiveSpillsCard liveSpills={liveSpills} go={go} />;
    topKpis = [
      { id:"c1", label:"Rounds done today",   value: String(doneR), unit:"/" + totalR, icon:"checkCircle", tone:"clean", foot:"across all sites" },
      { id:"c2", label:"Active spills",        value: String(liveSpills.length), icon:"alertTri", tone: liveSpills.length > 0 ? "crit" : "ok",
        live: liveSpills.length > 0, valColor: liveSpills.length > 0 ? "var(--crit)" : "var(--ok)",
        foot: liveSpills.length > 0 ? "signs deployed now" : "all sites clear" },
      { id:"c3", label:"Avg inspection score", value: String(avgScore), unit:"%", icon:"activity", tone: avgScore >= 90 ? "ok" : "warn", foot:"completed rounds this week" },
      { id:"c4", label:"Signs out",            value: String(signsOut), icon:"flag", tone: signsOut > 0 ? "warn" : "ok", foot:"smart hangers on the floor" },
    ];
  } else if (team === "maint") {
    greetingMain  = "Maintenance team — Friday afternoon";
    greetingSub   = "Work orders, PPM, parts and meters across " + (site ? site.name : (sites.length + " sites")) + ".";
    primaryAction = { label: "New work order", icon: "plus", to: "maintenance" };
    heroNode      = <MaintenanceHero workOrders={D.workOrders} ppmTasks={D.ppmTasks || []} go={go} />;
    topKpis = [
      { id:"m1", label:"Open work orders", value: String(openCount), icon:"wrench", tone:"maint", foot:"vs last week" },
      { id:"m2", label:"PM compliance",     value:"0", unit:"%", icon:"checkCircle", tone:"ok",    foot:"planned jobs on time" },
      { id:"m3", label:"Avg. MTTR",          value:"0", unit:"d", icon:"clock",     tone:"accent", foot:"mean time to repair" },
      { id:"m4", label:"Parts low",          value: String(partsLow), icon:"package", tone: partsLow > 0 ? "warn" : "ok",
        valColor: partsLow > 0 ? "var(--warn)" : "var(--ok)", foot:"at or below min level" },
    ];
  } else if (team === "secure") {
    greetingMain  = "Security team — Friday afternoon";
    greetingSub   = "Patrols, incidents, checkpoints and lone-workers across " + (site ? site.name : (sites.length + " sites")) + ".";
    primaryAction = { label: "Log incident", icon: "plus", to: "security" };
    heroNode      = <SecurityHero patrols={D.patrols || []} loneWorkers={D.loneWorkers || []} incidents={D.incidents || []} go={go} />;
    topKpis = [
      { id:"s1", label:"Open incidents",       value: String(openInc), icon:"alertTri", tone: openInc > 0 ? "warn" : "ok",
        valColor: openInc > 0 ? "var(--warn)" : "var(--ok)", foot:"awaiting close-out" },
      { id:"s2", label:"Patrols on time",       value:"0", unit:"%", icon:"shield", tone:"secure", foot:"all sites" },
      { id:"s3", label:"Checkpoints due",       value: String(checkpointsDue), icon:"scan", tone: checkpointsDue > 0 ? "warn" : "ok",
        foot:"on live patrols" },
      { id:"s4", label:"Lone-workers active",   value: String(loneActive), icon:"user", tone:"accent", live:true, foot:"checked in within 15 min" },
    ];
  } else {
    greetingMain  = "Good afternoon, " + ((HL.currentUser && HL.currentUser.name) ? HL.currentUser.name.split(" ")[0] : "there");
    greetingSub   = "Cleaning, maintenance and security across " + sites.length + " sites — live, in one place.";
    primaryAction = { label: "New work order", icon: "plus", to: "maintenance" };
    heroNode      = <ActiveSpillsCard liveSpills={liveSpills} go={go} />;
    topKpis = [spillsKpi, ...kpis];
  }

  // Match the disciplines shown in the right column
  const focusedDisciplines = team
    ? disciplines.filter((d) => d.id === team)
    : disciplines;

  const feedTitle = team === "clean" ? "Cleaning operations feed"
                  : team === "maint" ? "Maintenance operations feed"
                  : team === "secure" ? "Security operations feed"
                  : "Live operations feed";

  return (
    <div className="content-inner">
      {panel && <FeedPanel item={panel} onClose={() => setPanel(null)} go={go} />}
      <div className="page-head">
        <div>
          <h1 className="page-title">{greetingMain}</h1>
          <p className="page-desc">{greetingSub}</p>
        </div>
        <button className="btn btn-primary" onClick={() => go(primaryAction.to)}>
          <Icon name={primaryAction.icon} size={15} />{primaryAction.label}
        </button>
      </div>

      {heroNode}

      {team && (
        <ActionQueue
          items={team === "clean" ? getCleaningActions(D)
               : team === "maint" ? getMaintActions(D)
               : team === "secure" ? getSecActions(D)
               : []}
          teamLabel={team === "clean" ? "Cleaning"
                   : team === "maint" ? "Maintenance"
                   : team === "secure" ? "Security" : ""}
          go={go} />
      )}

      <div className={"kpi-row" + (team ? "" : " kpi-row-5")}>
        {topKpis.map((k) => (
          <KPI k={k} key={k.id} onClick={k.id === "ks" ? () => go("spills") : null} />
        ))}
      </div>

      <div className="dash-grid">
        <div className="card feed">
          <div className="card-head">
            <div style={{ width:30, height:30, borderRadius:8, background:"var(--surface-3)", color:"var(--ink-2)", display:"grid", placeItems:"center" }}>
              <Icon name="activity" size={16} />
            </div>
            <div>
              <h3>{feedTitle}</h3>
              <div className="sub">{team ? "Filtered to " + (team === "clean" ? "cleaning" : team === "maint" ? "maintenance" : "security") + " — click any row" : "Spills first — click any row for detail"}</div>
            </div>
            <div className="head-act"><span className="feed-live"><span className="blip" />Live</span></div>
          </div>
          <div className="feed-list">
            {enrichedFeed.length === 0
              ? <div style={{ padding:"30px", textAlign:"center", color:"var(--ink-3)", fontSize:13.5 }}>No live events for this team right now.</div>
              : enrichedFeed.map((item) => <FeedItem item={item} key={item.id} onClick={handleFeedClick} />)
            }
          </div>
        </div>

        <div className="col-right">
          {team === "clean"  ? <CleaningRightCol D={D} go={go} />
         : team === "maint"  ? <MaintRightCol    D={D} go={go} />
         : team === "secure" ? <SecRightCol      D={D} go={go} />
         : focusedDisciplines.map((d) => <DisciplineCard d={d} key={d.id} go={go} />)}
          <div className="card">
            <div className="card-head"><h3>Sites</h3><span className="sub" style={{ marginLeft:"auto" }}>open jobs</span></div>
            <div className="card-pad" style={{ paddingTop:4, paddingBottom:4 }}>
              {sites.map((s) => (
                <div className={"site-row" + (site && site.id === s.id ? " on" : "")}
                  key={s.id}
                  onClick={() => setSite(site && site.id === s.id ? null : s)}
                  style={{ cursor:"pointer" }}>
                  <span className="sdot" style={{ background: s.status === "ok" ? "var(--ok)" : "var(--warn)" }} />
                  <div><div className="sname">{s.name}</div><div className="sloc">{s.loc}</div></div>
                  <span className="scount">{siteOpenCount(s.name)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, FeedItem });

/* ════════════════════ asset_15_e0a69afe.js ════════════════════ */
;
/* HazardLink — team-focused dashboard pieces
   --------------------------------------------------------------
   - Action queue ("Needs your attention") per team
   - Right-column cards per team (Cleaning / Maintenance / Security)
   - Default-team localStorage helpers (the star toggle lives in
     chrome.jsx and writes through these helpers)
   -------------------------------------------------------------- */

const DEFAULT_TEAM_KEY = "hl_default_team_v1";

function readDefaultTeam() {
  try {
    const v = localStorage.getItem(DEFAULT_TEAM_KEY);
    return (v === "clean" || v === "maint" || v === "secure") ? v : null;
  } catch (e) { return null; }
}
function writeDefaultTeam(t) {
  try {
    if (t == null) localStorage.removeItem(DEFAULT_TEAM_KEY);
    else            localStorage.setItem(DEFAULT_TEAM_KEY, t);
  } catch (e) { /* ignore */ }
}

const _siteShort = (name) => {
  const s = HL.sites.find((x) => x.name === name);
  return (s && (s.shortName || s.name.split(/[\s,]/)[0])) || name;
};

/* =====================================================
   Action queue
   ===================================================== */
function ActionQueueRow({ item, go }) {
  return (
    <button className={"aq-row aq-row-" + item.tone} onClick={() => item.dest && go(item.dest)}>
      <span className={"aq-ico aq-ico-" + item.tone}><Icon name={item.icon} size={14} /></span>
      <div className="aq-body">
        <div className="aq-title">{item.title}</div>
        <div className="aq-sub">{item.sub}</div>
      </div>
      <span className={"aq-count aq-count-" + item.tone}>{item.count}</span>
      <Icon name="chevronRight" size={14} />
    </button>
  );
}

function ActionQueue({ items, go, teamLabel }) {
  if (!items || items.length === 0) {
    return (
      <div className="card aq-card aq-card-clear" style={{ marginBottom: 18 }}>
        <div className="aq-clear-head">
          <div className="aq-clear-ico"><Icon name="checkCircle" size={17} /></div>
          <div>
            <h3>Needs your attention</h3>
            <div className="sub">All clear — nothing urgent on the {teamLabel || "team"}'s plate right now.</div>
          </div>
        </div>
      </div>
    );
  }
  const total = items.reduce((s, i) => s + (Number(i.count) || 0), 0);
  return (
    <div className="card aq-card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <div className="aq-head-ico"><Icon name="alertCircle" size={16} /></div>
        <div>
          <h3>Needs your attention</h3>
          <div className="sub">
            <b style={{ color: "var(--ink)", fontFamily: "var(--mono)" }}>{total}</b>
            <span style={{ marginLeft: 4 }}>thing{total === 1 ? "" : "s"} on {teamLabel ? teamLabel + "'s" : "the team's"} plate · ordered by urgency</span>
          </div>
        </div>
      </div>
      <div className="aq-list">
        {items.map((it) => <ActionQueueRow item={it} go={go} key={it.id} />)}
      </div>
    </div>
  );
}

/* =====================================================
   Action queue — per-team item builders (read seed data)
   ===================================================== */
function getCleaningActions(D) {
  const overdueRounds    = D.rounds.filter((r) => r.status === "pending");
  const unassignedSpills = D.spillAlerts.filter((s) => s.state === "new" && s.liveStatusTone === "warn");
  const inspBelow        = D.rounds.filter((r) => r.score != null && r.score < 90);
  let lowBat = 0, offline = 0;
  (HL.deviceBuildings || []).forEach((b) => b.devices.forEach((d) => {
    if (d.type !== "Hanger") return;
    if (d.online === false) offline++;
    else if (d.battery != null && d.battery < 20) lowBat++;
  }));
  const items = [];
  if (overdueRounds.length) items.push({
    id: "c1", icon: "clock", tone: "crit",
    title: "Rounds running late",
    sub:  overdueRounds.slice(0, 2).map((r) => r.cleaner + " · " + _siteShort(r.site)).join(" · "),
    count: overdueRounds.length, dest: "cleaning",
  });
  if (unassignedSpills.length) items.push({
    id: "c2", icon: "alertTri", tone: "warn",
    title: "Spills awaiting a cleaner",
    sub:  unassignedSpills.slice(0, 2).map((s) => s.location + " · " + _siteShort(s.site)).join(" · "),
    count: unassignedSpills.length, dest: "spills",
  });
  if (inspBelow.length) items.push({
    id: "c3", icon: "activity", tone: "warn",
    title: "Inspections below 90%",
    sub:  inspBelow.slice(0, 3).map((r) => _siteShort(r.site) + " · " + r.score + "%").join(" · "),
    count: inspBelow.length, dest: "cleaning",
  });
  if (lowBat + offline > 0) items.push({
    id: "c4", icon: "alertCircle", tone: "muted",
    title: "Signs need attention",
    sub:  lowBat + " low battery · " + offline + " offline",
    count: lowBat + offline, dest: "devices",
  });
  return items;
}

function getMaintActions(D) {
  const slaRisk    = D.workOrders.filter((w) => w.priority === "High" && w.status !== "Done");
  const tenders    = D.workOrders.filter((w) => w.status === "Tendering");
  const overduePpm = (D.ppmTasks || []).filter((t) => t.bucket === "overdue");
  const partsLow   = (D.parts    || []).filter((p) => p.status === "low" || p.status === "out");
  const unassigned = D.workOrders.filter((w) => w.assignee === "Unassigned" && w.status !== "Done");
  const items = [];
  if (slaRisk.length) items.push({
    id: "m1", icon: "alertTri", tone: "crit",
    title: "SLA breaching soon",
    sub:  slaRisk.slice(0, 2).map((w) => w.id + " · " + _siteShort(w.site)).join(" · "),
    count: slaRisk.length, dest: "maintenance",
  });
  if (overduePpm.length) items.push({
    id: "m2", icon: "clock", tone: "crit",
    title: "PPMs overdue",
    sub:  overduePpm.slice(0, 2).map((t) => t.name + " · " + t.nextDue).join(" · "),
    count: overduePpm.length, dest: "ppm",
  });
  if (tenders.length) items.push({
    id: "m3", icon: "send", tone: "warn",
    title: "Quotes awaiting approval",
    sub:  tenders.slice(0, 2).map((w) => w.id + " · " + w.title.slice(0, 32) + (w.title.length > 32 ? "…" : "")).join(" · "),
    count: tenders.length, dest: "maintenance",
  });
  if (partsLow.length) items.push({
    id: "m4", icon: "package", tone: "warn",
    title: "Parts below min",
    sub:  partsLow.slice(0, 2).map((p) => p.name.slice(0, 28) + (p.name.length > 28 ? "…" : "")).join(" · "),
    count: partsLow.length, dest: "parts",
  });
  if (unassigned.length) items.push({
    id: "m5", icon: "user", tone: "muted",
    title: "Unassigned work orders",
    sub:  unassigned.slice(0, 3).map((w) => w.id).join(" · ") + (unassigned.length > 3 ? " · …" : ""),
    count: unassigned.length, dest: "maintenance",
  });
  return items;
}

function getSecActions(D) {
  const overdueLW   = (D.loneWorkers || []).filter((l) => l.status === "overdue");
  const openInc     = (D.incidents   || []).filter((i) => i.status === "Open");
  const inProgress  = (D.patrols     || []).filter((p) => p.status === "in-progress");
  const behindPatrols = inProgress.filter((p) => {
    const missed = p.checkpoints.filter((c) => !c.scanned).length;
    return missed / p.checkpoints.length > 0.35;
  });
  const missedCp = inProgress.reduce((n, p) => n + p.checkpoints.filter((c) => !c.scanned).length, 0);

  const items = [];
  if (overdueLW.length) items.push({
    id: "s1", icon: "user", tone: "crit",
    title: "Lone-worker check-in overdue",
    sub:  overdueLW.slice(0, 2).map((l) => l.name + " · " + l.lastCheckin).join(" · "),
    count: overdueLW.length, dest: "security",
  });
  if (openInc.length) items.push({
    id: "s2", icon: "alertTri", tone: "warn",
    title: "Incidents awaiting close-out",
    sub:  openInc.slice(0, 2).map((i) => i.id + " · " + i.type).join(" · "),
    count: openInc.length, dest: "security",
  });
  if (behindPatrols.length) items.push({
    id: "s3", icon: "shield", tone: "warn",
    title: "Patrols behind schedule",
    sub:  behindPatrols.slice(0, 2).map((p) => p.guard + " · " + _siteShort(p.site)).join(" · "),
    count: behindPatrols.length, dest: "security",
  });
  if (missedCp > 0) items.push({
    id: "s4", icon: "scan", tone: "muted",
    title: "Checkpoints not yet scanned",
    sub:  "On " + inProgress.length + " active patrol" + (inProgress.length === 1 ? "" : "s"),
    count: missedCp, dest: "security",
  });
  return items;
}

/* =====================================================
   Right-column cards (Cleaning)
   ===================================================== */
function CleaningRightCol({ D, go }) {
  const cleanLW       = (D.loneWorkers || []).filter((l) => /cleaner/i.test(l.role));
  const activeRounds  = D.rounds.filter((r) => r.status !== "done");

  /* Consumables — short curated list of stock items the cleaning lead actually
     reorders. Counts are seeded so they match the "Consumables low" KPI tone. */
  const consumables = [];

  return (
    <React.Fragment>
      <div className="card team-side-card">
        <div className="card-head ts-head">
          <div className="ts-ico" style={{ background: softBg("clean"), color: solid("clean") }}><Icon name="droplet" size={15} /></div>
          <div>
            <h3>On shift now</h3>
            <div className="sub">{cleanLW.length} cleaner{cleanLW.length === 1 ? "" : "s"} · {activeRounds.length} round{activeRounds.length === 1 ? "" : "s"} active</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("team")}>Open<Icon name="chevronRight" size={13} /></button>
        </div>
        <div className="ts-list">
          {cleanLW.map((lw) => {
            const round    = activeRounds.find((r) => r.cleaner === lw.name);
            const overdue  = lw.status === "overdue";
            const status   = overdue ? "Check-in late"
                           : round && round.status === "in-progress" ? round.type
                           : round ? "Round " + round.due
                           : "Free";
            const tone     = overdue ? "crit"
                           : round && round.status === "in-progress" ? "accent"
                           : round ? "warn" : "ok";
            return (
              <button key={lw.id} className="ts-row" onClick={() => go(round ? "cleaning" : "team")}>
                <span className={"ts-avatar ts-avatar-" + tone}>{lw.initials}</span>
                <div className="ts-body">
                  <div className="ts-name">{lw.name}</div>
                  <div className="ts-sub">{_siteShort(lw.site)} · {lw.role}</div>
                </div>
                <span className={"ts-pill ts-pill-" + tone}>{status}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card team-side-card">
        <div className="card-head ts-head">
          <div className="ts-ico" style={{ background: softBg("clean"), color: solid("clean") }}><Icon name="package" size={15} /></div>
          <div>
            <h3>Consumables low</h3>
            <div className="sub">
              {consumables.filter((c) => c.status === "out").length} out · {consumables.filter((c) => c.status === "low").length} low
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("parts")}>Reorder<Icon name="chevronRight" size={13} /></button>
        </div>
        <div className="ts-list">
          {consumables.map((c) => (
            <button key={c.id} className="ts-row" onClick={() => go("parts")}>
              <div className="ts-body">
                <div className="ts-name">{c.name}</div>
                <div className="ts-sub">{c.site} · min {c.min}</div>
              </div>
              <span className={"ts-stock-pill ts-stock-" + (c.status === "out" ? "crit" : "warn")}>
                <b>{c.onHand}</b><span>/{c.min}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}

/* =====================================================
   Right-column cards (Maintenance)
   ===================================================== */
function MaintRightCol({ D, go }) {
  const slaRisk = D.workOrders
    .filter((w) => w.priority === "High" && w.status !== "Done")
    .slice(0, 4);
  const tenders = D.workOrders.filter((w) => w.status === "Tendering");

  /* Approvals: tenders (price-ranked quotes) + a couple of POs from the
     low-stock parts so the value here reflects the parts shortfalls. */
  const approvals = [
    ...tenders.map((w) => ({ id: w.id, kind: "Quote",          title: w.title, amount: "3 quotes ranked", dest: "wo" })),
  ];

  /* Countdown text per WO — woDetail.sla is the source of truth for WO-2041. */
  const slaTimer = {};

  return (
    <React.Fragment>
      <div className="card team-side-card">
        <div className="card-head ts-head">
          <div className="ts-ico" style={{ background: softBg("maint"), color: solid("maint") }}><Icon name="clock" size={15} /></div>
          <div>
            <h3>SLA at risk</h3>
            <div className="sub">{slaRisk.length} job{slaRisk.length === 1 ? "" : "s"} near breach · countdown live</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("slas")}>SLAs<Icon name="chevronRight" size={13} /></button>
        </div>
        <div className="ts-list">
          {slaRisk.map((w) => {
            const t = slaTimer[w.id] || { left: "—", tone: "muted" };
            return (
              <button key={w.id} className="ts-row" onClick={() => go("maintenance")}>
                <div className="ts-body">
                  <div className="ts-name">{w.title.length > 40 ? w.title.slice(0, 40) + "…" : w.title}</div>
                  <div className="ts-sub" style={{ fontFamily: "var(--mono)" }}>{w.id} · {_siteShort(w.site)}</div>
                </div>
                <span className={"ts-timer ts-timer-" + t.tone}>
                  <Icon name="clock" size={11} /><b>{t.left}</b>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card team-side-card">
        <div className="card-head ts-head">
          <div className="ts-ico" style={{ background: softBg("maint"), color: solid("maint") }}><Icon name="checkCircle" size={15} /></div>
          <div>
            <h3>Awaiting your approval</h3>
            <div className="sub">{approvals.length} item{approvals.length === 1 ? "" : "s"} · quotes &amp; purchase orders</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("parts")}>POs<Icon name="chevronRight" size={13} /></button>
        </div>
        <div className="ts-list">
          {approvals.map((a) => (
            <button key={a.id} className="ts-row" onClick={() => go(a.dest)}>
              <span className={"ts-kind-pill ts-kind-" + (a.kind === "Quote" ? "warn" : "accent")}>{a.kind}</span>
              <div className="ts-body">
                <div className="ts-name">{a.title}</div>
                <div className="ts-sub" style={{ fontFamily: "var(--mono)" }}>{a.id} · {a.amount}</div>
              </div>
              <Icon name="chevronRight" size={13} />
            </button>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}

/* =====================================================
   Right-column cards (Security)
   ===================================================== */
function SecRightCol({ D, go }) {
  const guards = D.patrols.map((p) => {
    const done = p.checkpoints.filter((c) => c.scanned).length;
    const total = p.checkpoints.length;
    return { ...p, done, total, pct: Math.round((done / total) * 100) };
  });
  const checkIns = (D.loneWorkers || []).slice(0, 6);

  return (
    <React.Fragment>
      <div className="card team-side-card">
        <div className="card-head ts-head">
          <div className="ts-ico" style={{ background: softBg("secure"), color: solid("secure") }}><Icon name="shield" size={15} /></div>
          <div>
            <h3>Guards on duty</h3>
            <div className="sub">
              {guards.filter((p) => p.status === "in-progress").length} patrol{guards.filter((p) => p.status === "in-progress").length === 1 ? "" : "s"} in progress · {guards.filter((p) => p.status === "complete").length} complete
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("security")}>Open<Icon name="chevronRight" size={13} /></button>
        </div>
        <div className="ts-list">
          {guards.map((p) => {
            const live = p.status === "in-progress";
            return (
              <button key={p.id} className="ts-row" onClick={() => go("security")}>
                <span className={"ts-avatar ts-avatar-" + (live ? "accent" : "ok")}>{p.initials}</span>
                <div className="ts-body">
                  <div className="ts-name">{p.guard}</div>
                  <div className="ts-sub">{_siteShort(p.site)} · started {p.started}</div>
                </div>
                <div className="ts-progress">
                  <div className="ts-pb"><i style={{ width: p.pct + "%", background: live ? "var(--secure)" : "var(--ok)" }} /></div>
                  <span className="ts-pb-label">{p.done}/{p.total}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card team-side-card">
        <div className="card-head ts-head">
          <div className="ts-ico" style={{ background: softBg("secure"), color: solid("secure") }}><Icon name="clock" size={15} /></div>
          <div>
            <h3>Check-ins due</h3>
            <div className="sub">Lone-worker timers across all sites</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => go("security")}>Open<Icon name="chevronRight" size={13} /></button>
        </div>
        <div className="ts-list">
          {checkIns.map((l) => {
            const overdue = l.status === "overdue";
            return (
              <button key={l.id} className="ts-row" onClick={() => go("security")}>
                <span className={"ts-avatar ts-avatar-" + (overdue ? "crit" : "ok")}>{l.initials}</span>
                <div className="ts-body">
                  <div className="ts-name">{l.name}</div>
                  <div className="ts-sub">{l.role} · {_siteShort(l.site)}</div>
                </div>
                <span className={"ts-timer ts-timer-" + (overdue ? "crit" : "ok")}>
                  <Icon name="clock" size={11} /><b>{l.lastCheckin}</b>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, {
  DEFAULT_TEAM_KEY, readDefaultTeam, writeDefaultTeam,
  ActionQueue, ActionQueueRow,
  getCleaningActions, getMaintActions, getSecActions,
  CleaningRightCol, MaintRightCol, SecRightCol,
});

/* ════════════════════ asset_08_2b7ca6bf.js ════════════════════ */
;
/* HazardLink — Sites: Portfolio overview + per-site page */

/* ---------- Site enrichment metadata ---------- */
const SITE_INFO = {};

const _STATUS_LABEL = { ok: "Operational", warn: "Attention needed", crit: "Issues" };
const _STATUS_TONE  = { ok: "ok", warn: "warn", crit: "crit" };

/* ===========================================================
   Portfolio overview — "All sites"
   =========================================================== */
function PortfolioCard({ site, info, counts, onOpen }) {
  return (
    <button className="portfolio-card" onClick={() => onOpen(site)}>
      <div className="pc-photo" style={{ background: info.photoTint }}>
        <span className="pc-photo-tag">PHOTO · {info.type}</span>
        <div className="pc-photo-status">
          <span className={"pc-status-dot " + (site.status === "ok" ? "ok" : "warn")} />
          {_STATUS_LABEL[site.status] || "Operational"}
        </div>
      </div>
      <div className="pc-body">
        <h3 className="pc-name">{site.name}</h3>
        <div className="pc-loc">
          <Icon name="mapPin" size={12} />{info.address}
        </div>
        <div className="pc-counts">
          <div className="pc-count">
            <div className={"pc-n" + (counts.spills > 0 ? " is-crit" : "")}>{counts.spills}</div>
            <div className="pc-l">Live spills</div>
          </div>
          <div className="pc-count">
            <div className={"pc-n" + (counts.openWo > 0 ? " is-maint" : "")}>{counts.openWo}</div>
            <div className="pc-l">Open jobs</div>
          </div>
          <div className="pc-count">
            <div className={"pc-n" + (counts.incidents > 0 ? " is-warn" : "")}>{counts.incidents}</div>
            <div className="pc-l">Incidents</div>
          </div>
        </div>
      </div>
      <div className="pc-foot">
        <span>{info.area} · {info.manager}</span>
        <span className="pc-arrow"><Icon name="arrowRight" size={14} /></span>
      </div>
    </button>
  );
}

function PortfolioView({ go }) {
  const { setSite } = React.useContext(SiteContext);
  const sites = HL.sites;

  const countsFor = (siteName) => ({
    spills:    HL.spillAlerts.filter((a) => a.site === siteName && a.state === "new").length,
    openWo:    HL.workOrders.filter((w)  => w.site === siteName && w.status !== "Done").length,
    incidents: HL.incidents.filter((i)   => i.site === siteName && i.status === "Open").length,
  });

  const openSite = (s) => { setSite(s); go("site"); };

  // Roll-up KPIs
  const allSpills = HL.spillAlerts.filter((a) => a.state === "new").length;
  const allOpen   = HL.workOrders.filter((w) => w.status !== "Done").length;
  const allInc    = HL.incidents.filter((i) => i.status === "Open").length;
  const overdue   = HL.ppmTasks.filter((t) => t.status === "overdue").length;

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Sites portfolio</h1>
          <p className="page-desc">Every location in HazardLink. Open a site to see its live operations, sensors and floor plan.</p>
        </div>
        <button className="btn"><Icon name="plus" size={15} />Add a site</button>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("muted"), color:solid("muted") }}><Icon name="layers" size={16} /></div><span className="kpi-label">Sites live</span></div>
          <div className="kpi-val">{sites.length}</div>
          <div className="kpi-foot">across {new Set(sites.map((s) => s.loc)).size} cities</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Active spills</span></div>
          <div className="kpi-val" style={{ color: allSpills > 0 ? "var(--crit)" : "var(--ok)" }}>{allSpills}</div>
          <div className="kpi-foot">{allSpills > 0 ? "signs on the floor" : "every site clear"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("maint"), color:solid("maint") }}><Icon name="wrench" size={16} /></div><span className="kpi-label">Open work orders</span></div>
          <div className="kpi-val">{allOpen}</div>
          <div className="kpi-foot">{overdue} PPM overdue</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="shield" size={16} /></div><span className="kpi-label">Open incidents</span></div>
          <div className="kpi-val" style={{ color: allInc > 0 ? "var(--warn)" : "var(--ok)" }}>{allInc}</div>
          <div className="kpi-foot">across all sites</div>
        </div>
      </div>

      <div className="portfolio-grid">
        {sites.map((s) => (
          <PortfolioCard key={s.id} site={s} info={SITE_INFO[s.id] || {}}
            counts={countsFor(s.name)} onOpen={openSite} />
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
   SiteFloorPlan — image-style plan with multi-state pins + popover
   =========================================================== */
function _pinStateForSite(pin, deviceById) {
  const dev = deviceById[pin.id];
  if (dev && !dev.online) return "offline";
  return pin.state === "deployed" ? "deployed" : "cleared";
}
function _lowBatteryFor(pin, deviceById) {
  const dev = deviceById[pin.id];
  return dev && dev.battery != null && dev.battery < 25 && dev.online;
}

function PinPopoverSite({ pin, device, status, lowBat, x, y, onClose, go }) {
  // Flip the popover into the floor plan when the pin is near an edge.
  const flipH = x > 60;
  const flipV = y > 65;
  const cls = "sfp-popover"
            + (flipH ? " sfp-popover-flip-h" : "")
            + (flipV ? " sfp-popover-flip-v" : "");
  const style = {
    left:  flipH ? "auto" : x + "%",
    right: flipH ? (100 - x) + "%" : "auto",
    top:   flipV ? "auto" : y + "%",
    bottom: flipV ? (100 - y) + "%" : "auto",
  };
  const meta = {
    cleared:  { label:"On rack — ready",     tone:"ok",   icon:"checkCircle" },
    deployed: { label:"Signing a hazard",    tone:"crit", icon:"alertTri" },
    offline:  { label:"Sensor offline",       tone:"warn", icon:"alertCircle" },
  }[status];

  return (
    <div className={cls} style={style} onClick={(e) => e.stopPropagation()}>
      <div className="sfp-popover-head">
        <span className={"sfp-pin-mock sfp-pin-" + status} />
        <div style={{ flex:1, minWidth:0 }}>
          <div className="sfp-popover-name">{pin.label}</div>
          <div className="sfp-popover-id">Hanger {pin.id}</div>
        </div>
        <button className="icon-btn sfp-popover-close" onClick={onClose}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="sfp-popover-body">
        <div className="sfp-popover-row">
          <span className="k">Status</span>
          <span className="v">
            <Pill tone={meta.tone} dot>{meta.label}</Pill>
            {lowBat && <Pill tone="warn">Low battery</Pill>}
          </span>
        </div>
        <div className="sfp-popover-row">
          <span className="k">Zone</span>
          <span className="v">{pin.label}</span>
        </div>
        <div className="sfp-popover-row">
          <span className="k">Battery</span>
          <span className="v">
            {device && device.battery != null
              ? <span className="battery">
                  <span className="bat-shell"><i style={{ width: device.battery + "%", background: device.battery < 25 ? "var(--warn)" : device.battery < 60 ? "var(--accent)" : "var(--ok)" }} /></span>
                  <span className="bat-cap" />
                  <span className="bat-num">{device.battery}%</span>
                </span>
              : <span className="bat-mains"><Icon name="activity" size={12} />Mains</span>}
          </span>
        </div>
        <div className="sfp-popover-row">
          <span className="k">Last seen</span>
          <span className="v" style={{ fontFamily:"var(--mono)" }}>{device ? device.lastSeen : "—"}</span>
        </div>
        <div className="sfp-popover-row" style={{ borderBottom:"none" }}>
          <span className="k">Note</span>
          <span className="v" style={{ fontStyle:"italic", color:"var(--ink-2)" }}>{pin.note}</span>
        </div>
      </div>
      <div className="sfp-popover-foot">
        <button className="btn btn-sm" onClick={() => { onClose(); go("devices"); }}>
          <Icon name="monitor" size={13} />Open device
        </button>
        {status === "deployed" && (
          <button className="btn btn-sm btn-primary" onClick={() => { onClose(); go("spills"); }}>
            <Icon name="checkCircle" size={13} />Resolve
          </button>
        )}
      </div>
    </div>
  );
}

function SiteFloorPlanSVG({ floor, deviceById, activeId, onPin }) {
  return (
    <svg viewBox="0 0 1000 600" className="fp-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="sfp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0 L0 0 0 40" className="fp-grid" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="1000" height="600" fill="url(#sfp-grid)" />
      <rect x="6" y="6" width="988" height="588" className="fp-outer" />

      {floor.rooms.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} className="fp-room" rx="3" />
          <text x={r.x + 10} y={r.y + 18} className="fp-label">{r.label}</text>
        </g>
      ))}

      {floor.pins.map((p) => {
        const cx = p.x * 10, cy = p.y * 6;
        const state = _pinStateForSite(p, deviceById);
        const lowBat = _lowBatteryFor(p, deviceById);
        const isActive = activeId === p.id;
        return (
          <g key={p.id} className={"fp-pin-g " + (isActive ? "on " : "") + state}
             transform={`translate(${cx},${cy})`}
             onClick={(e) => { e.stopPropagation(); onPin(p, state, lowBat); }}>
            {state === "deployed" && <circle r="22" className="fp-pulse" />}
            {isActive && <circle r="20" className="fp-ring" />}
            <circle r="11" className={"fp-pin-disc fp-" + state} />
            <circle r="4" className="fp-pin-dot" />
            {lowBat && <circle r="6" cx="11" cy="-11" className="fp-pin-lowbat" />}
            <text y="-18" className="fp-pin-id">{p.id}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SiteFloorPlan({ floorPlanSite, deviceById, go }) {
  const floor = floorPlanSite.floors[0];
  const [active, setActive] = React.useState(null);

  const counts = floor.pins.reduce((acc, p) => {
    const s = _pinStateForSite(p, deviceById);
    acc[s]++;
    if (_lowBatteryFor(p, deviceById)) acc.lowbat++;
    return acc;
  }, { cleared:0, deployed:0, offline:0, lowbat:0 });

  return (
    <div className="sfp-shell">
      <div className="sfp-legend">
        <div className="sfp-legend-row">
          <span className="sfp-pin-mock sfp-pin-cleared" />
          Sign hanging correctly <b>{counts.cleared}</b>
        </div>
        <div className="sfp-legend-row">
          <span className="sfp-pin-mock sfp-pin-deployed" />
          Sign lifted or spill active <b>{counts.deployed}</b>
        </div>
        <div className="sfp-legend-row">
          <span className="sfp-pin-mock sfp-pin-offline" />
          Sensor offline <b>{counts.offline}</b>
        </div>
        <div className="sfp-legend-row">
          <span className="sfp-pin-mock sfp-pin-lowbat" />
          Low battery <b>{counts.lowbat}</b>
        </div>
      </div>

      <div className="sfp-canvas" onClick={() => setActive(null)}>
        <SiteFloorPlanSVG floor={floor} deviceById={deviceById}
          activeId={active && active.pin.id}
          onPin={(p, state, lowBat) => setActive({ pin: p, state, lowBat })} />
        {active && (
          <PinPopoverSite pin={active.pin} status={active.state} lowBat={active.lowBat}
            device={deviceById[active.pin.id]}
            x={active.pin.x} y={active.pin.y}
            go={go}
            onClose={(e) => { if (e) e.stopPropagation(); setActive(null); }} />
        )}
        <div className="fp-stamp">
          <Icon name="mapPin" size={13} /> {floorPlanSite.name} · {floor.name}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Compact line rows shared by site sections
   =========================================================== */
function SiteLine({ tone, icon, title, meta, right }) {
  return (
    <div className="site-line">
      <div className="site-line-ico" style={{ background:softBg(tone), color:solid(tone) }}>
        <Icon name={icon} size={13} />
      </div>
      <div className="site-line-body">
        <div className="site-line-title">{title}</div>
        <div className="site-line-meta">{meta}</div>
      </div>
      {right}
    </div>
  );
}

function SiteSection({ tone, icon, title, viewAll, onViewAll, children }) {
  return (
    <div className="card site-section">
      <div className="card-head">
        <div className="site-sec-ico" style={{ background:softBg(tone), color:solid(tone) }}>
          <Icon name={icon} size={17} />
        </div>
        <h3>{title}</h3>
        {viewAll && (
          <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={onViewAll}>
            {viewAll}<Icon name="chevronRight" size={14} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function SiteCol({ label, empty, children, count }) {
  return (
    <div className="site-sec-col">
      <div className="site-sec-col-label">
        {label}{count != null && <span className="site-sec-col-n">{count}</span>}
      </div>
      {(!children || (Array.isArray(children) && children.length === 0))
        ? <div className="site-sec-empty">{empty}</div>
        : children}
    </div>
  );
}

/* ===========================================================
   SiteView — focused dashboard for a single site
   =========================================================== */
function SiteView({ go }) {
  const { site } = React.useContext(SiteContext);
  const D = useSiteData();

  // Fallback: no site picked → portfolio
  if (!site) return <PortfolioView go={go} />;

  const info = SITE_INFO[site.id] || {};

  // Cross-reference devices for the floor plan + KPI
  const allDevices = (D.deviceBuildings || []).flatMap((b) => b.devices);
  const deviceById = allDevices.reduce((m, d) => { m[d.id] = d; return m; }, {});

  // KPIs for this site
  const activeSpills = D.spillAlerts.filter((a) => a.state === "new").length;
  const openWO       = D.workOrders.filter((w)  => w.status !== "Done").length;
  const openInc      = D.incidents.filter((i)   => i.status === "Open").length;
  const onSiteStaff  = (info.staffNominal || 4) + (D.loneWorkers || []).filter((w) => w.status === "ok").length;

  const planSite = (D.floorPlanSites || [])[0];

  const todayRounds  = D.rounds.slice(0, 3);
  const liveSpillsHere = D.spillAlerts.filter((a) => a.state === "new");
  const woHere       = D.workOrders.filter((w) => w.status !== "Done").slice(0, 4);
  const ppmHere      = (D.ppmTasks || []).filter((t) => t.status !== "complete").slice(0, 4);
  const incHere      = D.incidents.filter((i) => i.status !== "Closed").slice(0, 3);
  const patrolsHere  = (D.patrols || []).slice(0, 3);
  const devicesHere  = allDevices.slice(0, 6);

  const lowBatN  = allDevices.filter((d) => d.battery != null && d.battery < 25).length;
  const offlineN = allDevices.filter((d) => !d.online).length;

  return (
    <div className="content-inner">
      {/* Hero */}
      <div className="site-hero card">
        <div className="site-hero-photo" style={{ background: info.photoTint || "var(--surface-3)" }}>
          <div className="site-hero-photo-stripe" />
          <span className="site-hero-photo-tag">PHOTO · {info.type || "Site"}</span>
        </div>
        <div className="site-hero-body">
          <div className="site-hero-top">
            <Pill tone={_STATUS_TONE[site.status] || "ok"} dot>{_STATUS_LABEL[site.status] || "Operational"}</Pill>
            <span className="site-hero-type">{info.type}</span>
            {liveSpillsHere.length > 0 && <Pill tone="crit"><span className="blip" />{liveSpillsHere.length} live spill{liveSpillsHere.length === 1 ? "" : "s"}</Pill>}
          </div>
          <h1 className="site-hero-name">{site.name}</h1>
          <div className="site-hero-meta">
            <span><Icon name="mapPin" size={13} />{info.address || site.loc}</span>
            <span className="site-hero-sep" />
            <span>{info.area} · opened {info.openedOn}</span>
            <span className="site-hero-sep" />
            <span>Site manager: {info.manager}</span>
          </div>
        </div>
        <div className="site-hero-actions">
          <button className="btn" onClick={() => go("portfolio")}><Icon name="layers" size={14} />All sites</button>
          <button className="btn" onClick={() => go("devices")}><Icon name="monitor" size={14} />Devices</button>
          <button className="btn btn-primary" onClick={() => go("floorplan")}><Icon name="mapPin" size={14} />Open floor plan</button>
        </div>
      </div>

      {/* KPI row — 6 metrics */}
      <div className="kpi-row kpi-row-6">
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Active spills</span></div>
          <div className="kpi-val" style={{ color: activeSpills > 0 ? "var(--crit)" : "var(--ok)" }}>{activeSpills}</div>
          <div className="kpi-foot">{activeSpills > 0 ? "signs on the floor" : "all clear"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("maint"), color:solid("maint") }}><Icon name="wrench" size={16} /></div><span className="kpi-label">Open work orders</span></div>
          <div className="kpi-val">{openWO}</div>
          <div className="kpi-foot">backlog at this site</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">PM compliance</span></div>
          <div className="kpi-val">{info.pm}<small>%</small></div>
          <div className="kpi-foot">on time this month</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="alertCircle" size={16} /></div><span className="kpi-label">Open incidents</span></div>
          <div className="kpi-val" style={{ color: openInc > 0 ? "var(--warn)" : "var(--ok)" }}>{openInc}</div>
          <div className="kpi-foot">awaiting close-out</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="users" size={16} /></div><span className="kpi-label">Staff on site</span></div>
          <div className="kpi-val">{onSiteStaff}</div>
          <div className="kpi-foot">checked in today</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("secure"), color:solid("secure") }}><Icon name="shield" size={16} /></div><span className="kpi-label">Compliance</span></div>
          <div className="kpi-val">{info.compliance}<small>%</small></div>
          <div className="kpi-foot">contractors and certs</div>
        </div>
      </div>

      {/* CLEANING */}
      <SiteSection tone="clean" icon="droplet" title="Cleaning"
        viewAll="View cleaning" onViewAll={() => go("cleaning")}>
        <div className="site-sec-body">
          <SiteCol label="Today's rounds" count={todayRounds.length} empty="No rounds scheduled today.">
            {todayRounds.map((r) => {
              const stTone = r.status === "done" ? "ok" : r.status === "in-progress" ? "accent" : "muted";
              const stLab  = r.status === "done" ? "Complete" : r.status === "in-progress" ? "Live" : "Scheduled";
              return (
                <SiteLine key={r.id} tone="clean" icon="droplet"
                  title={r.type} meta={"due " + r.due + " · " + r.cleaner}
                  right={<Pill tone={stTone} dot>{stLab}</Pill>} />
              );
            })}
          </SiteCol>
          <SiteCol label="Active spills" count={liveSpillsHere.length} empty="No active spills.">
            {liveSpillsHere.map((s) => (
              <SiteLine key={s.id} tone="crit" icon="alertTri"
                title={s.location} meta={"Raised " + s.raisedAt + " · Hanger " + s.hanger}
                right={<Pill tone={s.severity === "high" ? "crit" : s.severity === "medium" ? "warn" : "muted"} dot>{s.severity}</Pill>} />
            ))}
          </SiteCol>
        </div>
      </SiteSection>

      {/* MAINTENANCE */}
      <SiteSection tone="maint" icon="wrench" title="Maintenance"
        viewAll="View maintenance" onViewAll={() => go("maintenance")}>
        <div className="site-sec-body">
          <SiteCol label="Open work orders" count={woHere.length} empty="Backlog clear at this site.">
            {woHere.map((w) => (
              <SiteLine key={w.id} tone="maint" icon="wrench"
                title={<React.Fragment><span className="site-line-id">{w.id}</span> {w.title}</React.Fragment>}
                meta={w.assignee + " · " + w.source}
                right={<PriorityPill p={w.priority} />} />
            ))}
          </SiteCol>
          <SiteCol label="PPMs due" count={ppmHere.length} empty="No PPMs scheduled here.">
            {ppmHere.map((t) => {
              const tone = t.status === "overdue" ? "crit" : t.status === "due-soon" ? "warn" : "muted";
              return (
                <SiteLine key={t.id} tone="maint" icon="clock"
                  title={t.name} meta={t.asset + " · " + t.frequency}
                  right={<Pill tone={tone} dot>{t.nextDue}</Pill>} />
              );
            })}
          </SiteCol>
        </div>
      </SiteSection>

      {/* SECURITY */}
      <SiteSection tone="secure" icon="shield" title="Security"
        viewAll="View security" onViewAll={() => go("security")}>
        <div className="site-sec-body">
          <SiteCol label="Open incidents" count={incHere.length} empty="No open incidents.">
            {incHere.map((i) => (
              <SiteLine key={i.id} tone="secure" icon="alertCircle"
                title={i.type} meta={i.time + " · reported by " + i.reporter}
                right={<Pill tone={i.statusTone} dot>{i.status}</Pill>} />
            ))}
          </SiteCol>
          <SiteCol label="Patrols" count={patrolsHere.length} empty="No active patrols.">
            {patrolsHere.map((p) => {
              const total = p.checkpoints.length;
              const done  = p.checkpoints.filter((c) => c.scanned).length;
              return (
                <SiteLine key={p.id} tone="secure" icon="shield"
                  title={p.guard} meta={"Started " + p.started + " · " + done + "/" + total + " checkpoints"}
                  right={<Pill tone={p.status === "in-progress" ? "warn" : "ok"} dot>{p.status === "in-progress" ? "Live" : "Complete"}</Pill>} />
              );
            })}
          </SiteCol>
        </div>
      </SiteSection>

      {/* DEVICES */}
      <SiteSection tone="muted" icon="monitor" title="Devices"
        viewAll="View devices" onViewAll={() => go("devices")}>
        <div style={{ display:"flex", gap:10, padding:"12px 18px 4px", flexWrap:"wrap" }}>
          <Pill tone="ok">{allDevices.length - offlineN} online</Pill>
          {offlineN > 0 && <Pill tone="warn">{offlineN} offline</Pill>}
          {lowBatN > 0  && <Pill tone="warn">{lowBatN} low battery</Pill>}
          <Pill tone="muted">{allDevices.filter((d) => d.type === "Hanger").length} hangers</Pill>
          <Pill tone="muted">{allDevices.filter((d) => d.type === "Gateway").length} gateways</Pill>
        </div>
        <div className="site-sec-body" style={{ gridTemplateColumns:"1fr" }}>
          <div className="site-sec-col" style={{ padding:"4px 4px 4px" }}>
            {devicesHere.map((d) => (
              <SiteLine key={d.id}
                tone={!d.online ? "warn" : d.battery != null && d.battery < 25 ? "warn" : "ok"}
                icon={d.type === "Gateway" ? "activity" : "monitor"}
                title={<React.Fragment><span className="site-line-id">{d.id}</span> {d.room}</React.Fragment>}
                meta={d.type + " · last seen " + d.lastSeen + (d.flags.length ? " · " + d.flags.join(", ") : "")}
                right={
                  <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {d.battery != null ? (
                      <span className="battery">
                        <span className="bat-shell"><i style={{ width: d.battery + "%", background: d.battery < 25 ? "var(--warn)" : d.battery < 60 ? "var(--accent)" : "var(--ok)" }} /></span>
                        <span className="bat-cap" />
                        <span className="bat-num">{d.battery}%</span>
                      </span>
                    ) : <span className="bat-mains"><Icon name="activity" size={12} />Mains</span>}
                    <Pill tone={d.online ? "ok" : "warn"} dot>{d.online ? "Online" : "Offline"}</Pill>
                  </span>
                } />
            ))}
          </div>
        </div>
      </SiteSection>

      {/* FLOOR PLAN */}
      <SiteSection tone="accent" icon="mapPin" title="Floor plan"
        viewAll="Open full plan" onViewAll={() => go("floorplan")}>
        {planSite
          ? <SiteFloorPlan floorPlanSite={planSite} deviceById={deviceById} go={go} />
          : <div className="empty" style={{ background:"transparent" }}>
              <div className="empty-ico"><Icon name="mapPin" size={28} /></div>
              <h3>No plan loaded for this site</h3>
              <p>Upload a PDF or DWG in the plan editor and drop sensor pins onto it.</p>
              <button className="btn btn-primary" onClick={() => go("floorplan")}>
                <Icon name="layers" size={15} />Open plan editor
              </button>
            </div>
        }
      </SiteSection>
    </div>
  );
}

Object.assign(window, { SiteView, PortfolioView, SITE_INFO });

/* ════════════════════ asset_10_c5c6d183.js ════════════════════ */
;
/* HazardLink — Scheduling & Dispatch board (WorkPal-style) */

/* ============================================================
   Resources (people + contractors) and seed jobs
   ============================================================ */
const SCHED_SITES = [];
const SITE_SHORT = {};

const SCHED_RESOURCES = [];

/* Seed jobs — d is the weekday index (0=Mon … 6=Sun), week is 0=this/1=next. */
let JOB_ID = 3000;
const J = (week, resId, d, start, dur, disc, title, site, status="Scheduled") => ({
  id: "JOB-" + (++JOB_ID), week, resId, d, start, dur, disc, title, site, status,
  driveMin: resId && resId.startsWith("r") ? 12 + Math.floor(Math.random() * 26) : 28,
});
const U = (week, d, start, dur, disc, title, site) => ({
  id: "JOB-" + (++JOB_ID), week, resId:null, d, start, dur, disc, title, site,
  status:"Unassigned", driveMin:null,
});

const SEED_JOBS = [];

/* ============================================================
   Helpers
   ============================================================ */
const DOW_LONG  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DOW_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

/* Today is Sat Jun 20 2026; "this week" Mon=15..Sun=21; next = 22..28 */
const WEEK_DATES = {
  0: [15, 16, 17, 18, 19, 20, 21],
  1: [22, 23, 24, 25, 26, 27, 28],
};
const TODAY_WEEK = 0, TODAY_DOW = 5; // Saturday Jun 20

function schAddMinutesHM(hm, mins) {
  const [h, m] = hm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return hh + ":" + mm;
}
function schFmtRange(start, dur) { return start + "–" + schAddMinutesHM(start, dur); }
function schFmtDur(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return (h ? h + "h" : "") + (m ? " " + m + "m" : "");
}

/* ============================================================
   SchBlock card (a job on the grid)
   ============================================================ */
function SchBlock({ job, onClick, onDragStart, draggable, compact }) {
  const meta = discMeta[job.disc];
  const siteShort = SITE_SHORT[job.site] || job.site;
  return (
    <div
      className={"sb-block sb-block-" + job.disc + (compact ? " sb-block-compact" : "")
        + (job.status === "Complete" ? " sb-block-done" : "")}
      draggable={!!draggable}
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick(job, e); }}
    >
      <div className="sb-block-top">
        <span className="sb-block-time">{schFmtRange(job.start, job.dur)}</span>
        <Icon name={meta.icon} size={11} />
      </div>
      <div className="sb-block-title">{job.title}</div>
      <div className="sb-block-foot">
        <Icon name="mapPin" size={10} />{siteShort}
      </div>
    </div>
  );
}

/* ============================================================
   Dispatch modal
   ============================================================ */
function SchDispatchModal({ onClose, onDispatch, defaults }) {
  const [type, setType]         = React.useState(defaults?.type || "");
  const [site, setSite]         = React.useState(defaults?.site || "");
  const [resId, setResId]       = React.useState(defaults?.resId || "");
  const [day, setDay]           = React.useState(defaults?.day != null ? String(defaults.day) : "0");
  const [start, setStart]       = React.useState(defaults?.start || "09:00");
  const [duration, setDuration] = React.useState(defaults?.duration || "90");
  const [notes, setNotes]       = React.useState("");
  const [week, setWeek]         = React.useState(defaults?.week != null ? String(defaults.week) : "0");

  const JOB_TYPES = {
    clean:  ["Daily clean","Deep clean","Reactive spill","Carpet shampoo","Weekend clean"],
    maint:  ["PPM task","Reactive repair","Lighting check","Air filter swap","Pump service","Quarterly fire test","Lift inspection"],
    secure: ["Day patrol","Night patrol","Lone-worker audit","Lock-down patrol","Incident response"],
  };

  /* Infer discipline from selected resource or type */
  const inferDisc = () => {
    const r = SCHED_RESOURCES.find((x) => x.id === resId);
    if (r) return r.disc;
    for (const k of Object.keys(JOB_TYPES)) if (JOB_TYPES[k].includes(type)) return k;
    return "maint";
  };
  const disc = inferDisc();
  const allTypes = [].concat(...Object.values(JOB_TYPES));

  const canSave = type && site && start && Number(duration) > 0;

  const save = () => {
    if (!canSave) return;
    onDispatch({
      id: "JOB-" + (++JOB_ID),
      week: Number(week),
      d: Number(day),
      resId: resId || null,
      start,
      dur: Number(duration),
      disc,
      title: type,
      site,
      status: resId ? "Scheduled" : "Unassigned",
      driveMin: resId ? 14 : null,
      notes,
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal dispatch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="send" size={18} /></div>
          <div>
            <h3>Dispatch a job</h3>
            <p>Send a job out to one of your team or a contractor.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body dispatch-body">
          <div className="dispatch-grid">
            <div className="ai-field">
              <label>Job type</label>
              <select className="dv-input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Pick a job type…</option>
                <optgroup label="Cleaning">{JOB_TYPES.clean.map((t) => <option key={t}>{t}</option>)}</optgroup>
                <optgroup label="Maintenance">{JOB_TYPES.maint.map((t) => <option key={t}>{t}</option>)}</optgroup>
                <optgroup label="Security">{JOB_TYPES.secure.map((t) => <option key={t}>{t}</option>)}</optgroup>
              </select>
            </div>
            <div className="ai-field">
              <label>Site</label>
              <select className="dv-input" value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">Pick a site…</option>
                {SCHED_SITES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="ai-field dispatch-full">
              <label>Assignee</label>
              <select className="dv-input" value={resId} onChange={(e) => setResId(e.target.value)}>
                <option value="">Leave unassigned (drop into board later)</option>
                <optgroup label="Own staff">
                  {SCHED_RESOURCES.filter((r) => r.kind === "staff").map((r) => (
                    <option key={r.id} value={r.id}>{r.name} · {r.role}</option>
                  ))}
                </optgroup>
                <optgroup label="Contractors">
                  {SCHED_RESOURCES.filter((r) => r.kind === "contractor").map((r) => (
                    <option key={r.id} value={r.id}>{r.name} · {r.role}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="ai-field">
              <label>Week</label>
              <select className="dv-input" value={week} onChange={(e) => setWeek(e.target.value)}>
                <option value="0">This week</option>
                <option value="1">Next week</option>
              </select>
            </div>
            <div className="ai-field">
              <label>Day</label>
              <select className="dv-input" value={day} onChange={(e) => setDay(e.target.value)}>
                {DOW_LONG.map((d, i) => (
                  <option key={d} value={i}>{d} {WEEK_DATES[Number(week)][i]} Jun</option>
                ))}
              </select>
            </div>
            <div className="ai-field">
              <label>Start time</label>
              <input className="dv-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="ai-field">
              <label>Duration (min)</label>
              <input className="dv-input" type="number" min="15" step="15" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="ai-field dispatch-full">
              <label>Notes</label>
              <textarea className="dv-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Brief site instructions or context for the team…" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave}
            style={{ opacity: canSave ? 1 : .5 }} onClick={save}>
            <Icon name="send" size={15} />Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SchBlock detail popover
   ============================================================ */
function SchBlockPopover({ job, anchor, onClose, onReassign, onComplete }) {
  const res = SCHED_RESOURCES.find((r) => r.id === job.resId);
  const meta = discMeta[job.disc];
  const [reassignOpen, setReassignOpen] = React.useState(false);

  /* Position the popover next to its anchor inside the viewport. */
  const style = React.useMemo(() => {
    if (!anchor) return { left: 80, top: 80 };
    const margin = 8, W = 340, H = 360;
    let x = anchor.right + margin, y = anchor.top;
    if (x + W > window.innerWidth - 12)  x = anchor.left - margin - W;
    if (x < 12)                          x = Math.max(12, Math.min(anchor.left, window.innerWidth - W - 12));
    if (y + H > window.innerHeight - 12) y = Math.max(12, window.innerHeight - H - 12);
    return { left: x, top: y };
  }, [anchor]);

  return (
    <React.Fragment>
      <div className="bp-backdrop" onClick={onClose} />
      <div className="block-popover" style={style} onClick={(e) => e.stopPropagation()}>
        <div className="bp-head">
          <span className={"pill " + meta.pill}><Icon name={meta.icon} size={12} />{meta.label}</span>
          <span className="bp-id">{job.id}</span>
          <button className="icon-btn bp-close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="bp-title">{job.title}</div>

        <div className="bp-rows">
          <div className="bp-row"><span className="k">Site</span><span className="v"><Icon name="mapPin" size={12} />{job.site}</span></div>
          <div className="bp-row"><span className="k">Assignee</span>
            <span className="v">
              {res
                ? <React.Fragment><span className="bp-av">{res.initials}</span>{res.name}</React.Fragment>
                : <span className="bp-unassigned">Unassigned</span>}
            </span>
          </div>
          <div className="bp-row"><span className="k">Day &amp; time</span><span className="v">
            {DOW_LONG[job.d]} {WEEK_DATES[job.week][job.d]} Jun · {schFmtRange(job.start, job.dur)}
          </span></div>
          <div className="bp-row"><span className="k">Duration</span><span className="v">{schFmtDur(job.dur)}</span></div>
          <div className="bp-row"><span className="k">Status</span>
            <span className="v">
              <Pill tone={job.status === "Complete" ? "ok" : job.status === "Unassigned" ? "warn" : "accent"} dot>{job.status}</Pill>
            </span>
          </div>
          {job.driveMin && (
            <div className="bp-row"><span className="k">Drive time</span><span className="v">~{job.driveMin} min from previous job</span></div>
          )}
        </div>

        {reassignOpen && (
          <div className="bp-reassign">
            <label>Reassign to</label>
            <select className="dv-input" defaultValue={job.resId || ""}
              onChange={(e) => onReassign(e.target.value)}>
              <option value="">Unassigned</option>
              <optgroup label="Own staff">
                {SCHED_RESOURCES.filter((r) => r.kind === "staff").map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
              <optgroup label="Contractors">
                {SCHED_RESOURCES.filter((r) => r.kind === "contractor").map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
        )}

        <div className="bp-foot">
          <button className="btn" onClick={() => setReassignOpen((o) => !o)}>
            <Icon name="users" size={14} />Reassign
          </button>
          <button className="btn btn-primary" onClick={onComplete} disabled={job.status === "Complete"}>
            <Icon name="check" size={14} />{job.status === "Complete" ? "Completed" : "Mark complete"}
          </button>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function SchedulingView({ go }) {
  const { site: globalSite } = React.useContext(SiteContext);
  const [jobs,   setJobs]   = React.useState(SEED_JOBS);
  const [week,   setWeek]   = React.useState(0);
  const [siteF,  setSiteF]  = React.useState(globalSite ? globalSite.name : "All sites");
  const [discF,  setDiscF]  = React.useState("All");
  const [dispatchOpen, setDispatchOpen] = React.useState(false);

  /* Re-sync the local site filter when the global picker changes. */
  React.useEffect(() => {
    setSiteF(globalSite ? globalSite.name : "All sites");
  }, [globalSite && globalSite.name]);
  const [dispatchDefaults, setDispatchDefaults] = React.useState(null);
  const [popoverJob, setPopoverJob]   = React.useState(null);
  const [popoverAnchor, setPopoverAnchor] = React.useState(null);
  const [dragJobId, setDragJobId] = React.useState(null);
  const [hoverCell, setHoverCell] = React.useState(null);
  const { showToast, toastNode } = useViewToast();

  const matchesFilter = (j) => {
    if (siteF !== "All sites" && j.site !== siteF) return false;
    if (discF !== "All" && j.disc !== discF) return false;
    return true;
  };
  const inWeek = (j) => j.week === week && matchesFilter(j);
  const weekJobs = jobs.filter(inWeek);
  const unassigned = weekJobs.filter((j) => j.resId == null);

  /* Drag handlers */
  const onDragStart = (job) => (e) => {
    setDragJobId(job.id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", job.id); } catch (err) {}
  };
  const onDragEnd = () => { setDragJobId(null); setHoverCell(null); };

  const onCellDragOver = (resId, d) => (e) => {
    if (!dragJobId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverCell(resId + ":" + d);
  };
  const onCellDrop = (resId, d) => (e) => {
    e.preventDefault();
    const id = dragJobId;
    if (!id) return;
    setJobs((js) => js.map((j) => {
      if (j.id !== id) return j;
      return { ...j, resId, d, status: "Scheduled", driveMin: j.driveMin || 14 };
    }));
    const j = jobs.find((x) => x.id === id);
    const r = SCHED_RESOURCES.find((x) => x.id === resId);
    showToast(`Assigned “${j?.title || "job"}” to ${r?.name} on ${DOW_LONG[d]}`);
    setDragJobId(null);
    setHoverCell(null);
  };

  const openPopover = (job, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverJob(job.id);
    setPopoverAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  };
  const closePopover = () => { setPopoverJob(null); setPopoverAnchor(null); };

  const dispatchJob = (newJob) => {
    setJobs((js) => [...js, newJob]);
    setDispatchOpen(false);
    setDispatchDefaults(null);
    showToast("Dispatched — " + newJob.id);
  };

  const reassignJob = (jobId, resId) => {
    setJobs((js) => js.map((j) => j.id === jobId
      ? { ...j, resId: resId || null, status: resId ? "Scheduled" : "Unassigned" }
      : j));
    const r = SCHED_RESOURCES.find((x) => x.id === resId);
    showToast(resId ? `Reassigned to ${r.name}` : "Moved to Unassigned");
  };
  const markComplete = (jobId) => {
    setJobs((js) => js.map((j) => j.id === jobId ? { ...j, status: "Complete" } : j));
    showToast("Marked complete");
    closePopover();
  };

  const dates = WEEK_DATES[week];
  const popJobObj = jobs.find((j) => j.id === popoverJob);

  /* Helper to list visible resources (filter when discipline picked) */
  const visibleResources = SCHED_RESOURCES.filter((r) => discF === "All" || r.disc === discF);

  /* Count stats for header */
  const totalJobs = weekJobs.length;
  const assignedJobs = weekJobs.filter((j) => j.resId).length;
  const utilisation = visibleResources.length
    ? Math.round((weekJobs.filter((j) => j.resId).length / Math.max(1, visibleResources.length * 5)) * 100)
    : 0;

  return (
    <div className="content-inner content-inner-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Scheduling &amp; dispatch</h1>
          <p className="page-desc">One calendar for every cleaner, technician, guard and contractor. Drag from the Unassigned lane onto a person to dispatch.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setDispatchDefaults(null); setDispatchOpen(true); }}>
          <Icon name="plus" size={15} />Dispatch job
        </button>
      </div>

      {/* Toolbar */}
      <div className="sched-toolbar">
        <div className="seg">
          <button className={week === 0 ? "on" : ""} onClick={() => setWeek(0)}>This week</button>
          <button className={week === 1 ? "on" : ""} onClick={() => setWeek(1)}>Next week</button>
        </div>
        <div className="sched-week-label">
          <Icon name="calendar" size={14} />
          Mon {dates[0]} – Sun {dates[6]} Jun 2026
        </div>

        <div className="sched-filter">
          <label>Site</label>
          <select className="dv-input" value={siteF} onChange={(e) => setSiteF(e.target.value)}>
            <option>All sites</option>
            {SCHED_SITES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="sched-disc-seg">
          {[
            { id:"All",    label:"All",         tone:"muted"  },
            { id:"clean",  label:"Cleaning",    tone:"clean"  },
            { id:"maint",  label:"Maintenance", tone:"maint"  },
            { id:"secure", label:"Security",    tone:"secure" },
          ].map((d) => (
            <button key={d.id}
              className={"sched-disc-chip sched-disc-" + d.tone + (discF === d.id ? " on" : "")}
              onClick={() => setDiscF(d.id)}>
              {d.id !== "All" && <span className="sched-disc-dot" />}
              {d.label}
            </button>
          ))}
        </div>

        <div className="sched-stats">
          <div><b>{totalJobs}</b> jobs</div>
          <div className="sched-stats-sep" />
          <div><b>{assignedJobs}</b> assigned</div>
          <div className="sched-stats-sep" />
          <div><b>{unassigned.length}</b> unassigned</div>
        </div>
      </div>

      {/* Grid */}
      <div className="sched-grid-wrap">
        <div className="sched-grid">
          {/* Header row */}
          <div className="sched-corner">Team</div>
          {DOW_SHORT.map((d, i) => (
            <div key={d} className={"sched-day-head" + (week === TODAY_WEEK && i === TODAY_DOW ? " today" : "")}>
              <div className="sched-day-dow">{d}</div>
              <div className="sched-day-date">{dates[i]}</div>
            </div>
          ))}

          {/* Unassigned row */}
          <div className="sched-res sched-res-unassigned">
            <div className="sched-res-ico"><Icon name="alertCircle" size={15} /></div>
            <div>
              <div className="sched-res-nm">Unassigned</div>
              <div className="sched-res-rl">Drag onto a person</div>
            </div>
            <span className="sched-res-count">{unassigned.length}</span>
          </div>
          {DOW_SHORT.map((_, d) => {
            const cell = unassigned.filter((j) => j.d === d);
            return (
              <div key={d} className={"sched-cell sched-cell-unassigned" + (week === TODAY_WEEK && d === TODAY_DOW ? " today" : "")}>
                {cell.map((j) => (
                  <SchBlock key={j.id} job={j} draggable
                    onDragStart={onDragStart(j)}
                    onClick={openPopover} />
                ))}
                {cell.length === 0 && <div className="sched-empty">—</div>}
              </div>
            );
          })}

          {/* Resource rows */}
          {visibleResources.map((r) => (
            <React.Fragment key={r.id}>
              <div className={"sched-res sched-res-" + r.kind}>
                <div className={"sched-res-av sched-disc-" + r.disc}>{r.initials}</div>
                <div className="sched-res-body">
                  <div className="sched-res-nm">{r.name}</div>
                  <div className="sched-res-rl">{r.role}</div>
                </div>
                {r.kind === "contractor" && <span className="sched-contractor-flag">Contractor</span>}
              </div>
              {DOW_SHORT.map((_, d) => {
                const cellJobs = weekJobs
                  .filter((j) => j.resId === r.id && j.d === d)
                  .sort((a, b) => a.start.localeCompare(b.start));
                const key = r.id + ":" + d;
                const isToday = week === TODAY_WEEK && d === TODAY_DOW;
                return (
                  <div key={d}
                    className={"sched-cell"
                      + (isToday ? " today" : "")
                      + (hoverCell === key ? " hover" : "")}
                    onDragOver={onCellDragOver(r.id, d)}
                    onDragLeave={() => hoverCell === key && setHoverCell(null)}
                    onDrop={onCellDrop(r.id, d)}
                    onDragEnd={onDragEnd}
                    onClick={() => {
                      setDispatchDefaults({ resId: r.id, day: d, week, site: r.base !== "Mobile" ? r.base : "" });
                      setDispatchOpen(true);
                    }}
                  >
                    {cellJobs.map((j) => (
                      <SchBlock key={j.id} job={j} onClick={openPopover} />
                    ))}
                    {cellJobs.length === 0 && <div className="sched-empty-cell">+</div>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Discipline legend */}
      <div className="sched-legend">
        <div className="sched-legend-row"><span className="sched-legend-dot sched-disc-clean" />Cleaning</div>
        <div className="sched-legend-row"><span className="sched-legend-dot sched-disc-maint" />Maintenance</div>
        <div className="sched-legend-row"><span className="sched-legend-dot sched-disc-secure" />Security</div>
        <div className="sched-legend-row sched-legend-spacer" />
        <div className="sched-legend-row sched-legend-hint">
          <Icon name="layers" size={12} />Click an empty cell to dispatch a job on that day to that person.
        </div>
      </div>

      {dispatchOpen && (
        <SchDispatchModal
          onClose={() => { setDispatchOpen(false); setDispatchDefaults(null); }}
          onDispatch={dispatchJob}
          defaults={dispatchDefaults}
        />
      )}
      {popJobObj && (
        <SchBlockPopover job={popJobObj} anchor={popoverAnchor}
          onClose={closePopover}
          onReassign={(resId) => { reassignJob(popJobObj.id, resId); closePopover(); }}
          onComplete={() => markComplete(popJobObj.id)}
        />
      )}
      {toastNode}
    </div>
  );
}

Object.assign(window, { SchedulingView });

/* ════════════════════ asset_11_27dbf992.js ════════════════════ */
;
/* HazardLink — Cleaning view (rounds + slide-over round panel) */

const GRADE_OPTS = [
  { v:100, label:"Pass",  cls:"on-ok" },
  { v:50,  label:"Minor", cls:"on-warn" },
  { v:0,   label:"Fail",  cls:"on-crit" },
];

function ScoreRing({ score, size }) {
  size = size || 68;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  const color = score == null ? "var(--line)" : score >= 90 ? "var(--ok)" : score >= 70 ? "var(--warn)" : "var(--crit)";
  return (
    <div className="score-ring" style={{ width:size, height:size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transform:"rotate(-90deg)", transformOrigin:"50% 50%", transition:"stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="ring-val" style={{ color: score == null ? "var(--ink-3)" : color, fontSize: size < 60 ? 12 : 14 }}>
        {score == null ? "--" : score + "%"}
      </div>
    </div>
  );
}

function RoundCard({ r, onOpen }) {
  const statusMeta = {
    done:          { tone:"ok",     label:"Complete" },
    "in-progress": { tone:"accent", label:"In progress" },
    pending:       { tone:"muted",  label:"Scheduled" },
  };
  const m = statusMeta[r.status] || statusMeta.pending;
  return (
    <div className="round-card" onClick={() => onOpen(r)}>
      <div className="round-ico" style={{ background:softBg("clean"), color:solid("clean") }}>
        <Icon name="droplet" size={17} />
      </div>
      <div>
        <div className="round-name">{r.site}</div>
        <div className="round-meta">{r.type} · due {r.due}{r.cleaner ? " · " + r.cleaner : ""}</div>
      </div>
      <Pill tone={m.tone} dot>{m.label}</Pill>
      {r.status === "done"
        ? <ScoreRing score={r.score} size={52} />
        : <div style={{ width:52, textAlign:"center", color:"var(--ink-3)", fontSize:11.5 }}>
            {r.status === "in-progress" ? <Pill tone="crit"><span style={{ width:5, height:5, borderRadius:"50%", background:"currentColor", display:"inline-block", marginRight:4, animation:"blip 1.2s infinite" }} />Live</Pill> : ""}
          </div>
      }
    </div>
  );
}

/* ---------- Synthesize the round's checklist, photos and activity timeline ---------- */
function _roundDetails(r) {
  const areas = HL.inspectionAreas;
  if (r.status === "done") {
    const grades = areas.map(() => null);
    return {
      grades,
      photoSlots: [],
      timeline: [],
    };
  }
  if (r.status === "in-progress") {
    const grades = areas.map(() => null);
    return {
      grades,
      photoSlots: [],
      timeline: [],
    };
  }
  return {
    grades: areas.map(() => null),
    photoSlots: [],
    timeline: [],
  };
}

const _GRADE_LABEL = { pass:"Pass", minor:"Minor", fail:"Fail" };
const _GRADE_TONE  = { pass:"ok", minor:"warn", fail:"crit" };

function RoundPanel({ round, onClose, onStartInspection }) {
  const r = round;
  const d = _roundDetails(r);
  const areas = HL.inspectionAreas;
  const ratedN = d.grades.filter(Boolean).length;
  const tone = r.status === "done" ? "ok" : r.status === "in-progress" ? "accent" : "muted";
  const label = r.status === "done" ? "Complete" : r.status === "in-progress" ? "In progress" : "Scheduled";

  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel round-panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg("clean"), color:solid("clean"), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name="droplet" size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{r.type}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{r.site} · scheduled {r.due}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div className="rp-score-row">
            <div className="rp-score">
              {r.status === "done" ? <ScoreRing score={r.score} size={76} />
               : r.status === "in-progress"
                 ? <div className="rp-score-bubble" style={{ background:"var(--accent-soft)", color:"var(--accent)" }}>
                     <Icon name="droplet" size={26} />
                   </div>
                 : <div className="rp-score-bubble" style={{ background:"var(--surface-3)", color:"var(--ink-3)" }}>
                     <Icon name="clock" size={26} />
                   </div>
              }
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="rp-pills">
                <Pill tone={tone} dot>{label}</Pill>
                {r.status === "in-progress" && <Pill tone="crit"><span className="blip" />Live</Pill>}
                {r.status === "done" && r.score >= 90 && <Pill tone="ok">Passed</Pill>}
                {r.status === "done" && r.score < 90 && r.score >= 70 && <Pill tone="warn">Minor issues</Pill>}
              </div>
              <div className="rp-summary">
                {r.status === "done"  && `${ratedN} of ${areas.length} areas inspected and signed off.`}
                {r.status === "in-progress" && `Cleaner on site — ${ratedN} of ${areas.length} areas done so far.`}
                {r.status === "pending" && `Scheduled to start at ${r.due}. Cleaner is on the rota.`}
              </div>
            </div>
          </div>

          <div className="info-row"><span className="k">Site</span><span className="v">{r.site}</span></div>
          <div className="info-row"><span className="k">Cleaner</span>
            <span className="v" style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span className="wo-mini-av">{r.initials}</span>{r.cleaner}
            </span>
          </div>
          <div className="info-row"><span className="k">Scheduled</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{r.due}</span></div>
          {r.done && <div className="info-row"><span className="k">Completed</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{r.done}</span></div>}
          <div className="info-row" style={{ borderBottom:"none" }}><span className="k">Type</span><span className="v">{r.type}</span></div>

          <div className="panel-label" style={{ marginTop:18 }}>Scored checklist</div>
          <div className="rp-check">
            {areas.map((a, i) => {
              const g = d.grades[i];
              return (
                <div className="rp-check-row" key={a.id}>
                  <div className="rp-check-tile">
                    <div className="rp-check-name">{a.name}</div>
                    <div className="rp-check-note">{a.note}</div>
                  </div>
                  {g ? <Pill tone={_GRADE_TONE[g]} dot>{_GRADE_LABEL[g]}</Pill>
                     : <span className="rp-pending">Pending</span>}
                </div>
              );
            })}
          </div>

          {d.photoSlots.length > 0 && (
            <React.Fragment>
              <div className="panel-label" style={{ marginTop:18 }}>Photos</div>
              <div className="proof-grid rp-photos">
                {d.photoSlots.map((p, i) => (
                  <div className={"proof" + (p.taken ? " taken" : " pending")} key={i}>
                    <span className="pcam">
                      <Icon name={p.taken ? "camera" : "plus"} size={15} />
                    </span>
                    <span className="plabel">{p.taken ? p.l : "Pending"}</span>
                  </div>
                ))}
              </div>
            </React.Fragment>
          )}

          <div className="panel-label" style={{ marginTop:18 }}>Activity</div>
          <div className="stepper">
            {d.timeline.map((s, i) => <Step s={s} key={i} />)}
          </div>

          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            {r.status === "done" && (
              <React.Fragment>
                <button className="btn" style={{ flex:1 }} onClick={onClose}>
                  <Icon name="file" size={15} />View PDF report
                </button>
                <button className="btn btn-primary" style={{ flex:1 }} onClick={onClose}>
                  <Icon name="send" size={15} />Share with client
                </button>
              </React.Fragment>
            )}
            {r.status === "in-progress" && (
              <button className="btn btn-primary" style={{ width:"100%" }} onClick={() => onStartInspection(r)}>
                <Icon name="arrowRight" size={15} />Continue inspection
              </button>
            )}
            {r.status === "pending" && (
              <button className="btn btn-primary" style={{ width:"100%" }} onClick={() => onStartInspection(r)}>
                <Icon name="check" size={15} />Start inspection
              </button>
            )}
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

function InspectionView({ round, onBack, onSubmit }) {
  const areas = HL.inspectionAreas;
  const [grades, setGrades]     = React.useState({});
  const [photos, setPhotos]     = React.useState({});
  const [submitted, setSubmitted] = React.useState(false);

  const rated = Object.keys(grades).length;
  const score = rated === 0 ? null : Math.round(
    Object.values(grades).reduce((s, v) => s + v, 0) / rated
  );

  const setGrade    = (id, v) => setGrades((g) => ({ ...g, [id]: v }));
  const togglePhoto = (id)    => setPhotos((p) => ({ ...p, [id]: !p[id] }));

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => onSubmit(score || 0), 1600);
  };

  if (submitted) {
    return (
      <div className="content-inner">
        <div style={{ maxWidth:560, margin:"60px auto", textAlign:"center" }}>
          <div style={{ width:72, height:72, borderRadius:"50%", background:"var(--ok-soft)", color:"var(--ok)", display:"grid", placeItems:"center", margin:"0 auto 20px" }}>
            <Icon name="checkCircle" size={32} />
          </div>
          <h1 style={{ marginBottom:8 }}>Inspection submitted</h1>
          <p style={{ color:"var(--ink-2)", fontSize:15, marginBottom:24 }}>Score: {score}% · PDF report generating</p>
          <button className="btn btn-primary" onClick={onBack}><Icon name="arrowLeft" size={15} />Back to rounds</button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to rounds
      </button>

      <div style={{ display:"flex", alignItems:"flex-start", gap:18, marginBottom:22, flexWrap:"wrap" }}>
        <div style={{ flex:1 }}>
          <h1 className="page-title" style={{ marginBottom:4 }}>{round.type}</h1>
          <p className="page-desc" style={{ margin:0 }}>{round.site} · {round.cleaner} · Started {round.due}</p>
        </div>
        <div className="insp-score-badge">
          <div className="score-n" style={{ color: score == null ? "var(--ink-3)" : score >= 90 ? "var(--ok)" : score >= 70 ? "var(--warn)" : "var(--crit)" }}>
            {score == null ? "--" : score + "%"}
          </div>
          <div className="score-l">{rated}/{areas.length} rated</div>
        </div>
      </div>

      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:"1fr 168px 60px", fontSize:11 }}>
          <div>Area</div>
          <div style={{ textAlign:"center" }}>Grade</div>
          <div style={{ textAlign:"center" }}>Photo</div>
        </div>
        {areas.map((area) => {
          const g = grades[area.id];
          return (
            <div className="check-row" key={area.id}>
              <div>
                <div className="check-area">{area.name}</div>
                <div className="check-note">{area.note}</div>
              </div>
              <div className="grade-sel">
                {GRADE_OPTS.map((opt) => (
                  <button key={opt.label}
                    className={"grade-btn" + (g === opt.v ? " " + opt.cls : "")}
                    onClick={() => setGrade(area.id, opt.v)}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className={"photo-slot" + (photos[area.id] ? " filled" : "")}
                onClick={() => togglePhoto(area.id)} title="Mark photo taken">
                <Icon name={photos[area.id] ? "camera" : "plus"} size={17} />
              </div>
            </div>
          );
        })}

        <div style={{ padding:"16px 18px", borderTop:"1px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div style={{ fontSize:13, color:"var(--ink-3)" }}>
            {rated < areas.length ? `Rate at least ${areas.length - rated} more area${areas.length - rated !== 1 ? "s" : ""} to submit` : "All areas rated — ready to submit"}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn" onClick={onBack}>Save draft</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={rated < 3} style={{ opacity: rated < 3 ? .5 : 1 }}>
              <Icon name="send" size={15} />Submit inspection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CleaningView({ go }) {
  const D = useSiteData();
  const { site } = React.useContext(SiteContext);
  const [openRound, setOpenRound]     = React.useState(null);   // round shown in slide-over
  const [inspectRound, setInspectRound] = React.useState(null); // round being inspected
  const [scoreOverrides, setScoreOverrides] = React.useState({});
  const [filter, setFilter]           = React.useState("All");
  const [reactiveOpen, setReactiveOpen] = React.useState(false);

  const rounds = D.rounds.map((r) =>
    scoreOverrides[r.id] != null
      ? { ...r, status:"done", score:scoreOverrides[r.id] }
      : r
  );

  const tabs = ["All", "Done", "In progress", "Scheduled"];
  const filtered = rounds.filter((r) => {
    if (filter === "All")           return true;
    if (filter === "Done")          return r.status === "done";
    if (filter === "In progress")   return r.status === "in-progress";
    if (filter === "Scheduled")     return r.status === "pending";
    return true;
  });

  const handleSubmit = (score) => {
    setScoreOverrides((o) => ({ ...o, [inspectRound.id]: score }));
    setInspectRound(null);
  };

  if (inspectRound) {
    return <InspectionView round={inspectRound} onBack={() => setInspectRound(null)} onSubmit={handleSubmit} />;
  }

  const done       = rounds.filter((r) => r.status === "done").length;
  const total      = rounds.length;
  const scored     = rounds.filter((r) => r.score);
  const avgScore   = scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : 0;
  const liveSpills = D.spillAlerts.filter((a) => a.state === "new").length;

  return (
    <div className="content-inner">
      {openRound && (
        <RoundPanel round={openRound}
          onClose={() => setOpenRound(null)}
          onStartInspection={(r) => { setOpenRound(null); setInspectRound(r); }} />
      )}
      {reactiveOpen && (
        <SimpleAddModal
          title="Log reactive round"
          subtitle="Send a cleaner to a hazard that didn't come from the rota."
          icon="droplet"
          submitLabel="Dispatch cleaner" submitIcon="send"
          successTitle="Cleaner dispatched"
          successCopy="The reactive round is on the live feed and will appear In progress below."
          fields={[
            { id:"site",    label:"Site",      type:"select", options:HL.sites.map((s) => s.name) },
            { id:"area",    label:"Area",      placeholder:"e.g. Aisle 4 produce" },
            { id:"reason",  label:"What's the hazard?", type:"textarea", rows:3, placeholder:"e.g. Spilled milk after stock-out" },
            { id:"cleaner", label:"Send",      type:"select", options:["Nearest cleaner on site"] },
          ]}
          onClose={() => setReactiveOpen(false)} />
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">Cleaning</h1>
          <p className="page-desc">Today's rounds and inspections. Every area graded, photo-proven and scored.{site ? " Filtered to " + site.name + "." : ""}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setReactiveOpen(true)}>
          <Icon name="plus" size={15} />Log reactive round
        </button>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <button className={"kpi kpi-clickable" + (filter === "All" ? " on" : "")} onClick={() => setFilter("All")}>
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("clean"), color:solid("clean") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">Rounds today</span></div>
          <div className="kpi-val">{done}<small>/{total}</small></div>
          <div className="kpi-foot">Show every round</div>
        </button>
        <button className={"kpi kpi-clickable" + (filter === "Done" ? " on" : "")} onClick={() => setFilter("Done")}>
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("clean"), color:solid("clean") }}><Icon name="activity" size={16} /></div><span className="kpi-label">Avg. inspection score</span></div>
          <div className="kpi-val">{avgScore}<small>%</small></div>
          <div className="kpi-foot">Show {scored.length} completed round{scored.length !== 1 ? "s" : ""}</div>
        </button>
        <button className={"kpi kpi-clickable" + (filter === "In progress" ? " on" : "")} onClick={() => setFilter("In progress")}>
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Active spills</span></div>
          <div className="kpi-val" style={{ color: liveSpills ? "var(--crit)" : "var(--ok)" }}>{liveSpills}</div>
          <div className="kpi-foot">Show in-progress rounds</div>
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Today's rounds</h3>
          <div className="head-act">
            <div className="seg">
              {tabs.map((t) => (
                <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
              ))}
            </div>
          </div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding:"30px", textAlign:"center", color:"var(--ink-3)", fontSize:13.5 }}>No rounds match this filter.</div>
        )}
        {filtered.map((r) => (
          <RoundCard r={r} key={r.id} onOpen={(r) => setOpenRound(r)} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CleaningView });

/* ════════════════════ asset_18_63efd111.js ════════════════════ */
;
/* HazardLink — Spill alerts view (live spills + escalation timers) */

function formatMMSS(seconds) {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ":" + s.toString().padStart(2, "0");
}

function SpillPipeline({ a, escalated }) {
  // Lifecycle: Lifted → Alert raised → Acknowledged/Escalated → Sign back on rack
  const liftedAt = a.raisedAt;
  const alertAt  = a.raisedAt;
  const ackedAt  = a.ackAt || null;
  const resolvedAt = a.resolvedAt || null;
  const isNew    = a.state === "new";
  const isAck    = a.state === "acknowledged";
  const isResolved = a.state === "resolved";

  const step3 = isResolved
    ? { tone:"done",   icon:"check",        label:"Cleaner attended",    t: ackedAt || "—" }
    : isAck
    ? { tone:"done",   icon:"check",        label:"Cleaner attending",   t: ackedAt }
    : escalated
    ? { tone:"active", icon:"flag",          label:"Escalated to manager", t:"now" }
    : { tone:"active", icon:"clock",         label:"Awaiting cleaner",     t:"running" };
  const step4 = isResolved
    ? { tone:"done",   icon:"checkCircle",  label:"Sign back on rack",    t: resolvedAt }
    : { tone:"pending", icon:"checkCircle", label:"Sign back on rack",    t:"—" };

  const steps = [
    { tone:"done",   icon:"alertTri",     label:"Sign lifted from rack", t: liftedAt },
    { tone:"done",   icon:"bell",          label:"Alert raised",          t: alertAt  },
    step3,
    step4,
  ];

  return (
    <div className="sp-pipe">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className={"sp-pipe-step sp-pipe-" + s.tone}>
            <div className="sp-pipe-dot"><Icon name={s.icon} size={10} /></div>
            <div className="sp-pipe-l">{s.label}</div>
            <div className="sp-pipe-t">{s.t}</div>
          </div>
          {i < steps.length - 1 && <div className={"sp-pipe-line sp-pipe-" + (steps[i+1].tone === "pending" ? "pending" : "done")} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function SpillCard({ a, onAck, onResolve }) {
  const [, force] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    if (a.state !== "new") return;
    const t = setInterval(force, 1000);
    return () => clearInterval(t);
  }, [a.state]);

  const remainingMs = a.state === "new" ? Math.max(0, a.escalateAt - Date.now()) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const totalMs = (a.escalateTotal || 300) * 1000;
  const pct = a.state === "new" ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const escalated = a.state === "new" && remainingMs <= 0;

  const sevMeta = {
    high:   { tone:"crit", label:"High severity" },
    medium: { tone:"warn", label:"Medium severity" },
    low:    { tone:"muted", label:"Low severity" },
  };
  const stateMeta = {
    new:           { tone:"crit", label:"Live", live:true },
    acknowledged:  { tone:"warn", label:"Acknowledged" },
    resolved:      { tone:"ok",   label:"Resolved" },
  };
  const sev = sevMeta[a.severity] || sevMeta.medium;
  const m   = stateMeta[a.state];

  const timerTone = escalated ? "var(--crit)" : pct < 25 ? "var(--crit)" : pct < 50 ? "var(--warn)" : "var(--accent)";

  return (
    <div className={"spill-card spill-" + a.state + (escalated ? " escalated" : "")}>
      <div className="sc-rail" style={{ background: m.tone === "crit" ? "var(--crit)" : m.tone === "warn" ? "var(--warn)" : "var(--ok)" }} />
      <div className="sc-main">
        <div className="sc-top">
          <span className="sc-id">{a.id}</span>
          <Pill tone={m.tone} dot>
            {m.live && <span className="blip-dot" />}
            {m.label}
          </Pill>
          <Pill tone={sev.tone}>{sev.label}</Pill>
          <span className="sc-raised">Raised {a.raisedAt}</span>
        </div>

        <div className="sc-title">{a.location}</div>
        <div className="sc-site">
          <Icon name="mapPin" size={12} />{a.site}
          <span className="sc-sep" />
          <span className="sc-hanger">Hanger {a.hanger}</span>
        </div>
        <div className="sc-lifted">
          <Icon name="alertTri" size={12} />
          Sign <b>{a.hanger}</b> lifted from rack at <b>{a.raisedAt}</b>
        </div>
        <p className="sc-note">{a.note}</p>

        <SpillPipeline a={a} escalated={escalated} />

        {a.state === "new" && (
          <div className="esc-block">
            <div className="esc-row">
              <Icon name="clock" size={14} />
              {escalated ? (
                <span style={{ color:"var(--crit)", fontWeight:700 }}>
                  Escalated to site manager — awaiting response
                </span>
              ) : (
                <span>
                  Escalates to site manager in <b style={{ fontFamily:"var(--mono)", color:timerTone }}>{formatMMSS(remainingSec)}</b>
                </span>
              )}
            </div>
            <div className="esc-bar"><i style={{ width: pct + "%", background: timerTone }} /></div>
          </div>
        )}

        {a.state === "acknowledged" && (
          <div className="sc-status-line ack">
            <Icon name="check" size={14} />Acknowledged by {a.ackBy} at {a.ackAt}
          </div>
        )}

        {a.state === "resolved" && (
          <div className="sc-status-line ok">
            <Icon name="checkCircle" size={14} />Resolved by {a.resolvedBy} at {a.resolvedAt}
          </div>
        )}

        {a.state !== "resolved" && (
          <div className="sc-actions">
            {a.state === "new" && (
              <button className="btn" onClick={() => onAck(a.id)}>
                <Icon name="check" size={15} />Acknowledge
              </button>
            )}
            <button className="btn btn-primary" onClick={() => onResolve(a.id)}>
              <Icon name="checkCircle" size={15} />Resolve
            </button>
            <button className="btn btn-ghost" style={{ marginLeft:"auto" }}>
              <Icon name="mapPin" size={14} />View on floor plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SpillsView() {
  const D = useSiteData();
  const { site } = React.useContext(SiteContext);
  const [alerts, setAlerts] = React.useState(() =>
    HL.spillAlerts.map((a) =>
      a.state === "new"
        ? { ...a, escalateAt: Date.now() + (a.escalateInSec || 300) * 1000 }
        : a
    )
  );
  const [filter, setFilter] = React.useState("Live");
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const visibleIds = new Set(D.spillAlerts.map((a) => a.id));
  const scoped = alerts.filter((a) => visibleIds.has(a.id));

  const ack = (id) => setAlerts((as) => as.map((a) =>
    a.id === id ? { ...a, state:"acknowledged", ackBy:"You (Site lead)", ackAt:"just now" } : a
  ));
  const resolve = (id) => setAlerts((as) => as.map((a) =>
    a.id === id ? { ...a, state:"resolved", resolvedBy:"You (Site lead)", resolvedAt:"just now" } : a
  ));

  const counts = {
    live:    scoped.filter((a) => a.state === "new").length,
    ack:     scoped.filter((a) => a.state === "acknowledged").length,
    res:     scoped.filter((a) => a.state === "resolved").length,
  };
  const tabs = [
    { id:"Live",         label:"Live",          n:counts.live },
    { id:"Acknowledged", label:"Acknowledged",  n:counts.ack },
    { id:"Resolved",     label:"Resolved today", n:counts.res },
    { id:"All",          label:"All" },
  ];

  const shown = scoped.filter((a) => {
    if (filter === "Live")         return a.state === "new";
    if (filter === "Acknowledged") return a.state === "acknowledged";
    if (filter === "Resolved")     return a.state === "resolved";
    return true;
  });

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Spill alerts</h1>
          <p className="page-desc">A spill happens, the cleaner lifts the yellow sign onto the floor, the hanger sensor detects the lift and HazardLink raises this alert. Acknowledge to stop the escalation; resolve once the sign is back on its rack.{site ? " Filtered to " + site.name + "." : ""}</p>
        </div>
        <button className="btn" onClick={() => setRulesOpen(true)}><Icon name="bell" size={15} />Escalation rules</button>
      </div>

      {rulesOpen && (
        <SimpleAddModal
          title="Escalation rules"
          subtitle="Choose when an unacknowledged spill escalates to the site manager"
          icon="bell"
          submitLabel="Save rules" submitIcon="check"
          successTitle="Rules saved"
          successCopy="Escalation rules updated for every site. Live spills will follow the new thresholds."
          fields={[
            { id:"high",   label:"High severity — escalate after",    type:"select", default:"3 minutes",  options:["1 minute","3 minutes","5 minutes","10 minutes"] },
            { id:"med",    label:"Medium severity — escalate after",  type:"select", default:"5 minutes",  options:["3 minutes","5 minutes","10 minutes","15 minutes"] },
            { id:"low",    label:"Low severity — escalate after",     type:"select", default:"10 minutes", options:["5 minutes","10 minutes","30 minutes","1 hour"] },
            { id:"target", label:"Escalate to", default:"site.manager@hazardlink.ie", placeholder:"site.manager@hazardlink.ie" },
          ]}
          onClose={() => setRulesOpen(false)} />
      )}

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div>
            <span className="kpi-label">Live spills</span>
          </div>
          <div className="kpi-val">{counts.live}</div>
          <div className="kpi-foot">across {new Set(scoped.filter((a) => a.state === "new").map((a) => a.site)).size} sites</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="check" size={16} /></div>
            <span className="kpi-label">Acknowledged, awaiting clear</span>
          </div>
          <div className="kpi-val">{counts.ack}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div>
            <span className="kpi-label">Resolved today</span>
          </div>
          <div className="kpi-val">{counts.res}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t.id} className={filter === t.id ? "on" : ""} onClick={() => setFilter(t.id)}>
              {t.label}{t.n != null && <span className="seg-count">{t.n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="spill-list">
        {shown.length === 0 && (
          <div className="empty" style={{ background:"var(--surface)", border:"1px solid var(--line)", borderRadius:"var(--radius)" }}>
            <div className="empty-ico"><Icon name="checkCircle" size={28} /></div>
            <h3>No spills in this view</h3>
            <p>Nothing to do here. The smart signs will let you know.</p>
          </div>
        )}
        {shown.map((a) => (
          <SpillCard key={a.id} a={a} onAck={ack} onResolve={resolve} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SpillsView });

/* ════════════════════ asset_32_782c3e61.js ════════════════════ */
;
/* HazardLink — Architectural floor-plan illustrations.
   Each component is meant to fit a 1000×600 viewBox set by the parent <svg>.
   These look like CAD-export drawings, not the plain box schematic. */

function ArchDefs() {
  /* Shared pattern defs: dropped once into the SVG. */
  return (
    <defs>
      <pattern id="arch-hatch-concrete" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="14" height="14" fill="#ece4cf" />
        <line x1="0" y1="0" x2="0" y2="14" stroke="#bfb392" strokeWidth="0.6" />
      </pattern>
      <pattern id="arch-hatch-tile" width="22" height="22" patternUnits="userSpaceOnUse">
        <rect width="22" height="22" fill="#f1eada" />
        <path d="M0 0 L22 0 M0 22 L22 22 M0 0 L0 22 M22 0 L22 22" stroke="#d6c89c" strokeWidth="0.4" />
      </pattern>
      <pattern id="arch-hatch-store" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="10" height="10" fill="#ebe0bf" />
        <line x1="0" y1="0" x2="0" y2="10" stroke="#c8b787" strokeWidth="0.5" />
      </pattern>
      <pattern id="arch-hatch-grass" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#e1ddc7" />
        <circle cx="2" cy="2" r=".7" fill="#b6ad8b" />
        <circle cx="5" cy="4.5" r=".7" fill="#b6ad8b" />
      </pattern>
    </defs>
  );
}

function ArchScaleBar({ x = 30, y = 560 }) {
  return (
    <g className="arch-scale" transform={`translate(${x},${y})`}>
      <line x1="0" y1="0" x2="120" y2="0" stroke="#3a3527" strokeWidth="1.2" />
      <line x1="0" y1="-4" x2="0" y2="4" stroke="#3a3527" strokeWidth="1.2" />
      <line x1="40" y1="-4" x2="40" y2="4" stroke="#3a3527" strokeWidth="1.2" />
      <line x1="80" y1="-4" x2="80" y2="4" stroke="#3a3527" strokeWidth="1.2" />
      <line x1="120" y1="-4" x2="120" y2="4" stroke="#3a3527" strokeWidth="1.2" />
      <text x="60" y="16" textAnchor="middle" className="arch-label-tiny">0   5   10m   SCALE 1:200</text>
    </g>
  );
}

function ArchNorthArrow({ x = 940, y = 540 }) {
  return (
    <g className="arch-north" transform={`translate(${x},${y})`}>
      <circle r="20" fill="#fbf7ec" stroke="#3a3527" strokeWidth="1.2" />
      <path d="M0 -14 L6 8 L0 4 L-6 8 Z" fill="#3a3527" />
      <text x="0" y="-22" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 9 }}>N</text>
    </g>
  );
}

/* Reusable door-swing: opens from (cx,cy) with radius r in a quadrant. */
function ArchDoor({ cx, cy, r, dir = "se", thick = false }) {
  const sweep = {
    se: { x1: cx + r, y1: cy, x2: cx, y2: cy + r, large: 0 },
    sw: { x1: cx - r, y1: cy, x2: cx, y2: cy + r, large: 0 },
    ne: { x1: cx + r, y1: cy, x2: cx, y2: cy - r, large: 0 },
    nw: { x1: cx - r, y1: cy, x2: cx, y2: cy - r, large: 0 },
  }[dir];
  return (
    <g className="arch-door">
      <line x1={cx} y1={cy} x2={sweep.x1} y2={sweep.y1} stroke="#3a3527" strokeWidth={thick ? 1.2 : 0.8} />
      <path d={`M ${sweep.x1} ${sweep.y1} A ${r} ${r} 0 0 1 ${sweep.x2} ${sweep.y2}`}
        fill="none" stroke="#7a7150" strokeWidth="0.7" strokeDasharray="3 2" />
    </g>
  );
}

/* ============================================================
   Riverside Retail Park — ground-floor retail
   ============================================================ */
function ArchRiversidePlan() {
  const aisles = [
    { y: 86,  label1: "AISLE 1",  label2: "PRODUCE" },
    { y: 168, label1: "AISLE 2",  label2: "BAKERY" },
    { y: 250, label1: "AISLE 3",  label2: "CHILLED" },
    { y: 332, label1: "AISLE 4",  label2: "GROCERY" },
    { y: 414, label1: "AISLE 5",  label2: "HOUSEHOLD" },
  ];
  return (
    <g className="arch-plan">
      <rect x="0" y="0" width="1000" height="600" fill="#fbf7ec" />
      {/* Pavement strip around lobby */}
      <rect x="440" y="555" width="280" height="45" fill="url(#arch-hatch-tile)" opacity=".7" />

      {/* Outer wall */}
      <rect x="20" y="22" width="960" height="556" className="arch-outer" />

      {/* Stockroom partition */}
      <line x1="790" y1="22" x2="790" y2="240" className="arch-wall" />
      <line x1="790" y1="290" x2="790" y2="578" className="arch-wall" />
      <ArchDoor cx={790} cy={290} r={40} dir="sw" thick />

      {/* Stockroom inner */}
      <rect x="800" y="32" width="170" height="536" fill="url(#arch-hatch-store)" opacity=".55" />
      <text x="885" y="56" textAnchor="middle" className="arch-label-room">STOCKROOM</text>
      {/* Pallet racks */}
      {[80, 152, 224, 296, 368, 440].map((y, i) => (
        <g key={i}>
          <rect x="812" y={y} width="146" height="36" fill="#cdbf91" stroke="#7a7150" strokeWidth="0.6" />
          {[0,1,2,3,4].map((j) => (
            <line key={j} x1={812 + j * 30} y1={y} x2={812 + j * 30} y2={y + 36} stroke="#7a7150" strokeWidth="0.4" />
          ))}
        </g>
      ))}
      <text x="885" y="540" textAnchor="middle" className="arch-label-tiny">PALLET RACKING</text>

      {/* WC block top right of retail floor */}
      <rect x="690" y="32" width="92" height="110" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <line x1="690" y1="92" x2="782" y2="92" stroke="#3a3527" strokeWidth="0.8" />
      <text x="736" y="80" textAnchor="middle" className="arch-label-room" style={{ fontSize: 11 }}>WCs</text>
      <ArchDoor cx={690} cy={70} r={18} dir="sw" />
      {/* WC fixtures */}
      <circle cx="708" cy="62" r="4" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <circle cx="720" cy="62" r="4" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <rect x="700" y="100" width="14" height="24" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <rect x="722" y="100" width="14" height="24" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />

      {/* Aisles + shelving */}
      {aisles.map((a, i) => (
        <g key={i}>
          <text x="40" y={a.y - 14} className="arch-label-room">{a.label1}</text>
          <text x="116" y={a.y - 14} className="arch-label-tag">— {a.label2}</text>
          {[0,1,2,3,4].map((j) => (
            <g key={j}>
              <rect x={40 + j * 130} y={a.y} width="115" height="34" fill="#ebe0bf" stroke="#7a7150" strokeWidth="0.6" />
              {[0,1,2,3,4,5].map((k) => (
                <line key={k} x1={40 + j * 130 + k * 19} y1={a.y} x2={40 + j * 130 + k * 19} y2={a.y + 34} stroke="#7a7150" strokeWidth="0.35" />
              ))}
            </g>
          ))}
        </g>
      ))}

      {/* Checkouts */}
      <text x="40" y="488" className="arch-label-room">CHECKOUTS</text>
      {[40, 132, 224, 316].map((x, i) => (
        <g key={i}>
          <rect x={x} y="500" width="84" height="44" fill="#e3d6a8" stroke="#7a7150" strokeWidth=".7" />
          <text x={x + 42} y="528" textAnchor="middle" className="arch-label-tiny">{`TILL ${i+1}`}</text>
        </g>
      ))}

      {/* Entrance lobby */}
      <text x="450" y="488" className="arch-label-room">ENTRANCE LOBBY</text>
      <rect x="450" y="500" width="280" height="44" fill="url(#arch-hatch-tile)" opacity=".55" stroke="#7a7150" strokeWidth=".6" />

      {/* Entrance doors at bottom */}
      <g>
        <line x1="500" y1="578" x2="540" y2="578" stroke="#3a3527" strokeWidth="2.4" />
        <line x1="560" y1="578" x2="600" y2="578" stroke="#3a3527" strokeWidth="2.4" />
        <path d="M 540 578 A 30 30 0 0 0 540 548" fill="none" stroke="#7a7150" strokeWidth=".7" strokeDasharray="3 2" />
        <path d="M 560 578 A 30 30 0 0 1 560 548" fill="none" stroke="#7a7150" strokeWidth=".7" strokeDasharray="3 2" />
      </g>

      {/* Dimension marks */}
      <g className="arch-dim">
        <line x1="20" y1="595" x2="980" y2="595" stroke="#7a7150" strokeWidth=".5" />
        <line x1="20" y1="592" x2="20" y2="598" stroke="#7a7150" strokeWidth=".5" />
        <line x1="980" y1="592" x2="980" y2="598" stroke="#7a7150" strokeWidth=".5" />
        <text x="500" y="588" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>48.00 m</text>
      </g>

      <ArchScaleBar x="80" y="565" />
      <ArchNorthArrow x="935" y="555" />

      {/* Title block */}
      <g transform="translate(640, 555)" className="arch-title">
        <rect x="0" y="0" width="280" height="22" fill="#fbf7ec" stroke="#3a3527" strokeWidth=".7" />
        <text x="8" y="15" className="arch-label-tag" style={{ fontWeight: 800 }}>RIVERSIDE RETAIL PARK · GROUND FLOOR · GA01</text>
      </g>
    </g>
  );
}

/* ============================================================
   Northgate Logistics Hub — warehouse
   ============================================================ */
function ArchNorthgatePlan() {
  return (
    <g className="arch-plan">
      <rect x="0" y="0" width="1000" height="600" fill="#fbf7ec" />
      {/* External yard */}
      <rect x="0" y="0" width="1000" height="20" fill="url(#arch-hatch-grass)" opacity=".5" />
      <rect x="0" y="0" width="20"   height="600" fill="url(#arch-hatch-grass)" opacity=".5" />

      <rect x="20" y="22" width="960" height="556" className="arch-outer" />

      {/* Cold store top right */}
      <rect x="600" y="32" width="370" height="200" fill="#dde9ee" stroke="#3a3527" strokeWidth="1.2" />
      <text x="785" y="58" textAnchor="middle" className="arch-label-room">COLD STORE</text>
      <text x="785" y="74" textAnchor="middle" className="arch-label-tiny">-4°C  CHILLED</text>
      {/* Cold store inner partition */}
      <line x1="780" y1="32" x2="780" y2="232" stroke="#7a7150" strokeWidth=".7" strokeDasharray="4 3" />
      <text x="690" y="180" textAnchor="middle" className="arch-label-tiny">FREEZER</text>
      <text x="880" y="180" textAnchor="middle" className="arch-label-tiny">CHILLED</text>

      {/* Loading bays left */}
      {[
        { y: 32,  label: "LOADING BAY 1" },
        { y: 162, label: "LOADING BAY 2" },
        { y: 292, label: "LOADING BAY 3" },
      ].map((b, i) => (
        <g key={i}>
          <rect x="32" y={b.y} width="528" height="120" fill="url(#arch-hatch-concrete)" opacity=".5" stroke="#3a3527" strokeWidth=".9" />
          <text x="60" y={b.y + 24} className="arch-label-room">{b.label}</text>
          {/* Roller-shutter doors at the left edge */}
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <line x1="20" y1={b.y + 28 + k * 30} x2="32" y2={b.y + 28 + k * 30} stroke="#3a3527" strokeWidth="2.2" />
              <line x1="20" y1={b.y + 36 + k * 30} x2="32" y2={b.y + 36 + k * 30} stroke="#7a7150" strokeWidth=".5" />
            </g>
          ))}
          {/* Forklift turn radius marks */}
          <circle cx={300} cy={b.y + 60} r="38" fill="none" stroke="#7a7150" strokeWidth=".5" strokeDasharray="3 3" />
        </g>
      ))}

      {/* Warehouse racking aisle */}
      <rect x="32" y="430" width="568" height="138" fill="url(#arch-hatch-store)" opacity=".4" stroke="#3a3527" strokeWidth=".9" />
      <text x="60" y="450" className="arch-label-room">RACKING — RACKS A–F</text>
      {[450, 478, 506, 534].map((y, i) => (
        <g key={i}>
          <rect x="40" y={y} width="560" height="14" fill="#cdbf91" stroke="#7a7150" strokeWidth=".5" />
          {[0,1,2,3,4,5,6,7,8].map((k) => (
            <line key={k} x1={40 + k * 70} y1={y} x2={40 + k * 70} y2={y + 14} stroke="#7a7150" strokeWidth=".4" />
          ))}
        </g>
      ))}

      {/* Site office */}
      <rect x="610" y="252" width="180" height="130" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="700" y="280" textAnchor="middle" className="arch-label-room">SITE OFFICE</text>
      <ArchDoor cx={680} cy={252} r={20} dir="se" />
      <rect x="624" y="296" width="60" height="20" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <rect x="624" y="324" width="60" height="20" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <rect x="708" y="296" width="76" height="50" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <text x="746" y="320" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>DESKS</text>

      {/* Staff room */}
      <rect x="800" y="252" width="170" height="130" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="885" y="280" textAnchor="middle" className="arch-label-room">STAFF ROOM</text>
      <ArchDoor cx={830} cy={252} r={20} dir="se" />
      <rect x="812" y="295" width="146" height="22" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <text x="885" y="310" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>CANTEEN</text>
      <circle cx="830" cy="345" r="10" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <circle cx="870" cy="345" r="10" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <circle cx="910" cy="345" r="10" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />

      {/* Plant room */}
      <rect x="730" y="400" width="240" height="168" fill="#e6d9b5" stroke="#3a3527" strokeWidth="1.2" />
      <text x="850" y="424" textAnchor="middle" className="arch-label-room">PLANT ROOM</text>
      <text x="850" y="440" textAnchor="middle" className="arch-label-tiny">HVAC · BOILER · GENERATOR</text>
      <ArchDoor cx={730} cy={430} r={22} dir="se" />
      <rect x="746" y="460" width="66" height="50" fill="#c8b787" stroke="#7a7150" strokeWidth=".5" />
      <text x="779" y="490" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>BOILER</text>
      <circle cx="860" cy="488" r="22" fill="#c8b787" stroke="#7a7150" strokeWidth=".5" />
      <text x="860" y="492" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>AHU</text>
      <rect x="900" y="460" width="60" height="50" fill="#c8b787" stroke="#7a7150" strokeWidth=".5" />
      <text x="930" y="490" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>GEN</text>

      {/* Forklift bays — column grid */}
      {[120, 240, 360, 480].map((x, i) => (
        <g key={i}>
          <rect x={x - 6} y="390" width="12" height="12" fill="#3a3527" />
        </g>
      ))}

      {/* Dimension marks */}
      <g className="arch-dim">
        <line x1="20" y1="588" x2="980" y2="588" stroke="#7a7150" strokeWidth=".5" />
        <line x1="20" y1="585" x2="20" y2="591" stroke="#7a7150" strokeWidth=".5" />
        <line x1="980" y1="585" x2="980" y2="591" stroke="#7a7150" strokeWidth=".5" />
      </g>

      <ArchScaleBar x="80" y="565" />
      <ArchNorthArrow x="935" y="555" />

      <g transform="translate(660, 555)" className="arch-title">
        <rect x="0" y="0" width="260" height="22" fill="#fbf7ec" stroke="#3a3527" strokeWidth=".7" />
        <text x="8" y="15" className="arch-label-tag" style={{ fontWeight: 800 }}>NORTHGATE LOGISTICS HUB · WAREHOUSE · GA01</text>
      </g>
    </g>
  );
}

/* ============================================================
   Aviva Office Tower — Level 2
   ============================================================ */
function ArchAvivaPlan() {
  return (
    <g className="arch-plan">
      <rect x="0" y="0" width="1000" height="600" fill="#fbf7ec" />
      <rect x="20" y="22" width="960" height="556" className="arch-outer" />

      {/* Core columns */}
      {[180, 380, 580, 780].map((x, i) => (
        <rect key={i} x={x} y="294" width="14" height="14" fill="#3a3527" />
      ))}

      {/* Reception block left */}
      <rect x="32" y="32" width="240" height="160" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="152" y="56" textAnchor="middle" className="arch-label-room">RECEPTION</text>
      <rect x="60" y="120" width="180" height="36" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <text x="150" y="142" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>RECEPTION DESK</text>
      <ArchDoor cx={272} cy={110} r={26} dir="se" thick />

      {/* Meeting 2A */}
      <rect x="290" y="32" width="200" height="160" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="390" y="56" textAnchor="middle" className="arch-label-room">MEETING 2A</text>
      <rect x="320" y="80" width="140" height="56" fill="none" stroke="#7a7150" strokeWidth=".7" />
      <text x="390" y="115" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>BOARDROOM TABLE</text>
      {[0,1,2,3,4,5].map((j) => <circle key={j} cx={335 + j * 22} cy="155" r="6" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />)}
      <ArchDoor cx={290} cy={130} r={22} dir="se" />

      {/* Meeting 2B */}
      <rect x="500" y="32" width="200" height="160" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="600" y="56" textAnchor="middle" className="arch-label-room">MEETING 2B</text>
      <rect x="530" y="80" width="140" height="56" fill="none" stroke="#7a7150" strokeWidth=".7" />
      <text x="600" y="115" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>BOARDROOM TABLE</text>
      {[0,1,2,3,4,5].map((j) => <circle key={j} cx={545 + j * 22} cy="155" r="6" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />)}
      <ArchDoor cx={500} cy={130} r={22} dir="se" />

      {/* Kitchenette */}
      <rect x="715" y="32" width="245" height="160" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="838" y="56" textAnchor="middle" className="arch-label-room">KITCHENETTE</text>
      {/* Counters */}
      <rect x="725" y="75" width="225" height="22" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
      <text x="838" y="91" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>SINK · COUNTER</text>
      {/* Tables */}
      {[0, 1].map((j) => (
        <g key={j}>
          <rect x={750 + j * 100} y="125" width="60" height="40" fill="#d8cea3" stroke="#7a7150" strokeWidth=".5" />
          <circle cx={780 + j * 100} cy="115" r="5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
          <circle cx={780 + j * 100} cy="175" r="5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
        </g>
      ))}
      <ArchDoor cx={715} cy={120} r={20} dir="se" />

      {/* Open-plan */}
      <rect x="32" y="200" width="680" height="312" fill="url(#arch-hatch-tile)" opacity=".5" stroke="#3a3527" strokeWidth="1.2" />
      <text x="372" y="226" textAnchor="middle" className="arch-label-room">OPEN-PLAN OFFICE</text>

      {/* Desk pods (clusters of 4) */}
      {[
        { x:60,  y:248 }, { x:200, y:248 }, { x:340, y:248 }, { x:480, y:248 }, { x:600, y:248 },
        { x:60,  y:362 }, { x:200, y:362 }, { x:340, y:362 }, { x:480, y:362 }, { x:600, y:362 },
        { x:60,  y:454 }, { x:200, y:454 }, { x:340, y:454 }, { x:480, y:454 }, { x:600, y:454 },
      ].map((p, i) => (
        <g key={i}>
          <rect x={p.x} y={p.y} width="92" height="40" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
          <line x1={p.x + 46} y1={p.y} x2={p.x + 46} y2={p.y + 40} stroke="#7a7150" strokeWidth=".35" />
          <circle cx={p.x + 23} cy={p.y - 8}  r="4.5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".35" />
          <circle cx={p.x + 69} cy={p.y - 8}  r="4.5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".35" />
          <circle cx={p.x + 23} cy={p.y + 48} r="4.5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".35" />
          <circle cx={p.x + 69} cy={p.y + 48} r="4.5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".35" />
        </g>
      ))}

      {/* Right column: WC + Stairs + Server */}
      {/* WC */}
      <rect x="730" y="200" width="116" height="138" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="788" y="222" textAnchor="middle" className="arch-label-room">WC</text>
      <line x1="788" y1="200" x2="788" y2="338" stroke="#3a3527" strokeWidth=".8" />
      <text x="755" y="240" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>F</text>
      <text x="821" y="240" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>M</text>
      <circle cx="750" cy="270" r="5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <circle cx="766" cy="270" r="5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <rect x="744" y="290" width="14" height="22" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <rect x="762" y="290" width="14" height="22" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <circle cx="808" cy="270" r="5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <circle cx="824" cy="270" r="5" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <rect x="800" y="290" width="14" height="22" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <rect x="820" y="290" width="14" height="22" fill="#d8cea3" stroke="#7a7150" strokeWidth=".4" />
      <ArchDoor cx={760} cy={200} r={18} dir="se" />
      <ArchDoor cx={830} cy={200} r={18} dir="se" />

      {/* Stairs */}
      <rect x="860" y="200" width="100" height="138" fill="#ece4cf" stroke="#3a3527" strokeWidth="1.2" />
      <text x="910" y="222" textAnchor="middle" className="arch-label-room">STAIRS</text>
      {[0,1,2,3,4,5,6].map((j) => (
        <line key={j} x1="870" y1={240 + j * 12} x2="950" y2={240 + j * 12} stroke="#7a7150" strokeWidth=".5" />
      ))}
      <path d="M 870 326 L 910 240 L 950 326" fill="none" stroke="#3a3527" strokeWidth=".8" />

      {/* Server room */}
      <rect x="730" y="350" width="230" height="162" fill="#dde9ee" stroke="#3a3527" strokeWidth="1.2" />
      <text x="845" y="374" textAnchor="middle" className="arch-label-room">SERVER ROOM</text>
      <text x="845" y="389" textAnchor="middle" className="arch-label-tiny">CLIMATE-CONTROLLED</text>
      {[0,1,2,3].map((j) => (
        <rect key={j} x={750 + j * 52} y="408" width="46" height="80" fill="#cdbf91" stroke="#7a7150" strokeWidth=".5" />
      ))}
      <text x="845" y="498" textAnchor="middle" className="arch-label-tiny" style={{ fontSize: 8 }}>RACKS A1 – A4</text>
      <ArchDoor cx={730} cy={384} r={22} dir="se" />

      {/* Dimension marks */}
      <g className="arch-dim">
        <line x1="20" y1="588" x2="980" y2="588" stroke="#7a7150" strokeWidth=".5" />
        <line x1="20" y1="585" x2="20" y2="591" stroke="#7a7150" strokeWidth=".5" />
        <line x1="980" y1="585" x2="980" y2="591" stroke="#7a7150" strokeWidth=".5" />
      </g>

      <ArchScaleBar x="80" y="565" />
      <ArchNorthArrow x="935" y="555" />

      <g transform="translate(620, 555)" className="arch-title">
        <rect x="0" y="0" width="290" height="22" fill="#fbf7ec" stroke="#3a3527" strokeWidth=".7" />
        <text x="8" y="15" className="arch-label-tag" style={{ fontWeight: 800 }}>AVIVA OFFICE TOWER · LEVEL 2 · GA01</text>
      </g>
    </g>
  );
}

/* ============================================================
   Generic blank plan — used when editor starts a brand new plan
   ============================================================ */
function ArchBlankPlan() {
  return (
    <g className="arch-plan">
      <rect x="0" y="0" width="1000" height="600" fill="#fbf7ec" />
      <rect x="20" y="22" width="960" height="556" className="arch-outer" />
      <text x="500" y="280" textAnchor="middle" className="arch-label-room" style={{ fontSize: 16 }}>BLANK PLAN</text>
      <text x="500" y="306" textAnchor="middle" className="arch-label-tiny">DROP A BUILDING PLAN INTO THE EDITOR — OR CLICK TO PLACE SIGNS HERE</text>
      <ArchScaleBar x="80" y="565" />
      <ArchNorthArrow x="935" y="555" />
    </g>
  );
}

function ArchPlanContent({ siteId }) {
  if (siteId === "s1") return <ArchRiversidePlan />;
  if (siteId === "s2") return <ArchNorthgatePlan />;
  if (siteId === "s3") return <ArchAvivaPlan />;
  return <ArchBlankPlan />;
}

Object.assign(window, { ArchDefs, ArchPlanContent });

/* ════════════════════ asset_14_1ed57ec8.js ════════════════════ */
;
/* HazardLink — Floor plans view (smart wet-floor sign pins on building plan).
   Includes a full Plan Editor with image upload + click-to-place + drag-to-move. */

/* ============================================================
   Cross-reference helpers: pin → live device + alert
   ============================================================ */
const HGR_DEVICE_MAP = (() => {
  const m = {};
  HL.deviceBuildings.forEach((b) => b.devices.forEach((d) => { m[d.id] = d; }));
  return m;
})();
const SPILL_BY_HGR_LATEST = (() => {
  const m = {};
  HL.spillAlerts.forEach((s) => {
    if (!m[s.hanger] || s.raisedAt > m[s.hanger].raisedAt) m[s.hanger] = s;
  });
  return m;
})();

/* ============================================================
   Gateway positions per floor — keeps gateways visible on the plan
   so coverage is obvious without polluting the data model.
   ============================================================ */
const GATEWAY_POSITIONS = {};

const GW_LOOKUP = (() => {
  const m = {};
  HL.deviceBuildings.forEach((b) => b.devices.forEach((d) => {
    if (d.type === "Gateway") m[d.id] = { ...d, building: b.name };
  }));
  return m;
})();

function gatewaysForFloor(siteId, floorId) {
  const list = (GATEWAY_POSITIONS[siteId] && GATEWAY_POSITIONS[siteId][floorId]) || [];
  return list.map((g) => {
    const dev = GW_LOOKUP[g.id] || {};
    return {
      ...g, kind: "gateway",
      label: dev.room || "Gateway",
      online: dev.online !== false,
      signal: dev.signal || 0,
      lastSeen: dev.lastSeen || "\u2014",
      building: dev.building || "",
      hangersHeard: dev.building ? (HL_LIVE.hangersHeardBy(g.id, dev.building) || 0) : 0,
    };
  });
}

function FALLBACK_LIFTED_init() { /* placeholder so adjacent decl block keeps name */ }

const FALLBACK_LIFTED = {};

function enrichPin(pin) {
  const dev = HGR_DEVICE_MAP[pin.id];
  const battery = dev ? dev.battery : null;
  const online  = dev ? dev.online  : true;
  let runState = pin.state;
  if (!online) runState = "offline";
  const lowBat = battery !== null && battery !== undefined && battery < 20;
  const sp = SPILL_BY_HGR_LATEST[pin.id];
  let lastLifted = FALLBACK_LIFTED[pin.id] || "—";
  let alertId = null, alertState = null;
  if (sp) {
    alertId = sp.id; alertState = sp.state;
    lastLifted = (sp.state === "new" || sp.state === "acknowledged")
      ? "Today " + sp.raisedAt + " (live)"
      : "Today " + sp.raisedAt;
  }
  return {
    ...pin, runState, dev, battery, online,
    signal:   dev ? dev.signal   : 0,
    lastSeen: dev ? dev.lastSeen : "—",
    lastLifted, lowBat, alertId, alertState,
  };
}

/* ============================================================
   Pin layer — used by both viewer and editor SVGs
   ============================================================ */
function PinLayer({ pins, activeId, hoverId, onPin, onPinEnter, onPinLeave, draggable, onPinDragStart }) {
  return (
    <g>
      {pins.map((p) => {
        const cx = p.x * 10, cy = p.y * 6;
        const isActive = activeId === p.id;
        const isHover  = hoverId  === p.id;
        return (
          <g key={p.id}
             className={"fp-pin-g " + (isActive ? "on " : "") + (isHover ? "hov " : "") + p.runState + (draggable ? " draggable" : "")}
             transform={`translate(${cx},${cy})`}
             onMouseDown={draggable ? (e) => onPinDragStart && onPinDragStart(p, e) : undefined}
             onMouseEnter={() => onPinEnter && onPinEnter(p)}
             onMouseLeave={() => onPinLeave && onPinLeave(p)}
             onClick={(e) => { e.stopPropagation(); onPin && onPin(p); }}>
            {p.runState === "deployed" && <circle r="24" className="fp-pulse" />}
            {p.runState === "deployed" && <circle r="24" className="fp-pulse fp-pulse-2" />}
            {p.runState === "offline"  && <circle r="20" className="fp-pulse fp-pulse-warn" />}
            {(isActive || isHover) && <circle r="22" className="fp-ring" />}
            <circle r="13" className={"fp-pin-disc fp-" + p.runState} />
            <circle r="5" className="fp-pin-dot" />
            {p.lowBat && (
              <g transform="translate(10,-10)" className="fp-lowbat-grp">
                <circle r="6.5" className="fp-lowbat-badge" />
                <path d="M-0.6 -3 L1.4 -.4 L0.3 -.4 L0.9 2.6 L-1.6 -.2 L-.4 -.2 Z" className="fp-lowbat-bolt" />
              </g>
            )}
            <text y="-20" className="fp-pin-id">{p.id}</text>
          </g>
        );
      })}
    </g>
  );
}

/* Gateway layer — square pins so coverage is visible on the plan. */
function GatewayLayer({ gateways, activeId, hoverId, onGateway, onGwEnter, onGwLeave }) {
  return (
    <g>
      {(gateways || []).map((g) => {
        const cx = g.x * 10, cy = g.y * 6;
        const isActive = activeId === g.id;
        const isHover  = hoverId  === g.id;
        const tone = g.online === false ? "offline" : "online";
        return (
          <g key={g.id}
             className={"fp-gw-g " + tone + (isActive ? " on" : "") + (isHover ? " hov" : "")}
             transform={`translate(${cx},${cy})`}
             onMouseEnter={() => onGwEnter && onGwEnter(g)}
             onMouseLeave={() => onGwLeave && onGwLeave(g)}
             onClick={(e) => { e.stopPropagation(); onGateway && onGateway(g); }}>
            {(isActive || isHover) && <rect x="-17" y="-17" width="34" height="34" rx="6" className="fp-gw-ring" />}
            <rect x="-12" y="-12" width="24" height="24" rx="4" className="fp-gw-rect" />
            <g className="fp-gw-icon">
              <path d="M-6.5 1.5 A 6.5 6.5 0 0 1 6.5 1.5" />
              <path d="M-3.5 -0.5 A 3.5 3.5 0 0 1 3.5 -0.5" />
              <circle cx="0" cy="3" r="1.2" className="fp-gw-icon-dot" />
            </g>
            <text y="-20" className="fp-pin-id">{g.id}</text>
          </g>
        );
      })}
    </g>
  );
}

/* ============================================================
   Floor-plan SVG (viewer)
   ============================================================ */
function FloorPlanSVG({ floor, gateways, siteId, activeId, hoverId, onPin, onGateway, onPinEnter, onPinLeave, onGwEnter, onGwLeave }) {
  return (
    <svg viewBox="0 0 1000 600" className="fp-svg arch-svg" preserveAspectRatio="xMidYMid slice">
      <ArchDefs />
      {floor.image
        ? <image href={floor.image} x="0" y="0" width="1000" height="600" preserveAspectRatio="xMidYMid meet" />
        : <ArchPlanContent siteId={siteId} />}
      <GatewayLayer gateways={gateways} activeId={activeId} hoverId={hoverId}
        onGateway={onGateway} onGwEnter={onGwEnter} onGwLeave={onGwLeave} />
      <PinLayer pins={floor.pins} activeId={activeId} hoverId={hoverId}
        onPin={onPin} onPinEnter={onPinEnter} onPinLeave={onPinLeave} />
    </svg>
  );
}

/* ============================================================
   Pin detail popover — floats over the canvas next to the pin
   ============================================================ */
function PinPopover({ pin, onClose, onViewAlert }) {
  const stateMeta = {
    deployed: { tone:"crit",  label:"Sign lifted \u2014 hazard on floor" },
    cleared:  { tone:"ok",    label:"Sign on rack \u2014 ready" },
    offline:  { tone:"warn",  label:"Hanger offline \u2014 not reporting" },
  };
  const sm = stateMeta[pin.runState] || stateMeta.cleared;
  const batteryTone = pin.battery == null ? "muted"
    : pin.battery < 20 ? "crit" : pin.battery < 40 ? "warn" : "ok";
  const gwId = HL_LIVE.gatewayForHanger(pin.id, pin.dev ? pin.dev.room : "") || "\u2014";
  const gw   = GW_LOOKUP[gwId];
  const devEUI = pin.id.replace(/[^0-9A-F]/gi, "").padEnd(4, "0");
  const devEUIFmt = "70B3D580" + (pin.id.match(/(\d+)/) || ["","0000"])[1].padStart(4, "0") + "A" + devEUI.slice(0, 2);

  return (
    <div className="fp-popover">
      <div className="fp-pop-head">
        <span className={"pin-dot " + pin.runState} />
        <div style={{ flex:1, minWidth:0 }}>
          <div className="fp-pop-name">{pin.label}</div>
          <div className="fp-pop-sub">
            <span style={{ fontWeight:700, color:"var(--ink-2)" }}>{pin.id}</span>
            <span className="fp-pop-dot" />
            <span style={{ fontFamily:"var(--mono)" }}>{devEUIFmt}</span>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close"><Icon name="x" size={15} /></button>
      </div>

      <div className="fp-pop-pills">
        <Pill tone={sm.tone} dot>{sm.label}</Pill>
        {pin.lowBat && <Pill tone="warn" icon="alertTri">Low battery</Pill>}
      </div>

      <div className="fp-pop-body">
        <div className="hgr-grid">
          <div className="hgr-k">Zone</div><div className="hgr-v">{pin.label}</div>
          <div className="hgr-k">Status</div><div className="hgr-v">{sm.label}</div>
          <div className="hgr-k">Battery</div>
          <div className="hgr-v">
            {pin.battery == null
              ? <span style={{ color:"var(--ink-3)" }}>{"\u2014"}</span>
              : <span className={"hgr-bat hgr-bat-" + batteryTone}>
                  <span className="hgr-bat-shell"><i style={{ width: Math.max(6, pin.battery) + "%" }} /></span>
                  <span className="hgr-bat-cap" />
                  <b>{pin.battery}%</b>
                </span>}
          </div>
          <div className="hgr-k">Signal</div>
          <div className="hgr-v">
            <span className="hgr-bars">
              {[1,2,3,4,5].map((n) => (
                <i key={n} className={pin.signal >= n ? "on" : ""} style={{ height: 4 + n * 2 }} />
              ))}
            </span>
            <span style={{ marginLeft:6, color:"var(--ink-3)", fontFamily:"var(--mono)", fontSize:12 }}>
              {pin.signal === 0 ? "\u2014" : pin.signal + "/5"}
            </span>
          </div>
          <div className="hgr-k">Last seen</div>
          <div className="hgr-v" style={{ fontFamily:"var(--mono)" }}>{pin.lastSeen}</div>
          <div className="hgr-k">Last lifted</div>
          <div className="hgr-v" style={{ fontFamily:"var(--mono)" }}>{pin.lastLifted}</div>
          <div className="hgr-k">Reports via</div>
          <div className="hgr-v">
            <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontFamily:"var(--mono)", fontSize:12 }}>
              <span className="fp-pop-gw-chip"><Icon name="wifi" size={10} />{gwId}</span>
              {gw && gw.room && <span style={{ color:"var(--ink-3)", fontFamily:"var(--font)" }}>{"\u00b7 " + gw.room}</span>}
            </span>
          </div>
        </div>

        {pin.alertId && (pin.alertState === "new" || pin.alertState === "acknowledged") && (
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", marginTop:12 }} onClick={onViewAlert}>
            <Icon name="alertTri" size={14} />Open spill alert {pin.alertId}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Gateway popover — lighter, shown when a gateway pin is selected
   ============================================================ */
function GatewayPopover({ gw, onClose }) {
  return (
    <div className="fp-popover fp-popover-gw">
      <div className="fp-pop-head">
        <span className="fp-pop-gw-glyph"><Icon name="wifi" size={13} /></span>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="fp-pop-name">{gw.label || "LoRa gateway"}</div>
          <div className="fp-pop-sub"><span style={{ fontWeight:700, color:"var(--ink-2)" }}>{gw.id}</span></div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close"><Icon name="x" size={15} /></button>
      </div>
      <div className="fp-pop-pills">
        <Pill tone={gw.online === false ? "warn" : "ok"} dot>{gw.online === false ? "Offline" : "Online"}</Pill>
        <Pill tone="muted">LoRaWAN gateway</Pill>
      </div>
      <div className="fp-pop-body">
        <div className="hgr-grid">
          <div className="hgr-k">Room</div><div className="hgr-v">{gw.label}</div>
          <div className="hgr-k">Signal</div>
          <div className="hgr-v">
            <span className="hgr-bars">
              {[1,2,3,4,5].map((n) => (
                <i key={n} className={gw.signal >= n ? "on" : ""} style={{ height: 4 + n * 2 }} />
              ))}
            </span>
            <span style={{ marginLeft:6, color:"var(--ink-3)", fontFamily:"var(--mono)", fontSize:12 }}>
              {gw.signal === 0 ? "\u2014" : gw.signal + "/5"}
            </span>
          </div>
          <div className="hgr-k">Last seen</div>
          <div className="hgr-v" style={{ fontFamily:"var(--mono)" }}>{gw.lastSeen}</div>
          <div className="hgr-k">Hangers heard</div>
          <div className="hgr-v"><b>{gw.hangersHeard}</b> in {gw.building}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Pin detail panel — viewer (legacy, retained for compatibility)
   ============================================================ */
function PinDetailPanel({ pin, onClose, onViewAlert }) {
  const stateMeta = {
    deployed: { tone:"crit",  label:"Sign lifted — hazard on floor" },
    cleared:  { tone:"ok",    label:"Sign on rack — ready" },
    offline:  { tone:"warn",  label:"Hanger offline — not reporting" },
  };
  const sm = stateMeta[pin.runState] || stateMeta.cleared;
  const batteryTone = pin.battery == null ? "muted"
    : pin.battery < 20 ? "crit" : pin.battery < 40 ? "warn" : "ok";

  return (
    <React.Fragment>
      <div className="fp-side-head">
        <span className={"pin-dot " + pin.runState} />
        <div style={{ flex:1, minWidth:0 }}>
          <div className="fp-pin-name">{pin.label}</div>
          <div className="fp-pin-sub">Hanger {pin.id}</div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ padding:"4px 16px 12px", display:"flex", gap:6, flexWrap:"wrap" }}>
        <Pill tone={sm.tone} dot>{sm.label}</Pill>
        {pin.lowBat && <Pill tone="warn" icon="alertTri">Low battery</Pill>}
      </div>

      <div style={{ padding:"0 16px" }}>
        <div className="hgr-grid">
          <div className="hgr-k">Zone</div><div className="hgr-v">{pin.label}</div>
          <div className="hgr-k">Status</div><div className="hgr-v">{sm.label}</div>
          <div className="hgr-k">Battery</div>
          <div className="hgr-v">
            {pin.battery == null
              ? <span style={{ color:"var(--ink-3)" }}>—</span>
              : <span className={"hgr-bat hgr-bat-" + batteryTone}>
                  <span className="hgr-bat-shell"><i style={{ width: Math.max(6, pin.battery) + "%" }} /></span>
                  <span className="hgr-bat-cap" />
                  <b>{pin.battery}%</b>
                </span>}
          </div>
          <div className="hgr-k">Signal</div>
          <div className="hgr-v">
            <span className="hgr-bars">
              {[1,2,3,4,5].map((n) => (
                <i key={n} className={pin.signal >= n ? "on" : ""} style={{ height: 4 + n * 2 }} />
              ))}
            </span>
            <span style={{ marginLeft:6, color:"var(--ink-3)", fontFamily:"var(--mono)", fontSize:12 }}>
              {pin.signal === 0 ? "—" : pin.signal + "/5"}
            </span>
          </div>
          <div className="hgr-k">Last seen</div>
          <div className="hgr-v" style={{ fontFamily:"var(--mono)" }}>{pin.lastSeen}</div>
          <div className="hgr-k">Last lifted</div>
          <div className="hgr-v" style={{ fontFamily:"var(--mono)" }}>{pin.lastLifted}</div>
          <div className="hgr-k">Hardware</div>
          <div className="hgr-v">Heltec ESP32 · Hall-effect sensor</div>
          <div className="hgr-k">Reports through</div>
          <div className="hgr-v" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{HL_LIVE.gatewayForHanger(pin.id, pin.dev ? pin.dev.room : "") || "—"}</div>
        </div>
      </div>

      {pin.alertId && (pin.alertState === "new" || pin.alertState === "acknowledged") && (
        <div style={{ padding:"0 16px", marginTop:14 }}>
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center" }} onClick={onViewAlert}>
            <Icon name="alertTri" size={14} />Open spill alert {pin.alertId}
          </button>
        </div>
      )}

      {pin.runState === "deployed" && !pin.alertId && (
        <div style={{ padding:"12px 16px 16px", display:"flex", gap:8 }}>
          <button className="btn" style={{ flex:1 }}><Icon name="check" size={14} />Acknowledge</button>
          <button className="btn btn-primary" style={{ flex:1 }}><Icon name="checkCircle" size={14} />Resolve</button>
        </div>
      )}
      {pin.runState === "offline" && (
        <div style={{ padding:"12px 16px 16px", display:"flex", gap:8 }}>
          <button className="btn" style={{ flex:1 }}><Icon name="send" size={14} />Ping device</button>
          <button className="btn btn-primary" style={{ flex:1 }}><Icon name="alertTri" size={14} />Raise ticket</button>
        </div>
      )}
    </React.Fragment>
  );
}

/* ============================================================
   Plan editor — full-screen overlay
   ============================================================ */
function PlanEditor({ site, floor, siteId, sites, onClose, onSave }) {
  const live = useHLLive();
  const [name,    setName]    = React.useState(floor.name || "Ground floor");
  const [siteSel, setSiteSel] = React.useState(siteId);
  const [image,   setImage]   = React.useState(floor.image || null);
  /* Clone pins into editor-local state. Strip enrichment overlay info. */
  const [pins, setPins] = React.useState(() => floor.pins.map((p) => ({
    id: p.id, label: p.label, x: p.x, y: p.y, state: p.state || "cleared", note: p.note || "",
  })));
  const [activeId, setActiveId] = React.useState(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dropHover, setDropHover] = React.useState(false);

  const svgRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  /* Compute the next HGR-#### id consistent with the site number. */
  const sitePrefix = { s1: 1, s2: 2, s3: 3 }[siteSel] || 9;
  const nextHgr = () => {
    const usedNums = new Set(
      pins.map((p) => Number((p.id.match(/HGR-(\d+)/) || [])[1]) || 0)
    );
    let n = sitePrefix * 1000 + 50;
    while (usedNums.has(n)) n++;
    return "HGR-" + n;
  };

  /* ----- File upload (real, via FileReader) ----- */
  const acceptFile = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      /* Non-image: keep architectural fallback */
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  };
  const onPickClick  = () => fileInputRef.current && fileInputRef.current.click();
  const onPickChange = (e) => { acceptFile(e.target.files && e.target.files[0]); e.target.value = ""; };
  const onDropZone   = (e) => { e.preventDefault(); setDropHover(false); acceptFile(e.dataTransfer.files && e.dataTransfer.files[0]); };
  const onDragOver   = (e) => { e.preventDefault(); setDropHover(true); };
  const onDragLeave  = () => setDropHover(false);

  /* ----- Convert mouse coords → SVG userspace (0..1000, 0..600) ----- */
  const eventToSvg = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const c = pt.matrixTransform(ctm.inverse());
    return { x: c.x, y: c.y };
  };

  /* Unplaced hangers — added via the Devices wizard, not yet dropped. */
  const unplaced = live.addedHangers.filter((h) => !h.placed && h.building === site.name);
  const [pendingPlace, setPendingPlace] = React.useState(null); // hanger id we will drop next click

  /* ----- Click on canvas → place a new pin ----- */
  const handleCanvasClick = (e) => {
    if (isDragging) { setIsDragging(false); return; }
    const { x, y } = eventToSvg(e);
    const px = Math.max(2, Math.min(98, x / 10));
    const py = Math.max(2, Math.min(98, y / 6));

    /* If a real unplaced hanger is queued, drop THAT one (instead of a fresh blank). */
    if (pendingPlace) {
      const h = live.addedHangers.find((x) => x.id === pendingPlace);
      if (h) {
        const newPin = {
          id: h.id, label: h.zone || "New zone",
          x: +px.toFixed(1), y: +py.toFixed(1),
          state: "cleared", note: "On rack · just placed from Devices",
        };
        setPins((ps) => [...ps, newPin]);
        setActiveId(newPin.id);
        HL_LIVE.placeHanger(h.id, siteSel, 0, newPin.x, newPin.y);
      }
      setPendingPlace(null);
      return;
    }

    const newPin = {
      id: nextHgr(),
      label: "New sign (rename me)",
      x: +px.toFixed(1),
      y: +py.toFixed(1),
      state: "cleared",
      note: "On rack",
    };
    setPins((ps) => [...ps, newPin]);
    setActiveId(newPin.id);
  };

  /* ----- Pin drag (mousemove on window for smoothness) ----- */
  const dragInfo = React.useRef(null);
  const onPinDragStart = (pin, e) => {
    e.stopPropagation();
    dragInfo.current = { id: pin.id, started: false };
    setActiveId(pin.id);
    const onMove = (ev) => {
      const { x, y } = eventToSvg(ev);
      const px = Math.max(2, Math.min(98, x / 10));
      const py = Math.max(2, Math.min(98, y / 6));
      dragInfo.current.started = true;
      setIsDragging(true);
      setPins((ps) => ps.map((p) =>
        p.id === pin.id ? { ...p, x: +px.toFixed(1), y: +py.toFixed(1) } : p
      ));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      /* Defer clearing the drag flag so the SVG click fires AFTER and skips. */
      setTimeout(() => setIsDragging(false), 50);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ----- Pin editing ----- */
  const updatePin = (id, patch) => setPins((ps) => ps.map((p) => p.id === id ? { ...p, ...patch } : p));
  const removePin = (id) => {
    setPins((ps) => ps.filter((p) => p.id !== id));
    setActiveId(null);
  };
  const clearAll  = () => { setPins([]); setActiveId(null); };

  const active = pins.find((p) => p.id === activeId);

  const enrichedForRender = pins.map((p) => {
    /* Editor pins use a quick lookup so newly-placed pins still display
       their selected state (cleared/deployed/offline) and inherit live
       device battery for an existing HGR id if present. */
    const dev = HGR_DEVICE_MAP[p.id];
    const battery = dev ? dev.battery : null;
    const lowBat = battery !== null && battery !== undefined && battery < 20;
    return { ...p, runState: p.state, lowBat, signal: dev ? dev.signal : 0 };
  });

  const STATE_OPTS = [
    { id:"cleared",  label:"On rack — green",     dot:"cleared"  },
    { id:"deployed", label:"Lifted — red",        dot:"deployed" },
    { id:"offline",  label:"Offline — orange",    dot:"offline"  },
  ];

  return (
    <div className="plan-editor">
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickChange} />

      <header className="plan-editor-head">
        <div className="plan-editor-crumb">
          <Icon name="layers" size={16} />
          <span>Plan editor</span>
          <Icon name="chevronRight" size={12} />
          <b>{site.name}</b>
          <Icon name="chevronRight" size={12} />
          <span>{name}</span>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span className="plan-editor-count">{pins.length} sign{pins.length === 1 ? "" : "s"} placed</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ name, image, pins, siteId: siteSel })}>
            <Icon name="check" size={15} />Save plan
          </button>
        </div>
      </header>

      <div className="plan-editor-body">
        {/* Left sidebar — form + pin list + tools */}
        <aside className="plan-editor-side">
          <div className="pe-section">
            <div className="pe-section-cap">Plan details</div>
            <div className="ai-field">
              <label>Plan name</label>
              <input className="dv-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="ai-field">
              <label>Site</label>
              <select className="dv-input" value={siteSel} onChange={(e) => setSiteSel(e.target.value)}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ai-field">
              <label>Floor level</label>
              <select className="dv-input" defaultValue="Ground floor">
                <option>Basement</option>
                <option>Ground floor</option>
                <option>Level 1</option>
                <option>Level 2</option>
                <option>Level 3</option>
                <option>Roof</option>
              </select>
            </div>
          </div>

          <div className="pe-section">
            <div className="pe-section-cap">Plan image</div>
            <div className={"pe-dropzone" + (dropHover ? " hover" : "") + (image ? " has-image" : "")}
                 onClick={onPickClick} onDrop={onDropZone} onDragOver={onDragOver} onDragLeave={onDragLeave}>
              {image ? (
                <React.Fragment>
                  <div className="pe-dropzone-thumb" style={{ backgroundImage:`url(${image})` }} />
                  <div className="pe-dropzone-info">
                    <div className="pe-dropzone-title"><Icon name="checkCircle" size={13} />Image set</div>
                    <div className="pe-dropzone-sub">Click to replace · drag a new file to swap</div>
                  </div>
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setImage(null); }}>
                    <Icon name="x" size={13} />Remove
                  </button>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <div className="pe-dropzone-ico"><Icon name="layers" size={22} /></div>
                  <div className="pe-dropzone-title">Drop a plan image here</div>
                  <div className="pe-dropzone-sub">PNG, JPG or PDF render — or click to choose</div>
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onPickClick(); }}>
                    <Icon name="plus" size={13} />Choose image
                  </button>
                  <div className="pe-dropzone-fallback">No image? The architectural illustration stays as the background.</div>
                </React.Fragment>
              )}
            </div>
          </div>

          <div className="pe-section">
            <div className="pe-section-cap">
              Unplaced hangers ({unplaced.length})
            </div>
            {unplaced.length === 0 && (
              <div className="pe-empty" style={{ fontSize: 11.5 }}>
                Hangers added in <b style={{ color: "var(--ink-2)" }}>Devices</b> appear here as unplaced pins.
                Click one, then click the plan to drop it.
              </div>
            )}
            {unplaced.map((h) => (
              <button key={h.id}
                className={"pe-unplaced" + (pendingPlace === h.id ? " on" : "")}
                onClick={() => setPendingPlace(pendingPlace === h.id ? null : h.id)}>
                <span className="pe-unp-ico"><Icon name="droplet" size={12} /></span>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div className="pe-unp-name">{h.zone || h.id}</div>
                  <div className="pe-unp-id">{h.id} · via {h.gateway}</div>
                </div>
                {pendingPlace === h.id
                  ? <Pill tone="accent" dot>Tap plan to drop</Pill>
                  : <Icon name="plus" size={13} />}
              </button>
            ))}
          </div>

          <div className="pe-section">
            <div className="pe-section-cap">
              Signs ({pins.length})
              {pins.length > 0 && (
                <button className="pe-clear" onClick={clearAll}><Icon name="trash" size={12} />Clear all</button>
              )}
            </div>
            <div className="pe-pin-list">
              {pins.length === 0 && (
                <div className="pe-empty">Click anywhere on the plan to drop a sign.</div>
              )}
              {pins.map((p) => (
                <button key={p.id} className={"pe-pin-row" + (activeId === p.id ? " on" : "")}
                  onClick={() => setActiveId(p.id)}>
                  <span className={"pin-dot " + p.state} />
                  <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
                    <div className="pe-pin-row-label">{p.label}</div>
                    <div className="pe-pin-row-id">{p.id}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {active && (
            <div className="pe-section pe-section-edit">
              <div className="pe-section-cap">Selected sign</div>
              <div className="ai-field">
                <label>Sign ID</label>
                <input className="dv-input" value={active.id}
                  onChange={(e) => updatePin(active.id, { id: e.target.value })} />
              </div>
              <div className="ai-field">
                <label>Zone label</label>
                <input className="dv-input" value={active.label}
                  onChange={(e) => updatePin(active.id, { label: e.target.value })} />
              </div>
              <div className="ai-field">
                <label>State</label>
                <div className="pe-state-row">
                  {STATE_OPTS.map((o) => (
                    <button key={o.id}
                      className={"pe-state-chip" + (active.state === o.id ? " on" : "")}
                      onClick={() => updatePin(active.id, { state: o.id })}>
                      <span className={"pin-dot " + o.dot} />{o.label}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn auto-btn-danger" style={{ width:"100%", justifyContent:"center" }}
                onClick={() => removePin(active.id)}>
                <Icon name="trash" size={14} />Delete sign
              </button>
            </div>
          )}
        </aside>

        {/* Canvas */}
        <div className="plan-editor-canvas">
          <div className="pe-canvas-bar">
            <Icon name="layers" size={12} />
            <span>{site.name} · {name}</span>
            <span className="pe-canvas-hint">
              {pendingPlace
                ? <React.Fragment><b style={{ color: "var(--accent)" }}>Drop mode — click anywhere to place {pendingPlace}</b></React.Fragment>
                : "Click on the plan to drop a sign · drag pins to reposition"}
            </span>
          </div>
          <div className="pe-canvas-shell"
            onDrop={onDropZone} onDragOver={onDragOver} onDragLeave={onDragLeave}>
            <svg ref={svgRef} viewBox="0 0 1000 600" className="fp-svg arch-svg"
                 preserveAspectRatio="xMidYMid meet"
                 onClick={handleCanvasClick}>
              <ArchDefs />
              {image
                ? <image href={image} x="0" y="0" width="1000" height="600" preserveAspectRatio="xMidYMid slice" />
                : <ArchPlanContent siteId={siteSel} />}
              <PinLayer pins={enrichedForRender} activeId={activeId}
                onPin={(p) => setActiveId(p.id)}
                draggable
                onPinDragStart={onPinDragStart} />
            </svg>
            {dropHover && (
              <div className="pe-dropover">
                <Icon name="layers" size={28} />
                <div>Drop the image to set as plan background</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function FloorPlanView({ go }) {
  const D = useSiteData();
  const { site: globalSite } = React.useContext(SiteContext);

  /* Local editable copy of plans — preserves edits during the session. */
  const [planState, setPlanState] = React.useState(() =>
    HL.floorPlanSites.map((s) => ({
      ...s, floors: s.floors.map((f) => ({ ...f, image: f.image || null, pins: f.pins.slice() })),
    }))
  );

  /* Apply current site filter to local state. */
  const sites = React.useMemo(() => {
    if (!globalSite) return planState;
    return planState.filter((s) => s.name === globalSite.name);
  }, [planState, globalSite]);

  const [siteId, setSiteId] = React.useState(sites[0] ? sites[0].id : null);
  React.useEffect(() => {
    if (sites.length === 0) { setSiteId(null); return; }
    if (!sites.find((s) => s.id === siteId)) setSiteId(sites[0].id);
  }, [sites]);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [createNewOpen, setCreateNewOpen] = React.useState(false);
  const site = sites.find((s) => s.id === siteId) || sites[0];
  const [floorIdx, setFloorIdx] = React.useState(0);
  const [activeId, setActiveId] = React.useState(null);
  const [hoverId,  setHoverId]  = React.useState(null);

  React.useEffect(() => { setActiveId(null); setFloorIdx(0); }, [siteId]);

  const onSavePlan = (next) => {
    /* Update the floor in question with new name/image/pins. */
    setPlanState((all) => all.map((s) => {
      if (s.id !== siteId) return s;
      const floors = s.floors.slice();
      floors[floorIdx] = {
        ...floors[floorIdx],
        name: next.name,
        image: next.image,
        pins: next.pins,
      };
      return { ...s, floors };
    }));
    setEditorOpen(false);
    setActiveId(null);
  };

  if (!site) {
    return (
      <div className="content-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">Floor plans</h1>
            <p className="page-desc">Every smart wet-floor sign on the building map. Green is on the rack and ready; red is lifted onto the floor; orange means the hanger has gone offline.</p>
          </div>
        </div>
        <div className="empty" style={{ background:"var(--surface)", border:"1px solid var(--line)", borderRadius:"var(--radius)" }}>
          <div className="empty-ico"><Icon name="mapPin" size={28} /></div>
          <h3>No floor plan loaded</h3>
          <p>{globalSite ? `${globalSite.name} does not have a floor plan in HazardLink yet. Open the plan editor to upload one and drop your sign pins.` : "Open the plan editor to upload a building plan and start placing pins."}</p>
          <button className="btn btn-primary" onClick={() => setCreateNewOpen(true)}>
            <Icon name="layers" size={15} />Open plan editor
          </button>
        </div>
        {createNewOpen && (
          <PlanEditor
            site={{ id:"new", name: globalSite ? globalSite.name : "New plan", floors:[] }}
            floor={{ name:"Ground floor", image:null, pins:[] }}
            siteId={"new"}
            sites={HL.sites.map((s) => ({ id:"new-" + s.id, name:s.name }))}
            onClose={() => setCreateNewOpen(false)}
            onSave={(next) => {
              /* Create a new entry attached to the matching base site. */
              const baseSite = HL.sites.find((s) => s.name === globalSite?.name) || HL.sites[0];
              const newSite = {
                id: baseSite.id, name: baseSite.name,
                shortName: baseSite.name.split(/[\s,]/)[0],
                floors: [{ id:"new-floor", name: next.name, rooms:[], pins: next.pins, image: next.image }],
              };
              setPlanState((all) => [...all, newSite]);
              setSiteId(baseSite.id);
              setCreateNewOpen(false);
            }} />
        )}
      </div>
    );
  }

  const rawFloor = site.floors[floorIdx] || site.floors[0];
  const floor = { ...rawFloor, pins: rawFloor.pins.map(enrichPin) };
  const gateways = gatewaysForFloor(site.id, rawFloor.id);

  const deployed = floor.pins.filter((p) => p.runState === "deployed");
  const cleared  = floor.pins.filter((p) => p.runState === "cleared");
  const offline  = floor.pins.filter((p) => p.runState === "offline");
  const lowBat   = floor.pins.filter((p) => p.lowBat);
  const active   = floor.pins.find((p) => p.id === activeId);
  const activeGw = gateways.find((g) => g.id === activeId);

  /* Position the popover next to the active pin's coords (0–98).
     The canvas keeps a fixed 5:3 aspect ratio so percentages map directly. */
  const popTarget = active || activeGw;
  let popStyle = null;
  if (popTarget) {
    const below = popTarget.y < 52;
    const x = Math.min(Math.max(popTarget.x, 22), 78);
    popStyle = {
      left: x + "%",
      top:  below ? `calc(${popTarget.y}% + 28px)` : `calc(${popTarget.y}% - 28px)`,
      transform: `translate(-50%, ${below ? "0" : "-100%"})`,
    };
  }

  return (
    <div className="content-inner">
      {editorOpen && (
        <PlanEditor
          site={site}
          floor={rawFloor}
          siteId={siteId}
          sites={planState}
          onClose={() => setEditorOpen(false)}
          onSave={onSavePlan} />
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">Floor plans</h1>
          <p className="page-desc">Every smart wet-floor sign on the building map. Green is on the rack and ready; red is lifted out signing a live hazard; orange means the hanger sensor has gone offline.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditorOpen(true)}><Icon name="layers" size={15} />Open plan editor</button>
      </div>

      <div className="fp-bar">
        <div className="fp-bar-label">Site</div>
        <div className="seg">
          {sites.map((s) => (
            <button key={s.id} className={siteId === s.id ? "on" : ""}
              onClick={() => setSiteId(s.id)}>{s.shortName}</button>
          ))}
        </div>
        {site.floors.length > 1 && (
          <React.Fragment>
            <div className="fp-bar-label" style={{ marginLeft:14 }}>Floor</div>
            <div className="seg">
              {site.floors.map((f, i) => (
                <button key={f.id} className={floorIdx === i ? "on" : ""}
                  onClick={() => setFloorIdx(i)}>{f.name}</button>
              ))}
            </div>
          </React.Fragment>
        )}

        <div className="fp-legend">
          <span className="fp-lg"><span className="pin-dot cleared"  /> On rack <b>{cleared.length}</b></span>
          <span className="fp-lg"><span className="pin-dot deployed" /> Lifted <b>{deployed.length}</b></span>
          <span className="fp-lg"><span className="pin-dot offline"  /> Offline <b>{offline.length}</b></span>
          <span className="fp-lg"><span className="pin-dot lowbat"   /> Low battery <b>{lowBat.length}</b></span>
          <span className="fp-lg"><span className="pin-dot gateway"  /> Gateways <b>{gateways.length}</b></span>
        </div>
      </div>

      <div className="fp-shell">
        <div className="fp-canvas">
          <FloorPlanSVG floor={floor} gateways={gateways} siteId={siteId}
            activeId={activeId} hoverId={hoverId}
            onPin={(p) => setActiveId(p.id)}
            onGateway={(g) => setActiveId(g.id)}
            onPinEnter={(p) => setHoverId(p.id)}
            onPinLeave={() => setHoverId(null)}
            onGwEnter={(g) => setHoverId(g.id)}
            onGwLeave={() => setHoverId(null)} />
          <div className="fp-stamp">
            <Icon name="mapPin" size={13} /> {site.name} · {floor.name}
          </div>
          {popTarget && (
            <div className="fp-popover-wrap" style={popStyle}>
              {active
                ? <PinPopover pin={active} onClose={() => setActiveId(null)} onViewAlert={() => go("spills")} />
                : <GatewayPopover gw={activeGw} onClose={() => setActiveId(null)} />}
            </div>
          )}
        </div>

        <aside className="fp-side card">
          <div className="card-head" style={{ borderBottom:"1px solid var(--line)" }}>
            <h3>Signs on this floor</h3>
            <span className="sub">{floor.pins.length} total</span>
          </div>
          <div className="fp-pin-list">
            {floor.pins.length === 0 && (
              <div style={{ padding:"30px 20px", textAlign:"center", color:"var(--ink-3)", fontSize:13 }}>
                No signs placed yet. Open the plan editor to drop the first one.
              </div>
            )}
            {floor.pins.map((p) => (
              <button key={p.id}
                className={"fp-pin-row" + (activeId === p.id ? " on" : "") + (hoverId === p.id ? " hov" : "")}
                onClick={() => setActiveId(p.id)}
                onMouseEnter={() => setHoverId(p.id)}
                onMouseLeave={() => setHoverId(null)}>
                <span className={"pin-dot " + p.runState} />
                <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
                  <div className="fp-row-label">
                    {p.label}
                    {p.lowBat && <span className="fp-row-lowbat" title="Low battery"><Icon name="alertTri" size={10} /></span>}
                  </div>
                  <div className="fp-row-note">{p.note}</div>
                </div>
                <span className="fp-row-id">{p.id}</span>
              </button>
            ))}
          </div>

          {gateways.length > 0 && (
            <React.Fragment>
              <div className="card-head fp-side-divider" style={{ borderTop:"1px solid var(--line)", borderBottom:"1px solid var(--line)" }}>
                <h3 style={{ fontSize:13 }}>Gateways</h3>
                <span className="sub">{gateways.length}</span>
              </div>
              <div className="fp-pin-list fp-gw-list">
                {gateways.map((g) => (
                  <button key={g.id}
                    className={"fp-pin-row" + (activeId === g.id ? " on" : "") + (hoverId === g.id ? " hov" : "")}
                    onClick={() => setActiveId(g.id)}
                    onMouseEnter={() => setHoverId(g.id)}
                    onMouseLeave={() => setHoverId(null)}>
                    <span className="pin-dot gateway" />
                    <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
                      <div className="fp-row-label">{g.label}</div>
                      <div className="fp-row-note">Hears {g.hangersHeard} hanger{g.hangersHeard === 1 ? "" : "s"} · signal {g.signal}/5</div>
                    </div>
                    <span className="fp-row-id">{g.id}</span>
                  </button>
                ))}
              </div>
            </React.Fragment>
          )}
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { FloorPlanView });

/* ════════════════════ asset_44_6aa8b35f.js ════════════════════ */
;
/* HazardLink — Devices view: the real setup hub for HazardLink hardware.

   Two device types:
   • GATEWAY  — mains-powered LoRa base station. Setup via Bluetooth pairing
                from the phone, then WiFi creds. Self-registers, comes online.
   • HANGER   — battery LoRa sensor that clips to a yellow wet-floor sign.
                Hall-effect sensor reports when the sign is lifted off its rack.
                Setup either by typing the DevEUI (BOR-format ID) or via
                Bluetooth "Discover nearby" from the phone.

   Devices are grouped by site/building. Each shows live status; gateways
   also show how many hangers they hear right now.

   Newly-added hangers are pushed into HL_LIVE so the Floor-plan editor can
   surface them as "Unplaced" pins to drop onto the building plan. */

function SignalBars({ signal }) {
  return (
    <div className="signal-bars" title={"Signal " + signal + "/5"}>
      {[1,2,3,4,5].map((n) => (
        <i key={n} className={signal >= n ? "on" : ""} style={{ height: 4 + n*2.2 }} />
      ))}
      <span className="signal-num">{signal === 0 ? "—" : signal + "/5"}</span>
    </div>
  );
}

function Battery({ pct }) {
  if (pct === null || pct === undefined) {
    return <span className="bat-mains"><Icon name="activity" size={12} />Mains powered</span>;
  }
  const tone = pct < 20 ? "var(--crit)" : pct < 40 ? "var(--warn)" : "var(--ok)";
  return (
    <div className="battery" title={pct + "%"}>
      <div className="bat-shell">
        <i style={{ width: Math.max(6, pct) + "%", background: tone }} />
      </div>
      <div className="bat-cap" />
      <span className="bat-num" style={{ color: tone }}>{pct}%</span>
    </div>
  );
}

/* Tiny mock OLED screen for the device detail panel — gateway version. */
function GatewayScreen({ name, hangersHeard, ssid, signal }) {
  return (
    <div className="dev-screen dev-screen-gw">
      <div className="dev-screen-glow" />
      <div className="dev-screen-content">
        <div className="ds-row ds-row-name">HZL // {name}</div>
        <div className="ds-row"><span>HANGERS</span><b>{hangersHeard} HEARD</b></div>
        <div className="ds-row"><span>WIFI</span><b>{ssid || "—"}</b></div>
        <div className="ds-row">
          <span>RSSI</span>
          <b>
            {[1,2,3,4,5].map((n) =>
              <span key={n} style={{ display: "inline-block", width: 5, height: 4 + n*2,
                marginRight: 2, background: signal >= n ? "#27d28a" : "rgba(255,255,255,.18)" }} />
            )}
          </b>
        </div>
        <div className="ds-row ds-row-ok"><span>•</span><b>ONLINE</b></div>
      </div>
    </div>
  );
}

/* Hanger screen */
function HangerScreen({ name, battery, signal, gateway, lifted }) {
  return (
    <div className="dev-screen dev-screen-hgr">
      <div className="dev-screen-glow" />
      <div className="dev-screen-content">
        <div className="ds-row ds-row-name">HZL // {name}</div>
        <div className="ds-row">
          <span>BATT</span>
          <b>
            <span style={{ display: "inline-block", width: 22, height: 8, border: "1px solid currentColor", borderRadius: 1, marginRight: 4, verticalAlign: "middle", position: "relative" }}>
              <span style={{ position: "absolute", inset: 1, width: Math.max(2, (battery || 0) / 5), background: "currentColor" }} />
            </span>
            {battery == null ? "—" : battery + "%"}
          </b>
        </div>
        <div className="ds-row"><span>SIGNAL</span><b>{signal === 0 ? "—" : signal + "/5"}</b></div>
        <div className="ds-row"><span>GW</span><b>{gateway || "—"}</b></div>
        <div className={"ds-row " + (lifted ? "ds-row-warn" : "ds-row-ok")}>
          <span>•</span><b>{lifted ? "LIFTED" : "ON RACK"}</b>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Add Gateway wizard — power on → Bluetooth → WiFi → registered
   ============================================================ */
function AddGatewayWizard({ onClose, onComplete }) {
  const [step, setStep] = React.useState(1);
  const [poweredOn, setPoweredOn] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [pickedBLE, setPickedBLE] = React.useState(null);
  const [building, setBuilding] = React.useState(HL.deviceBuildings[0] ? HL.deviceBuildings[0].name : "");
  const [room, setRoom] = React.useState("Plant room");
  const [ssid, setSsid] = React.useState("");
  const [wifiPwd, setWifiPwd] = React.useState("");
  const [connecting, setConnecting] = React.useState(false);

  /* Synthesize a BLE discovery list as soon as we hit step 2 */
  const bleCandidates = React.useMemo(() => ([]), []);

  React.useEffect(() => {
    if (step === 2 && poweredOn) {
      setScanning(true);
      const t = setTimeout(() => setScanning(false), 1200);
      return () => clearTimeout(t);
    }
  }, [step, poweredOn]);

  const newId = pickedBLE ? pickedBLE.id.replace("GW-NEW-", "GW-NEW-") : "GW-NEW-A4F2";

  const finish = () => {
    setConnecting(true);
    setTimeout(() => {
      const id = pickedBLE.id;
      const gateway = {
        id, type: "Gateway",
        room, building, site: building,
        ssid,
        online: true, battery: null, signal: 5,
        hangersHeard: 0, addedAt: "just now",
      };
      HL_LIVE.addGateway(gateway);
      onComplete(gateway);
    }, 1400);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal dev-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="monitor" size={18} /></div>
          <div>
            <h3>Add LoRa gateway</h3>
            <p>Mains-powered base station — pair from your phone, give it WiFi, it self-registers.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="dev-wizard-steps">
          {["Power on","Bluetooth","WiFi","Registered"].map((l, i) => {
            const n = i + 1;
            const cls = step === n ? "on" : step > n ? "done" : "";
            return (
              <div key={l} className={"dev-step " + cls}>
                <span className="dev-step-n">{step > n ? "✓" : n}</span>
                <span>{l}</span>
              </div>
            );
          })}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <React.Fragment>
              <div className="dev-step-h">Plug it in</div>
              <p className="dev-step-p">Plug the gateway into mains. The display lights up and the small LED on the front blinks <b>blue</b> while it waits to be paired. Confirm once that's happening.</p>
              <div className="dev-illus">
                <div className={"dev-led" + (poweredOn ? " on" : "")}>
                  <span className="dev-led-dot" />
                  <div className="dev-led-l">{poweredOn ? "LED solid green" : "LED blinking blue"}</div>
                </div>
                <button className={"btn " + (poweredOn ? "" : "btn-primary")}
                  onClick={() => setPoweredOn(true)}>
                  <Icon name={poweredOn ? "checkCircle" : "activity"} size={14} />
                  {poweredOn ? "Powered on" : "Confirm powered on"}
                </button>
              </div>
            </React.Fragment>
          )}

          {step === 2 && (
            <React.Fragment>
              <div className="dev-step-h">Connect over Bluetooth</div>
              <p className="dev-step-p">HazardLink will pair with the gateway over Bluetooth from this phone. The gateway is in pairing mode for 5 minutes after power-on.</p>
              {scanning && (
                <div className="dev-scan">
                  <div className="dev-scan-pulse"><Icon name="activity" size={16} /></div>
                  <div>
                    <b>Scanning nearby</b>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Looking for gateways within 5 m</div>
                  </div>
                </div>
              )}
              {!scanning && (
                <div className="dev-ble-list">
                  {bleCandidates.map((b) => (
                    <button key={b.id}
                      className={"dev-ble-row" + (pickedBLE && pickedBLE.id === b.id ? " on" : "")}
                      onClick={() => setPickedBLE(b)}>
                      <div className="dev-ble-ico"><Icon name="monitor" size={14} /></div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div className="dev-ble-name">{b.name}</div>
                        <div className="dev-ble-meta">{b.mac} · RSSI {b.rssi} dBm</div>
                      </div>
                      <div className="dev-ble-sig">{b.rssi > -50 ? "Strong" : b.rssi > -70 ? "Good" : "Weak"}</div>
                    </button>
                  ))}
                  <button className="dev-ble-rescan" onClick={() => setScanning(true)}>
                    <Icon name="activity" size={12} />Re-scan
                  </button>
                </div>
              )}
            </React.Fragment>
          )}

          {step === 3 && (
            <React.Fragment>
              <div className="dev-step-h">Enter site WiFi</div>
              <p className="dev-step-p">The gateway uses your site's WiFi to forward LoRa packets to the cloud. Once you save the credentials it joins the network and self-registers — no console work needed.</p>
              <div className="vm-grid">
                <div className="ai-field"><label>Site / building</label>
                  <select className="dv-input" value={building} onChange={(e) => setBuilding(e.target.value)}>
                    {HL.deviceBuildings.map((b) => <option key={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="ai-field"><label>Mounting location</label>
                  <input className="dv-input" value={room} onChange={(e) => setRoom(e.target.value)}
                    placeholder="e.g. Plant room, IT cupboard" />
                </div>
                <div className="ai-field"><label>WiFi network (SSID)</label>
                  <input className="dv-input" value={ssid} onChange={(e) => setSsid(e.target.value)}
                    placeholder="e.g. AVIVA-IoT" autoFocus />
                </div>
                <div className="ai-field"><label>Password</label>
                  <input className="dv-input" type="password" value={wifiPwd}
                    onChange={(e) => setWifiPwd(e.target.value)}
                    placeholder="WPA2 / WPA3" />
                </div>
              </div>
              <p style={{ marginTop: 14, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
                <Icon name="shield" size={11} /> Credentials are sent over the encrypted Bluetooth link and stored only on the gateway. HazardLink never sees them.
              </p>
            </React.Fragment>
          )}

          {step === 4 && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              {connecting ? (
                <React.Fragment>
                  <div className="mic-orb" style={{ width: 72, height: 72 }}><Icon name="activity" size={28} /></div>
                  <h3 style={{ margin: "16px 0 6px", fontSize: 17, fontFamily: "var(--font-head)" }}>Joining WiFi…</h3>
                  <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>Gateway is connecting to {ssid || "the network"} and self-registering.</p>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <div className="mic-orb" style={{ width: 72, height: 72, background: "var(--ok)" }}><Icon name="checkCircle" size={28} /></div>
                  <h3 style={{ margin: "16px 0 6px", fontSize: 17, fontFamily: "var(--font-head)" }}>Gateway online</h3>
                  <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 auto", maxWidth: 380, lineHeight: 1.55 }}>
                    {pickedBLE && pickedBLE.id} registered in {building} · waiting for first hanger to come into range.
                  </p>
                </React.Fragment>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step > 1 && step < 4 && (
            <button className="btn" onClick={() => setStep(step - 1)}>Back</button>
          )}
          {step === 1 && (
            <React.Fragment>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!poweredOn} style={{ opacity: poweredOn ? 1 : .5 }}
                onClick={() => setStep(2)}>
                Next: Bluetooth pair<Icon name="chevronRight" size={14} />
              </button>
            </React.Fragment>
          )}
          {step === 2 && (
            <button className="btn btn-primary" disabled={!pickedBLE || scanning}
              style={{ opacity: !pickedBLE || scanning ? .5 : 1 }}
              onClick={() => setStep(3)}>
              Next: site WiFi<Icon name="chevronRight" size={14} />
            </button>
          )}
          {step === 3 && (
            <button className="btn btn-primary" disabled={!ssid.trim()}
              style={{ opacity: ssid.trim() ? 1 : .5 }}
              onClick={() => { setStep(4); finish(); }}>
              <Icon name="send" size={14} />Send WiFi &amp; register
            </button>
          )}
          {step === 4 && !connecting && (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Add Hanger wizard — DevEUI or Discover nearby → assign → save
   ============================================================ */
function AddHangerWizard({ onClose, onComplete }) {
  const [step, setStep] = React.useState(1);
  const [mode, setMode] = React.useState(null); // "type" | "ble"
  const [devEUI, setDevEUI] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [picked, setPicked] = React.useState(null);
  const [building, setBuilding] = React.useState(HL.deviceBuildings[0] ? HL.deviceBuildings[0].name : "");
  const [floor, setFloor] = React.useState("Ground floor");
  const [zone, setZone] = React.useState("");

  const bleCandidates = React.useMemo(() => ([]), []);

  React.useEffect(() => {
    if (step === 2 && mode === "ble") {
      setScanning(true);
      const t = setTimeout(() => setScanning(false), 1400);
      return () => clearTimeout(t);
    }
  }, [step, mode]);

  const finish = () => {
    /* Build the hanger record. Use whichever id source was chosen. */
    const fullId = mode === "ble" ? picked.id : devEUI.trim();
    const shortId = mode === "ble" ? picked.short
      : ("HGR-" + (fullId.replace(/[^A-Z0-9]/gi, "").slice(-5).toUpperCase()));
    const gatewayId = HL_LIVE.gatewayForHanger(shortId, building);
    HL_LIVE.setHangerGateway(shortId, gatewayId);
    const hanger = {
      id: shortId,
      devEUI: fullId,
      type: "Hanger",
      site: building, building,
      floorLabel: floor,
      zone: zone || "Awaiting placement",
      battery: mode === "ble" ? picked.batt : 100,
      signal: 4,
      online: true,
      gateway: gatewayId,
      addedAt: "just now",
      placed: null,
    };
    HL_LIVE.addHanger(hanger);
    onComplete(hanger);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal dev-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="droplet" size={18} /></div>
          <div>
            <h3>Add hanger</h3>
            <p>Battery sensor that clips under a yellow wet-floor sign. Detects when the sign is lifted.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="dev-wizard-steps">
          {["Identify","Pick device","Assign","Saved"].map((l, i) => {
            const n = i + 1;
            const cls = step === n ? "on" : step > n ? "done" : "";
            return (
              <div key={l} className={"dev-step " + cls}>
                <span className="dev-step-n">{step > n ? "✓" : n}</span>
                <span>{l}</span>
              </div>
            );
          })}
        </div>

        <div className="modal-body">
          {step === 1 && (
            <React.Fragment>
              <div className="dev-step-h">How would you like to identify this hanger?</div>
              <div className="dev-mode-grid">
                <button className={"dev-mode" + (mode === "type" ? " on" : "")} onClick={() => setMode("type")}>
                  <div className="dev-mode-ico"><Icon name="edit" size={16} /></div>
                  <div className="dev-mode-l">Type DevEUI</div>
                  <div className="dev-mode-h">Punch in the BOR-format ID printed on the sticker. Useful when the hanger is already on the rack and you're sitting at a desk.</div>
                </button>
                <button className={"dev-mode" + (mode === "ble" ? " on" : "")} onClick={() => setMode("ble")}>
                  <div className="dev-mode-ico"><Icon name="activity" size={16} /></div>
                  <div className="dev-mode-l">Discover nearby</div>
                  <div className="dev-mode-h">Find any unprovisioned hanger within Bluetooth range of this phone — no typing. Best when you have the hanger in hand.</div>
                </button>
              </div>
            </React.Fragment>
          )}

          {step === 2 && mode === "type" && (
            <React.Fragment>
              <div className="dev-step-h">Enter the DevEUI</div>
              <p className="dev-step-p">Printed under the QR code on the back of the hanger. Format is BOR followed by 16 hex characters.</p>
              <div className="ai-field">
                <label>DevEUI</label>
                <input className="dv-input" autoFocus value={devEUI}
                  onChange={(e) => setDevEUI(e.target.value.toUpperCase())}
                  style={{ fontFamily: "var(--mono)", letterSpacing: ".05em" }}
                  placeholder="HGR-B0R-XXXX-XXXX-XXXX" />
                <div className="ai-hint" style={{ color: devEUI.length >= 12 ? "var(--ok)" : "var(--ink-3)" }}>
                  <Icon name={devEUI.length >= 12 ? "checkCircle" : "info"} size={11} />
                  {devEUI.length >= 12 ? "Looks valid" : "16 hex characters · prefix BOR"}
                </div>
              </div>
            </React.Fragment>
          )}

          {step === 2 && mode === "ble" && (
            <React.Fragment>
              <div className="dev-step-h">Discover nearby</div>
              <p className="dev-step-p">Hold a powered hanger close to your phone. Press its button once to put it in pairing mode — it'll appear in the list below.</p>
              {scanning ? (
                <div className="dev-scan">
                  <div className="dev-scan-pulse"><Icon name="activity" size={16} /></div>
                  <div>
                    <b>Scanning for unprovisioned hangers</b>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Bluetooth, within 5 m</div>
                  </div>
                </div>
              ) : (
                <div className="dev-ble-list">
                  {bleCandidates.map((b) => (
                    <button key={b.id}
                      className={"dev-ble-row" + (picked && picked.id === b.id ? " on" : "")}
                      onClick={() => setPicked(b)}>
                      <div className="dev-ble-ico"><Icon name="droplet" size={14} /></div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div className="dev-ble-name">{b.short}</div>
                        <div className="dev-ble-meta" style={{ fontFamily: "var(--mono)" }}>{b.id.slice(0, 20)}…</div>
                      </div>
                      <div className="dev-ble-sig">
                        <div style={{ fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>{b.batt}%</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>RSSI {b.rssi}</div>
                      </div>
                    </button>
                  ))}
                  <button className="dev-ble-rescan" onClick={() => setScanning(true)}>
                    <Icon name="activity" size={12} />Re-scan
                  </button>
                </div>
              )}
            </React.Fragment>
          )}

          {step === 3 && (
            <React.Fragment>
              <div className="dev-step-h">Assign to site, floor and zone</div>
              <p className="dev-step-p">Where does this hanger live? You can refine the exact spot on the floor plan after saving.</p>
              <div className="vm-grid">
                <div className="ai-field"><label>Site / building</label>
                  <select className="dv-input" value={building} onChange={(e) => setBuilding(e.target.value)}>
                    {HL.deviceBuildings.map((b) => <option key={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="ai-field"><label>Floor</label>
                  <select className="dv-input" value={floor} onChange={(e) => setFloor(e.target.value)}>
                    <option>Basement</option><option>Ground floor</option>
                    <option>Level 1</option><option>Level 2</option><option>Level 3</option>
                    <option>Roof</option>
                  </select>
                </div>
                <div className="ai-field" style={{ gridColumn: "span 2" }}>
                  <label>Zone label <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>(what staff will read on the plan)</span></label>
                  <input className="dv-input" value={zone} onChange={(e) => setZone(e.target.value)}
                    placeholder="e.g. Aisle 6, Reception lobby, Pool deck north" autoFocus />
                </div>
              </div>
              <div className="dev-gw-hint">
                <Icon name="info" size={12} />
                Will report through <b>{HL_LIVE.gatewayForHanger("preview-" + building, building)}</b>
                <span>(the nearest LoRa gateway in {building})</span>
              </div>
            </React.Fragment>
          )}

          {step === 4 && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div className="mic-orb" style={{ width: 72, height: 72, background: "var(--ok)" }}><Icon name="checkCircle" size={28} /></div>
              <h3 style={{ margin: "16px 0 6px", fontSize: 17, fontFamily: "var(--font-head)" }}>Hanger added</h3>
              <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 auto", maxWidth: 400, lineHeight: 1.55 }}>
                Saved to {building} · {floor}. It's now waiting as an <b>unplaced pin</b> in Floor plans — open the plan editor and drop it onto the spot where the sign lives.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step > 1 && step < 4 && (
            <button className="btn" onClick={() => setStep(step - 1)}>Back</button>
          )}
          {step === 1 && (
            <React.Fragment>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!mode} style={{ opacity: mode ? 1 : .5 }}
                onClick={() => setStep(2)}>Next<Icon name="chevronRight" size={14} /></button>
            </React.Fragment>
          )}
          {step === 2 && (
            <button className="btn btn-primary"
              disabled={mode === "type" ? devEUI.length < 12 : !picked}
              style={{ opacity: (mode === "type" ? devEUI.length >= 12 : !!picked) ? 1 : .5 }}
              onClick={() => setStep(3)}>Next<Icon name="chevronRight" size={14} /></button>
          )}
          {step === 3 && (
            <button className="btn btn-primary" disabled={!zone.trim()}
              style={{ opacity: zone.trim() ? 1 : .5 }}
              onClick={() => { setStep(4); finish(); }}>
              <Icon name="check" size={14} />Save hanger
            </button>
          )}
          {step === 4 && (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Map: hanger id → its sign state via floor-plan data
   ============================================================ */
const HGR_PIN_MAP = (() => {
  const m = {};
  HL.floorPlanSites.forEach((s) => s.floors.forEach((f) => f.pins.forEach((p) => { m[p.id] = p; })));
  return m;
})();
function signStateFor(d) {
  if (d.type !== "Hanger") return null;
  if (!d.online) return { dot:"offline",  label:"Sign offline" };
  const pin = HGR_PIN_MAP[d.id];
  if (pin && pin.state === "deployed") return { dot:"deployed", label:"Sign lifted" };
  return { dot:"cleared", label:"Sign on rack" };
}

/* ============================================================
   Main view
   ============================================================ */
function DevicesView() {
  const D = useSiteData();
  const live = useHLLive();
  const buildings = D.deviceBuildings;
  const [filter, setFilter]   = React.useState("All");
  const [wizardOpen, setWizardOpen] = React.useState(null); // "gateway" | "hanger"
  const [detail, setDetail]   = React.useState(null);
  const { showToast, toastNode } = useViewToast();

  /* Merge added devices into the per-building listing.
     Only show added devices whose building is currently visible. */
  const mergedBuildings = React.useMemo(() => {
    return buildings.map((b) => {
      const extras = [
        ...live.addedGateways.filter((g) => g.building === b.name),
        ...live.addedHangers .filter((h) => h.building === b.name),
      ];
      return { ...b, devices: [...extras, ...b.devices] };
    });
  }, [buildings, live.addedGateways.length, live.addedHangers.length]);

  const all = mergedBuildings.flatMap((b) => b.devices.map((d) => ({ ...d, _building: b.name })));
  const counts = {
    online:  all.filter((d) => d.online).length,
    offline: all.filter((d) => !d.online).length,
    lowBat:  all.filter((d) => d.battery !== null && d.battery !== undefined && d.battery < 20).length,
    flagged: all.filter((d) => (d.flags || []).length > 0).length,
    hgr:     all.filter((d) => d.type === "Hanger").length,
    gw:      all.filter((d) => d.type === "Gateway").length,
    unplaced: live.addedHangers.filter((h) => !h.placed).length,
  };

  const filterMatch = (d) => {
    switch (filter) {
      case "All":      return true;
      case "Hangers":  return d.type === "Hanger";
      case "Gateways": return d.type === "Gateway";
      case "Offline":  return !d.online;
      case "Flagged":  return (d.flags || []).length > 0;
      default: return true;
    }
  };

  const tabs = ["All", "Hangers", "Gateways", "Offline", "Flagged"];
  const grid = "1.5fr 120px 110px 140px 130px 130px";

  const onAdded = (kind, dev) => {
    showToast(kind === "gateway"
      ? `${dev.id} registered · ${dev.building} now has +1 gateway`
      : `${dev.id} added · drop it on the floor plan to finish`);
    setWizardOpen(null);
  };

  return (
    <div className="content-inner">
      {wizardOpen === "gateway" && (
        <AddGatewayWizard onClose={() => setWizardOpen(null)}
          onComplete={(g) => onAdded("gateway", g)} />
      )}
      {wizardOpen === "hanger" && (
        <AddHangerWizard onClose={() => setWizardOpen(null)}
          onComplete={(h) => onAdded("hanger", h)} />
      )}
      {detail && <DeviceDetailPanel device={detail} onClose={() => setDetail(null)} />}

      <div className="page-head">
        <div>
          <h1 className="page-title">Devices</h1>
          <p className="page-desc">
            The hardware behind HazardLink. Mains-powered <b>LoRa gateways</b> sit on each site and relay packets to the cloud;
            battery <b>hangers</b> clip under every yellow wet-floor sign and report when the sign is lifted off its rack.
            This is also where you set up new hardware.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setWizardOpen("gateway")}>
            <Icon name="monitor" size={15} />Add gateway
          </button>
          <button className="btn btn-primary" onClick={() => setWizardOpen("hanger")}>
            <Icon name="plus" size={15} />Add hanger
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("ok"), color: solid("ok") }}><Icon name="activity" size={16} /></div><span className="kpi-label">Devices online</span></div>
          <div className="kpi-val">{counts.online}<small>/{all.length}</small></div>
          <div className="kpi-foot">{counts.gw} gateways · {counts.hgr} hangers</div>
        </div>
        <div className="kpi" style={{ borderColor: counts.offline ? "var(--crit)" : "" }}>
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("crit"), color: solid("crit") }}><Icon name="alertCircle" size={16} /></div><span className="kpi-label">Offline</span></div>
          <div className="kpi-val" style={{ color: counts.offline ? "var(--crit)" : "" }}>{counts.offline}</div>
          <div className="kpi-foot">not seen for &gt;15 min</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("warn"), color: solid("warn") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Low battery</span></div>
          <div className="kpi-val" style={{ color: counts.lowBat ? "var(--warn)" : "" }}>{counts.lowBat}</div>
          <div className="kpi-foot">hangers below 20%</div>
        </div>
        <div className="kpi" style={{ borderColor: counts.unplaced ? "var(--accent)" : "" }}>
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("accent"), color: solid("accent") }}><Icon name="mapPin" size={16} /></div><span className="kpi-label">Unplaced hangers</span></div>
          <div className="kpi-val" style={{ color: counts.unplaced ? "var(--accent)" : "" }}>{counts.unplaced}</div>
          <div className="kpi-foot">drop onto floor plan</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {all.filter(filterMatch).length} of {all.length} devices
        </div>
      </div>

      {mergedBuildings.map((b) => {
        const rows = b.devices.filter(filterMatch);
        if (rows.length === 0) return null;
        const onlineCount = b.devices.filter((d) => d.online).length;
        const buildingHangers = b.devices.filter((d) => d.type === "Hanger").length;
        const buildingGateways = b.devices.filter((d) => d.type === "Gateway");
        return (
          <div key={b.id} className="card" style={{ marginBottom:14 }}>
            <div className="card-head">
              <Icon name="mapPin" size={14} />
              <h3 style={{ margin:0 }}>{b.name}</h3>
              <span className="sub">{onlineCount}/{b.devices.length} online</span>
              <span className="head-act">
                <Pill tone="muted">{buildingHangers} hangers · {buildingGateways.length} gateways</Pill>
              </span>
            </div>

            <div className="wo-head dv-head" style={{ gridTemplateColumns:grid }}>
              <div>Device</div><div>Type</div><div>Status</div><div>Battery</div><div>Signal</div><div>Last seen</div>
            </div>

            {rows.map((d) => {
              const signState = signStateFor(d);
              const isAdded = d.addedAt === "just now" || live.addedHangers.find((h) => h.id === d.id) || live.addedGateways.find((g) => g.id === d.id);
              const unplaced = d.type === "Hanger" && live.addedHangers.find((h) => h.id === d.id && !h.placed);
              const heard = d.type === "Gateway" ? HL_LIVE.hangersHeardBy(d.id, b.name) : null;
              const reportsThrough = d.type === "Hanger" ? HL_LIVE.gatewayForHanger(d.id, b.name) : null;
              return (
              <div className="dv-row" key={d.id} style={{ gridTemplateColumns:grid, cursor:"pointer" }} onClick={() => setDetail({ ...d, _building: b.name, _heard: heard, _reportsThrough: reportsThrough })}>
                <div className="dv-cell-dev">
                  <span className={"dv-ico dv-" + d.type.toLowerCase()}>
                    <Icon name={d.type === "Gateway" ? "monitor" : "droplet"} size={14} />
                  </span>
                  <div style={{ minWidth:0 }}>
                    <div className="dv-id">{d.id}
                      {isAdded && <span className="dv-new-pill">NEW</span>}
                    </div>
                    <div className="dv-where">{d.room || d.zone || "—"}</div>
                    <div className="dv-hw">
                      {d.type === "Gateway"
                        ? <React.Fragment>Mains LoRa gateway · {d.ssid ? <span style={{ fontFamily: "var(--mono)" }}>{d.ssid}</span> : "site WiFi"}</React.Fragment>
                        : <React.Fragment>Heltec ESP32 · Hall-effect sensor{reportsThrough && <span> · via <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)" }}>{reportsThrough}</b></span>}</React.Fragment>}
                    </div>
                    {(d.flags || []).length > 0 && (
                      <div className="dv-flags">
                        {d.flags.map((f) => (
                          <Pill key={f} tone={f.startsWith("Anti-theft") ? "crit" : f === "Low battery" ? "warn" : "muted"} dot>{f}</Pill>
                        ))}
                      </div>
                    )}
                    {unplaced && (
                      <div className="dv-flags">
                        <Pill tone="accent" dot>Unplaced — drop on plan</Pill>
                      </div>
                    )}
                  </div>
                </div>
                <div className="dv-type-cell">
                  {d.type}
                  {d.type === "Hanger" && signState && (
                    <div className="dv-sign-state">
                      <span className={"pin-dot " + signState.dot} />{signState.label}
                    </div>
                  )}
                  {d.type === "Gateway" && heard != null && (
                    <div className="dv-sign-state">
                      <Icon name="activity" size={11} />{heard} hangers heard
                    </div>
                  )}
                </div>
                <div>
                  <Pill tone={d.online ? "ok" : "crit"} dot>{d.online ? "Online" : "Offline"}</Pill>
                </div>
                <div><Battery pct={d.battery} /></div>
                <div><SignalBars signal={d.signal} /></div>
                <div className="dv-last">{d.lastSeen || d.addedAt || "—"}</div>
              </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Device detail panel — now shows a mocked OLED screen
   ============================================================ */
function DeviceDetailPanel({ device, onClose }) {
  const d = device;
  const isGW = d.type === "Gateway";
  const lifted = !isGW && (HGR_PIN_MAP[d.id] && HGR_PIN_MAP[d.id].state === "deployed");
  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg(isGW ? "secure" : "clean"), color:solid(isGW ? "secure" : "clean"), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name={isGW ? "monitor" : "droplet"} size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{d.id}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{d.type} · {d.room || d.zone || "—"} · {d._building || d.building}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
            <Pill tone={d.online ? "ok" : "crit"} dot>{d.online ? "Online" : "Offline"}</Pill>
            {(d.flags || []).map((f) => (
              <Pill key={f} tone={f.startsWith("Anti-theft") ? "crit" : "warn"} dot>{f}</Pill>
            ))}
          </div>

          {/* OLED screen */}
          {isGW
            ? <GatewayScreen name={d.id} hangersHeard={d._heard != null ? d._heard : 0} ssid={d.ssid || "Site WiFi"} signal={d.signal} />
            : <HangerScreen name={d.id} battery={d.battery} signal={d.signal} gateway={d._reportsThrough || d.gateway} lifted={lifted} />}

          <div style={{ marginTop: 14 }}>
            <div className="info-row"><span className="k">Battery</span><span className="v"><Battery pct={d.battery} /></span></div>
            <div className="info-row"><span className="k">Signal</span><span className="v"><SignalBars signal={d.signal} /></span></div>
            {isGW
              ? <React.Fragment>
                  <div className="info-row"><span className="k">WiFi network</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{d.ssid || "—"}</span></div>
                  <div className="info-row"><span className="k">Hangers heard</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{d._heard != null ? d._heard : "—"}</span></div>
                </React.Fragment>
              : <React.Fragment>
                  <div className="info-row"><span className="k">Reports through</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{d._reportsThrough || d.gateway || "—"}</span></div>
                  <div className="info-row"><span className="k">DevEUI</span><span className="v" style={{ fontFamily:"var(--mono)", fontSize: 11.5 }}>{d.devEUI || "BOR-" + d.id.replace("HGR-","")}</span></div>
                </React.Fragment>}
            <div className="info-row"><span className="k">Last seen</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{d.lastSeen || d.addedAt || "—"}</span></div>
            <div className="info-row" style={{ borderBottom:"none" }}><span className="k">Type</span><span className="v">{d.type}</span></div>
          </div>

          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            <button className="btn" style={{ flex:1 }} onClick={onClose}><Icon name="mapPin" size={15} />Locate on plan</button>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={onClose}><Icon name="send" size={15} />Send heartbeat</button>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

Object.assign(window, { DevicesView, DeviceDetailPanel });

/* ════════════════════ asset_37_8ef74e9e.js ════════════════════ */
;
/* HazardLink — Maintenance list + Work order detail */

function Step({ s }) {
  const ico = s.state === "done" ? "check" : s.state === "active" ? "clock" : null;
  return (
    <div className={"step " + s.state}>
      <div className="step-rail">
        <div className="step-dot">
          {ico
            ? <Icon name={ico} size={13} />
            : <span style={{ width:6, height:6, borderRadius:"50%", background:"currentColor" }} />
          }
        </div>
        <div className="step-line" />
      </div>
      <div className="step-body">
        <div className="step-title">{s.title}</div>
        {s.by   && <div className="step-by">{s.by}</div>}
        {s.time && <div className="step-time">{s.time}</div>}
      </div>
    </div>
  );
}

function Quote({ q }) {
  return (
    <div className={"quote" + (q.best ? " best" : "")}>
      {q.best && <span className="quote-rank">Best value · {q.value}</span>}
      <div className="quote-top">
        <div className="quote-name">{q.name}<small>{q.note}</small></div>
        <div className="quote-price">{q.price}</div>
      </div>
      <div className="quote-bars">
        {q.bars.map((b, i) => (
          <div key={i}>
            <div className="qbar-l"><span>{b.l}</span><b>{b.v}</b></div>
            <div className="qbar"><i style={{ width: b.v + "%" }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Maintenance({ go, workOrders, openWO, flashId, onCreate }) {
  const D = useSiteData();
  const { site } = React.useContext(SiteContext);
  const visibleIds = new Set(D.workOrders.map((w) => w.id));
  const scoped = site ? workOrders.filter((w) => visibleIds.has(w.id)) : workOrders;
  const [filter, setFilter]     = React.useState("All");
  const [viewMode, setViewMode] = React.useState("list");
  const tabs = ["All", "Open", "In progress", "Tendering", "Done"];
  const rows = scoped.filter((w) => filter === "All" ? true : w.status === filter);

  // board: map Scheduled -> In progress so it appears in that column
  const boardItems = scoped.map((w) => ({
    ...w, boardStatus: w.status === "Scheduled" ? "In progress" : w.status,
  }));
  const kanbanCols = [
    { id:"Open",        label:"Logged",       tone:"muted" },
    { id:"In progress", label:"In progress",  tone:"accent" },
    { id:"Tendering",   label:"Tendering",    tone:"warn" },
    { id:"Done",        label:"Done",          tone:"ok" },
  ];

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Maintenance</h1>
          <p className="page-desc">From a logged fault to a finished, costed job — with contractors built into the flow.</p>
        </div>
        <button className="btn btn-primary" onClick={onCreate}><Icon name="plus" size={15} />New work order</button>
      </div>

      <div className="toolbar">
        {viewMode === "list" && (
          <div className="seg">
            {tabs.map((t) => (
              <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
            ))}
          </div>
        )}
        <div style={{ marginLeft:"auto", display:"flex", gap:10, alignItems:"center" }}>
          <div className="vm-seg">
            <button className={"vm-btn" + (viewMode === "list"  ? " on" : "")} onClick={() => setViewMode("list")}>
              <Icon name="layers" size={14} />List
            </button>
            <button className={"vm-btn" + (viewMode === "board" ? " on" : "")} onClick={() => setViewMode("board")}>
              <Icon name="grid" size={14} />Board
            </button>
          </div>
          {viewMode === "list" && (
            <div style={{ fontSize:13, color:"var(--ink-3)" }}>{rows.length} work orders</div>
          )}
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="card wo-table">
          <div className="wo-head">
            <div>ID</div><div>Work order</div><div>Site</div><div>Assignee</div><div>Status</div><div>Priority</div>
          </div>
          {rows.map((w) => (
            <div className={"wo-row" + (w.id === flashId ? " flash" : "")} key={w.id} onClick={() => openWO(w.id)}>
              <div className="wo-id">{w.id}</div>
              <div className="wo-title">{w.title}<small>{w.asset} · via {w.source}</small></div>
              <div className="wo-site">{w.site}</div>
              <div className="wo-assignee"><span className="wo-mini-av">{w.initials}</span>{w.assignee}</div>
              <div><Pill tone={w.statusTone} dot>{w.status}</Pill></div>
              <div><PriorityPill p={w.priority} /></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban">
          {kanbanCols.map((col) => {
            const cards = boardItems.filter((w) => w.boardStatus === col.id);
            return (
              <div className="kanban-col" key={col.id}>
                <div className="kanban-head">
                  <span>{col.label}</span>
                  <Pill tone={col.tone}>{cards.length}</Pill>
                </div>
                <div className="kanban-cards">
                  {cards.length === 0 && (
                    <div style={{ padding:"18px 12px", textAlign:"center", color:"var(--ink-3)", fontSize:12 }}>None</div>
                  )}
                  {cards.map((w) => (
                    <div className={"kanban-card" + (w.id === flashId ? " flash" : "")} key={w.id} onClick={() => openWO(w.id)}>
                      <div className="kc-id">{w.id}</div>
                      <div className="kc-title">{w.title}</div>
                      <div className="kc-foot">
                        <PriorityPill p={w.priority} />
                        <span className="kc-av" title={w.assignee}>{w.initials}</span>
                        <span className="kc-site">{w.site.split(" ")[0]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkOrder({ go }) {
  const _wo = HL.woDetail || {};
  const w = {
    id:"", title:"", priority:"", site:"", desc:"", scope:"", sla:"",
    scopeBullets:[], quotes:[], steps:[],
    ...(_wo),
    asset:    { name:"", id:"", make:"", health:0, ...(_wo.asset || {}) },
    reporter: { initials:"", name:"", role:"", ...(_wo.reporter || {}) },
  };
  const [assigned, setAssigned] = React.useState(false);

  return (
    <div className="content-inner">
      <button className="back-link" onClick={() => go("maintenance")}>
        <Icon name="arrowLeft" size={16} />Back to maintenance
      </button>

      <div className="wo-detail-head">
        <div style={{ flex:1 }}>
          <div className="wo-num">{w.id}</div>
          <h1>{w.title}</h1>
          <div className="tags">
            <Pill tone="maint" icon="wrench">Maintenance</Pill>
            <PriorityPill p={w.priority} />
            <Pill tone={assigned ? "ok" : "accent"} dot>{assigned ? "Assigned" : "In progress"}</Pill>
            <Pill tone="muted" icon="mapPin">{w.site}</Pill>
          </div>
        </div>
        {!assigned && (
          <button className="btn btn-primary" onClick={() => setAssigned(true)}>
            <Icon name="check" size={15} />Assign contractor
          </button>
        )}
        {assigned && <Pill tone="ok" icon="checkCircle">Contractor assigned</Pill>}
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="card card-pad">
            <p style={{ margin:0, fontSize:14.5, lineHeight:1.6, color:"var(--ink-2)" }}>{w.desc}</p>
          </div>

          <div className="ai-scope">
            <div className="ai-scope-head">
              <Icon name="sparkles" size={17} />
              <b>AI-drafted scope of works</b>
              <span className="tag">from asset history</span>
            </div>
            <p>{w.scope}</p>
            <ul>{w.scopeBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Contractor quotes</h3>
              <span className="sub">Ranked on value, not just price</span>
              <span className="head-act"><Pill tone="ok" dot>{w.quotes.length} received</Pill></span>
            </div>
            <div className="card-pad">
              {w.quotes.map((q, i) => <Quote q={q} key={i} />)}
            </div>
          </div>
        </div>

        <div className="detail-side">
          <div className="card">
            <div className="card-head"><h3>Lifecycle</h3></div>
            <div className="card-pad">
              <div className="stepper">{w.steps.map((s, i) => <Step s={s} key={i} />)}</div>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em", color:"var(--ink-3)", marginBottom:12 }}>Asset</div>
            <div className="asset-card">
              <div className="asset-thumb"><Icon name="box" size={22} /></div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>{w.asset.name}</div>
                <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{w.asset.id} · {w.asset.make}</div>
              </div>
            </div>
            <div style={{ marginTop:14 }}>
              <div className="qbar-l" style={{ fontSize:11 }}><span>Asset health</span><b>{w.asset.health}%</b></div>
              <div className="qbar"><i style={{ width: w.asset.health + "%", background:"var(--warn)" }} /></div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="info-row"><span className="k">Reported by</span>
              <span className="v" style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span className="wo-mini-av">{w.reporter.initials}</span>{w.reporter.name} · {w.reporter.role}
              </span>
            </div>
            <div className="info-row"><span className="k">SLA</span><span className="v" style={{ color:"var(--warn)" }}>{w.sla}</span></div>
            <div className="info-row"><span className="k">Site</span><span className="v">{w.site}</span></div>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em", color:"var(--ink-3)", marginBottom:11 }}>Photo proof</div>
            <div className="proof-grid">
              {[].map((p, i) => (
                <div className="proof" key={i}>
                  <span className="pcam"><Icon name="camera" size={15} /></span>
                  <span className="plabel">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Step, Maintenance, WorkOrder });

/* ════════════════════ asset_17_54494e3b.js ════════════════════ */
;
/* HazardLink — Maintenance overview (reliability KPIs + small charts) */

function _maintTone(v) {
  return v >= 90 ? "var(--ok)" : v >= 80 ? "var(--warn)" : "var(--crit)";
}

function MaintenanceOverview({ go }) {
  const m = HL.maintenanceMetrics || {};
  const hasData = (m.upcoming && m.upcoming.length) || (m.bySite && m.bySite.length) ||
                  (m.backlogPriority && m.backlogPriority.length) || !!(m.backlog && m.backlog.v);

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Maintenance overview</h1>
          <p className="page-desc">Reliability across every site at a glance — planned versus reactive, mean time to repair, and what's coming up next.</p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn" onClick={() => go("ppm")}><Icon name="clock" size={15} />PPM schedule</button>
          <button className="btn btn-primary" onClick={() => go("maintenance")}>
            <Icon name="wrench" size={15} />Open work orders
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="card" style={{ textAlign:"center", padding:"48px 24px" }}>
          <div style={{ fontWeight:700, color:"var(--ink-2)", marginBottom:6 }}>No maintenance data yet</div>
          <div style={{ fontSize:13.5, color:"var(--ink-3)" }}>Reliability KPIs and charts appear here once work orders and PPMs start flowing.</div>
        </div>
      ) : (
      <React.Fragment>
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div>
            <span className="kpi-label">PM compliance</span>
          </div>
          <div className="kpi-val">{m.pmCompliance.v}<small>%</small></div>
          <div className="kpi-foot">
            <span className={"trend " + (m.pmCompliance.up ? "trend-up" : "trend-down")}>
              <Icon name={m.pmCompliance.up ? "trendUp" : "trendDown"} size={13} />{m.pmCompliance.trend}
            </span>
            {m.pmCompliance.foot}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="clock" size={16} /></div>
            <span className="kpi-label">Mean time to repair</span>
          </div>
          <div className="kpi-val">{m.mttr.v}<small>{m.mttr.unit}</small></div>
          <div className="kpi-foot">
            <span className={"trend " + (m.mttr.up ? "trend-up" : "trend-down")}>
              <Icon name={m.mttr.up ? "trendUp" : "trendDown"} size={13} />{m.mttr.trend}
            </span>
            {m.mttr.foot}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("maint"), color:solid("maint") }}><Icon name="wrench" size={16} /></div>
            <span className="kpi-label">Open backlog</span>
          </div>
          <div className="kpi-val">{m.backlog.v}</div>
          <div className="kpi-foot">
            <span className={"trend " + (m.backlog.up ? "trend-up" : "trend-down")}>
              <Icon name={m.backlog.up ? "trendUp" : "trendDown"} size={13} />{m.backlog.trend}
            </span>
            {m.backlog.foot}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("secure"), color:solid("secure") }}><Icon name="layers" size={16} /></div>
            <span className="kpi-label">Planned share</span>
          </div>
          <div className="kpi-val">{m.plannedShare.v}<small>{m.plannedShare.unit}</small></div>
          <div className="kpi-foot">
            <span className={"trend " + (m.plannedShare.up ? "trend-up" : "trend-down")}>
              <Icon name={m.plannedShare.up ? "trendUp" : "trendDown"} size={13} />{m.plannedShare.trend}
            </span>
            {m.plannedShare.foot}
          </div>
        </div>
      </div>

      <div className="report-grid">
        <div className="card chart-card">
          <div className="chart-title">PM compliance by site</div>
          <div className="chart-sub">Planned tasks completed on time this month</div>
          <HorizBars data={m.bySite} color="var(--ok)" max={100} />
        </div>

        <div className="card chart-card">
          <div className="chart-title">Mean time to repair</div>
          <div className="chart-sub">Average calendar days from fault logged to work order closed</div>
          <LineSparkline data={m.mttrMonths} color="var(--accent)" />
        </div>

        <div className="card chart-card">
          <div className="chart-title">Planned vs reactive</div>
          <div className="chart-sub">Share of work orders raised this month</div>
          <div className="pvr-bar" title={m.plannedShare.v + "% planned · " + (100 - m.plannedShare.v) + "% reactive"}>
            <div className="pvr-seg pvr-planned"  style={{ flex: m.plannedShare.v }}>
              <span className="pvr-l">Planned</span>
              <span className="pvr-n">{m.plannedShare.v}%</span>
            </div>
            <div className="pvr-seg pvr-reactive" style={{ flex: 100 - m.plannedShare.v }}>
              <span className="pvr-l">Reactive</span>
              <span className="pvr-n">{100 - m.plannedShare.v}%</span>
            </div>
          </div>
          <div className="pvr-foot">
            <span className="pvr-key pvr-planned" />Planned (PPM, condition-based)
            <span className="pvr-key pvr-reactive" />Reactive (faults, spills, callouts)
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-title">Open backlog</div>
          <div className="chart-sub">By priority and by age</div>
          <div className="mb-block-label">Priority</div>
          <div className="bar-group">
            {m.backlogPriority.map((b) => (
              <div className="bar-row" key={b.l}>
                <div style={{ fontSize:12.5, color:"var(--ink-2)" }}>{b.l}</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width:(b.v / 11 * 100) + "%", background: solid(b.tone) }} />
                </div>
                <div className="bar-num">{b.v}</div>
              </div>
            ))}
          </div>
          <div className="mb-block-label" style={{ marginTop:16 }}>Age</div>
          <div className="bar-group">
            {m.backlogAge.map((b) => (
              <div className="bar-row" key={b.l}>
                <div style={{ fontSize:12.5, color:"var(--ink-2)" }}>{b.l}</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width:(b.v / 14 * 100) + "%", background: solid(b.tone) }} />
                </div>
                <div className="bar-num">{b.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop:16 }}>
        <div className="card-head">
          <h3>Up next</h3>
          <span className="sub">Three nearest PPMs</span>
          <button className="btn btn-ghost btn-sm head-act" onClick={() => go("ppm")}>
            See full schedule<Icon name="chevronRight" size={14} />
          </button>
        </div>
        {m.upcoming.map((t) => (
          <div className="wo-row" key={t.id} style={{ gridTemplateColumns:"100px 1fr 200px 150px 110px" }} onClick={() => go("ppm")}>
            <div className="wo-id">{t.id}</div>
            <div className="wo-title">{t.title}<small>{t.site}</small></div>
            <div style={{ fontSize:13, color:"var(--ink-2)" }}>{t.assignee}</div>
            <div style={{ fontSize:12.5, color:"var(--ink-3)", fontFamily:"var(--mono)" }}>{t.due}</div>
            <div><Pill tone="muted" dot>Scheduled</Pill></div>
          </div>
        ))}
      </div>
      </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { MaintenanceOverview });

/* ════════════════════ asset_43_7a7799a9.js ════════════════════ */
;
/* HazardLink — PPM schedule (planned preventive maintenance) */

const PPM_BUCKETS = [
  { id:"overdue",   label:"Overdue",           sub:"Past due — attend now",    tone:"crit" },
  { id:"this-week", label:"Due this week",     sub:"Next 7 days",               tone:"warn" },
  { id:"next-14",   label:"In the next 14 days", sub:"Plan for the next sprint", tone:"accent" },
  { id:"later",     label:"Later",              sub:"On the longer-term roster", tone:"muted" },
];

function PPMView() {
  const D = useSiteData();
  const [filter, setFilter] = React.useState("All");
  const [addOpen, setAddOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const all = D.ppmTasks;

  const counts = {
    overdue:   all.filter((t) => t.status === "overdue").length,
    dueSoon:   all.filter((t) => t.status === "due-soon" || t.bucket === "this-week").length,
    inProg:    all.filter((t) => t.status === "in-progress").length,
    scheduled: all.filter((t) => t.status === "scheduled").length,
  };
  const tabs = ["All", "Overdue", "Due this week", "In progress", "Later"];

  const filterFn = (t) => {
    if (filter === "All")            return true;
    if (filter === "Overdue")         return t.bucket === "overdue";
    if (filter === "Due this week")   return t.bucket === "this-week";
    if (filter === "In progress")     return t.status === "in-progress";
    if (filter === "Later")           return t.bucket === "next-14" || t.bucket === "later";
    return true;
  };
  const shown = all.filter(filterFn);

  const grid = "92px 1fr 170px 130px 130px 130px";

  const statusPill = (t) => {
    if (t.status === "overdue")     return <Pill tone="crit" dot>Overdue</Pill>;
    if (t.status === "in-progress") return <Pill tone="accent" dot>In progress</Pill>;
    if (t.status === "due-soon")    return <Pill tone="warn" dot>Due soon</Pill>;
    return <Pill tone="muted" dot>Scheduled</Pill>;
  };

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">PPM schedule</h1>
          <p className="page-desc">Every planned preventive maintenance task across all sites — what's due, when, and who's attending.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} />New PPM task</button>
      </div>

      {addOpen && (
        <SimpleAddModal
          title="New PPM task"
          subtitle="Schedule a planned preventive maintenance task and assign an attendee."
          icon="clock"
          submitLabel="Create PPM" submitIcon="check"
          successTitle="PPM scheduled"
          successCopy="The task is on the schedule and will appear on the assignee's mobile when due."
          fields={[
            { id:"name",      label:"Task name",  placeholder:"e.g. Quarterly HVAC service" },
            { id:"asset",     label:"Asset",       type:"select", options:HL.assets.map((a) => a.name) },
            { id:"frequency", label:"Frequency",   type:"select", options:["Weekly","Fortnightly","Monthly","Bi-monthly","Quarterly","Half-yearly","Annually"], default:"Quarterly" },
            { id:"next",      label:"First due",   placeholder:"e.g. in 14 days, 22 Jun 2026" },
            { id:"assignee",  label:"Assignee",    type:"select", options:HL.contractors.map((c) => c.name).concat(["In-house team"]) },
          ]}
          onClose={() => setAddOpen(false)} />
      )}
      {detail && <PPMDetailPanel task={detail} onClose={() => setDetail(null)} />}

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Overdue</span></div>
          <div className="kpi-val" style={{ color: counts.overdue ? "var(--crit)" : "var(--ok)" }}>{counts.overdue}</div>
          <div className="kpi-foot">past due, attend now</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Due this week</span></div>
          <div className="kpi-val">{counts.dueSoon}</div>
          <div className="kpi-foot">in the next 7 days</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="activity" size={16} /></div><span className="kpi-label">In progress</span></div>
          <div className="kpi-val">{counts.inProg}</div>
          <div className="kpi-foot">attending today</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">Scheduled</span></div>
          <div className="kpi-val">{counts.scheduled}</div>
          <div className="kpi-foot">further out</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {shown.length} of {all.length} tasks
        </div>
      </div>

      {PPM_BUCKETS.map((b) => {
        const rows = shown.filter((t) => t.bucket === b.id);
        if (rows.length === 0) return null;
        return (
          <div key={b.id} className="card" style={{ marginBottom:14 }}>
            <div className="card-head">
              <div className={"bucket-ico bucket-" + b.tone}>
                <Icon name={b.id === "overdue" ? "alertTri" : "clock"} size={14} />
              </div>
              <div>
                <h3 style={{ margin:0 }}>{b.label}</h3>
                <div className="sub">{b.sub}</div>
              </div>
              <span className="head-act"><Pill tone={b.tone}>{`${rows.length} task${rows.length !== 1 ? "s" : ""}`}</Pill></span>
            </div>
            <div className="wo-head" style={{ gridTemplateColumns:grid }}>
              <div>ID</div>
              <div>Task</div>
              <div>Frequency</div>
              <div>Next due</div>
              <div>Assignee</div>
              <div>Status</div>
            </div>
            {rows.map((t) => (
              <div className="wo-row" key={t.id} style={{ gridTemplateColumns:grid }} onClick={() => setDetail(t)}>
                <div className="wo-id">{t.id}</div>
                <div className="wo-title">{t.name}<small>{t.asset} · {t.site}</small></div>
                <div style={{ fontSize:13, color:"var(--ink-2)" }}>
                  {t.frequency}
                  <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2 }}>est. {t.duration}</div>
                </div>
                <div style={{ fontSize:12.5, color: t.status === "overdue" ? "var(--crit)" : t.status === "in-progress" ? "var(--accent)" : "var(--ink-3)", fontFamily:"var(--mono)", fontWeight:600 }}>{t.nextDue}</div>
                <div className="wo-assignee"><span className="wo-mini-av">{t.initials}</span>{t.assignee}</div>
                <div>{statusPill(t)}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { PPMView });

function PPMDetailPanel({ task, onClose }) {
  const tone  = task.status === "overdue" ? "crit" : task.status === "in-progress" ? "accent" : task.status === "due-soon" ? "warn" : "muted";
  const label = task.status === "overdue" ? "Overdue" : task.status === "in-progress" ? "In progress" : task.status === "due-soon" ? "Due soon" : "Scheduled";
  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg("maint"), color:solid("maint"), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name="clock" size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{task.name}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{task.id} · {task.site}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
            <Pill tone={tone} dot>{label}</Pill>
            <Pill tone="muted">{task.frequency}</Pill>
            <Pill tone="muted" icon="clock">{`Est. ${task.duration}`}</Pill>
          </div>
          <div className="info-row"><span className="k">Asset</span><span className="v">{task.asset}</span></div>
          <div className="info-row"><span className="k">Site</span><span className="v">{task.site}</span></div>
          <div className="info-row"><span className="k">Next due</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{task.nextDue}</span></div>
          <div className="info-row"><span className="k">Last done</span><span className="v">{task.lastDone}</span></div>
          <div className="info-row" style={{ borderBottom:"none" }}><span className="k">Assignee</span>
            <span className="v" style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span className="wo-mini-av">{task.initials}</span>{task.assignee}
            </span>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            <button className="btn" style={{ flex:1 }} onClick={onClose}><Icon name="send" size={15} />Reassign</button>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={onClose}><Icon name="check" size={15} />Mark complete</button>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

Object.assign(window, { PPMDetailPanel });

/* ════════════════════ asset_49_26b2ed36.js ════════════════════ */
;
/* HazardLink — Meters (asset meter readings) */

function MetersView() {
  const D = useSiteData();
  const [filter, setFilter] = React.useState("All");
  const [logOpen, setLogOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(null);
  const all = D.meters;

  const counts = {
    total:     all.length,
    overdue:   all.filter((m) => m.status === "overdue").length,
    dueSoon:   all.filter((m) => m.status === "due-soon").length,
    onTrack:   all.filter((m) => m.status === "on-schedule").length,
  };
  const tabs = ["All", "Overdue", "Due soon", "On schedule"];
  const filterFn = (m) => {
    if (filter === "All")           return true;
    if (filter === "Overdue")        return m.status === "overdue";
    if (filter === "Due soon")       return m.status === "due-soon";
    if (filter === "On schedule")    return m.status === "on-schedule";
    return true;
  };

  const grid = "1.5fr 150px 160px 130px 140px 110px";
  const rows = all.filter(filterFn);

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Meters</h1>
          <p className="page-desc">Run hours, cycle counts and self-test passes for every monitored asset. Readings drive condition-based PPMs and warranty claims.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setLogOpen(true)}><Icon name="plus" size={15} />Log reading</button>
      </div>

      {logOpen && (
        <SimpleAddModal
          title="Log meter reading"
          subtitle="Record the latest run hours, cycle count or self-test pass."
          icon="activity"
          submitLabel="Save reading" submitIcon="check"
          successTitle="Reading saved"
          successCopy="The next-due date has been recalculated from the new figure."
          fields={[
            { id:"asset",   label:"Asset",   type:"select", options:HL.meters.map((m) => m.asset) },
            { id:"reading", label:"Reading", placeholder:"e.g. 14,820" },
            { id:"taken",   label:"Taken on",default:"Today" },
            { id:"by",      label:"Recorded by", default:"You" },
          ]}
          onClose={() => setLogOpen(false)} />
      )}
      {detail && <MeterDetailPanel meter={detail} onClose={() => setDetail(null)} />}

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("muted"), color:solid("muted") }}><Icon name="activity" size={16} /></div><span className="kpi-label">Meters tracked</span></div>
          <div className="kpi-val">{counts.total}</div>
          <div className="kpi-foot">across all assets</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertCircle" size={16} /></div><span className="kpi-label">Overdue reads</span></div>
          <div className="kpi-val" style={{ color: counts.overdue ? "var(--crit)" : "var(--ok)" }}>{counts.overdue}</div>
          <div className="kpi-foot">past due date</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Due this week</span></div>
          <div className="kpi-val">{counts.dueSoon}</div>
          <div className="kpi-foot">scheduled in next 7 days</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">On schedule</span></div>
          <div className="kpi-val">{counts.onTrack}</div>
          <div className="kpi-foot">read on time</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {rows.length} of {all.length} meters
        </div>
      </div>

      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:grid }}>
          <div>Asset</div>
          <div>Meter</div>
          <div>Latest reading</div>
          <div>Last read</div>
          <div>Next due</div>
          <div>Status</div>
        </div>
        {rows.map((m) => {
          const tone = m.status === "overdue" ? "crit" : m.status === "due-soon" ? "warn" : "ok";
          const label = m.status === "overdue" ? "Overdue" : m.status === "due-soon" ? "Due soon" : "On schedule";
          return (
            <div className="wo-row" key={m.id} style={{ gridTemplateColumns:grid }} onClick={() => setDetail(m)}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:11 }}>
                <div className="meter-ic"><Icon name="activity" size={14} /></div>
                <div style={{ minWidth:0 }}>
                  <div className="wo-title" style={{ fontSize:13.5 }}>{m.asset}</div>
                  <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2, fontFamily:"var(--mono)" }}>{m.assetId} · {m.site}</div>
                </div>
              </div>
              <div style={{ fontSize:13, color:"var(--ink-2)" }}>
                <div>{m.type}</div>
                <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2 }}>{m.frequency}</div>
              </div>
              <div className="meter-reading">
                <span className="mr-n">{m.reading}</span>
                <span className="mr-u">{m.unit}</span>
              </div>
              <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>{m.lastRead}</div>
              <div style={{ fontSize:12.5, color: tone === "ok" ? "var(--ink-2)" : solid(tone), fontFamily:"var(--mono)" }}>{m.nextDue}</div>
              <div><Pill tone={tone} dot>{label}</Pill></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { MetersView });

function MeterDetailPanel({ meter, onClose }) {
  const m = meter;
  const tone  = m.status === "overdue" ? "crit" : m.status === "due-soon" ? "warn" : "ok";
  const label = m.status === "overdue" ? "Overdue" : m.status === "due-soon" ? "Due soon" : "On schedule";
  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg("accent"), color:solid("accent"), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name="activity" size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{m.asset}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{m.assetId} · {m.site}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
            <Pill tone={tone} dot>{label}</Pill>
            <Pill tone="muted">{m.frequency}</Pill>
            <Pill tone="muted">{m.type}</Pill>
          </div>

          <div className="meter-big">
            <div className="mb-n">{m.reading}</div>
            <div className="mb-u">{m.unit}</div>
            <div className="mb-l">latest reading</div>
          </div>

          <div className="info-row"><span className="k">Last read</span><span className="v">{m.lastRead}</span></div>
          <div className="info-row"><span className="k">Next due</span><span className="v" style={{ color: tone === "ok" ? "var(--ink)" : solid(tone), fontFamily:"var(--mono)" }}>{m.nextDue}</span></div>
          <div className="info-row" style={{ borderBottom:"none" }}><span className="k">Asset</span><span className="v">{m.asset}</span></div>

          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            <button className="btn" style={{ flex:1 }} onClick={onClose}><Icon name="file" size={15} />View history</button>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={onClose}><Icon name="plus" size={15} />Log reading</button>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

Object.assign(window, { MeterDetailPanel });

/* ════════════════════ asset_46_956d8c2c.js ════════════════════ */
;
/* HazardLink — Parts and inventory (with QR codes, scanner, full part detail) */

function StockBar({ onHand, min, max }) {
  const tone = onHand === 0 ? "crit" : onHand < min ? "warn" : "ok";
  const pct = Math.max(2, Math.min(100, (onHand / Math.max(max, 1)) * 100));
  const minPct = Math.max(0, Math.min(100, (min / Math.max(max, 1)) * 100));
  return (
    <div className="stock-bar" title={onHand + " in stock · min " + min}>
      <div className="stock-track">
        <div className="stock-min" style={{ left: minPct + "%" }} />
        <div className="stock-fill" style={{ width: pct + "%", background: solid(tone) }} />
      </div>
      <div className="stock-nums">
        <span className="stock-on" style={{ color: solid(tone) }}>{onHand}</span>
        <span className="stock-of">/ {max}</span>
      </div>
    </div>
  );
}

/* deterministic helpers — synthesize bin location and usage history per part */
function _partBin(p) {
  const aisles = ["A","B","C","D"];
  const a    = aisles[_qrHash(p.id)   % aisles.length];
  const shelf = (_qrHash(p.code)  % 5) + 1;
  const bin   = (_qrHash(p.name)  % 30) + 1;
  return "Aisle " + a + " · Shelf " + shelf + " · Bin " + String(bin).padStart(2, "0");
}
function _initialUsage(p) {
  // No seeded usage history for a brand-new org — events accrue as stock moves.
  return [];
}

/* ===========================================================
   List view
   =========================================================== */
function PartsView({ go, onScan, pendingScan, onConsumeScan }) {
  const D = useSiteData();
  const [filter,  setFilter]  = React.useState("All");
  const [addOpen, setAddOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState(null);
  const [section, setSection] = React.useState("inventory"); // inventory | po
  // Mutable on-hand counts (id → number). Falls back to data default.
  const [stock, setStock] = React.useState({});
  // Mutable usage history (id → array). Lazy-initialized on first open.
  const [usage, setUsage] = React.useState({});
  // Per-part auto-reorder toggle overrides (id → bool). Initial values
  // come from PART_REORDER_CFG; this map only stores overrides.
  const [autoOverride, setAutoOverride] = React.useState({});
  const { showToast, toastNode } = useViewToast();

  const isAuto = (p) => {
    if (autoOverride[p.id] != null) return autoOverride[p.id];
    return !!(PART_REORDER_CFG[p.id] && PART_REORDER_CFG[p.id].auto);
  };
  const toggleAuto = (p) => {
    setAutoOverride((o) => ({ ...o, [p.id]: !isAuto(p) }));
    showToast(isAuto(p)
      ? `Auto-reorder paused for ${p.name}`
      : `Auto-reorder on · ${p.name} → ${p.supplier}`);
  };

  const addStockFromPO = (partId, qty, poId) => {
    setStock((s) => {
      const raw = HL.parts.find((x) => x.id === partId);
      const current = s[partId] != null ? s[partId] : (raw ? raw.onHand : 0);
      return { ...s, [partId]: current + qty };
    });
    const entry = {
      id: "u-po-" + Date.now() + "-" + partId,
      date: "just now", type: "in", qty,
      ref: poId, by: "Goods-in", note: `Received via ${poId}`,
    };
    setUsage((u) => ({ ...u, [partId]: [entry, ...(u[partId] || [])] }));
  };

  // Pick up scan-resolutions from the app
  React.useEffect(() => {
    if (pendingScan) {
      setDetailId(pendingScan.id);
      onConsumeScan && onConsumeScan();
    }
  }, [pendingScan && pendingScan.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  const partWithLive = (p) => {
    if (!p) return p;
    const live = stock[p.id];
    if (live == null) return p;
    const status = live === 0 ? "out" : live < p.min ? "low" : "in-stock";
    return { ...p, onHand: live, status };
  };

  // If a part detail is open, render the detail page.
  if (detailId) {
    const raw = HL.parts.find((x) => x.id === detailId);
    const live = partWithLive(raw);
    if (!live) { setDetailId(null); return null; }
    return (
      <PartDetail
        part={live}
        usage={usage[detailId] || _initialUsage(raw)}
        onBack={() => setDetailId(null)}
        onStockChange={(delta, entry) => {
          setStock((s) => ({ ...s, [detailId]: Math.max(0, (s[detailId] != null ? s[detailId] : raw.onHand) + delta) }));
          setUsage((u) => ({ ...u, [detailId]: [entry, ...(u[detailId] || _initialUsage(raw))] }));
        }}
      />
    );
  }

  const allRaw = D.parts;
  const all    = allRaw.map(partWithLive);

  const counts = {
    total:   all.length,
    inStock: all.filter((p) => p.status === "in-stock").length,
    low:     all.filter((p) => p.status === "low").length,
    out:     all.filter((p) => p.status === "out").length,
    pending: all.filter((p) => /awaiting|PO/i.test(p.lastOrder)).length,
  };

  const filterFn = (p) => {
    if (filter === "All")            return true;
    if (filter === "Low stock")      return p.status === "low";
    if (filter === "Out of stock")   return p.status === "out";
    if (filter === "Pending reorder") return /awaiting|PO/i.test(p.lastOrder);
    return true;
  };
  const tabs = ["All", "Low stock", "Out of stock", "Pending reorder"];
  const rows = all.filter(filterFn);

  const grid = "1.4fr 56px 160px 150px 130px 90px 120px 96px";

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Parts and inventory</h1>
          <p className="page-desc">Every spare part and consumable across the central stores and on-site stockrooms. Scan a QR to find or update stock without typing.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={onScan}><Icon name="scan" size={15} />Scan</button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} />Add part</button>
        </div>
      </div>

      {addOpen && (
        <SimpleAddModal
          title="Add part to inventory"
          subtitle="Set a min level and HazardLink will reorder automatically."
          icon="package"
          submitLabel="Add part" submitIcon="check"
          successTitle="Part added"
          successCopy="The part is now tracked. Auto-reorder kicks in the moment stock dips below the min level."
          fields={[
            { id:"name",     label:"Part name",  placeholder:"e.g. Pleated air filter, 600×600" },
            { id:"code",     label:"Part code",   placeholder:"e.g. PAF-600" },
            { id:"category", label:"Category",    type:"select", options:["Belts","Filters","Plumbing","Refrigerant","Batteries","Lifts","Auto doors","Pool","Lighting","Other"] },
            { id:"location", label:"Location",   type:"select", options:["Central stores, Dublin"].concat(HL.sites.map((s) => s.name)) },
            { id:"min",      label:"Minimum level", placeholder:"e.g. 4" },
            { id:"supplier", label:"Supplier",      placeholder:"e.g. Buckley & Co" },
          ]}
          onClose={() => setAddOpen(false)} />
      )}

      <div className="toolbar">
        <div className="seg">
          <button className={section === "inventory" ? "on" : ""} onClick={() => setSection("inventory")}>Inventory</button>
          <button className={section === "po" ? "on" : ""} onClick={() => setSection("po")}>Purchase orders</button>
        </div>
      </div>

      {section === "po" ? (
        <PurchaseOrdersTab parts={all} onAddStock={addStockFromPO} showToast={showToast} />
      ) : (
      <React.Fragment>
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("muted"), color:solid("muted") }}><Icon name="package" size={16} /></div><span className="kpi-label">SKUs tracked</span></div>
          <div className="kpi-val">{counts.total}</div>
          <div className="kpi-foot">across all stores</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Low stock</span></div>
          <div className="kpi-val" style={{ color: counts.low ? "var(--warn)" : "var(--ok)" }}>{counts.low}</div>
          <div className="kpi-foot">at or below min level</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertCircle" size={16} /></div><span className="kpi-label">Out of stock</span></div>
          <div className="kpi-val" style={{ color: counts.out ? "var(--crit)" : "var(--ok)" }}>{counts.out}</div>
          <div className="kpi-foot">cannot fulfil work orders</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="send" size={16} /></div><span className="kpi-label">Pending reorders</span></div>
          <div className="kpi-val">{counts.pending}</div>
          <div className="kpi-foot">PO raised, awaiting delivery</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {rows.length} of {all.length} parts
        </div>
      </div>

      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:grid }}>
          <div>Part</div>
          <div>QR</div>
          <div>Location</div>
          <div>Stock on hand</div>
          <div>Status</div>
          <div>Unit price</div>
          <div>Last reorder</div>
          <div>Auto-reorder</div>
        </div>
        {rows.map((p) => {
          const tone = p.status === "in-stock" ? "ok" : p.status === "low" ? "warn" : "crit";
          const label = p.status === "in-stock" ? "In stock" : p.status === "low" ? "Reorder — at min" : "Out of stock";
          const cfg = PART_REORDER_CFG[p.id] || {};
          const auto = isAuto(p);
          return (
            <div className="wo-row" key={p.id} style={{ gridTemplateColumns:grid }} onClick={() => setDetailId(p.id)}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:11 }}>
                <div className="part-ic"><Icon name="package" size={14} /></div>
                <div style={{ minWidth:0 }}>
                  <div className="wo-title" style={{ fontSize:13.5 }}>{p.name}</div>
                  <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2, fontFamily:"var(--mono)" }}>{p.code} · {p.category}</div>
                  <div className="part-assets">{p.linkedAssets.join(" · ")}</div>
                </div>
              </div>
              <div className="qr-thumb" title={p.id}>
                <QRCode value={p.id} size={40} />
              </div>
              <div className="part-loc">{p.site}<small>{p.supplier}</small></div>
              <div><StockBar onHand={p.onHand} min={p.min} max={p.max} /></div>
              <div><Pill tone={tone} dot>{label}</Pill></div>
              <div className="part-price">{p.price}</div>
              <div className="part-reorder">
                {p.lastOrder}
                {cfg.reorderTo && <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>→ reorder to {cfg.reorderTo}</div>}
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <button className={"auto-toggle" + (auto ? " on" : "")}
                  onClick={() => toggleAuto(p)}
                  title={auto ? "Auto-reorder is on" : "Auto-reorder is off"}>
                  <span className="auto-knob" />
                  <span className="auto-lbl">{auto ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      </React.Fragment>
      )}
      {toastNode}
    </div>
  );
}

/* ===========================================================
   Full-page Part Detail
   =========================================================== */
function PartDetail({ part, usage, onBack, onStockChange }) {
  const p = part;
  const [flashCls, setFlashCls] = React.useState("");
  const [form, setForm] = React.useState(null);     // null | "in" | "out"
  const [printedAt, setPrintedAt] = React.useState(null);
  const tone  = p.status === "in-stock" ? "ok" : p.status === "low" ? "warn" : "crit";
  const label = p.status === "in-stock" ? "In stock" : p.status === "low" ? "Low — at min" : "Out of stock";
  const flashRef = React.useRef(null);

  // re-trigger flash animation
  React.useEffect(() => {
    if (!flashCls) return;
    const t = setTimeout(() => setFlashCls(""), 1300);
    return () => clearTimeout(t);
  }, [flashCls]);

  const handleSubmit = (type, qty, note) => {
    const delta = type === "in" ? qty : -qty;
    const entry = {
      id:"u-new-" + Date.now(),
      date:"just now",
      type:type,
      qty:qty,
      ref:type === "in" ? "Manual entry" : "Manual issue",
      by:"Aoife Kelly",
      note:note || "",
    };
    onStockChange(delta, entry);
    setFlashCls(type === "in" ? "flash-up" : "flash-down");
    setForm(null);
  };

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to parts
      </button>

      <div className="detail-head-row">
        <div className="dh-ico" style={{ background:softBg("maint"), color:solid("maint") }}>
          <Icon name="package" size={20} />
        </div>
        <div className="dh-title">
          <h1>{p.name}</h1>
          <div className="dh-id"><Icon name="scan" size={13} />{p.id} · {p.code} · {p.category}</div>
          <div className="dh-pills">
            <Pill tone={tone} dot>{label}</Pill>
            <Pill tone="muted">{p.category}</Pill>
            {/awaiting|PO/i.test(p.lastOrder) && <Pill tone="accent">PO in flight</Pill>}
          </div>
        </div>
        <div className="detail-head-actions">
          <button className="btn"><Icon name="file" size={15} />Order history</button>
          <button className="btn btn-primary"><Icon name="send" size={15} />Reorder now</button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="card stock-summary">
            <div className="panel-label" style={{ marginBottom: 0 }}>Stock on hand</div>
            <div className="stock-big">
              <div ref={flashRef} className={"sb-n " + flashCls}>
                {p.onHand}<small>/{p.max}</small>
              </div>
              <div className="sb-cap">min level <b style={{ color: "var(--ink-2)", fontFamily: "var(--mono)" }}>{p.min}</b> · {p.site}</div>
              <div className="sb-bar"><StockBar onHand={p.onHand} min={p.min} max={p.max} /></div>
            </div>

            <div className="stock-action-row">
              <button className="btn btn-stock btn-stock-in" onClick={() => setForm(form === "in" ? null : "in")}>
                <Icon name="plus" size={15} />Add stock
              </button>
              <button className="btn btn-stock btn-stock-out" onClick={() => setForm(form === "out" ? null : "out")} disabled={p.onHand === 0}>
                <Icon name="arrowRight" size={15} />Use stock
              </button>
            </div>

            {form && (
              <StockForm
                kind={form}
                maxOut={p.onHand}
                onCancel={() => setForm(null)}
                onSubmit={(qty, note) => handleSubmit(form, qty, note)} />
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Usage history</h3>
              <span className="sub">stock in and stock out · newest first</span>
            </div>
            {usage.map((u) => (
              <div className="usage-row" key={u.id}>
                <div className={"usage-ico " + u.type}>
                  <Icon name={u.type === "in" ? "plus" : "arrowRight"} size={14} />
                </div>
                <div>
                  <div className="usage-title">
                    {u.type === "in" ? "Stock received" : "Issued from stock"}
                    {u.note && <span style={{ fontWeight: 500, color: "var(--ink-3)" }}> — {u.note}</span>}
                  </div>
                  <div className="usage-meta">{u.by} · <span className="usage-ref">{u.ref}</span></div>
                </div>
                <div className={"usage-delta " + u.type}>
                  {u.type === "in" ? "+" : "−"}{u.qty}
                </div>
                <div className="usage-time">{u.date}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-side">
          <div className="card qr-card">
            <QRCode value={p.id} size={200} />
            <div className="qr-id-mono">{p.id}</div>
            <button className="btn qr-print-btn" onClick={() => {
              setPrintedAt("Sent to label printer");
              setTimeout(() => setPrintedAt(null), 2600);
            }}>
              <Icon name="file" size={15} />Print label
            </button>
            {printedAt && (
              <div style={{ fontSize:11.5, color:"var(--ok)", fontWeight:700, display:"inline-flex", alignItems:"center", gap:6 }}>
                <Icon name="checkCircle" size={13} />{printedAt}
              </div>
            )}
          </div>

          <div className="card meta-card">
            <div className="info-row"><span className="k">Bin location</span><span className="v" style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{_partBin(p)}</span></div>
            <div className="info-row"><span className="k">Site / store</span><span className="v">{p.site}</span></div>
            <div className="info-row"><span className="k">Supplier</span><span className="v">{p.supplier}</span></div>
            <div className="info-row"><span className="k">Unit price</span><span className="v" style={{ fontFamily: "var(--mono)" }}>{p.price}</span></div>
            <div className="info-row"><span className="k">Last reorder</span><span className="v">{p.lastOrder}</span></div>
            <div className="info-row" style={{ borderBottom: "none" }}>
              <span className="k">Linked assets</span>
              <span className="v" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.linkedAssets.join(", ")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Stock in/out inline form */
function StockForm({ kind, maxOut, onCancel, onSubmit }) {
  const [qty, setQty]   = React.useState(1);
  const [note, setNote] = React.useState("");
  const cap = kind === "out" ? maxOut : 999;
  const setSafe = (n) => setQty(Math.max(1, Math.min(cap, n | 0)));
  return (
    <div className="stock-inline-form">
      <div className="panel-label" style={{ margin: 0 }}>
        {kind === "in" ? "Add stock" : "Use stock"} — quantity and a quick note
      </div>
      <div className="stock-form-row">
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Qty</div>
          <div className="stock-qty">
            <button onClick={() => setSafe(qty - 1)} disabled={qty <= 1}>−</button>
            <input value={qty} onChange={(e) => setSafe(parseInt(e.target.value || "0", 10))} inputMode="numeric" />
            <button onClick={() => setSafe(qty + 1)} disabled={qty >= cap}>+</button>
          </div>
        </div>
        <div className="grow">
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Note (optional)</div>
          <input className="dv-input" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={kind === "in" ? "e.g. PO 2031 received from supplier" : "e.g. Issued for WO-2041"} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className={"btn " + (kind === "in" ? "btn-stock-in" : "btn-stock-out")}
          onClick={() => onSubmit(qty, note)}>
          <Icon name="check" size={14} />
          {kind === "in" ? "Add " + qty + " to stock" : "Use " + qty + " from stock"}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { PartsView, PartDetail });

/* ════════════════════ asset_39_39b525bf.js ════════════════════ */
;
/* HazardLink — Parts: Purchase orders tab + auto-reorder helpers.
   Extends the parts view with a PO list, New PO modal, and a Receive
   action that pushes received quantities back into live stock. */

/* Per-part config: reorder-to level + preferred supplier (defaults to
   the part's existing supplier) + initial auto-reorder flags.
   Indexed by part id. */
const PART_REORDER_CFG = {
  "P-1042": { reorderTo: 24, auto: true  },
  "P-0987": { reorderTo: 20, auto: true  },
  "P-0654": { reorderTo: 6,  auto: true  },
  "P-1119": { reorderTo: 6,  auto: false },
  "P-1234": { reorderTo: 8,  auto: true  },
  "P-0822": { reorderTo: 3,  auto: false },
  "P-1450": { reorderTo: 8,  auto: false },
  "P-1633": { reorderTo: 3,  auto: false },
  "P-2011": { reorderTo: 10, auto: false },
};

/* Seed POs — mix of statuses across the existing suppliers */
const PO_SEED = [];

const PO_STATUS_TONE = {
  "Draft": "muted",
  "Sent": "accent",
  "Confirmed": "warn",
  "Received": "ok",
};

function poTotal(po) {
  return po.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
}
function poItemSummary(po) {
  const first = po.items[0];
  const more  = po.items.length - 1;
  return first.name + (more > 0 ? "  +" + more + " more" : "");
}
function moneyEUR(n) {
  return "€" + n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ============================================================
   New PO modal
   ============================================================ */
function NewPOModal({ parts, presetIds, onClose, onSubmit }) {
  const groupedBySupplier = React.useMemo(() => {
    const m = new Map();
    parts.forEach((p) => {
      if (!m.has(p.supplier)) m.set(p.supplier, []);
      m.get(p.supplier).push(p);
    });
    return m;
  }, [parts]);

  const suppliers = [...groupedBySupplier.keys()];
  const [supplier, setSupplier] = React.useState(suppliers[0]);
  const [selected, setSelected] = React.useState(() => new Set(presetIds || []));
  const [qtys, setQtys]         = React.useState(() => {
    const m = {};
    parts.forEach((p) => {
      const cfg = PART_REORDER_CFG[p.id] || { reorderTo: p.max };
      m[p.id] = Math.max(1, cfg.reorderTo - p.onHand);
    });
    return m;
  });

  React.useEffect(() => {
    // pre-select any low-stock parts for this supplier
    const lowForSupplier = parts
      .filter((p) => p.supplier === supplier && (p.status === "low" || p.status === "out"))
      .map((p) => p.id);
    setSelected((prev) => {
      const next = new Set(prev);
      lowForSupplier.forEach((id) => next.add(id));
      return next;
    });
  }, [supplier]);

  const supplierParts = groupedBySupplier.get(supplier) || [];
  const total = supplierParts
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + qtys[p.id] * parseFloat((p.price || "€0").replace(/[^\d.]/g, "")), 0);

  const canSubmit = supplierParts.some((p) => selected.has(p.id));

  const toggle = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const submit = () => {
    if (!canSubmit) return;
    const items = supplierParts.filter((p) => selected.has(p.id)).map((p) => ({
      partId: p.id, name: p.name, code: p.code,
      qty: qtys[p.id], unitPrice: parseFloat((p.price || "€0").replace(/[^\d.]/g, "")),
    }));
    const id = "PO-" + Math.floor(2033 + Math.random() * 30);
    onSubmit({
      id, supplier, items,
      raised: "just now", raisedBy: "Aoife Kelly",
      eta: "Quote requested",
      status: "Draft",
      site: "Central stores, Dublin",
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="send" size={18} /></div>
          <div>
            <h3>New purchase order</h3>
            <p>Pick a supplier, tick the parts, set quantities. We'll draft the PO and email it.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="ai-field">
            <label>Supplier</label>
            <select className="dv-input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="po-li-head">
              <div></div>
              <div>Part</div>
              <div>On hand</div>
              <div>Order qty</div>
              <div>Line total</div>
            </div>
            {supplierParts.map((p) => {
              const checked = selected.has(p.id);
              const unitPrice = parseFloat((p.price || "€0").replace(/[^\d.]/g, ""));
              const lineTotal = qtys[p.id] * unitPrice;
              const lowTone = p.status === "low" || p.status === "out";
              return (
                <div key={p.id} className={"po-li-row" + (checked ? " on" : "") + (lowTone ? " low" : "")}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>{p.code} · {moneyEUR(unitPrice)} each</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, fontWeight: 700 }}>
                      {p.onHand}/{p.max}
                    </div>
                    {lowTone && <Pill tone={p.status === "out" ? "crit" : "warn"} dot>{p.status === "out" ? "out" : "low"}</Pill>}
                  </div>
                  <div className="po-qty">
                    <button onClick={() => setQtys((q) => ({ ...q, [p.id]: Math.max(1, q[p.id] - 1) }))}>−</button>
                    <input value={qtys[p.id]} onChange={(e) => setQtys((q) => ({ ...q, [p.id]: Math.max(1, parseInt(e.target.value || "0", 10)) }))} />
                    <button onClick={() => setQtys((q) => ({ ...q, [p.id]: q[p.id] + 1 }))}>+</button>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700 }}>
                    {checked ? moneyEUR(lineTotal) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="po-total-row">
            <span>Estimated total (ex-VAT)</span>
            <b>{moneyEUR(total)}</b>
          </div>
          <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            <Icon name="checkCircle" size={11} /> PO is created as Draft. Email it to {supplier} once you're happy with the line items.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : .5 }} onClick={submit}>
            <Icon name="send" size={15} />Create draft PO
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PO list view (rendered inside the Parts page)
   ============================================================ */
function PurchaseOrdersTab({ parts, onAddStock, showToast }) {
  const [pos, setPos]               = React.useState(PO_SEED);
  const [open, setOpen]             = React.useState(null);  // PO id (expanded)
  const [newPO, setNewPO]           = React.useState(false);
  const [presetIds, setPresetIds]   = React.useState(null);

  const counts = {
    draft:     pos.filter((p) => p.status === "Draft").length,
    sent:      pos.filter((p) => p.status === "Sent").length,
    confirmed: pos.filter((p) => p.status === "Confirmed").length,
    received:  pos.filter((p) => p.status === "Received").length,
  };
  const openTotal = pos.filter((p) => p.status !== "Received").reduce((s, p) => s + poTotal(p), 0);

  const advance = (po, nextStatus) => {
    setPos((xs) => xs.map((x) => x.id === po.id ? { ...x, status: nextStatus } : x));
  };

  const receive = (po) => {
    po.items.forEach((i) => onAddStock(i.partId, i.qty, po.id));
    setPos((xs) => xs.map((x) => x.id === po.id ? { ...x, status: "Received", eta: "Received just now" } : x));
    showToast(`${po.id} received · ${po.items.length} line${po.items.length === 1 ? "" : "s"} added to stock`);
  };

  const send = (po) => {
    advance(po, "Sent");
    showToast(`${po.id} emailed to ${po.supplier}`);
  };

  const handleNewPO = (po) => {
    setPos((xs) => [po, ...xs]);
    setNewPO(false);
    setPresetIds(null);
    setOpen(po.id);
    showToast(`${po.id} drafted · ${po.items.length} line item${po.items.length === 1 ? "" : "s"}`);
  };

  const grid = "100px 1fr 1.4fr 70px 110px 130px 110px 130px";

  return (
    <React.Fragment>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("muted"), color: solid("muted") }}><Icon name="file" size={16} /></div><span className="kpi-label">Drafts</span></div>
          <div className="kpi-val">{counts.draft}</div>
          <div className="kpi-foot">created, not yet sent</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("accent"), color: solid("accent") }}><Icon name="send" size={16} /></div><span className="kpi-label">Sent</span></div>
          <div className="kpi-val">{counts.sent}</div>
          <div className="kpi-foot">awaiting supplier confirmation</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("warn"), color: solid("warn") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Confirmed</span></div>
          <div className="kpi-val">{counts.confirmed}</div>
          <div className="kpi-foot">in transit, ready to receive</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("ok"), color: solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">Open value</span></div>
          <div className="kpi-val">{moneyEUR(openTotal)}</div>
          <div className="kpi-foot">PO value in flight</div>
        </div>
      </div>

      <div className="po-auto-banner">
        <div className="po-auto-ico"><Icon name="sparkles" size={16} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Auto-reorder is live for {Object.values(PART_REORDER_CFG).filter((c) => c.auto).length} parts</b>
          <p>When stock dips at or below a part's min level, HazardLink raises a draft PO to the preferred supplier and emails it for approval. Configured via the <a href="#" onClick={(e) => { e.preventDefault(); }}>automation engine</a>.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setPresetIds(null); setNewPO(true); }}>
          <Icon name="plus" size={15} />New PO
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Purchase orders</h3>
          <span className="sub">{pos.length} orders on record</span>
          <span className="head-act"><Pill tone="accent" dot>{counts.sent + counts.confirmed} in flight</Pill></span>
        </div>
        <div className="wo-head" style={{ gridTemplateColumns: grid }}>
          <div>PO</div>
          <div>Supplier</div>
          <div>Items</div>
          <div>Qty</div>
          <div>Total</div>
          <div>Status</div>
          <div>Raised</div>
          <div></div>
        </div>
        {pos.map((po) => {
          const expanded = open === po.id;
          const total = poTotal(po);
          const totalQty = po.items.reduce((s, i) => s + i.qty, 0);
          return (
            <React.Fragment key={po.id}>
              <div className="wo-row" style={{ gridTemplateColumns: grid }} onClick={() => setOpen(expanded ? null : po.id)}>
                <div className="wo-id">{po.id}</div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>{po.supplier}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{po.site}</div>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {poItemSummary(po)}
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{po.raisedBy}</div>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>{totalQty}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 13.5, fontWeight: 800 }}>{moneyEUR(total)}</div>
                <div><Pill tone={PO_STATUS_TONE[po.status]} dot>{po.status}</Pill></div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{po.raised}</div>
                <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                  {po.status === "Draft" && (
                    <button className="btn btn-sm btn-primary" onClick={() => send(po)}>
                      <Icon name="send" size={12} />Send
                    </button>
                  )}
                  {po.status === "Sent" && (
                    <button className="btn btn-sm" onClick={() => advance(po, "Confirmed")}>
                      <Icon name="check" size={12} />Confirm
                    </button>
                  )}
                  {po.status === "Confirmed" && (
                    <button className="btn btn-sm btn-primary" style={{ background: "var(--ok)" }} onClick={() => receive(po)}>
                      <Icon name="check" size={12} />Receive
                    </button>
                  )}
                  {po.status === "Received" && (
                    <span style={{ fontSize: 11.5, color: "var(--ok)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="checkCircle" size={11} />Done
                    </span>
                  )}
                </div>
              </div>
              {expanded && (
                <div className="po-detail">
                  <div className="po-detail-head">
                    <div>
                      <div className="po-detail-l">PO ref</div>
                      <div className="po-detail-v"><b>{po.id}</b></div>
                    </div>
                    <div>
                      <div className="po-detail-l">Supplier</div>
                      <div className="po-detail-v">{po.supplier}</div>
                    </div>
                    <div>
                      <div className="po-detail-l">Raised</div>
                      <div className="po-detail-v">{po.raised}<small>by {po.raisedBy.replace(/^Auto-reorder ·\s*/, "")}</small></div>
                    </div>
                    <div>
                      <div className="po-detail-l">ETA</div>
                      <div className="po-detail-v">{po.eta}</div>
                    </div>
                    <div>
                      <div className="po-detail-l">Deliver to</div>
                      <div className="po-detail-v">{po.site}</div>
                    </div>
                  </div>
                  <div className="po-lines">
                    <div className="po-lines-head">
                      <div>Part</div>
                      <div>Code</div>
                      <div>Qty</div>
                      <div>Unit</div>
                      <div>Line</div>
                    </div>
                    {po.items.map((i) => (
                      <div key={i.partId} className="po-line">
                        <div style={{ fontWeight: 600 }}>{i.name}</div>
                        <div style={{ fontFamily: "var(--mono)", color: "var(--ink-3)" }}>{i.code}</div>
                        <div style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{i.qty}</div>
                        <div style={{ fontFamily: "var(--mono)" }}>{moneyEUR(i.unitPrice)}</div>
                        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, textAlign: "right" }}>{moneyEUR(i.qty * i.unitPrice)}</div>
                      </div>
                    ))}
                    <div className="po-lines-total">
                      <span>Total ex-VAT</span>
                      <b>{moneyEUR(total)}</b>
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {newPO && <NewPOModal parts={parts} presetIds={presetIds} onClose={() => setNewPO(false)} onSubmit={handleNewPO} />}
    </React.Fragment>
  );
}

Object.assign(window, { PurchaseOrdersTab, PART_REORDER_CFG, PO_SEED });

/* ════════════════════ asset_25_a86cbb3a.js ════════════════════ */
;
/* HazardLink — Timesheets
   Logged hours per job/shift across staff and contractors, with weekly
   totals, an Approve action, and a labour cost summary that ties into billing. */

/* People — own staff and contractor operatives, with hourly rates */
const TS_PEOPLE = [];

/* Entries for the week of Mon 15 Jun – Sun 21 Jun 2026.
   Mixed status — most Approved or Submitted; a couple Draft. */
const TS_ENTRIES_SEED = [];

const TS_STATUS_TONE = {
  "Draft":     "muted",
  "Submitted": "warn",
  "Approved":  "ok",
  "Rejected":  "crit",
};

const moneyEUR2 = (n) => "€" + n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getPerson(id) { return TS_PEOPLE.find((p) => p.id === id); }

/* ============================================================
   Timesheet detail modal
   ============================================================ */
function TimesheetDetailModal({ entry, onClose, onApprove, onReject }) {
  const person = getPerson(entry.personId);
  const cost   = entry.hours * person.rate;
  const canApprove = entry.status === "Submitted";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="clock" size={18} /></div>
          <div>
            <h3>Timesheet entry {entry.id}</h3>
            <p>{person.name} · {entry.date}</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="ts-detail">
            <div className="ts-d-row"><span>Person</span>
              <b style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="ts-av">{person.initials}</span>
                {person.name} <small style={{ color: "var(--ink-3)", fontWeight: 500 }}>· {person.role}</small>
              </b>
            </div>
            <div className="ts-d-row"><span>Organisation</span><b>{person.org === "internal" ? "In-house" : person.org}</b></div>
            <div className="ts-d-row"><span>Date</span><b>{entry.date}</b></div>
            <div className="ts-d-row"><span>Site</span><b>{entry.site}</b></div>
            <div className="ts-d-row"><span>Job / shift</span><b>{entry.ref}</b></div>
            <div className="ts-d-row"><span>Time</span><b style={{ fontFamily: "var(--mono)" }}>{entry.start} – {entry.end}</b></div>
            <div className="ts-d-row"><span>Hours logged</span><b style={{ fontFamily: "var(--mono)", fontSize: 16 }}>{entry.hours.toFixed(2)}</b></div>
            <div className="ts-d-row"><span>Rate</span><b style={{ fontFamily: "var(--mono)" }}>{moneyEUR2(person.rate)}<small style={{ color: "var(--ink-3)", fontWeight: 500 }}> /hr</small></b></div>
            <div className="ts-d-row"><span>Billable</span>
              <b><Pill tone={entry.billable ? "ok" : "muted"} dot>{entry.billable ? "Billable to client" : "Internal"}</Pill></b>
            </div>
            <div className="ts-d-row ts-d-total">
              <span>{entry.billable ? "To bill to client" : "Cost to facility"}</span>
              <b style={{ fontFamily: "var(--mono)", fontSize: 18, color: entry.billable ? "var(--ok)" : "var(--ink-2)" }}>{moneyEUR2(cost)}</b>
            </div>
          </div>

          <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            <Icon name="checkCircle" size={11} /> Approved billable entries feed the next billing run automatically.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Close</button>
          {canApprove && (
            <React.Fragment>
              <button className="btn" style={{ background: "var(--crit-soft)", color: "var(--crit)", borderColor: "color-mix(in oklch, var(--crit) 30%, var(--line))" }}
                onClick={() => onReject(entry.id)}>
                <Icon name="x" size={14} />Reject
              </button>
              <button className="btn btn-primary" style={{ background: "var(--ok)" }}
                onClick={() => onApprove(entry.id)}>
                <Icon name="check" size={14} />Approve
              </button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Weekly totals panel
   ============================================================ */
function WeeklyTotals({ entries }) {
  const byPerson = React.useMemo(() => {
    const m = new Map();
    entries.forEach((e) => {
      const p = getPerson(e.personId);
      if (!p) return;
      if (!m.has(p.id)) m.set(p.id, { person: p, hours: 0, billable: 0, internal: 0, cost: 0, billableCost: 0 });
      const r = m.get(p.id);
      r.hours += e.hours;
      if (e.billable) {
        r.billable += e.hours;
        r.billableCost += e.hours * p.rate;
      } else {
        r.internal += e.hours;
      }
      r.cost += e.hours * p.rate;
    });
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const grandHours = byPerson.reduce((s, x) => s + x.hours, 0);
  const grandCost  = byPerson.reduce((s, x) => s + x.cost, 0);
  const grandBill  = byPerson.reduce((s, x) => s + x.billableCost, 0);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Weekly totals — Mon 15 Jun → Sun 21 Jun</h3>
        <span className="sub">hours per person, billable split, cost</span>
        <span className="head-act"><Pill tone="accent" dot>{byPerson.length} people</Pill></span>
      </div>
      <div className="ts-wk-head">
        <div>Person</div>
        <div>Total</div>
        <div>Billable</div>
        <div>Internal</div>
        <div>Cost this week</div>
        <div>To bill</div>
      </div>
      {byPerson.map((r) => {
        const pctBill = r.hours ? (r.billable / r.hours) * 100 : 0;
        return (
          <div key={r.person.id} className="ts-wk-row">
            <div className="ts-wk-person">
              <span className="ts-av">{r.person.initials}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5 }}>{r.person.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{r.person.role}{r.person.org !== "internal" ? " · " + r.person.org : ""}</div>
              </div>
            </div>
            <div className="ts-wk-h">
              {r.hours.toFixed(1)}<small>h</small>
              <div className="ts-wk-bar">
                <div className="ts-wk-bar-fill" style={{ width: pctBill + "%" }} />
              </div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13.5, color: "var(--ok)", fontWeight: 700 }}>{r.billable.toFixed(1)}h</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13.5, color: "var(--ink-3)", fontWeight: 600 }}>{r.internal.toFixed(1)}h</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13.5, fontWeight: 700 }}>{moneyEUR2(r.cost)}</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13.5, fontWeight: 700, color: "var(--ok)" }}>{moneyEUR2(r.billableCost)}</div>
          </div>
        );
      })}
      <div className="ts-wk-totals">
        <div>Totals</div>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 800 }}>{grandHours.toFixed(1)}h</div>
        <div></div>
        <div></div>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 800 }}>{moneyEUR2(grandCost)}</div>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 800, color: "var(--ok)" }}>{moneyEUR2(grandBill)}</div>
      </div>
    </div>
  );
}

/* ============================================================
   Top-level Timesheets view
   ============================================================ */
function TimesheetsView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [entries, setEntries] = React.useState(TS_ENTRIES_SEED);
  const [filter, setFilter]   = React.useState("All");
  const [open, setOpen]       = React.useState(null);  // entry id
  const [tab, setTab]         = React.useState("entries"); // entries | totals
  const { showToast, toastNode } = useViewToast();

  /* Site scope — entire view reads from this scoped list, so KPIs,
     filters, weekly totals and counts all match the active site. */
  const scopedEntries = site
    ? entries.filter((e) => e.site === site.name || (site.name === "All sites" && true))
    : entries;

  const filtered = scopedEntries.filter((e) => {
    if (filter === "All") return true;
    if (filter === "Submitted") return e.status === "Submitted";
    if (filter === "Approved")  return e.status === "Approved";
    if (filter === "Draft")     return e.status === "Draft";
    if (filter === "Billable")  return e.billable;
    return true;
  });

  const grid = "1.3fr 110px 1.4fr 1.4fr 130px 70px 90px 110px 120px";

  /* KPI numbers — across SCOPED entries (so the active site filters them) */
  const allHours    = scopedEntries.reduce((s, e) => s + e.hours, 0);
  const billHours   = scopedEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
  const pendingCt   = scopedEntries.filter((e) => e.status === "Submitted").length;
  const allCost     = scopedEntries.reduce((s, e) => s + e.hours * getPerson(e.personId).rate, 0);
  const billableCost = scopedEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours * getPerson(e.personId).rate, 0);
  const billablePct = allHours ? (billHours / allHours) * 100 : 0;

  const approve = (id) => {
    setEntries((xs) => xs.map((x) => x.id === id ? { ...x, status: "Approved" } : x));
    setOpen(null);
    showToast(`Timesheet ${id} approved`);
  };
  const reject  = (id) => {
    setEntries((xs) => xs.map((x) => x.id === id ? { ...x, status: "Rejected" } : x));
    setOpen(null);
    showToast(`Timesheet ${id} rejected`);
  };
  const approveAllPending = () => {
    const ids = scopedEntries.filter((e) => e.status === "Submitted").map((e) => e.id);
    if (ids.length === 0) return;
    setEntries((xs) => xs.map((x) => ids.includes(x.id) ? { ...x, status: "Approved" } : x));
    showToast(`${ids.length} timesheet${ids.length === 1 ? "" : "s"} approved`);
  };

  const entry = open ? entries.find((e) => e.id === open) : null;

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <p className="page-desc">
            Hours logged per job and shift by your team and approved contractors.
            Approved billable hours feed the next billing run automatically.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="file" size={15} />Export CSV</button>
          <button className="btn btn-primary" onClick={approveAllPending} disabled={pendingCt === 0}
            style={{ opacity: pendingCt === 0 ? .5 : 1 }}>
            <Icon name="check" size={15} />Approve {pendingCt} pending
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("accent"), color: solid("accent") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Hours this week</span></div>
          <div className="kpi-val">{allHours.toFixed(1)}<small>h</small></div>
          <div className="kpi-foot">across {TS_PEOPLE.length} people, {new Set(entries.map((e) => e.site)).size} sites</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("ok"), color: solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">Billable</span></div>
          <div className="kpi-val">{billHours.toFixed(1)}<small>h</small></div>
          <div className="kpi-foot">{billablePct.toFixed(0)}% of total · {moneyEUR2(billableCost)}</div>
        </div>
        <div className="kpi" style={{ borderColor: pendingCt ? "var(--warn)" : "" }}>
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("warn"), color: solid("warn") }}><Icon name="alertCircle" size={16} /></div><span className="kpi-label">Pending approval</span></div>
          <div className="kpi-val" style={{ color: pendingCt ? "var(--warn)" : "var(--ok)" }}>{pendingCt}</div>
          <div className="kpi-foot">submitted, awaiting your sign-off</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("muted"), color: solid("muted") }}><Icon name="creditCard" size={16} /></div><span className="kpi-label">Labour cost</span></div>
          <div className="kpi-val">{moneyEUR2(allCost)}</div>
          <div className="kpi-foot">includes in-house + contractor rates</div>
        </div>
      </div>

      <div className="tabs">
        <button className={"tab-btn" + (tab === "entries" ? " on" : "")} onClick={() => setTab("entries")}>Entries ({scopedEntries.length})</button>
        <button className={"tab-btn" + (tab === "totals" ? " on" : "")} onClick={() => setTab("totals")}>Weekly totals ({TS_PEOPLE.length})</button>
      </div>

      {tab === "totals" && <WeeklyTotals entries={scopedEntries} />}

      {tab === "entries" && (
        <React.Fragment>
          <div className="toolbar">
            <div className="seg">
              {["All", "Submitted", "Approved", "Draft", "Billable"].map((t) => (
                <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-3)" }}>
              {filtered.length} of {scopedEntries.length} entries
            </div>
          </div>

          <div className="card">
            <div className="wo-head" style={{ gridTemplateColumns: grid }}>
              <div>Person</div>
              <div>Date</div>
              <div>Site</div>
              <div>Job / shift</div>
              <div>Start–End</div>
              <div>Hours</div>
              <div>Billable</div>
              <div>Status</div>
              <div></div>
            </div>
            {filtered.map((e) => {
              const person = getPerson(e.personId);
              const cost = e.hours * person.rate;
              return (
                <div key={e.id} className="wo-row" style={{ gridTemplateColumns: grid }} onClick={() => setOpen(e.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="ts-av">{person.initials}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 13.5 }}>{person.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{person.org === "internal" ? "In-house" : person.org}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{e.date}</div>
                  <div className="wo-site" style={{ fontSize: 12.5 }}>{e.site}</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{e.ref}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)" }}>{e.start}–{e.end}</div>
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 14 }}>{e.hours.toFixed(1)}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>{moneyEUR2(cost)}</div>
                  </div>
                  <div>
                    {e.billable
                      ? <Pill tone="ok" dot>Billable</Pill>
                      : <Pill tone="muted">Internal</Pill>}
                  </div>
                  <div><Pill tone={TS_STATUS_TONE[e.status]} dot>{e.status}</Pill></div>
                  <div style={{ textAlign: "right" }} onClick={(ev) => ev.stopPropagation()}>
                    {e.status === "Submitted" && (
                      <button className="btn btn-sm btn-primary" style={{ background: "var(--ok)" }}
                        onClick={() => approve(e.id)}>
                        <Icon name="check" size={12} />Approve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}

      {entry && (
        <TimesheetDetailModal entry={entry}
          onClose={() => setOpen(null)}
          onApprove={approve} onReject={reject} />
      )}
      {toastNode}
    </div>
  );
}

Object.assign(window, { TimesheetsView });

/* ════════════════════ asset_24_688e696e.js ════════════════════ */
;
/* HazardLink — Security command-centre extras
   (Post orders, Pass-down notes, Daily Activity Report,
    Dispatch-guard modal, plus shared guard roster.) */

/* ============================================================
   Guards currently on duty across the portfolio.
   ============================================================ */
const SEC_GUARDS = [];

const SEC_GUARD_STATUS = {
  "on-patrol": { label:"On patrol", tone:"accent", icon:"shield" },
  "at-post":   { label:"At post",   tone:"ok",     icon:"user" },
  "break":     { label:"On break",  tone:"muted",  icon:"clock" },
  "panic":     { label:"PANIC",     tone:"crit",   icon:"alertTri" },
};

/* ============================================================
   Post orders — standing instructions per post.
   Acknowledged at shift start.
   ============================================================ */
const SEC_POSTS = [];

/* ============================================================
   Pass-down notes — shift handover log
   ============================================================ */
const SEC_PASSDOWN_SEED = [];

/* ============================================================
   Daily Activity Report — chronological event log for today
   ============================================================ */
const SEC_DAR_EVENTS = [];

const SEC_DAR_STATS = {
  checkpoints: 0, total: 0,
  incidents: 0,
  visitors: 0,
  patrolsDone: 0, patrolsScheduled: 0,
  panics: 0,
};

/* ============================================================
   Guard card — used in command centre + dispatch picker
   ============================================================ */
function GuardCard({ g, compact, onDispatch }) {
  const sm = SEC_GUARD_STATUS[g.status];
  return (
    <div className={"sc-guard sc-guard-" + g.status + (compact ? " sc-guard-compact" : "")}>
      <div className={"sc-guard-av sc-disc-secure"}>{g.initials}</div>
      <div className="sc-guard-body">
        <div className="sc-guard-top">
          <div className="sc-guard-name">{g.name}</div>
          <Pill tone={sm.tone} icon={sm.icon}>
            {g.status === "panic" ? <span className="sc-panic-blink"><span className="blip-dot" />{sm.label}</span> : sm.label}
          </Pill>
        </div>
        <div className="sc-guard-meta">
          <Icon name="mapPin" size={11} />{g.site} · {g.zone}
        </div>
        <div className="sc-guard-cps">
          <div className="sc-guard-cp">
            <span className="sc-guard-cp-l">Last</span>
            <span className={"sc-guard-cp-v" + (g.cpMissed ? " miss" : "")}>
              {g.lastCp} · {g.lastCpName}
            </span>
          </div>
          <div className="sc-guard-cp">
            <span className="sc-guard-cp-l">Next</span>
            <span className="sc-guard-cp-v">{g.nextCp}</span>
          </div>
        </div>
        {g.status === "panic" && (
          <div className="sc-guard-panic-reason">{g.panicReason}</div>
        )}
      </div>
      {!compact && onDispatch && (
        <div className="sc-guard-actions">
          <button className="btn btn-sm" onClick={() => onDispatch(g)}>
            <Icon name="send" size={12} />Dispatch
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Post orders tab
   ============================================================ */
function PostOrdersTab({ posts, guards, onAck, onUnack }) {
  const ackedCt = posts.filter((p) => p.ack).length;
  return (
    <React.Fragment>
      <div className="toolbar" style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, color:"var(--ink-3)" }}>
          {ackedCt}/{posts.length} posts acknowledged today
        </div>
        <div style={{ marginLeft:"auto" }}>
          <Pill tone={ackedCt === posts.length ? "ok" : "warn"} dot>
            {ackedCt === posts.length ? "All posts acknowledged" : (posts.length - ackedCt) + " awaiting ack"}
          </Pill>
        </div>
      </div>

      <div className="sc-post-grid">
        {posts.map((p) => {
          const g = guards.find((x) => x.id === p.assigned);
          return (
            <div key={p.id} className={"sc-post-card" + (p.ack ? " ack" : "")}>
              <div className="sc-post-head">
                <span className="pill pill-secure"><Icon name="shield" size={12} />Post order</span>
                <span className="sc-post-id">{p.id.toUpperCase()}</span>
              </div>
              <div className="sc-post-title">{p.post}</div>
              <div className="sc-post-site"><Icon name="mapPin" size={12} />{p.site}</div>
              {g && (
                <div className="sc-post-guard">
                  <span className="wo-mini-av" style={{ width:22, height:22, fontSize:9 }}>{g.initials}</span>
                  Assigned: <b>{g.name}</b> · {g.shift}
                </div>
              )}
              <ul className="sc-post-instructions">
                {p.instructions.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
              <div className="sc-post-foot">
                {p.ack ? (
                  <React.Fragment>
                    <div className="sc-post-ack">
                      <Icon name="checkCircle" size={14} />
                      Acknowledged at <b>{p.ackedAt}</b>
                    </div>
                    <button className="btn btn-sm" onClick={() => onUnack(p.id)}>
                      <Icon name="x" size={12} />Revoke
                    </button>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <div className="sc-post-warn">
                      <Icon name="alertTri" size={14} />Awaiting acknowledgement at shift start
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => onAck(p.id)}>
                      <Icon name="check" size={12} />Acknowledge
                    </button>
                  </React.Fragment>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

/* ============================================================
   Pass-down tab
   ============================================================ */
function PassDownTab({ notes, onAdd }) {
  return (
    <React.Fragment>
      <div className="toolbar" style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, color:"var(--ink-3)" }}>
          {notes.length} handover notes · most recent at the top
        </div>
        <button className="btn btn-primary" style={{ marginLeft:"auto" }} onClick={onAdd}>
          <Icon name="plus" size={15} />Add note
        </button>
      </div>

      <div className="sc-passdown">
        {notes.map((n) => (
          <div key={n.id} className="sc-pd-card">
            <div className="sc-pd-head">
              <div className="sc-pd-when">
                <span className="sc-pd-date">{n.date}</span>
                <span className="sc-pd-shift">{n.shift}</span>
              </div>
              <div className="sc-pd-leader">
                <Icon name="user" size={12} />
                <b>{n.leader}</b>
                <span className="sc-pd-sep" />
                <Icon name="mapPin" size={12} />{n.site}
              </div>
            </div>
            <p className="sc-pd-note">{n.note}</p>
            {n.items && n.items.length > 0 && (
              <ul className="sc-pd-items">
                {n.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

/* ============================================================
   Daily Activity Report tab
   ============================================================ */
function DARTab({ events, stats, onExport }) {
  return (
    <React.Fragment>
      <div className="toolbar" style={{ marginBottom:14 }}>
        <div>
          <div style={{ fontSize:13, color:"var(--ink-3)" }}>
            Daily Activity Report — auto-compiled from sensors, scans and reports
          </div>
          <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:3, fontFamily:"var(--mono)" }}>
            No report compiled yet
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          <button className="btn"><Icon name="send" size={14} />Email shift leader</button>
          <button className="btn btn-primary" onClick={onExport}><Icon name="file" size={14} />Export PDF</button>
        </div>
      </div>

      <div className="stat-strip" style={{ gridTemplateColumns:"repeat(5,1fr)" }}>
        <div className="stat-box">
          <div className="n">{stats.checkpoints}<small>/{stats.total}</small></div>
          <div className="l">Checkpoints scanned</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.incidents}</div>
          <div className="l">Incidents logged</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.visitors}</div>
          <div className="l">Visitors signed in</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.patrolsDone}<small>/{stats.patrolsScheduled}</small></div>
          <div className="l">Patrols completed</div>
        </div>
        <div className="stat-box" style={{ borderColor: stats.panics > 0 ? "color-mix(in oklch, var(--crit) 30%, var(--line))" : undefined }}>
          <div className="n" style={{ color: stats.panics > 0 ? "var(--crit)" : undefined }}>{stats.panics}</div>
          <div className="l">Panic activations</div>
        </div>
      </div>

      <div className="card" style={{ marginTop:14 }}>
        <div className="card-head">
          <h3>Event log</h3>
          <span className="sub">{events.length} events · chronological</span>
        </div>
        <div className="sc-dar-log">
          {events.map((e, i) => (
            <div key={i} className="sc-dar-row">
              <div className="sc-dar-t">{e.t}</div>
              <div className={"sc-dar-ico tone-" + e.tone}>
                <Icon name={e.icon} size={12} />
              </div>
              <div>
                <div className="sc-dar-title">{e.title}</div>
                <div className="sc-dar-detail">{e.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}

/* ============================================================
   Dispatch-guard modal
   ============================================================ */
function DispatchGuardModal({ guards, presetIncident, onClose, onDispatch }) {
  const [destKind, setDestKind] = React.useState(presetIncident ? "incident" : "incident");
  const [incidentId, setIncidentId] = React.useState(presetIncident || "INC-0034");
  const [location,   setLocation]   = React.useState("");
  const [guardId,    setGuardId]    = React.useState("");
  const [notes,      setNotes]      = React.useState("");

  /* Recommend the closest available guard. Naive: nearest by name token,
     skip panic and break. */
  const available = guards.filter((g) => g.status !== "panic" && g.status !== "break");
  const recommended = available[0];
  const effectiveGuardId = guardId || (recommended && recommended.id) || "";

  const canSend = effectiveGuardId && (destKind === "incident" ? incidentId : location);

  const dispatch = () => {
    if (!canSend) return;
    onDispatch({
      guardId: effectiveGuardId,
      destKind, incidentId, location, notes,
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth:560 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="send" size={18} /></div>
          <div>
            <h3>Dispatch guard</h3>
            <p>Send the nearest available guard to an incident or location.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="ai-field">
            <label>Destination</label>
            <div className="seg" style={{ width:"fit-content" }}>
              <button className={destKind === "incident" ? "on" : ""} onClick={() => setDestKind("incident")}>Active incident</button>
              <button className={destKind === "location" ? "on" : ""} onClick={() => setDestKind("location")}>Location</button>
            </div>
          </div>

          {destKind === "incident" ? (
            <div className="ai-field">
              <label>Active incident</label>
              <select className="dv-input" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
                {HL.incidents.map((i) => (
                  <option key={i.id} value={i.id}>{i.id} · {i.type} · {i.site}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="ai-field">
              <label>Location</label>
              <input className="dv-input" value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Aviva Office Tower — Reception, or Northgate yard gate 2" />
            </div>
          )}

          <div className="ai-field">
            <label>Guard {recommended && !guardId && <span className="sc-rec-chip">recommended: {recommended.name}</span>}</label>
            <select className="dv-input" value={effectiveGuardId} onChange={(e) => setGuardId(e.target.value)}>
              {available.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.site} · {SEC_GUARD_STATUS[g.status].label}
                </option>
              ))}
              {guards.filter((g) => g.status === "break").map((g) => (
                <option key={g.id} value={g.id} disabled>
                  {g.name} (on break) — unavailable
                </option>
              ))}
              {guards.filter((g) => g.status === "panic").map((g) => (
                <option key={g.id} value={g.id} disabled>
                  {g.name} (panic) — already responding to own incident
                </option>
              ))}
            </select>
          </div>

          <div className="ai-field">
            <label>Notes (radio brief)</label>
            <textarea className="dv-input" rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Short brief for the guard — what to do on arrival, who to contact…" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSend}
            style={{ opacity: canSend ? 1 : .5 }} onClick={dispatch}>
            <Icon name="send" size={15} />Dispatch
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Add pass-down note modal
   ============================================================ */
function AddPassDownModal({ guards, onClose, onSubmit }) {
  const [leader, setLeader] = React.useState(guards[0] ? guards[0].name : "");
  const [site,   setSite]   = React.useState(HL.sites?.[0]?.name || "");
  const [shift,  setShift]  = React.useState("Day 06:00–14:00");
  const [note,   setNote]   = React.useState("");
  const [items,  setItems]  = React.useState("");

  const canSave = leader && site && note.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSubmit({
      id:"pd-" + Date.now(),
      date:"Today", shift, leader, site,
      note: note.trim(),
      items: items.split("\n").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth:580 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="edit" size={18} /></div>
          <div>
            <h3>Add pass-down note</h3>
            <p>Hand over to the next shift — context, open items and anything they should know.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="ai-field">
              <label>Shift</label>
              <select className="dv-input" value={shift} onChange={(e) => setShift(e.target.value)}>
                <option>Day 06:00–14:00</option>
                <option>Late 14:00–22:00</option>
                <option>Night 22:00–06:00</option>
              </select>
            </div>
            <div className="ai-field">
              <label>Shift leader</label>
              <select className="dv-input" value={leader} onChange={(e) => setLeader(e.target.value)}>
                {guards.map((g) => <option key={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="ai-field" style={{ gridColumn:"1 / -1" }}>
              <label>Site</label>
              <select className="dv-input" value={site} onChange={(e) => setSite(e.target.value)}>
                {HL.sites.map((s) => <option key={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="ai-field" style={{ gridColumn:"1 / -1" }}>
              <label>Handover note</label>
              <textarea className="dv-input" rows={4} value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened on shift, what's still open, who has been informed…" />
            </div>
            <div className="ai-field" style={{ gridColumn:"1 / -1" }}>
              <label>Items handed over (one per line)</label>
              <textarea className="dv-input" rows={3} value={items}
                onChange={(e) => setItems(e.target.value)}
                placeholder="e.g. Master keys returned to safe&#10;Visitor register has 2 sign-outs pending" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave}
            style={{ opacity: canSave ? 1 : .5 }} onClick={save}>
            <Icon name="check" size={15} />Save note
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  SEC_GUARDS, SEC_POSTS, SEC_PASSDOWN_SEED, SEC_DAR_EVENTS, SEC_DAR_STATS, SEC_GUARD_STATUS,
  GuardCard, PostOrdersTab, PassDownTab, DARTab,
  DispatchGuardModal, AddPassDownModal,
});

/* ════════════════════ asset_26_470d6346.js ════════════════════ */
;
/* HazardLink — Security view (Command Centre + tabs).
   Existing incident reporting, patrols and lone-worker check-in
   are kept intact and surfaced inside the new layout. */

/* ============================================================
   Kept from the previous version: incident detail panel + list,
   patrols view, lone workers view.
   ============================================================ */
function IncidentPanel({ inc, onClose, onDispatch }) {
  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg("secure"), color:solid("secure"), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name="shield" size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{inc.type}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{inc.id} · {inc.site}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            <Pill tone={inc.sevTone} dot>{inc.sev === "medium" ? "Medium severity" : inc.sev === "high" ? "High severity" : "Low severity"}</Pill>
            <Pill tone={inc.statusTone} dot>{inc.status}</Pill>
          </div>

          <p style={{ fontSize:13.5, lineHeight:1.65, color:"var(--ink-2)", margin:"0 0 20px" }}>{inc.desc}</p>

          <div className="panel-label">Timeline</div>
          <div className="stepper" style={{ marginBottom:20 }}>
            {inc.steps.map((s, i) => <Step s={s} key={i} />)}
          </div>

          <div className="info-row"><span className="k">Reported by</span><span className="v">{inc.reporter} · {inc.role}</span></div>
          <div className="info-row"><span className="k">Logged</span><span className="v">{inc.time}</span></div>
          <div className="info-row"><span className="k">Site</span><span className="v">{inc.site}</span></div>

          {inc.sev === "medium" && (
            <div style={{ marginTop:18 }}>
              <div className="panel-label">Photos attached</div>
              <div className="proof-grid">
                {[].map((lbl, i) => (
                  <div className="proof" key={i}>
                    <span className="pcam"><Icon name="camera" size={15} /></span>
                    <span className="plabel">{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:10, marginTop:20 }}>
            {inc.status === "Open" && (
              <React.Fragment>
                <button className="btn btn-primary" style={{ flex:1 }}><Icon name="check" size={15} />Acknowledge</button>
                <button className="btn" style={{ flex:1 }} onClick={() => onDispatch && onDispatch(inc.id)}>
                  <Icon name="send" size={15} />Dispatch guard
                </button>
              </React.Fragment>
            )}
            {inc.status !== "Open" && (
              <button className="btn" style={{ flex:1 }}>View full report</button>
            )}
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

function IncidentsList({ incidents, onDispatch }) {
  const [panel, setPanel] = React.useState(null);
  const inc = incidents;
  return (
    <div>
      {panel && <IncidentPanel inc={panel} onClose={() => setPanel(null)}
        onDispatch={(id) => { setPanel(null); onDispatch && onDispatch(id); }} />}
      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:"106px 1fr 180px 120px 90px" }}>
          <div>ID</div><div>Incident</div><div>Site</div><div>Logged</div><div>Status</div>
        </div>
        {inc.map((item) => (
          <div key={item.id} className="wo-row" style={{ gridTemplateColumns:"106px 1fr 180px 120px 90px" }}
            onClick={() => setPanel(item)}>
            <div className="wo-id">{item.id}</div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:softBg(item.sevTone), color:solid(item.sevTone), display:"grid", placeItems:"center", flex:"none" }}>
                <Icon name={item.sevTone === "warn" || item.sevTone === "crit" ? "alertTri" : "shield"} size={14} />
              </div>
              <div>
                <div style={{ fontWeight:650, fontSize:14 }}>{item.type}</div>
                <div style={{ fontSize:12, color:"var(--ink-3)" }}>{item.reporter} · {item.role}</div>
              </div>
            </div>
            <div className="wo-site">{item.site}</div>
            <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>{item.time}</div>
            <div><Pill tone={item.statusTone} dot>{item.status}</Pill></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PatrolsView({ patrols }) {
  const [activeId, setActiveId] = React.useState(patrols[0] ? patrols[0].id : null);
  const patrol = patrols.find((p) => p.id === activeId) || patrols[0];

  if (!patrol) {
    return (
      <div className="empty" style={{ background:"var(--surface)", border:"1px solid var(--line)", borderRadius:"var(--radius)" }}>
        <div className="empty-ico"><Icon name="shield" size={28} /></div>
        <h3>No patrols at this site</h3>
        <p>Select a different site, or create a patrol route from settings.</p>
      </div>
    );
  }

  return (
    <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:16 }}>
      <div className="card">
        <div className="card-head"><h3>Today's patrols</h3></div>
        {patrols.map((p) => (
          <div key={p.id} className="patrol-pick" onClick={() => setActiveId(p.id)}
            style={{ background: activeId === p.id ? "var(--accent-soft)" : "" }}>
            <span className="wo-mini-av" style={{ width:30, height:30, fontSize:11, flex:"none" }}>{p.initials}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:650, fontSize:13 }}>{p.guard}</div>
              <div style={{ fontSize:11.5, color:"var(--ink-3)" }}>{p.site}</div>
            </div>
            <Pill tone={p.status === "complete" ? "ok" : "accent"} dot>{p.status === "complete" ? "Done" : "Active"}</Pill>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>{patrol.guard}</h3>
          <div className="sub">{patrol.site} · started {patrol.started}</div>
          <div className="head-act">
            <span style={{ fontSize:12.5, color:"var(--ink-3)" }}>
              {patrol.checkpoints.filter((c) => c.scanned).length}/{patrol.checkpoints.length} scanned
            </span>
          </div>
        </div>
        {patrol.checkpoints.map((cp) => (
          <div className="checkpoint" key={cp.id}>
            <div className="cp-dot" style={{ background: cp.scanned ? "var(--ok)" : "var(--line-2)" }} />
            <div className="cp-name">{cp.name}</div>
            {cp.scanned
              ? <React.Fragment><span className="cp-time">{cp.time}</span><Pill tone="ok" style={{ marginLeft:6 }}>Scanned</Pill></React.Fragment>
              : <Pill tone="muted">Pending</Pill>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

function LoneWorkersView({ workers: initialWorkers }) {
  const [workers, setWorkers] = React.useState(initialWorkers);
  React.useEffect(() => { setWorkers(initialWorkers); }, [initialWorkers]);

  const checkin = (id) => {
    setWorkers((ws) => ws.map((w) => w.id === id ? { ...w, status:"ok", lastCheckin:"just now" } : w));
  };

  return (
    <div>
      <div className="lone-worker-grid">
        {workers.map((w) => (
          <div className={"lw-card" + (w.status === "overdue" ? " overdue" : "")} key={w.id}>
            <div className="lw-head">
              <div className="lw-av" style={{ background: w.status === "overdue" ? "var(--crit-soft)" : "var(--surface-3)", color: w.status === "overdue" ? "var(--crit)" : "var(--ink-2)" }}>
                {w.initials}
              </div>
              <div style={{ flex:1 }}>
                <div className="lw-name">{w.name}</div>
                <div className="lw-role">{w.role}</div>
              </div>
              <Pill tone={w.status === "ok" ? "ok" : "crit"} dot>{w.status === "ok" ? "OK" : "Overdue"}</Pill>
            </div>
            <div className="lw-site"><Icon name="mapPin" size={12} />{w.site}</div>
            <div className="lw-checkin" style={{ marginTop:6 }}>Last check-in: {w.lastCheckin}</div>
            {w.status === "overdue" && (
              <div style={{ marginTop:10, display:"flex", gap:8 }}>
                <button className="btn btn-sm" style={{ flex:1, borderColor:"var(--crit)", color:"var(--crit)" }}>
                  <Icon name="phone" size={13} />Call
                </button>
                <button className="btn btn-sm btn-primary" style={{ flex:1 }} onClick={() => checkin(w.id)}>
                  <Icon name="check" size={13} />Mark safe
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Command Centre — guards on duty, incidents, patrols, lone workers
   ============================================================ */
function CommandBanner({ attention, reasons, onDispatch }) {
  if (attention) {
    return (
      <div className="sc-banner sc-banner-attn">
        <div className="sc-banner-ico"><Icon name="alertTri" size={20} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="sc-banner-title">Attention needed — security desk action required</div>
          <div className="sc-banner-sub">{reasons.join(" · ")}</div>
        </div>
        <button className="btn btn-primary" onClick={onDispatch}>
          <Icon name="send" size={14} />Dispatch guard
        </button>
      </div>
    );
  }
  return (
    <div className="sc-banner sc-banner-ok">
      <div className="sc-banner-ico sc-banner-ico-ok"><Icon name="checkCircle" size={20} /></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div className="sc-banner-title">All clear across every site</div>
        <div className="sc-banner-sub">Guards at post, patrols on schedule, no live incidents</div>
      </div>
    </div>
  );
}

function CommandCentre({ guards, incidents, patrols, loneWorkers, onDispatch, onOpenIncident }) {
  const reasons = [];
  const panic   = guards.filter((g) => g.status === "panic");
  const missed  = guards.filter((g) => g.cpMissed);
  const openInc = incidents.filter((i) => i.status === "Open");
  const overdue = loneWorkers.filter((w) => w.status === "overdue");
  if (panic.length)   reasons.push(panic.length   + " panic activation" + (panic.length === 1 ? "" : "s"));
  if (missed.length)  reasons.push(missed.length  + " missed checkpoint" + (missed.length === 1 ? "" : "s"));
  if (openInc.length) reasons.push(openInc.length + " open incident" + (openInc.length === 1 ? "" : "s"));
  if (overdue.length) reasons.push(overdue.length + " lone-worker overdue");
  const attention = reasons.length > 0;

  /* Patrol scan progress */
  const patrolProgress = patrols.map((p) => ({
    id: p.id, guard: p.guard, initials: p.initials,
    site: p.site, status: p.status,
    scanned: p.checkpoints.filter((c) => c.scanned).length,
    total:   p.checkpoints.length,
  }));

  return (
    <React.Fragment>
      <CommandBanner attention={attention} reasons={reasons} onDispatch={onDispatch} />

      {/* KPI strip */}
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("secure"), color:solid("secure") }}><Icon name="shield" size={16} /></div>
            <span className="kpi-label">Guards on duty</span>
          </div>
          <div className="kpi-val">{guards.length}</div>
          <div className="kpi-foot">across {new Set(guards.map((g) => g.site)).size} sites · day shift</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg(openInc.length ? "warn" : "ok"), color:solid(openInc.length ? "warn" : "ok") }}><Icon name="alertTri" size={16} /></div>
            <span className="kpi-label">Open incidents</span>
          </div>
          <div className="kpi-val">{openInc.length}</div>
          <div className="kpi-foot">{incidents.filter((i) => i.sev === "high").length} high · {incidents.filter((i) => i.sev === "medium").length} medium · {incidents.filter((i) => i.sev === "low").length} low</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="scan" size={16} /></div>
            <span className="kpi-label">Patrols on schedule</span>
          </div>
          <div className="kpi-val">
            {patrolProgress.filter((p) => p.status === "in-progress" || p.status === "complete").length}
            <small>/{patrolProgress.length}</small>
          </div>
          <div className="kpi-foot">{patrolProgress.reduce((s, p) => s + p.scanned, 0)} of {patrolProgress.reduce((s, p) => s + p.total, 0)} checkpoints scanned</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg(overdue.length ? "crit" : "ok"), color:solid(overdue.length ? "crit" : "ok") }}><Icon name="user" size={16} /></div>
            <span className="kpi-label">Lone workers</span>
          </div>
          <div className="kpi-val">{loneWorkers.length - overdue.length}<small>/{loneWorkers.length}</small></div>
          <div className="kpi-foot">{overdue.length} overdue · timers running</div>
        </div>
      </div>

      {/* Status board */}
      <div className="sc-board">
        <div className="card sc-board-card">
          <div className="card-head">
            <h3>Guards on duty</h3>
            <span className="sub">colour-coded · click Dispatch to send any guard</span>
            <span className="head-act"><Pill tone="secure" dot>{guards.length} live</Pill></span>
          </div>
          <div className="sc-guards-list">
            {guards.map((g) => (
              <GuardCard key={g.id} g={g} onDispatch={() => onDispatch && onDispatch()} />
            ))}
          </div>
        </div>

        <div className="sc-board-right">
          {/* Active incidents */}
          <div className="card">
            <div className="card-head">
              <h3>Active incidents</h3>
              <span className="sub">by severity</span>
              <span className="head-act"><Pill tone={openInc.length ? "warn" : "ok"} dot>{openInc.length} open</Pill></span>
            </div>
            <div className="sc-incs">
              {incidents.slice(0, 4).map((i) => (
                <button key={i.id} className="sc-inc-row" onClick={() => onOpenIncident(i)}>
                  <div className={"sc-inc-sev sc-sev-" + i.sevTone}>
                    <Icon name={i.sevTone === "crit" ? "alertTri" : i.sevTone === "warn" ? "alertCircle" : "shield"} size={12} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="sc-inc-title">{i.type}</div>
                    <div className="sc-inc-meta">{i.site} · {i.time} · <span className="sc-inc-id">{i.id}</span></div>
                  </div>
                  <Pill tone={i.statusTone} dot>{i.status}</Pill>
                </button>
              ))}
            </div>
          </div>

          {/* Patrol progress */}
          <div className="card">
            <div className="card-head">
              <h3>Patrols</h3>
              <span className="sub">scan progress</span>
            </div>
            <div className="sc-patrols">
              {patrolProgress.map((p) => {
                const pct = Math.round((p.scanned / Math.max(1, p.total)) * 100);
                return (
                  <div key={p.id} className="sc-patrol-row">
                    <span className="wo-mini-av" style={{ width:24, height:24, fontSize:10 }}>{p.initials}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="sc-patrol-top">
                        <span className="sc-patrol-nm">{p.guard}</span>
                        <span className="sc-patrol-frac">{p.scanned}/{p.total}</span>
                      </div>
                      <div className="sc-patrol-bar">
                        <i style={{ width: pct + "%", background: p.status === "complete" ? "var(--ok)" : "var(--accent)" }} />
                      </div>
                      <div className="sc-patrol-meta">{p.site} · {p.status === "complete" ? "complete" : "in progress"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lone-worker timers */}
          <div className="card">
            <div className="card-head">
              <h3>Lone-worker timers</h3>
              <span className="sub">last check-in</span>
              <span className="head-act"><Pill tone={overdue.length ? "crit" : "ok"} dot>{overdue.length ? overdue.length + " overdue" : "all OK"}</Pill></span>
            </div>
            <div className="sc-lone">
              {loneWorkers.map((w) => (
                <div key={w.id} className={"sc-lone-row" + (w.status === "overdue" ? " overdue" : "")}>
                  <span className="wo-mini-av" style={{ width:24, height:24, fontSize:9, background: w.status === "overdue" ? "var(--crit-soft)" : "var(--surface-3)", color: w.status === "overdue" ? "var(--crit)" : "var(--ink-2)" }}>{w.initials}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="sc-lone-nm">{w.name}<span className="sc-lone-role"> · {w.role}</span></div>
                    <div className="sc-lone-site">{w.site}</div>
                  </div>
                  <div className="sc-lone-time">
                    <Icon name="clock" size={11} />{w.lastCheckin}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function SecurityView({ go }) {
  const [tab, setTab] = React.useState("command");
  const [logOpen, setLogOpen] = React.useState(false);
  const [dispatchOpen, setDispatchOpen] = React.useState(false);
  const [presetIncident, setPresetIncident] = React.useState(null);
  const [addNoteOpen, setAddNoteOpen] = React.useState(false);
  const [posts, setPosts] = React.useState(SEC_POSTS);
  const [passdown, setPassdown] = React.useState(SEC_PASSDOWN_SEED);
  const [openIncidentPanel, setOpenIncidentPanel] = React.useState(null);
  const { showToast, toastNode } = useViewToast();
  const D = useSiteData();

  const ackPost   = (id) => {
    setPosts((ps) => ps.map((p) => p.id === id ? { ...p, ack:true, ackedAt:"just now" } : p));
    showToast("Post order acknowledged");
  };
  const unackPost = (id) => setPosts((ps) => ps.map((p) => p.id === id ? { ...p, ack:false, ackedAt:undefined } : p));

  const addNote = (n) => {
    setPassdown((ps) => [n, ...ps]);
    setAddNoteOpen(false);
    showToast("Pass-down note saved");
  };

  const onDispatch = (incidentId) => {
    setPresetIncident(incidentId || null);
    setDispatchOpen(true);
  };
  const handleDispatch = (payload) => {
    const guard = SEC_GUARDS.find((g) => g.id === payload.guardId);
    const dest  = payload.destKind === "incident" ? payload.incidentId : payload.location;
    setDispatchOpen(false);
    setPresetIncident(null);
    showToast(`${guard?.name || "Guard"} dispatched to ${dest}`);
  };

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Security command centre</h1>
          <p className="page-desc">Guards on duty, live incidents, patrols and lone-worker timers — plus post orders, shift handovers and the daily activity report.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={() => onDispatch(null)}>
            <Icon name="send" size={15} />Dispatch guard
          </button>
          <button className="btn btn-primary" onClick={() => setLogOpen(true)}>
            <Icon name="plus" size={15} />Log incident
          </button>
        </div>
      </div>

      {logOpen && (
        <SimpleAddModal
          title="Log incident"
          subtitle="Capture what happened. Attach photos in the next step."
          icon="shield"
          submitLabel="Log incident" submitIcon="send"
          successTitle="Incident logged"
          successCopy="Site manager has been notified and the incident is on the security log."
          fields={[
            { id:"type",   label:"Incident type", type:"select",   options:["Slip and fall","Near miss","Lone-worker overdue","Suspicious person","Property damage","Panic activation","Other"] },
            { id:"site",   label:"Site",          type:"select",   options:HL.sites.map((s) => s.name) },
            { id:"sev",    label:"Severity",       type:"select",   options:["Low","Medium","High"], default:"Low" },
            { id:"detail", label:"What happened", type:"textarea", placeholder:"Describe in your own words", rows:4 },
          ]}
          onClose={() => setLogOpen(false)} />
      )}

      {dispatchOpen && (
        <DispatchGuardModal
          guards={SEC_GUARDS}
          presetIncident={presetIncident}
          onClose={() => { setDispatchOpen(false); setPresetIncident(null); }}
          onDispatch={handleDispatch} />
      )}

      {addNoteOpen && (
        <AddPassDownModal
          guards={SEC_GUARDS}
          onClose={() => setAddNoteOpen(false)}
          onSubmit={addNote} />
      )}

      {openIncidentPanel && (
        <IncidentPanel inc={openIncidentPanel}
          onClose={() => setOpenIncidentPanel(null)}
          onDispatch={(id) => { setOpenIncidentPanel(null); onDispatch(id); }} />
      )}

      <div className="tabs">
        {[
          ["command",   "Command centre"],
          ["posts",     `Post orders (${posts.filter((p) => p.ack).length}/${posts.length})`],
          ["passdown",  `Pass-down (${passdown.length})`],
          ["dar",       "Daily activity report"],
          ["incidents", `Incidents (${D.incidents.filter((i) => i.status === "Open").length})`],
          ["patrols",   "Patrols"],
          ["lone",      `Lone workers (${D.loneWorkers.filter((w) => w.status === "overdue").length || ""})`],
        ].map(([id, label]) => (
          <button key={id} className={"tab-btn" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "command" && (
        <CommandCentre
          guards={SEC_GUARDS}
          incidents={D.incidents}
          patrols={D.patrols}
          loneWorkers={D.loneWorkers}
          onDispatch={onDispatch}
          onOpenIncident={setOpenIncidentPanel} />
      )}
      {tab === "posts"     && <PostOrdersTab posts={posts} guards={SEC_GUARDS} onAck={ackPost} onUnack={unackPost} />}
      {tab === "passdown"  && <PassDownTab notes={passdown} onAdd={() => setAddNoteOpen(true)} />}
      {tab === "dar"       && <DARTab events={SEC_DAR_EVENTS} stats={SEC_DAR_STATS} onExport={() => showToast("DAR queued for PDF export")} />}
      {tab === "incidents" && <IncidentsList incidents={D.incidents} onDispatch={onDispatch} />}
      {tab === "patrols"   && <PatrolsView patrols={D.patrols} />}
      {tab === "lone"      && <LoneWorkersView workers={D.loneWorkers} />}

      {toastNode}
    </div>
  );
}

Object.assign(window, { SecurityView });

/* ════════════════════ asset_48_f983ffff.js ════════════════════ */
;
/* HazardLink — Visitor management
   Adds: on-site register, expected today, watchlist screening,
   visitor history and an evacuation roll-call modal. */

const VISITOR_SITES = HL.sites.map((s) => s.name);

/* Hosts the receptionist can pick from */
const VISITOR_HOSTS = [
  { name: "Aoife Kelly",    role: "Facilities Manager",  site: "Aviva Office Tower" },
  { name: "Ronan Walsh",    role: "Site Lead",            site: "Aviva Office Tower" },
  { name: "Niamh Doherty",  role: "Operations Director",  site: "Northgate Logistics Hub" },
  { name: "Padraig Burke",  role: "Yard Supervisor",      site: "Northgate Logistics Hub" },
  { name: "Sinead Murphy",  role: "Store Manager",        site: "Riverside Retail Park" },
  { name: "Caoimhe Lynch",  role: "Clinic Lead",          site: "Lee Valley Medical Centre" },
  { name: "Eoin Brady",     role: "Duty Manager",         site: "Tramore Leisure Centre" },
  { name: "Tara Fitzgerald", role: "Branch Librarian",    site: "Galway City Library" },
];

const VISITOR_REASONS = [
  "Meeting", "Contractor — works",  "Delivery", "Audit / inspection",
  "Interview", "Tour", "Maintenance", "Other",
];

/* People we do NOT want on site (former staff, court orders, etc.) */
const VISITOR_WATCHLIST = [];

/* Seed: people currently on-site at the start of the day */
const SEED_ONSITE = [];

/* Seed: pre-booked but not arrived yet */
const SEED_EXPECTED = [];

/* Seed: already signed in and out today */
const SEED_HISTORY = [];

let NEXT_VID = 4119;
let NEXT_BADGE = 224;
const nextVid   = () => "V-" + (NEXT_VID++);
const nextBadge = () => "B-" + (NEXT_BADGE++);

function watchlistMatch(name) {
  const n = (name || "").trim().toLowerCase();
  if (n.length < 2) return null;
  return VISITOR_WATCHLIST.find((w) => {
    const wn = w.name.toLowerCase();
    return wn === n || wn.includes(n) || n.includes(wn);
  }) || null;
}

/* ============================================================
   Sign-in modal
   ============================================================ */
function SignInVisitorModal({ defaultSite, onClose, onSubmit }) {
  const [name, setName]       = React.useState("");
  const [company, setCompany] = React.useState("");
  const [host, setHost]       = React.useState("");
  const [reason, setReason]   = React.useState("Meeting");
  const [reg, setReg]         = React.useState("");
  const [site, setSite]       = React.useState(defaultSite || VISITOR_SITES[0]);
  const [override, setOverride] = React.useState(false);
  const [badge] = React.useState(() => "B-" + NEXT_BADGE);
  const flag    = watchlistMatch(name);

  const hostOptions = VISITOR_HOSTS.filter((h) => h.site === site);

  React.useEffect(() => { setHost(""); }, [site]);

  const canSubmit = name.trim() && company.trim() && host && reason && site && (!flag || override);

  const submit = () => {
    if (!canSubmit) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    onSubmit({
      id: nextVid(),
      name: name.trim(),
      company: company.trim(),
      host, reason, site,
      badge: nextBadge(),
      reg: reg.trim() || null,
      timeIn: `${hh}:${mm}`,
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="user" size={18} /></div>
          <div>
            <h3>Sign in visitor</h3>
            <p>Issue a badge, notify the host, add to the live register.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body">
          {flag && (
            <div className="vm-flag">
              <div className="vm-flag-ico"><Icon name="alertTri" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vm-flag-title">Do not admit — watchlist match</div>
                <div className="vm-flag-sub">
                  <b>{flag.name}</b> — {flag.reason}
                </div>
                <div className="vm-flag-meta">Added {flag.added} · Notify duty manager before proceeding.</div>
              </div>
            </div>
          )}

          <div className="vm-grid">
            <div className="ai-field" style={{ gridColumn: "span 2" }}>
              <label>Visitor name</label>
              <input className="dv-input" autoFocus value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name as on photo ID" />
              {!flag && name.trim().length > 1 && (
                <div className="ai-hint" style={{ color: "var(--ok)" }}>
                  <Icon name="checkCircle" size={11} /> No watchlist match
                </div>
              )}
            </div>
            <div className="ai-field">
              <label>Company</label>
              <input className="dv-input" value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Murphy Mechanical" />
            </div>
            <div className="ai-field">
              <label>Site</label>
              <select className="dv-input" value={site} onChange={(e) => setSite(e.target.value)}>
                {VISITOR_SITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="ai-field">
              <label>Host being visited</label>
              <select className="dv-input" value={host} onChange={(e) => setHost(e.target.value)}>
                <option value="">Select host…</option>
                {hostOptions.map((h) => <option key={h.name} value={h.name}>{h.name} — {h.role}</option>)}
              </select>
            </div>
            <div className="ai-field">
              <label>Reason for visit</label>
              <select className="dv-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {VISITOR_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="ai-field">
              <label>Vehicle registration <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>(optional)</span></label>
              <input className="dv-input" value={reg}
                onChange={(e) => setReg(e.target.value.toUpperCase())}
                placeholder="e.g. 242-D-7741" />
            </div>
            <div className="ai-field">
              <label>Badge number</label>
              <div className="vm-badge-preview">
                <Icon name="award" size={14} />
                <span>{badge}</span>
                <small>auto-assigned</small>
              </div>
            </div>
            <div className="ai-field" style={{ gridColumn: "span 2" }}>
              <label>Visitor photo</label>
              <div className="vm-photo-slot">
                <div className="vm-photo-ico"><Icon name="camera" size={20} /></div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 13 }}>Capture from front-desk webcam</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>Required for the printed badge · click to retake</div>
                </div>
              </div>
            </div>
          </div>

          {flag && (
            <label className="vm-override">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              <span>Duty manager has approved entry despite watchlist match (audit-logged).</span>
            </label>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : .5 }} onClick={submit}>
            <Icon name="check" size={15} />Sign in &amp; notify host
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Roll call modal — evacuation
   ============================================================ */
function RollCallModal({ onSite, onClose }) {
  const [accounted, setAccounted] = React.useState(() => new Set());
  const bySite = React.useMemo(() => {
    const m = new Map();
    onSite.forEach((v) => {
      if (!m.has(v.site)) m.set(v.site, []);
      m.get(v.site).push(v);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [onSite]);

  const toggle = (id) => {
    setAccounted((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const markAll = () => setAccounted(new Set(onSite.map((v) => v.id)));
  const reset   = () => setAccounted(new Set());

  const total      = onSite.length;
  const accCount   = accounted.size;
  const missingCt  = total - accCount;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal vm-rollcall" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head" style={{ background: "var(--crit-soft)", borderBottomColor: "var(--crit-soft)" }}>
          <div className="mh-ico" style={{ background: "var(--crit)" }}>
            <Icon name="alertTri" size={18} />
          </div>
          <div>
            <h3 style={{ color: "var(--crit)" }}>Evacuation roll-call</h3>
            <p>Tick each visitor as they reach the muster point. Hosts are also notified to confirm.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          <div className="vm-rc-summary">
            <div className="vm-rc-stat">
              <div className="vm-rc-num">{total}</div>
              <div className="vm-rc-lbl">On site</div>
            </div>
            <div className="vm-rc-stat ok">
              <div className="vm-rc-num">{accCount}</div>
              <div className="vm-rc-lbl">Accounted for</div>
            </div>
            <div className={"vm-rc-stat" + (missingCt > 0 ? " crit" : "")}>
              <div className="vm-rc-num">{missingCt}</div>
              <div className="vm-rc-lbl">Still to account for</div>
            </div>
            <div className="vm-rc-actions">
              <button className="btn btn-sm" onClick={reset}>Reset</button>
              <button className="btn btn-sm btn-primary" onClick={markAll}>Mark all accounted</button>
            </div>
          </div>

          {bySite.length === 0 && (
            <div className="empty" style={{ padding: "40px 20px" }}>
              <div className="empty-ico"><Icon name="checkCircle" size={26} /></div>
              <h3>No visitors on site</h3>
              <p>Nothing to account for — building can be cleared.</p>
            </div>
          )}

          {bySite.map(([siteName, vs]) => (
            <div key={siteName} className="vm-rc-site">
              <div className="vm-rc-site-head">
                <Icon name="mapPin" size={13} />
                <b>{siteName}</b>
                <span>{vs.length} visitor{vs.length === 1 ? "" : "s"}</span>
              </div>
              {vs.map((v) => {
                const ok = accounted.has(v.id);
                return (
                  <button key={v.id} className={"vm-rc-row" + (ok ? " on" : "")}
                    onClick={() => toggle(v.id)}>
                    <span className={"vm-rc-check" + (ok ? " on" : "")}>
                      {ok ? <Icon name="check" size={13} /> : null}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div className="vm-rc-nm">{v.name}</div>
                      <div className="vm-rc-meta">{v.company} · host {v.host} · in {v.timeIn}</div>
                    </div>
                    <span className="vm-badge-pill"><Icon name="award" size={11} />{v.badge}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={total > 0 && missingCt > 0}
            style={{ opacity: total > 0 && missingCt > 0 ? .5 : 1 }}
            onClick={onClose}>
            <Icon name="checkCircle" size={15} />All clear
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function VisitorsView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [tab, setTab]               = React.useState("onsite");
  const [onSite, setOnSite]         = React.useState(SEED_ONSITE);
  const [expected, setExpected]     = React.useState(SEED_EXPECTED);
  const [history, setHistory]       = React.useState(SEED_HISTORY);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [rollOpen, setRollOpen]     = React.useState(false);
  const { showToast, toastNode }    = useViewToast();

  /* Filter by current global site, if one is picked */
  const filter = (arr) => site ? arr.filter((v) => v.site === site.name) : arr;
  const vOnSite   = filter(onSite);
  const vExpected = filter(expected);
  const vHistory  = filter(history);
  const flaggedHere = VISITOR_WATCHLIST;

  /* KPIs */
  const signedInToday  = onSite.length + history.length;
  const signedOutToday = history.length;
  const expectedToday  = expected.length + signedInToday; // expected = arrived + still-to-arrive
  const onSiteNow      = onSite.length;
  const onSiteHere     = vOnSite.length;

  const addSignedIn = (v) => {
    setOnSite((xs) => [v, ...xs]);
    showToast(`${v.name} signed in · host ${v.host} notified`);
  };

  const signOut = (id) => {
    const v = onSite.find((x) => x.id === id);
    if (!v) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    setOnSite((xs) => xs.filter((x) => x.id !== id));
    setHistory((xs) => [{ ...v, timeOut: `${hh}:${mm}` }, ...xs]);
    showToast(`${v.name} signed out · badge ${v.badge} returned`);
  };

  const arriveExpected = (id) => {
    const e = expected.find((x) => x.id === id);
    if (!e) return;
    const flag = watchlistMatch(e.name);
    if (flag) {
      showToast(`⚠ ${e.name} matches watchlist — open sign-in to override`);
      return;
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const v = {
      id: nextVid(),
      name: e.name, company: e.company, host: e.host, reason: e.reason, site: e.site,
      badge: nextBadge(), reg: null, timeIn: `${hh}:${mm}`,
    };
    setExpected((xs) => xs.filter((x) => x.id !== id));
    setOnSite((xs) => [v, ...xs]);
    showToast(`${e.name} signed in from expected list · badge ${v.badge}`);
  };

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Visitor management</h1>
          <p className="page-desc">
            Live on-site register for evacuation roll-call, watchlist screening at the front desk,
            and the daily expected / signed-in / signed-out totals.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setRollOpen(true)}>
            <Icon name="alertTri" size={15} />Evacuation roll-call
          </button>
          <button className="btn btn-primary" onClick={() => setSignInOpen(true)}>
            <Icon name="plus" size={15} />Sign in visitor
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="kpi" style={{ borderColor: onSiteNow > 0 ? "var(--accent)" : "" }}>
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background: softBg("accent"), color: solid("accent") }}>
              <Icon name="users" size={16} />
            </div>
            <span className="kpi-label">On site now</span>
          </div>
          <div className="kpi-val">{onSiteNow}</div>
          <div className="kpi-foot">live register for evacuation roll-call</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background: softBg("secure"), color: solid("secure") }}>
              <Icon name="calendar" size={16} />
            </div>
            <span className="kpi-label">Expected today</span>
          </div>
          <div className="kpi-val">{expectedToday}</div>
          <div className="kpi-foot">{expected.length} not yet arrived</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background: softBg("ok"), color: solid("ok") }}>
              <Icon name="check" size={16} />
            </div>
            <span className="kpi-label">Signed in today</span>
          </div>
          <div className="kpi-val">{signedInToday}</div>
          <div className="kpi-foot">across {new Set([...onSite, ...history].map((v) => v.site)).size} sites</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background: softBg("muted"), color: solid("muted") }}>
              <Icon name="arrowRight" size={16} />
            </div>
            <span className="kpi-label">Signed out today</span>
          </div>
          <div className="kpi-val">{signedOutToday}</div>
          <div className="kpi-foot">badges returned and logged</div>
        </div>
      </div>

      {site && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "-6px 0 14px" }}>
          Showing visitors for <b style={{ color: "var(--ink)" }}>{site.name}</b> · {onSiteHere} on site here
        </div>
      )}

      <div className="tabs">
        {[
          ["onsite",    `On site (${vOnSite.length})`],
          ["expected",  `Expected today (${vExpected.length})`],
          ["watchlist", `Watchlist (${flaggedHere.length})`],
          ["history",   `History (${vHistory.length})`],
        ].map(([id, label]) => (
          <button key={id} className={"tab-btn" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "onsite" && (
        <div className="card">
          <div className="card-head">
            <h3>On site now</h3>
            <span className="sub">badge issued · counted in evacuation roll-call</span>
            <span className="head-act"><Pill tone="accent" dot>{vOnSite.length} live</Pill></span>
          </div>
          {vOnSite.length === 0 ? (
            <div className="empty" style={{ padding: "48px 20px" }}>
              <div className="empty-ico"><Icon name="users" size={26} /></div>
              <h3>No visitors on site</h3>
              <p>Use “Sign in visitor” to register the first arrival.</p>
            </div>
          ) : (
            <React.Fragment>
              <div className="wo-head vm-on-grid">
                <div>Visitor</div><div>Company</div><div>Host</div>
                <div>Badge</div><div>In</div><div>Site</div><div></div>
              </div>
              {vOnSite.map((v) => (
                <div key={v.id} className="wo-row vm-on-grid">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="wo-mini-av">{v.name.split(" ").map((p) => p[0]).slice(0,2).join("")}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>{v.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{v.reason}{v.reg ? " · " + v.reg : ""}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{v.company}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{v.host}</div>
                  <div><span className="vm-badge-pill"><Icon name="award" size={11} />{v.badge}</span></div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink-2)" }}>{v.timeIn}</div>
                  <div className="wo-site" style={{ fontSize: 12.5 }}>{v.site}</div>
                  <div style={{ textAlign: "right" }}>
                    <button className="btn btn-sm" onClick={() => signOut(v.id)}>
                      <Icon name="arrowRight" size={12} />Sign out
                    </button>
                  </div>
                </div>
              ))}
            </React.Fragment>
          )}
        </div>
      )}

      {tab === "expected" && (
        <div className="card">
          <div className="card-head">
            <h3>Expected today</h3>
            <span className="sub">pre-booked · click Arrived to sign in instantly</span>
            <span className="head-act"><Pill tone="secure" dot>{vExpected.length} pre-booked</Pill></span>
          </div>
          {vExpected.length === 0 ? (
            <div className="empty" style={{ padding: "48px 20px" }}>
              <div className="empty-ico"><Icon name="calendar" size={26} /></div>
              <h3>No-one else expected today</h3>
              <p>Pre-book visitors from any meeting invite, or use Sign in for walk-ins.</p>
            </div>
          ) : (
            <React.Fragment>
              <div className="wo-head vm-exp-grid">
                <div>Visitor</div><div>Company</div><div>Host</div>
                <div>Reason</div><div>Due</div><div>Site</div><div></div>
              </div>
              {vExpected.map((e) => {
                const flag = watchlistMatch(e.name);
                return (
                  <div key={e.id} className={"wo-row vm-exp-grid" + (flag ? " vm-row-flag" : "")}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="wo-mini-av">{e.name.split(" ").map((p) => p[0]).slice(0,2).join("")}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 650, fontSize: 14 }}>{e.name}</div>
                        {flag && <div style={{ fontSize: 11.5, color: "var(--crit)", fontWeight: 600 }}>⚠ Watchlist match</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{e.company}</div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{e.host}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{e.reason}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink-2)" }}>{e.due}</div>
                    <div className="wo-site" style={{ fontSize: 12.5 }}>{e.site}</div>
                    <div style={{ textAlign: "right" }}>
                      <button className="btn btn-sm btn-primary" onClick={() => arriveExpected(e.id)}>
                        <Icon name="check" size={12} />Arrived
                      </button>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          )}
        </div>
      )}

      {tab === "watchlist" && (
        <div className="card">
          <div className="card-head">
            <h3>Do-not-admit watchlist</h3>
            <span className="sub">checked live against every sign-in attempt</span>
            <span className="head-act"><Pill tone="crit" dot>{flaggedHere.length} flagged</Pill></span>
          </div>
          {flaggedHere.map((w, i) => (
            <div key={i} className="vm-wl-row">
              <div className="vm-wl-ico"><Icon name="alertTri" size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>{w.reason}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Added {w.added}</div>
              <Pill tone="crit" dot>Do not admit</Pill>
            </div>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="card-head">
            <h3>Visitor log</h3>
            <span className="sub">signed in and out today</span>
          </div>
          {vHistory.length === 0 ? (
            <div className="empty" style={{ padding: "48px 20px" }}>
              <div className="empty-ico"><Icon name="file" size={26} /></div>
              <h3>No completed visits yet today</h3>
              <p>Once visitors sign out, their full record appears here.</p>
            </div>
          ) : (
            <React.Fragment>
              <div className="wo-head vm-hist-grid">
                <div>Visitor</div><div>Company</div><div>Host</div>
                <div>Badge</div><div>In</div><div>Out</div><div>Site</div>
              </div>
              {vHistory.map((v) => (
                <div key={v.id} className="wo-row vm-hist-grid">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="wo-mini-av">{v.name.split(" ").map((p) => p[0]).slice(0,2).join("")}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>{v.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{v.reason}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{v.company}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{v.host}</div>
                  <div><span className="vm-badge-pill"><Icon name="award" size={11} />{v.badge}</span></div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink-2)" }}>{v.timeIn}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink-2)" }}>{v.timeOut}</div>
                  <div className="wo-site" style={{ fontSize: 12.5 }}>{v.site}</div>
                </div>
              ))}
            </React.Fragment>
          )}
        </div>
      )}

      {signInOpen && (
        <SignInVisitorModal
          defaultSite={site ? site.name : VISITOR_SITES[0]}
          onClose={() => setSignInOpen(false)}
          onSubmit={(v) => { setSignInOpen(false); addSignedIn(v); }} />
      )}

      {rollOpen && (
        <RollCallModal onSite={onSite} onClose={() => setRollOpen(false)} />
      )}

      {toastNode}
    </div>
  );
}

Object.assign(window, { VisitorsView });

/* ════════════════════ asset_29_e6e719f3.js ════════════════════ */
;
/* HazardLink — Client portal
   A limited, read-mostly view branded for the customer.
   Shows their sites' status, requests they raised, quotes awaiting approval,
   invoices, upcoming PPM visits, and a 'Log a request' button. */

const CLIENT_SITES = [];

const CP_REQUESTS = [];

const CP_QUOTES = [];

const CP_INVOICES = [];

const CP_VISITS = [];

/* ============================================================
   Log a request modal
   ============================================================ */
function LogRequestModal({ onClose, onSubmit }) {
  const [title, setTitle]   = React.useState("");
  const [site, setSite]     = React.useState(CLIENT_SITES[0] ? CLIENT_SITES[0].name : "");
  const [where, setWhere]   = React.useState("");
  const [pri, setPri]       = React.useState("Medium");
  const [desc, setDesc]     = React.useState("");
  const canSubmit = title.trim().length > 3;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      id: "CR-" + Math.floor(1050 + Math.random() * 30),
      title: title.trim(), site, raised: "just now",
      status: "Awaiting triage", tone: "muted",
      wo: null, note: "Logged via Client portal · being triaged",
      raisedBy: "You (client)", where, pri, desc,
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="plus" size={18} /></div>
          <div>
            <h3>Log a new request</h3>
            <p>Tell us what's wrong — the FM team will triage and update you here.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="ai-field">
            <label>What's the issue?</label>
            <input className="dv-input" autoFocus value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hot water out in west wing washrooms" />
          </div>
          <div className="vm-grid" style={{ marginTop: 12 }}>
            <div className="ai-field">
              <label>Site</label>
              <select className="dv-input" value={site} onChange={(e) => setSite(e.target.value)}>
                {CLIENT_SITES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="ai-field">
              <label>Where on site?</label>
              <input className="dv-input" value={where} onChange={(e) => setWhere(e.target.value)}
                placeholder="e.g. Level 3 east, near lifts" />
            </div>
            <div className="ai-field">
              <label>Priority</label>
              <select className="dv-input" value={pri} onChange={(e) => setPri(e.target.value)}>
                <option>Low — when convenient</option>
                <option>Medium</option>
                <option>High — same day</option>
                <option>Critical — now</option>
              </select>
            </div>
            <div className="ai-field">
              <label>Reference (optional)</label>
              <input className="dv-input" placeholder="PO number, ticket, etc." />
            </div>
            <div className="ai-field" style={{ gridColumn: "span 2" }}>
              <label>Anything else we should know?</label>
              <textarea className="dv-input" rows="3" value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Times to avoid, who to contact, photos to follow…" />
            </div>
          </div>
          <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            <Icon name="checkCircle" size={11} /> You'll get an email when this is triaged, scheduled and closed.
            All requests are SLA-tracked under your contract.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : .5 }} onClick={submit}>
            <Icon name="send" size={15} />Submit request
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Quote actions modal — confirm Approve / Decline
   ============================================================ */
function QuoteDecisionModal({ quote, action, onClose, onConfirm }) {
  const isApprove = action === "approve";
  const [note, setNote] = React.useState("");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-head">
          <div className="mh-ico" style={{ background: isApprove ? "var(--ok)" : "var(--crit)" }}>
            <Icon name={isApprove ? "check" : "x"} size={18} />
          </div>
          <div>
            <h3>{isApprove ? "Approve quote" : "Decline quote"}</h3>
            <p>{quote.contractor} · {quote.amount}</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="cp-quote-summary">
            <div className="cp-quote-line"><span>Job</span><b>{quote.title}</b></div>
            <div className="cp-quote-line"><span>Site</span><b>{quote.site}</b></div>
            <div className="cp-quote-line"><span>Contractor</span><b>{quote.contractor}</b></div>
            <div className="cp-quote-line"><span>Lead time</span><b>{quote.lead}</b></div>
            <div className="cp-quote-line"><span>Total (ex-VAT)</span>
              <b style={{ fontFamily: "var(--mono)", fontSize: 16, color: isApprove ? "var(--ok)" : "var(--crit)" }}>{quote.amount}</b>
            </div>
          </div>
          <div className="ai-field" style={{ marginTop: 14 }}>
            <label>{isApprove ? "Approval note (optional)" : "Reason for declining"}</label>
            <textarea className="dv-input" rows="3" value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isApprove
                ? "Anything the contractor should know before they attend"
                : "Why is this being declined? Helps us re-tender well."} />
          </div>
          {isApprove && (
            <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
              <Icon name="checkCircle" size={11} /> Approving instructs {quote.contractor} to proceed.
              A PO will be raised against your contract and you'll receive an invoice when complete.
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={"btn " + (isApprove ? "btn-primary" : "")}
            style={{ background: isApprove ? "" : "var(--crit)", color: isApprove ? "" : "#fff" }}
            onClick={() => onConfirm(note)}>
            <Icon name={isApprove ? "check" : "x"} size={15} />
            {isApprove ? "Approve and instruct" : "Decline quote"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Top-level Client portal view
   ============================================================ */
function ClientPortalView({ go }) {
  const [requests, setRequests] = React.useState(CP_REQUESTS);
  const [quotes, setQuotes]     = React.useState(CP_QUOTES);
  const [logOpen, setLogOpen]   = React.useState(false);
  const [decision, setDecision] = React.useState(null); // { quote, action }
  const { showToast, toastNode } = useViewToast();

  const openCount    = requests.filter((r) => r.status !== "Completed").length;
  const pendingQuote = quotes.filter((q) => q.status === "pending").length;
  const openInvoices = CP_INVOICES.filter((i) => i.status === "Unpaid").length;
  const owedAmount   = CP_INVOICES.filter((i) => i.status === "Unpaid")
    .reduce((s, i) => s + Number(i.amount.replace(/[^\d.]/g, "")), 0);

  const decide = (note) => {
    const { quote, action } = decision;
    setQuotes((qs) => qs.filter((q) => q.id !== quote.id));
    if (action === "approve") {
      setRequests((rs) => rs.map((r) => r.id === "CR-1037" && quote.id === "Q-4188"
        ? { ...r, status: "Approved — scheduled", tone: "ok", note: `${quote.contractor} · ${quote.amount} approved` }
        : r));
      showToast(`Quote ${quote.id} approved · ${quote.contractor} instructed`);
    } else {
      showToast(`Quote ${quote.id} declined · re-tendering`);
    }
    setDecision(null);
  };

  const onLogged = (req) => {
    setRequests((rs) => [req, ...rs]);
    setLogOpen(false);
    showToast(`Request ${req.id} logged · FM team notified`);
  };

  return (
    <div className="cp-shell">
      {/* Branded client header */}
      <div className="cp-brand">
        <div className="cp-brand-logo">
          <span>—</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cp-brand-name">Client portal</div>
          <div className="cp-brand-sub">Limited view · facilities self-service for your properties</div>
        </div>
        <button className="btn btn-primary cp-cta" onClick={() => setLogOpen(true)}>
          <Icon name="plus" size={15} />Log a request
        </button>
      </div>

      <div className="cp-banner">
        <Icon name="user" size={14} />
        <b>Viewing as client</b>
        <span>Read-mostly view shown to your customer — only their own sites, requests, quotes and invoices are visible. Internal screens (work orders, contractor accreditation, automations…) are hidden.</span>
      </div>

      <div className="content-inner" style={{ paddingTop: 0 }}>
        {/* KPI strip */}
        <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <div className="kpi">
            <div className="kpi-top">
              <div className="kpi-ico" style={{ background: softBg("accent"), color: solid("accent") }}><Icon name="mapPin" size={16} /></div>
              <span className="kpi-label">Sites</span>
            </div>
            <div className="kpi-val">{CLIENT_SITES.length}</div>
            <div className="kpi-foot">{CLIENT_SITES.filter((s) => s.health === "ok").length} all clear · {CLIENT_SITES.filter((s) => s.health !== "ok").length} need attention</div>
          </div>
          <div className="kpi">
            <div className="kpi-top">
              <div className="kpi-ico" style={{ background: softBg("warn"), color: solid("warn") }}><Icon name="alertCircle" size={16} /></div>
              <span className="kpi-label">Open requests</span>
            </div>
            <div className="kpi-val">{openCount}</div>
            <div className="kpi-foot">raised by your team</div>
          </div>
          <div className="kpi" style={{ borderColor: pendingQuote ? "var(--warn)" : "" }}>
            <div className="kpi-top">
              <div className="kpi-ico" style={{ background: softBg("warn"), color: solid("warn") }}><Icon name="file" size={16} /></div>
              <span className="kpi-label">Quotes to approve</span>
            </div>
            <div className="kpi-val" style={{ color: pendingQuote ? "var(--warn)" : "" }}>{pendingQuote}</div>
            <div className="kpi-foot">awaiting your sign-off</div>
          </div>
          <div className="kpi">
            <div className="kpi-top">
              <div className="kpi-ico" style={{ background: softBg("crit"), color: solid("crit") }}><Icon name="creditCard" size={16} /></div>
              <span className="kpi-label">Invoices outstanding</span>
            </div>
            <div className="kpi-val">{openInvoices}<small style={{ marginLeft: 6, color: "var(--ink-3)" }}>· €{owedAmount.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small></div>
            <div className="kpi-foot">on standard 30-day terms</div>
          </div>
        </div>

        <div className="cp-grid">
          {/* Sites */}
          <div className="card" style={{ gridColumn: "span 2" }}>
            <div className="card-head">
              <h3>Your sites</h3>
              <span className="sub">live status across the portfolio</span>
              <span className="head-act"><Pill tone="ok" dot>{CLIENT_SITES.filter((s) => s.health === "ok").length} healthy</Pill></span>
            </div>
            <div className="cp-sites">
              {CLIENT_SITES.map((s) => (
                <div key={s.name} className={"cp-site cp-site-" + s.health}>
                  <div className="cp-site-ico">
                    <Icon name="mapPin" size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cp-site-name">{s.name}</div>
                    <div className="cp-site-meta">{s.role} · {s.loc}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <Pill tone={s.health === "ok" ? "ok" : s.health === "warn" ? "warn" : "crit"} dot>
                      {s.health === "ok" ? "All clear" : s.health === "warn" ? "Needs attention" : "Issues"}
                    </Pill>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{s.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming PPM */}
          <div className="card">
            <div className="card-head">
              <h3>Upcoming visits</h3>
              <span className="sub">planned maintenance</span>
            </div>
            <div className="cp-ppm-list">
              {CP_VISITS.map((v) => (
                <div key={v.id} className="cp-ppm-row">
                  <div className="cp-ppm-date">
                    <div className="cp-ppm-day">{v.when.split("·")[0].trim()}</div>
                    <div className="cp-ppm-time">{v.when.split("·")[1].trim()}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cp-ppm-what">{v.what}</div>
                    <div className="cp-ppm-meta">{v.site} · {v.who} · {v.dur}</div>
                    {v.access && <div className="cp-ppm-access"><Icon name="info" size={11} />{v.access}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quotes awaiting approval */}
          <div className="card" style={{ gridColumn: "span 3" }}>
            <div className="card-head">
              <h3>Quotes awaiting your approval</h3>
              <span className="sub">approve to instruct · decline to re-tender</span>
              <span className="head-act"><Pill tone={pendingQuote ? "warn" : "ok"} dot>{pendingQuote ? pendingQuote + " pending" : "All caught up"}</Pill></span>
            </div>
            {quotes.length === 0 ? (
              <div className="empty" style={{ padding: "44px 20px" }}>
                <div className="empty-ico"><Icon name="checkCircle" size={26} /></div>
                <h3>No quotes need your sign-off</h3>
                <p>We'll email you the moment a new one lands.</p>
              </div>
            ) : (
              <div className="cp-quote-list">
                {quotes.map((q) => (
                  <div key={q.id} className="cp-quote">
                    <div className="cp-quote-head">
                      <div>
                        <div className="cp-quote-title">{q.title}</div>
                        <div className="cp-quote-sub">{q.site} · ref {q.wo} · quote {q.id}</div>
                      </div>
                      <div className="cp-quote-amt">{q.amount}<small>ex-VAT</small></div>
                    </div>
                    <div className="cp-quote-body">
                      <div className="cp-quote-meta">
                        <span><Icon name="user" size={11} />{q.contractor}</span>
                        <span><Icon name="clock" size={11} />Lead time {q.lead}</span>
                        <span><Icon name="award" size={11} />Rating {q.rating}</span>
                        <span><Icon name="alertCircle" size={11} />{q.expires}</span>
                      </div>
                      <div className="cp-quote-price">{q.priceLine}</div>
                    </div>
                    <div className="cp-quote-actions">
                      <button className="btn" style={{ background: "var(--crit-soft)", color: "var(--crit)", borderColor: "color-mix(in oklch, var(--crit) 30%, var(--line))" }}
                        onClick={() => setDecision({ quote: q, action: "decline" })}>
                        <Icon name="x" size={14} />Decline
                      </button>
                      <button className="btn btn-primary"
                        style={{ background: "var(--ok)" }}
                        onClick={() => setDecision({ quote: q, action: "approve" })}>
                        <Icon name="check" size={14} />Approve &amp; instruct
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open requests */}
          <div className="card" style={{ gridColumn: "span 2" }}>
            <div className="card-head">
              <h3>Your open requests</h3>
              <span className="sub">jobs you raised with HazardLink</span>
              <span className="head-act"><Pill tone="accent" dot>{openCount} open</Pill></span>
            </div>
            <div className="wo-head" style={{ gridTemplateColumns: "100px 1.6fr 1fr 150px 150px" }}>
              <div>Ref</div><div>Issue</div><div>Site</div><div>Status</div><div>Raised</div>
            </div>
            {requests.map((r) => (
              <div key={r.id} className="wo-row" style={{ gridTemplateColumns: "100px 1.6fr 1fr 150px 150px" }}>
                <div className="wo-id">{r.id}</div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{r.note}</div>
                </div>
                <div className="wo-site">{r.site}</div>
                <div><Pill tone={r.tone} dot>{r.status}</Pill></div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {r.raised}
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>by {r.raisedBy}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Invoices */}
          <div className="card">
            <div className="card-head">
              <h3>Invoices</h3>
              <span className="sub">last 30 days</span>
            </div>
            <div className="cp-inv-list">
              {CP_INVOICES.map((i) => (
                <div key={i.id} className="cp-inv-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cp-inv-id">{i.id}</div>
                    <div className="cp-inv-desc">{i.desc}</div>
                    <div className="cp-inv-meta">{i.site} · issued {i.date} · due {i.due}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="cp-inv-amt">{i.amount}</div>
                    <Pill tone={i.tone} dot>{i.status}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cp-foot">
          <Icon name="shield" size={13} />
          Powered by HazardLink · This view is provided to your organisation under your FM contract. All requests are SLA-tracked.
        </div>
      </div>

      {logOpen && <LogRequestModal onClose={() => setLogOpen(false)} onSubmit={onLogged} />}
      {decision && (
        <QuoteDecisionModal
          quote={decision.quote} action={decision.action}
          onClose={() => setDecision(null)}
          onConfirm={decide} />
      )}
      {toastNode}
    </div>
  );
}

Object.assign(window, { ClientPortalView });

/* ════════════════════ asset_09_686d9fda.js ════════════════════ */
;
/* HazardLink — Forms
   Library of digital forms / checklists + a simple drag-to-reorder
   form builder with a live preview pane. */

const FIELD_TYPES = [
  { id: "text",      label: "Short text",      icon: "file",       hint: "single-line answer" },
  { id: "longtext",  label: "Long text",       icon: "file",       hint: "multi-line answer / notes" },
  { id: "number",    label: "Number",          icon: "activity",   hint: "numeric value with units" },
  { id: "yesno",     label: "Yes / No",        icon: "checkCircle", hint: "two-option toggle" },
  { id: "choice",    label: "Multiple choice", icon: "grid",       hint: "pick one from a list" },
  { id: "rating",    label: "Rating 1–5",      icon: "award",      hint: "score with 5 stars" },
  { id: "photo",     label: "Photo",           icon: "camera",     hint: "operative uploads a picture" },
  { id: "signature", label: "Signature",       icon: "edit",       hint: "captured on glass" },
];

const FIELD_LABELS = Object.fromEntries(FIELD_TYPES.map((f) => [f.id, f.label]));

/* Seeded forms library */
const SEED_FORMS = [];

const DEFAULT_FIELD = (type) => {
  const base = { id: "fd" + Math.random().toString(36).slice(2, 8),
    type, label: FIELD_LABELS[type] + " question", required: false, options: [] };
  if (type === "choice") base.options = ["Option 1", "Option 2", "Option 3"];
  return base;
};

/* ============================================================
   Form library
   ============================================================ */
function FormLibrary({ forms, onOpen, onNew, onDelete }) {
  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Forms &amp; checklists</h1>
          <p className="page-desc">
            Digital forms used across cleaning, security and maintenance.
            Built once here, filled in on mobile by the team in the field.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" size={15} />New form
        </button>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("accent"), color: solid("accent") }}><Icon name="file" size={16} /></div><span className="kpi-label">Forms in library</span></div>
          <div className="kpi-val">{forms.length}</div>
          <div className="kpi-foot">across cleaning, security and maintenance</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("ok"), color: solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">Submissions today</span></div>
          <div className="kpi-val">{forms.reduce((s, f) => s + (f.usedToday || 0), 0)}</div>
          <div className="kpi-foot">filled in by field staff</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("clean"), color: solid("clean") }}><Icon name="droplet" size={16} /></div><span className="kpi-label">Most used</span></div>
          <div className="kpi-val" style={{ fontSize: 18, lineHeight: 1.2 }}>{[...forms].sort((a, b) => (b.usedToday || 0) - (a.usedToday || 0))[0]?.name || "—"}</div>
          <div className="kpi-foot">{[...forms].sort((a, b) => (b.usedToday || 0) - (a.usedToday || 0))[0]?.usedToday || 0} submissions today</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background: softBg("warn"), color: solid("warn") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Fields available</span></div>
          <div className="kpi-val">{FIELD_TYPES.length}</div>
          <div className="kpi-foot">text · number · y/n · choice · photo · signature…</div>
        </div>
      </div>

      <div className="forms-grid">
        {forms.map((f) => {
          const meta = discMeta[f.disc] || discMeta.maint;
          const tone = f.disc === "clean" ? "clean" : f.disc === "secure" ? "secure" : "maint";
          return (
            <button key={f.id} className="form-card" onClick={() => onOpen(f.id)}>
              <div className="form-card-head">
                <div className="form-card-ico" style={{ background: softBg(tone), color: solid(tone) }}>
                  <Icon name={f.icon} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="form-card-name">{f.name}</div>
                  <div className="form-card-disc">{meta.label}</div>
                </div>
                <Icon name="chevronRight" size={16} />
              </div>
              <div className="form-card-desc">{f.description}</div>
              <div className="form-card-fields">
                {f.fields.slice(0, 5).map((fd) => (
                  <span key={fd.id} className="form-chip">
                    <Icon name={FIELD_TYPES.find((t) => t.id === fd.type)?.icon || "file"} size={10} />
                    {fd.label.length > 22 ? fd.label.slice(0, 20) + "…" : fd.label}
                  </span>
                ))}
                {f.fields.length > 5 && (
                  <span className="form-chip muted">+{f.fields.length - 5} more</span>
                )}
              </div>
              <div className="form-card-foot">
                <div className="form-card-stat">
                  <b>{f.fields.length}</b>
                  <span>field{f.fields.length === 1 ? "" : "s"}</span>
                </div>
                <div className="form-card-stat">
                  <b>{f.usedToday}</b>
                  <span>used today</span>
                </div>
                <div className="form-card-stat">
                  <b>{f.lastUsed}</b>
                  <span>last submission</span>
                </div>
                <span className="form-card-owner">by {f.owner}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Field row in the builder (left column)
   ============================================================ */
function FieldEditor({ field, idx, total, onChange, onDelete, onMove, isSelected, onSelect }) {
  const meta = FIELD_TYPES.find((t) => t.id === field.type);
  return (
    <div className={"fb-field" + (isSelected ? " selected" : "")} onClick={() => onSelect(field.id)}>
      <div className="fb-field-head">
        <span className="fb-field-ico"><Icon name={meta?.icon || "file"} size={13} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input className="fb-field-label" value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            onClick={(e) => e.stopPropagation()} />
          <div className="fb-field-type">{meta?.label || field.type}{field.required ? " · required" : ""}</div>
        </div>
        <div className="fb-field-tools">
          <button className="fb-tool" onClick={(e) => { e.stopPropagation(); onMove(idx, idx - 1); }} disabled={idx === 0} title="Move up">
            <Icon name="chevronUp" size={13} />
          </button>
          <button className="fb-tool" onClick={(e) => { e.stopPropagation(); onMove(idx, idx + 1); }} disabled={idx === total - 1} title="Move down">
            <Icon name="chevronDown" size={13} />
          </button>
          <button className="fb-tool danger" onClick={(e) => { e.stopPropagation(); onDelete(field.id); }} title="Delete field">
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      {isSelected && (
        <div className="fb-field-cfg" onClick={(e) => e.stopPropagation()}>
          <label className="fb-req">
            <input type="checkbox" checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })} />
            Required field
          </label>
          {field.type === "choice" && (
            <div className="fb-options">
              <div className="fb-options-l">Options</div>
              {field.options.map((opt, i) => (
                <div key={i} className="fb-opt-row">
                  <input className="dv-input" value={opt}
                    onChange={(e) => {
                      const next = [...field.options];
                      next[i] = e.target.value;
                      onChange({ ...field, options: next });
                    }} />
                  <button className="fb-tool danger" onClick={() => {
                    const next = field.options.filter((_, j) => j !== i);
                    onChange({ ...field, options: next });
                  }}><Icon name="x" size={12} /></button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={() => onChange({ ...field, options: [...field.options, "New option"] })}>
                <Icon name="plus" size={12} />Add option
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Live preview pane (right column)
   ============================================================ */
function PreviewField({ field }) {
  const required = field.required ? <span className="fp-req">*</span> : null;
  switch (field.type) {
    case "text":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <input className="dv-input" placeholder="Type your answer…" />
        </div>
      );
    case "longtext":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <textarea className="dv-input" rows="3" placeholder="Type your answer…" />
        </div>
      );
    case "number":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <input className="dv-input" type="number" placeholder="0" />
        </div>
      );
    case "yesno":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <div className="fp-yesno">
            <button className="fp-yn"><Icon name="check" size={13} />Yes</button>
            <button className="fp-yn"><Icon name="x" size={13} />No</button>
          </div>
        </div>
      );
    case "choice":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <div className="fp-choice">
            {(field.options || []).map((o, i) => (
              <button key={i} className="fp-choice-opt">
                <span className="fp-radio" />{o}
              </button>
            ))}
          </div>
        </div>
      );
    case "rating":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <div className="fp-rating">
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className="fp-star">★</span>)}
          </div>
        </div>
      );
    case "photo":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <div className="fp-photo">
            <Icon name="camera" size={22} />
            <div>
              <div style={{ fontWeight: 650, fontSize: 13 }}>Tap to take a photo</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>Camera or gallery</div>
            </div>
          </div>
        </div>
      );
    case "signature":
      return (
        <div className="fp-field">
          <label className="fp-label">{field.label} {required}</label>
          <div className="fp-sig">
            <div className="fp-sig-line" />
            <div className="fp-sig-hint">Sign here</div>
          </div>
        </div>
      );
    default:
      return <div className="fp-field">{field.label}</div>;
  }
}

function FormPreview({ form }) {
  return (
    <div className="fp-shell">
      <div className="fp-phone">
        <div className="fp-phone-head">
          <Icon name="chevronLeft" size={14} />
          <div style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700 }}>HazardLink Mobile</div>
          <Icon name="bell" size={14} />
        </div>
        <div className="fp-phone-body">
          <h2 className="fp-title">{form.name}</h2>
          <p className="fp-desc">{form.description}</p>
          {form.fields.length === 0 && (
            <div className="empty" style={{ padding: "40px 20px", margin: "20px 0" }}>
              <div className="empty-ico"><Icon name="plus" size={22} /></div>
              <h3>No fields yet</h3>
              <p>Add fields from the left to start building.</p>
            </div>
          )}
          {form.fields.map((f) => <PreviewField key={f.id} field={f} />)}
          {form.fields.length > 0 && (
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 18, justifyContent: "center" }}>
              <Icon name="check" size={15} />Submit form
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Form builder
   ============================================================ */
function FormBuilder({ formIn, onBack, onSave }) {
  const [form, setForm]         = React.useState(formIn);
  const [selected, setSelected] = React.useState(formIn.fields[0]?.id || null);

  const addField = (type) => {
    const fd = DEFAULT_FIELD(type);
    setForm((f) => ({ ...f, fields: [...f.fields, fd] }));
    setSelected(fd.id);
  };

  const updateField = (next) => {
    setForm((f) => ({ ...f, fields: f.fields.map((x) => x.id === next.id ? next : x) }));
  };

  const deleteField = (id) => {
    setForm((f) => ({ ...f, fields: f.fields.filter((x) => x.id !== id) }));
    if (selected === id) setSelected(null);
  };

  const moveField = (from, to) => {
    if (to < 0 || to >= form.fields.length) return;
    setForm((f) => {
      const next = [...f.fields];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return { ...f, fields: next };
    });
  };

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to forms
      </button>

      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <input className="fb-form-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Untitled form" />
          <textarea className="fb-form-desc" rows="2"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Short description shown above the form on mobile…" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>
            <Icon name="check" size={15} />Save form
          </button>
        </div>
      </div>

      <div className="fb-grid">
        {/* LEFT — field palette + ordered field list */}
        <div className="fb-col">
          <div className="card">
            <div className="card-head">
              <h3>Add a field</h3>
              <span className="sub">{FIELD_TYPES.length} field types</span>
            </div>
            <div className="fb-palette">
              {FIELD_TYPES.map((t) => (
                <button key={t.id} className="fb-pal-btn" onClick={() => addField(t.id)}>
                  <Icon name={t.icon} size={14} />
                  <div style={{ minWidth: 0 }}>
                    <div className="fb-pal-l">{t.label}</div>
                    <div className="fb-pal-h">{t.hint}</div>
                  </div>
                  <Icon name="plus" size={13} />
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Form fields</h3>
              <span className="sub">{form.fields.length} field{form.fields.length === 1 ? "" : "s"} · drag-reorder coming soon · use arrows</span>
            </div>
            <div className="fb-fields">
              {form.fields.length === 0 && (
                <div className="empty" style={{ padding: "40px 20px" }}>
                  <div className="empty-ico"><Icon name="plus" size={22} /></div>
                  <h3>No fields yet</h3>
                  <p>Pick a field type above to get started.</p>
                </div>
              )}
              {form.fields.map((fd, i) => (
                <FieldEditor key={fd.id}
                  field={fd} idx={i} total={form.fields.length}
                  isSelected={selected === fd.id}
                  onSelect={setSelected}
                  onChange={updateField}
                  onDelete={deleteField}
                  onMove={moveField} />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — live preview */}
        <div className="fb-col fb-preview-col">
          <div className="fb-preview-cap">
            <Icon name="monitor" size={13} />Live preview · this is what the team sees on mobile
          </div>
          <FormPreview form={form} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Top-level Forms view — switches between library and builder
   ============================================================ */
function FormsView({ go }) {
  const [forms, setForms] = React.useState(SEED_FORMS);
  const [editing, setEditing] = React.useState(null); // form id or "new"
  const { showToast, toastNode } = useViewToast();

  const openForm = (id) => setEditing(id);
  const newForm = () => setEditing("new");

  const current = editing === "new"
    ? { id: "f" + Date.now(), name: "Untitled form", description: "", disc: "maint", icon: "file",
        lastUsed: "never", usedToday: 0, owner: "You", fields: [] }
    : forms.find((f) => f.id === editing);

  const saveForm = (next) => {
    setForms((fs) => {
      const exists = fs.some((f) => f.id === next.id);
      if (exists) return fs.map((f) => f.id === next.id ? { ...f, ...next, lastUsed: "just edited" } : f);
      return [...fs, { ...next, lastUsed: "just created" }];
    });
    setEditing(null);
    showToast(editing === "new" ? `Form "${next.name}" created` : `Form "${next.name}" saved`);
  };

  if (editing && current) {
    return (
      <React.Fragment>
        <FormBuilder formIn={current} onBack={() => setEditing(null)} onSave={saveForm} />
        {toastNode}
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <FormLibrary forms={forms} onOpen={openForm} onNew={newForm} />
      {toastNode}
    </React.Fragment>
  );
}

Object.assign(window, { FormsView });

/* ════════════════════ asset_13_4d008642.js ════════════════════ */
;
/* HazardLink — Safety Data Sheets: library + add-product wizard */

const WZ_STEPS = ["Identify product", "Review extraction", "Verify and save"];

function BarcodeAnim() {
  const heights = [18,30,22,40,15,35,25,20,38,28,18,42,22,35,18,30,25,40,20,35,28,18,32,22];
  return (
    <div className="barcode-scan-anim">
      {heights.map((h, i) => (
        <div key={i} className="barcode-bar" style={{ width:3, height:h, opacity: i % 3 === 0 ? 1 : i % 3 === 1 ? 0.6 : 0.35 }} />
      ))}
      <div className="scan-line" />
    </div>
  );
}

function WizardStep1({ onNext }) {
  const [mode, setMode]       = React.useState("scan");
  const [scanning, setScanning] = React.useState(false);
  const [scanned, setScanned]  = React.useState(false);
  const [manualName, setManualName] = React.useState("");

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => { setScanning(false); setScanned(true); }, 2000);
  };

  return (
    <div>
      <div className="seg" style={{ marginBottom:20 }}>
        <button className={mode === "scan" ? "on" : ""} onClick={() => { setMode("scan"); setScanned(false); }}>Scan barcode</button>
        <button className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>Manual entry</button>
      </div>

      {mode === "scan" ? (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <BarcodeAnim />
          {!scanned ? (
            <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
              <Icon name="scan" size={15} />{scanning ? "Scanning..." : "Tap to scan barcode"}
            </button>
          ) : (
            <div className="barcode-field">
              <Icon name="scan" size={20} />
              —
              <div style={{ marginLeft:"auto" }}><Pill tone="ok" dot>Matched</Pill></div>
            </div>
          )}
          {!scanned && (
            <div style={{ textAlign:"center", color:"var(--ink-3)", fontSize:13 }}>
              Or upload the PDF directly
              <button className="btn btn-ghost btn-sm" style={{ marginLeft:8 }}><Icon name="file" size={13} />Upload PDF</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {[["Product name", manualName, setManualName], ["Supplier", "", null], ["Barcode / product code", "", null]].map(([lbl, val, setter], i) => (
            <div key={i}>
              <label style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em", color:"var(--ink-3)", display:"block", marginBottom:6 }}>{lbl}</label>
              <input defaultValue={val} style={{ width:"100%", border:"1px solid var(--line)", borderRadius:10, padding:"10px 13px", fontSize:14, background:"var(--surface-2)", color:"var(--ink)", outline:"none", fontFamily:"inherit" }}
                onChange={setter ? (e) => setter(e.target.value) : undefined} />
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop:22, display:"flex", justifyContent:"flex-end" }}>
        <button className="btn btn-primary"
          disabled={mode === "scan" && !scanned}
          style={{ opacity: mode === "scan" && !scanned ? .45 : 1 }}
          onClick={onNext}>
          <Icon name="arrowRight" size={15} />Next: review extraction
        </button>
      </div>
    </div>
  );
}

function WizardStep2({ onNext, onBack }) {
  const [loading, setLoading] = React.useState(true);
  const ext = HL.sdsExtraction;

  React.useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1800);
    return () => clearTimeout(t);
  }, []);

  const fields = [
    { key:"Product",          val:ext.product },
    { key:"Supplier",         val:ext.supplier },
    { key:"Product code",     val:ext.productCode },
    { key:"Hazard statements",val:ext.hazards },
    { key:"PPE required",     val:ext.ppe },
    { key:"First aid — skin", val:ext.firstAidSkin },
    { key:"First aid — eyes", val:ext.firstAidEyes },
    { key:"Storage",          val:ext.storage },
    { key:"Disposal",         val:ext.disposal },
    { key:"Dilution guide",   val:ext.dilution },
  ];

  if (loading) {
    return (
      <div style={{ padding:"52px 0", textAlign:"center" }}>
        <div className="mic-orb" style={{ margin:"0 auto 18px", width:68, height:68 }}>
          <Icon name="sparkles" size={26} />
        </div>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Reading the SDS PDF...</div>
        <div style={{ color:"var(--ink-3)", fontSize:13, maxWidth:380, margin:"0 auto", lineHeight:1.6 }}>
          Extracting hazards, PPE and first-aid instructions directly from the document. Nothing is inferred or invented.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="ai-scope" style={{ marginBottom:18 }}>
        <div className="ai-scope-head">
          <Icon name="sparkles" size={17} />
          <b>Extracted from the uploaded PDF</b>
          <span className="tag">grounded, not invented</span>
        </div>
        <p>Every value below was read directly from the safety data sheet. Nothing is assumed. A person verifies before the sheet goes live to field teams.</p>
      </div>
      <div className="card card-pad">
        {fields.map((f, i) => (
          <div className="extract-row" key={i}>
            <div className="extract-key">{f.key}</div>
            <div>
              <div className="extract-val">{f.val}</div>
              <span className="extract-source"><Icon name="sparkles" size={10} />from document</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:18, display:"flex", gap:10, justifyContent:"space-between" }}>
        <button className="btn" onClick={onBack}><Icon name="arrowLeft" size={15} />Back</button>
        <button className="btn btn-primary" onClick={onNext}><Icon name="arrowRight" size={15} />Next: verify and save</button>
      </div>
    </div>
  );
}

function WizardStep3({ onSave, onBack }) {
  const [status, setStatus] = React.useState("verified");

  const opts = [
    { v:"verified",     tone:"ok",   label:"Verified",      desc:"I have checked the extracted data against the original SDS and it is correct. This sheet can go live to field teams now." },
    { v:"needs-review", tone:"warn", label:"Needs review",  desc:"One or more extracted values need a colleague or the supplier to confirm before going live." },
  ];

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom:20 }}>
        <div className="panel-label" style={{ marginBottom:14 }}>Verification status</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {opts.map((opt) => (
            <div key={opt.v} onClick={() => setStatus(opt.v)}
              style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"13px 14px",
                border:`1px solid ${status === opt.v ? solid(opt.tone) : "var(--line)"}`,
                borderRadius:10, cursor:"pointer",
                background: status === opt.v ? softBg(opt.tone) : "var(--surface-2)",
                transition:"all .14s" }}>
              <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${status === opt.v ? solid(opt.tone) : "var(--line)"}`, display:"grid", placeItems:"center", marginTop:2, flex:"none" }}>
                {status === opt.v && <div style={{ width:8, height:8, borderRadius:"50%", background:solid(opt.tone) }} />}
              </div>
              <div>
                <Pill tone={opt.tone} dot>{opt.label}</Pill>
                <div style={{ fontSize:13, color:"var(--ink-2)", marginTop:8, lineHeight:1.55 }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, justifyContent:"space-between" }}>
        <button className="btn" onClick={onBack}><Icon name="arrowLeft" size={15} />Back</button>
        <button className="btn btn-primary" onClick={() => onSave(status)}>
          <Icon name="check" size={15} />Save to library
        </button>
      </div>
    </div>
  );
}

function SDSView({ go }) {
  const [mode, setMode]       = React.useState("library");
  const [step, setStep]       = React.useState(0);
  const [products, setProducts] = React.useState(HL.sds);
  const [toast, setToast]     = React.useState(null);

  const handleSave = (status) => {
    const newProd = { id:"", name:"",
      supplier:"", disc:"clean", hazard:"—",
      status: status === "verified" ? "Verified" : "Awaiting check",
      stone: status === "verified" ? "ok" : "warn",
      date: status === "verified" ? "verified just now" : "AI-extracted, needs a person" };
    setProducts((p) => [newProd, ...p]);
    setMode("library");
    setStep(0);
    setToast(status === "verified" ? "SDS saved and live to field teams" : "SDS saved, awaiting verification");
    setTimeout(() => setToast(null), 4200);
  };

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Safety data sheets</h1>
          <p className="page-desc">Every chemical on site, read from the original document. AI extracts, a person verifies.</p>
        </div>
        {mode === "library" && (
          <button className="btn btn-primary" onClick={() => { setMode("adding"); setStep(0); }}>
            <Icon name="plus" size={15} />Add product
          </button>
        )}
      </div>

      {mode === "adding" ? (
        <div style={{ maxWidth:680 }}>
          <div className="wizard-steps" style={{ marginBottom:28 }}>
            {WZ_STEPS.map((label, i) => (
              <React.Fragment key={i}>
                <div className={"wz-step" + (i < step ? " done" : i === step ? " active" : "")}>
                  <div className="wz-dot">{i < step ? <Icon name="check" size={12} /> : i + 1}</div>
                  <div className="wz-label">{label}</div>
                </div>
                {i < WZ_STEPS.length - 1 && <div className={"wz-line" + (i < step ? " done" : "")} />}
              </React.Fragment>
            ))}
          </div>

          <div className="card card-pad">
            {step === 0 && <WizardStep1 onNext={() => setStep(1)} />}
            {step === 1 && <WizardStep2 onNext={() => setStep(2)} onBack={() => setStep(0)} />}
            {step === 2 && <WizardStep3 onSave={handleSave} onBack={() => setStep(1)} />}
          </div>

          <button className="btn btn-ghost" style={{ marginTop:12 }} onClick={() => { setMode("library"); setStep(0); }}>
            Cancel
          </button>
        </div>
      ) : (
        <React.Fragment>
          <div className="card" style={{ marginBottom:18 }}>
            <div className="wo-head" style={{ gridTemplateColumns:"44px 1fr 140px 150px 1fr" }}>
              <div></div><div>Product</div><div>Supplier</div><div>Hazard</div><div>Status</div>
            </div>
            {products.map((s) => (
              <div key={s.id} className="wo-row" style={{ gridTemplateColumns:"44px 1fr 140px 150px 1fr" }}>
                <div className="asset-ic" style={{ background:softBg(s.disc), color:solid(s.disc), border:"none" }}>
                  <Icon name="beaker" size={18} />
                </div>
                <div className="asset-nm">{s.name}<small>{s.id}</small></div>
                <div style={{ fontSize:13, color:"var(--ink-2)" }}>{s.supplier}</div>
                <div>
                  <Pill tone={["Corrosive","Flammable gas","Flammable"].includes(s.hazard) ? "crit" : "warn"} icon="alertTri">
                    {s.hazard}
                  </Pill>
                </div>
                <div>
                  <Pill tone={s.stone} icon={s.stone === "ok" ? "checkCircle" : "clock"}>{s.status}</Pill>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:4 }}>{s.date}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ai-scope">
            <div className="ai-scope-head">
              <Icon name="sparkles" size={17} />
              <b>How HazardLink reads safety sheets</b>
              <span className="tag">grounded, not invented</span>
            </div>
            <p>Scan the product barcode and upload the PDF. HazardLink reads the safety data sheet and pulls hazard statements, PPE requirements and first-aid instructions directly from the document — never inferring or inventing. Every sheet is verified by a person before it goes live to field teams.</p>
          </div>
        </React.Fragment>
      )}

      {toast && (
        <div className="toast">
          <Icon name="checkCircle" size={18} />{toast}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SDSView });

/* ════════════════════ asset_33_a7d2e48a.js ════════════════════ */
;
/* HazardLink — Asset register with QR codes, scanner support, full asset detail */

function _serviceHistory(asset) {
  return [];
}

/* ===========================================================
   List view
   =========================================================== */
function AssetsView({ go, onScan, pendingScan, onConsumeScan }) {
  const D = useSiteData();
  const [detailId, setDetailId] = React.useState(null);
  const [addOpen, setAddOpen]   = React.useState(false);

  React.useEffect(() => {
    if (pendingScan) {
      setDetailId(pendingScan.id);
      onConsumeScan && onConsumeScan();
    }
  }, [pendingScan && pendingScan.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (detailId) {
    const a = HL.assets.find((x) => x.id === detailId);
    if (!a) { setDetailId(null); return null; }
    return <AssetDetail asset={a} onBack={() => setDetailId(null)} />;
  }

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Asset register</h1>
          <p className="page-desc">Every asset and its full service history — a tap or scan away from any work order or contractor.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={onScan}><Icon name="scan" size={15} />Scan</button>
          <button className="btn" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} />Add asset</button>
        </div>
      </div>

      {addOpen && (
        <SimpleAddModal
          title="Add asset"
          subtitle="Register equipment and put it on the maintenance plan."
          icon="box"
          submitLabel="Add asset" submitIcon="check"
          successTitle="Asset added"
          successCopy="The asset is on the register. Schedule a PPM or log a reading whenever you're ready."
          fields={[
            { id:"name",  label:"Asset name", placeholder:"e.g. Rooftop HVAC unit 4" },
            { id:"site",  label:"Site",       type:"select", options:HL.sites.map((s) => s.name) },
            { id:"make",  label:"Make and model",  placeholder:"e.g. Daikin ZEAS, installed 2024" },
            { id:"category", label:"Category", type:"select", options:["HVAC","Refrigeration","Plumbing","Lifts","Doors","Fire safety","Lighting","Pool plant","Other"] },
          ]}
          onClose={() => setAddOpen(false)} />
      )}

      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:"56px 36px 1fr 180px 140px 110px 32px" }}>
          <div>QR</div><div></div><div>Asset</div><div>Site</div><div>Health</div><div>Last service</div><div></div>
        </div>
        {D.assets.map((a) => (
          <div className="wo-row" key={a.id} style={{ gridTemplateColumns:"56px 36px 1fr 180px 140px 110px 32px" }}
            onClick={() => setDetailId(a.id)}>
            <div className="qr-thumb" title={a.id}>
              <QRCode value={a.id} size={40} />
            </div>
            <div className="asset-ic"><Icon name={a.icon} size={18} /></div>
            <div className="asset-nm">{a.name}<small>{a.id}</small></div>
            <div style={{ fontSize:13, color:"var(--ink-2)" }}>{a.site}</div>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <div className="health-bar"><i style={{ width:a.health + "%", background:solid(a.htone) }} /></div>
              <span style={{ fontSize:12.5, fontWeight:700, color:solid(a.htone), fontVariantNumeric:"tabular-nums" }}>{a.health}%</span>
            </div>
            <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>{a.last}</div>
            <div style={{ color:"var(--ink-3)" }}><Icon name="chevronRight" size={16} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
   Full-page Asset Detail
   =========================================================== */
function AssetDetail({ asset, onBack }) {
  const a = asset;
  const history = _serviceHistory(a);
  const [printedAt, setPrintedAt] = React.useState(null);

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to assets
      </button>

      <div className="detail-head-row">
        <div className="dh-ico" style={{ background:softBg("maint"), color:solid("maint") }}>
          <Icon name={a.icon} size={20} />
        </div>
        <div className="dh-title">
          <h1>{a.name}</h1>
          <div className="dh-id"><Icon name="scan" size={13} />{a.id} · {a.site}</div>
          <div className="dh-pills">
            <Pill tone={a.htone} dot>
              {a.htone === "ok" ? "Healthy" : a.htone === "warn" ? "Monitor" : "Critical"}
            </Pill>
            <Pill tone="muted">Last service {a.last}</Pill>
          </div>
        </div>
        <div className="detail-head-actions">
          <button className="btn"><Icon name="plus" size={15} />Log service</button>
          <button className="btn btn-primary"><Icon name="wrench" size={15} />Raise work order</button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="card card-pad">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:9 }}>
              <div style={{ fontWeight:700, fontSize:14, fontFamily:"var(--font-head)" }}>Asset health</div>
              <span style={{ fontWeight:800, fontSize:18, color:solid(a.htone), fontVariantNumeric:"tabular-nums", fontFamily:"var(--mono)" }}>{a.health}%</span>
            </div>
            <div className="qbar" style={{ height:9 }}>
              <i style={{ width:a.health + "%", background:solid(a.htone) }} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Service history</h3>
              <span className="sub">{history.length} events · newest first</span>
            </div>
            <div style={{ padding: "14px 18px" }}>
              <div className="stepper">
                {history.map((h, i) => <Step s={h} key={i} />)}
              </div>
            </div>
          </div>
        </div>

        <div className="detail-side">
          <div className="card qr-card">
            <QRCode value={a.id} size={200} />
            <div className="qr-id-mono">{a.id}</div>
            <button className="btn qr-print-btn" onClick={() => {
              setPrintedAt("Sent to label printer");
              setTimeout(() => setPrintedAt(null), 2600);
            }}>
              <Icon name="file" size={15} />Print label
            </button>
            {printedAt && (
              <div style={{ fontSize:11.5, color:"var(--ok)", fontWeight:700, display:"inline-flex", alignItems:"center", gap:6 }}>
                <Icon name="checkCircle" size={13} />{printedAt}
              </div>
            )}
          </div>

          <div className="card meta-card">
            <div className="info-row"><span className="k">Asset ID</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{a.id}</span></div>
            <div className="info-row"><span className="k">Site</span><span className="v">{a.site}</span></div>
            <div className="info-row"><span className="k">Last service</span><span className="v">{a.last}</span></div>
            <div className="info-row"><span className="k">Condition</span>
              <span className="v"><Pill tone={a.htone} dot>{a.htone === "ok" ? "Good" : a.htone === "warn" ? "Monitor" : "Critical"}</Pill></span>
            </div>
            <div className="info-row" style={{ borderBottom:"none" }}>
              <span className="k">Category</span><span className="v" style={{ textTransform:"capitalize" }}>{a.icon === "droplet" ? "Pool plant" : a.icon === "shield" ? "Fire safety" : a.icon === "monitor" ? "IT / kiosk" : "Mechanical"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AssetsView, AssetDetail });

/* ════════════════════ asset_41_2f9cf588.js ════════════════════ */
;
/* HazardLink — Contractor accreditation & compliance portal.
   Lists contractor companies with insurance + accreditation + staff status,
   detail with tabs (Documents, Staff, Rate card, Jobs), gate that blocks
   suspended contractors from being dispatched. */

/* Only real backend rows (uuid ids) may call the authed claim-invite
   endpoint — sample/demo ids like "c1" must never hit the API. */
const isRealContractorId = (id) => /^[0-9a-f-]{36}$/i.test(String(id || ""));

/* ============================================================
   Display labels for the existing status keys (compliant/expiring/blocked).
   We map them to Approved / Action needed / Suspended for the UI. */
const STATUS_META = {
  compliant: { tone:"ok",   label:"Approved",       icon:"checkCircle" },
  expiring:  { tone:"warn", label:"Action needed",  icon:"clock" },
  blocked:   { tone:"crit", label:"Suspended",       icon:"alertTri" },
};

/* ============================================================
   Per-contractor extras: insurance, accreditations, documents,
   rate cards, historic jobs. Keyed by HL.contractors id.
   Empty for a new org — populated as real contractors are added. */
const CONTRACTOR_EXTRA = {};

const SHORT_NAMES = {};

function countCerts(c) {
  let valid = 0, expiring = 0, expired = 0;
  c.staff.forEach((p) => p.certs.forEach((x) => {
    if (x.status === "valid")    valid++;
    if (x.status === "expiring") expiring++;
    if (x.status === "expired")  expired++;
  }));
  return { valid, expiring, expired, total: c.staff.length * 4 };
}

function countDocs(extra) {
  if (!extra) return { valid: 0, expiring: 0, expired: 0, total: 0 };
  let valid = 0, expiring = 0, expired = 0;
  extra.docs.forEach((d) => {
    if (d.status === "valid")    valid++;
    if (d.status === "expiring") expiring++;
    if (d.status === "expired")  expired++;
  });
  return { valid, expiring, expired, total: extra.docs.length };
}

/* ============================================================
   Re-used cert card from prior version
   ============================================================ */
function CertCard({ c }) {
  const tone = c.status === "valid" ? "ok" : c.status === "expiring" ? "warn" : "crit";
  let label;
  if (c.status === "valid")    label = "Valid";
  else if (c.status === "expired")  label = "Expired";
  else if (c.status === "expiring") label = c.inDays != null
    ? (c.inDays < 0 ? Math.abs(c.inDays) + "d overdue" : "In " + c.inDays + "d")
    : "Expiring";
  else label = c.status;

  return (
    <div className={"cert-card cert-" + c.status}>
      <div className="cert-name">{c.name}</div>
      <div className="cert-dates">
        <span>Issued <b>{c.issued}</b></span>
        <span>{c.status === "expired" ? "Expired " : "Expires "}<b>{c.expires}</b></span>
      </div>
      <Pill tone={tone} dot>{label}</Pill>
    </div>
  );
}

function StaffBlock({ p }) {
  const blocking = p.certs.filter((x) => x.status === "expired").length;
  return (
    <div className={"staff-block" + (blocking > 0 ? " blocked" : "")}>
      <div className="staff-head">
        <div className="staff-av">{p.initials}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="staff-name">{p.name}</div>
          <div className="staff-role">{p.role}</div>
        </div>
        {blocking > 0
          ? <Pill tone="crit" dot>{`${blocking} cert${blocking !== 1 ? "s" : ""} blocking`}</Pill>
          : <Pill tone="ok" dot>All certs valid</Pill>}
      </div>
      <div className="cert-grid">
        {p.certs.map((x, i) => <CertCard c={x} key={i} />)}
      </div>
    </div>
  );
}

/* ============================================================
   Request documents modal — also re-used for per-doc re-request
   ============================================================ */
function RequestDocsModal({ c, doc, onClose, onSent }) {
  const [step, setStep] = React.useState(1);
  const [email, setEmail] = React.useState(c.email);
  const title = doc ? `Re-request "${doc.name}"` : `Request documents from ${c.name}`;
  const subtitle = doc
    ? "Sends a single-document upload link directly to the contractor."
    : "Sends a secure no-login upload link with all missing or expiring documents pre-listed.";
  const initialMsg = doc
    ? `Hi ${c.contact}, please upload a current "${doc.name}" — the version on file expires ${doc.expires}. The link is single-use and works from any device.`
    : `Hi ${c.contact}, please upload current versions of the documents listed below. No login needed — open the link from any device, drop the PDFs in, and we’ll do the rest.`;
  const [message, setMessage] = React.useState(initialMsg);
  const link = "hazardlink.app/upload/" + c.id.toUpperCase() + (doc ? "-DOC" : "-3F8K");

  const items = doc ? [doc.name] : ["Public Liability Insurance","Employers Liability Insurance","SafeContractor accreditation","Master RAMS","Tax clearance"];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="send" size={18} /></div>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body">
          {step === 1 && (
            <React.Fragment>
              <div className="ai-field" style={{ marginBottom:14 }}>
                <label>Send to</label>
                <input className="dv-input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="ai-field" style={{ marginBottom:14 }}>
                <label>{doc ? "Document" : "Documents to request"}</label>
                <div className="cert-tags">
                  {items.map((t) => <span key={t} className="cert-tag">{t}<Icon name="x" size={11} /></span>)}
                </div>
              </div>
              <div className="ai-field">
                <label>Message</label>
                <textarea className="dv-input" rows="4" value={message}
                  onChange={(e) => setMessage(e.target.value)} />
              </div>
              <p style={{ fontSize:12.5, color:"var(--ink-3)", marginTop:14, lineHeight:1.55 }}>
                The link is single-use, expires in 7 days, and lets {c.contact} upload from any device.
                Auto reminders go out 30, 14 and 3 days before each document expires.
              </p>
            </React.Fragment>
          )}
          {step === 2 && (
            <div style={{ textAlign:"center", padding:"12px 0" }}>
              <div className="mic-orb" style={{ width:72, height:72 }}><Icon name="checkCircle" size={28} /></div>
              <h3 style={{ margin:"16px 0 4px", fontSize:17, fontFamily:"var(--font-head)" }}>Secure upload link sent</h3>
              <p style={{ fontSize:13, color:"var(--ink-2)", margin:"0 auto", maxWidth:380, lineHeight:1.55 }}>
                Emailed to {email}. {c.contact} can upload from any device — no login required.
              </p>
              <div className="link-preview"><Icon name="file" size={14} />{link}</div>
              <div style={{ marginTop:6 }}>
                <Pill tone="warn" dot>Pending upload</Pill>
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step === 1 ? (
            <React.Fragment>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { setStep(2); onSent && onSent(c.id, doc); }}>
                <Icon name="send" size={15} />Send secure link
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

/* ============================================================
   List view — wider, info-dense cards
   ============================================================ */
function InsuranceLine({ label, line }) {
  if (!line) {
    return (
      <div className="ct-ins-row missing">
        <span className="ct-ins-l">{label}</span>
        <Pill tone="muted" dot>Not on file</Pill>
      </div>
    );
  }
  const tone = line.status === "valid" ? "ok" : line.status === "expiring" ? "warn" : "crit";
  return (
    <div className="ct-ins-row">
      <span className="ct-ins-l">{label}</span>
      <span className="ct-ins-amt">{line.amount}</span>
      <span className="ct-ins-prov">{line.provider}</span>
      <span className="ct-ins-exp">
        {line.status === "expired" ? "Expired " : "Expires "}<b>{line.expires}</b>
      </span>
      <Pill tone={tone} dot>{line.status === "valid" ? "Valid" : line.status === "expiring" ? "Expiring" : "Expired"}</Pill>
    </div>
  );
}

function AccBadge({ a }) {
  const tone = a.status === "valid" ? "ok" : a.status === "expiring" ? "warn" : "crit";
  return (
    <span className={"acc-badge acc-" + tone}>
      <span className="acc-dot" />
      {a.name}
      {a.status !== "valid" && (
        <span className="acc-meta">
          {a.status === "expired" ? "expired" : (a.inDays != null ? "in " + a.inDays + "d" : "expiring")}
        </span>
      )}
    </span>
  );
}

function ContractorCard({ c, onOpen, onRequest, onInvite, inviting }) {
  const m = STATUS_META[c.status];
  const counts = countCerts(c);
  const extra  = CONTRACTOR_EXTRA[c.id];
  const dcounts = countDocs(extra);
  const blocked = c.status === "blocked";

  return (
    <div className={"ct-card" + (blocked ? " blocked" : "")}>
      {blocked && (
        <div className="block-strip">
          <Icon name="alertTri" size={14} />
          Not permitted on site — auto-reminders sent. Cannot be dispatched until insurance + RAMS renewed.
        </div>
      )}
      <div className="ct-card-body">
        <div className="ct-card-head">
          <div className="ct-av">{c.initials}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="ct-name">{SHORT_NAMES[c.name] || c.name}</div>
            <div className="ct-type">{c.type} · {c.location}</div>
          </div>
          <Pill tone={m.tone} dot icon={m.icon}>{m.label}</Pill>
        </div>

        {extra && (
          <div className="ct-ins-block">
            <InsuranceLine label="PL" line={extra.insurance.pl} />
            <InsuranceLine label="EL" line={extra.insurance.el} />
          </div>
        )}

        {extra && (
          <div className="ct-acc-row">
            {extra.accreditations.map((a, i) => <AccBadge a={a} key={i} />)}
          </div>
        )}

        <div className="ct-stats">
          <div><span className="n">{c.staff.length}</span><span className="l">staff</span></div>
          <div><span className="n" style={{ color:"var(--ok)" }}>{counts.valid}<small>/{counts.total}</small></span><span className="l">certs valid</span></div>
          {counts.expiring > 0 && <div><span className="n" style={{ color:"var(--warn)" }}>{counts.expiring}</span><span className="l">expiring</span></div>}
          {counts.expired  > 0 && <div><span className="n" style={{ color:"var(--crit)" }}>{counts.expired}</span><span className="l">expired</span></div>}
          {dcounts.total > 0 && (
            <div><span className="n" style={{ color: dcounts.expired ? "var(--crit)" : "var(--ink)" }}>
              {dcounts.valid}<small>/{dcounts.total}</small>
            </span><span className="l">docs on file</span></div>
          )}
        </div>

        <div className="ct-actions">
          <button className="btn btn-primary" onClick={() => onOpen(c.id)}>
            Open contractor<Icon name="chevronRight" size={14} />
          </button>
          <button className="btn" onClick={() => onRequest(c, null)}>
            <Icon name="send" size={14} />{blocked ? "Resend reminder" : "Request documents"}
          </button>
          {onInvite && isRealContractorId(c.id) && (
            <button className="btn" disabled={!!inviting} onClick={() => onInvite(c)}>
              <Icon name="link" size={14} />{inviting ? "Inviting…" : "Invite to profile"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Detail — tabbed view
   ============================================================ */
function DocRow({ doc, onReRequest }) {
  const tone = doc.status === "valid" ? "ok" : doc.status === "expiring" ? "warn" : "crit";
  const label = doc.status === "valid" ? "Valid"
              : doc.status === "expired" ? "Expired"
              : (doc.inDays != null ? "In " + doc.inDays + "d" : "Expiring");
  return (
    <div className={"doc-row doc-" + doc.status}>
      <div className="doc-ico"><Icon name="file" size={15} /></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div className="doc-name">{doc.name}</div>
        <div className="doc-meta">{doc.category} · issued {doc.issued}</div>
      </div>
      <div className="doc-exp">
        <div className="doc-exp-l">{doc.status === "expired" ? "Expired" : "Expires"}</div>
        <div className="doc-exp-v">{doc.expires}</div>
      </div>
      <Pill tone={tone} dot>{label}</Pill>
      <button className="btn btn-sm" onClick={() => onReRequest(doc)}>
        <Icon name="send" size={12} />
        {doc.status === "valid" ? "Re-request" : "Re-request"}
      </button>
    </div>
  );
}

function DocumentsTab({ c, extra, onReRequest }) {
  const cats = ["Insurance","Accreditation","RAMS","Method statement","Tax"];
  return (
    <React.Fragment>
      {cats.map((cat) => {
        const items = extra.docs.filter((d) => d.category === cat);
        if (items.length === 0) return null;
        return (
          <div className="card" key={cat} style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h3>{cat}</h3>
              <span className="sub">{items.length} document{items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="doc-list">
              {items.map((d, i) => <DocRow doc={d} key={i} onReRequest={onReRequest} />)}
            </div>
          </div>
        );
      })}
    </React.Fragment>
  );
}

function RateCardTab({ extra }) {
  const groups = [
    { label:"Labour rates",   keys:["Standard labour rate","Apprentice rate","Out-of-hours rate","Out-of-hours rate (after 18:00)","Weekend & bank holiday"] },
    { label:"Callout & misc", keys:["Emergency callout fee","Quarterly fire-panel test","Refrigerant disposal surcharge","Materials mark-up","Travel rate"] },
    { label:"SLA",            keys:["Standard SLA response","Out-of-hours SLA response","Critical alarm response"] },
  ];
  const usedKeys = new Set();
  return (
    <div className="card">
      <div className="card-head">
        <h3>Rate card</h3>
        <span className="sub">agreed framework rates · ex-VAT</span>
        <span className="head-act"><Pill tone="muted" dot>EUR</Pill></span>
      </div>
      <div className="rate-card">
        {groups.map((g) => {
          const rows = extra.rateCard.rows.filter((r) => g.keys.includes(r.label));
          rows.forEach((r) => usedKeys.add(r.label));
          if (rows.length === 0) return null;
          return (
            <div key={g.label} className="rate-group">
              <div className="rate-group-l">{g.label}</div>
              <div className="rate-rows">
                {rows.map((r, i) => (
                  <div key={i} className="rate-row">
                    <div className="rate-row-l">{r.label}</div>
                    <div className="rate-row-u">{r.unit || ""}</div>
                    <div className="rate-row-v">{r.value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobsTab({ c, extra }) {
  const live = HL.workOrders.filter((w) => (w.assignee || "").toLowerCase().includes(c.initials.toLowerCase()) ||
    (w.assignee || "").includes(c.name.split(/[\s,]/)[0]) ||
    (w.assignee || "").includes(SHORT_NAMES[c.name] || ""));
  const allJobs = [
    ...live.map((w) => ({
      id:w.id, title:w.title, site:w.site, closed:w.status === "Done" ? "recent" : w.status, cost:w.priority,
      rating:null, status:w.status,
    })),
    ...extra.historicJobs.map((j) => ({ ...j, status:"Closed" })),
  ];

  return (
    <div className="card">
      <div className="card-head">
        <h3>Work history</h3>
        <span className="sub">{allJobs.length} job{allJobs.length === 1 ? "" : "s"} on record</span>
        <span className="head-act">
          <Pill tone="ok" dot>{extra.historicJobs.filter((j) => j.rating).length} rated jobs</Pill>
        </span>
      </div>
      <div className="wo-head" style={{ gridTemplateColumns:"96px 1.5fr 1fr 130px 100px 80px" }}>
        <div>WO</div><div>Job</div><div>Site</div><div>Closed</div><div>Cost</div><div>Rating</div>
      </div>
      {allJobs.map((j) => (
        <div key={j.id} className="wo-row" style={{ gridTemplateColumns:"96px 1.5fr 1fr 130px 100px 80px" }}>
          <div className="wo-id">{j.id}</div>
          <div style={{ fontSize:13.5, fontWeight:650 }}>{j.title}</div>
          <div className="wo-site">{j.site}</div>
          <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>{j.closed}</div>
          <div style={{ fontFamily:"var(--mono)", fontSize:12.5, fontWeight:700 }}>{j.cost}</div>
          <div>
            {j.rating ? (
              <span style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:700, color:"var(--ok)" }}>
                {j.rating.toFixed(1)}
              </span>
            ) : (
              <Pill tone="muted">—</Pill>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContractorDetail({ c, onBack, onRequest, onReRequest }) {
  const [tab, setTab] = React.useState("documents");
  const m = STATUS_META[c.status];
  const counts = countCerts(c);
  const extra  = CONTRACTOR_EXTRA[c.id];
  const dcounts = countDocs(extra);
  const blocked = c.status === "blocked";

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to contractors
      </button>

      <div className="wo-detail-head">
        <div className="ct-av-lg">{c.initials}</div>
        <div style={{ flex:1 }}>
          <div className="wo-num">CRO {c.cro}</div>
          <h1 style={{ margin:"4px 0 8px" }}>{c.name}</h1>
          <div className="tags">
            <Pill tone={m.tone} dot icon={m.icon}>{m.label}</Pill>
            <Pill tone="muted" icon="mapPin">{c.location}</Pill>
            <Pill tone="muted">{c.type}</Pill>
            {c.pendingUpload && <Pill tone="warn" dot>Pending upload</Pill>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onRequest(c, null)}>
          <Icon name="send" size={15} />{blocked ? "Resend reminder" : "Request documents"}
        </button>
      </div>

      {blocked && (
        <div className="block-banner">
          <Icon name="alertTri" size={22} />
          <div>
            <b>Not permitted on site — accreditation gate active</b>
            <p>
              {c.name} cannot be assigned new work orders or dispatched to any site until expired insurance and RAMS are renewed.
              {c.blockedSummary ? " " + c.blockedSummary : ""} HazardLink has {c.remindedAt || "emailed " + c.contact + " this morning"}, and an auto-reminder will go again every 48 hours until the documents are uploaded.
            </p>
          </div>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-main">
          <div className="ct-summary card card-pad">
            <div className="ct-sum-item">
              <div className="ct-sum-n">{c.staff.length}</div>
              <div className="ct-sum-l">staff on file</div>
            </div>
            <div className="ct-sum-divider" />
            <div className="ct-sum-item">
              <div className="ct-sum-n" style={{ color:"var(--ok)" }}>{counts.valid}<small>/{counts.total}</small></div>
              <div className="ct-sum-l">staff certs valid</div>
            </div>
            <div className="ct-sum-divider" />
            <div className="ct-sum-item">
              <div className="ct-sum-n" style={{ color: dcounts.expired ? "var(--crit)" : "var(--ok)" }}>
                {dcounts.valid}<small>/{dcounts.total}</small>
              </div>
              <div className="ct-sum-l">company docs valid</div>
            </div>
            {(dcounts.expiring + dcounts.expired) > 0 && (
              <React.Fragment>
                <div className="ct-sum-divider" />
                <div className="ct-sum-item">
                  <div className="ct-sum-n" style={{ color: dcounts.expired ? "var(--crit)" : "var(--warn)" }}>
                    {dcounts.expiring + dcounts.expired}
                  </div>
                  <div className="ct-sum-l">need attention</div>
                </div>
              </React.Fragment>
            )}
          </div>

          <div className="tabs">
            {[
              ["documents", `Documents (${extra ? extra.docs.length : 0})`],
              ["staff",     `Staff (${c.staff.length})`],
              ["rates",     "Rate card"],
              ["jobs",      `Jobs (${(extra ? extra.historicJobs.length : 0)})`],
            ].map(([id, label]) => (
              <button key={id} className={"tab-btn" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "documents" && extra && <DocumentsTab c={c} extra={extra} onReRequest={(d) => onReRequest(c, d)} />}
          {tab === "staff"     && c.staff.map((p) => <StaffBlock p={p} key={p.id} />)}
          {tab === "rates"     && extra && <RateCardTab extra={extra} />}
          {tab === "jobs"      && extra && <JobsTab c={c} extra={extra} />}
        </div>

        <div className="detail-side">
          <div className="card card-pad">
            <div className="panel-label">Primary contact</div>
            <div className="info-row"><span className="k">Name</span><span className="v">{c.contact}</span></div>
            <div className="info-row"><span className="k">Email</span><span className="v" style={{ color:"var(--accent-ink)" }}>{c.email}</span></div>
            <div className="info-row"><span className="k">Phone</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{c.phone}</span></div>
            <div className="info-row"><span className="k">CRO</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{c.cro}</span></div>
            <div className="info-row"><span className="k">Last refresh</span><span className="v">{c.lastRefresh}</span></div>
          </div>

          {extra && (
            <div className="card card-pad">
              <div className="panel-label">Insurance</div>
              {[
                ["Public Liability",   extra.insurance.pl],
                ["Employers Liability", extra.insurance.el],
                ["Professional Indemnity", extra.insurance.pi],
              ].map(([k, v]) => (
                <div className="info-row" key={k}>
                  <span className="k">{k}</span>
                  <span className="v" style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2 }}>
                    {v ? (
                      <React.Fragment>
                        <b>{v.amount}</b>
                        <small style={{ color:"var(--ink-3)", fontWeight:500 }}>
                          {v.provider} · {v.status === "expired" ? "expired " : "to "}{v.expires}
                        </small>
                      </React.Fragment>
                    ) : (
                      <Pill tone="muted">Not on file</Pill>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {extra && (
            <div className="card card-pad">
              <div className="panel-label">Accreditations</div>
              <div className="acc-list">
                {extra.accreditations.map((a, i) => (
                  <div className="acc-list-row" key={i}>
                    <span>{a.name}</span>
                    <Pill tone={a.status === "valid" ? "ok" : a.status === "expiring" ? "warn" : "crit"} dot>
                      {a.status === "valid" ? "Valid"
                       : a.status === "expired" ? "Expired"
                       : (a.inDays != null ? "In " + a.inDays + "d" : "Expiring")}
                    </Pill>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h3>Auto reminders</h3></div>
            <div className="card-pad" style={{ paddingTop:14 }}>
              <p style={{ margin:"0 0 12px", fontSize:13, color:"var(--ink-2)", lineHeight:1.55 }}>
                HazardLink emails {c.contact} when any document hits these thresholds:
              </p>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <Pill tone="ok"   dot>30 days</Pill>
                <Pill tone="warn" dot>14 days</Pill>
                <Pill tone="crit" dot>3 days</Pill>
                <Pill tone="crit" dot>Expired</Pill>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Auto reminder activity card (re-used)
   ============================================================ */
function AutoReminderCard({ reminders }) {
  return (
    <div className="card auto-rem-card">
      <div className="card-head">
        <div className="ar-ico"><Icon name="bell" size={15} /></div>
        <div>
          <h3>Automatic document reminders</h3>
          <div className="sub">Emails go out 30, 14 and 3 days before each document expires, then on the day it expires.</div>
        </div>
        <div className="head-act">
          <Pill tone="ok" dot>{reminders.length} sent this week</Pill>
        </div>
      </div>
      <div className="ar-list">
        {reminders.slice(0, 4).map((r) => {
          const tone = r.state === "expired" ? "crit" : r.state === "expiring" ? "warn" : "muted";
          return (
            <div className="ar-row" key={r.id}>
              <div className={"ar-mark ar-" + tone}>
                <Icon name={r.state === "expired" ? "alertTri" : "clock"} size={13} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="ar-title">{r.cert} — {r.whom}<small>{r.contractor}</small></div>
                <div className="ar-meta">
                  <span>
                    {r.state === "expired"  && "Expired · auto reminder sent"}
                    {r.state === "expiring" && "Expires in " + r.days + " days"}
                    {r.state === "upcoming" && r.days + "-day notice"}
                  </span>
                  <span className="ar-sep" />
                  <span>{r.sentAt}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Top-level view
   ============================================================ */
/* ── Contractor directory (in-app) ──────────────────────────────────────────
   Contractors who claimed their profile from a tender email and opted in are
   listed here for every HazardLink organisation. "Add to my contractors"
   copies them into this org so they can be tendered through the normal flow. */
function DirectoryPanel({ showToast }) {
  const [items, setItems]       = React.useState(null); // null = loading
  const [error, setError]       = React.useState(false);
  const [q, setQ]               = React.useState("");
  const [county, setCounty]     = React.useState("All");
  const [addingId, setAdding]   = React.useState(null);
  const [addedIds, setAddedIds] = React.useState({});

  React.useEffect(() => {
    fetch((window.HL_API_BASE || "/api") + "/public/directory")
      .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then((b) => setItems(b.contractors || []))
      .catch(() => { setError(true); setItems([]); });
  }, []);

  const counties = ["All", ...Array.from(new Set((items || []).map((c) => c.county).filter(Boolean))).sort()];
  const needle = q.trim().toLowerCase();
  const filtered = (items || []).filter((c) => {
    if (county !== "All" && c.county !== county) return false;
    if (needle) {
      const hay = (c.name + " " + (c.services || "") + " " + (c.bio || "")).toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const initialsFor = (name) =>
    (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  const addToMine = (c) => {
    if (addingId || addedIds[c.id]) return;
    setAdding(c.id);
    const token = localStorage.getItem("bor.token") || "";
    fetch((window.HL_API_BASE || "/api") + "/directory/" + c.id + "/add", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })).catch(() => ({ ok: false, b: null })))
      .then(({ ok, b }) => {
        if (!ok || !b || !b.contractor) throw new Error("add_failed");
        setAddedIds((prev) => ({ ...prev, [c.id]: true }));
        // Reflect immediately in "my contractors" without a reload.
        const n = b.contractor;
        if (!HL.contractors.some((x) => x.id === String(n.id))) {
          HL.contractors.push({
            id: String(n.id),
            name: n.name || c.name,
            type: n.services || c.services || "Contractor",
            location: n.county || c.county || "—",
            contact: n.contactName || n.name || "—",
            email: n.email || "—",
            phone: n.phone || "—",
            cro: "—",
            insurance: n.insuranceExpiry ? "On file · expires " + n.insuranceExpiry : "—",
            status: "compliant",
            lastRefresh: "added from the directory",
            pendingUpload: false,
            initials: initialsFor(n.name || c.name),
            staff: [],
          });
        }
        showToast(b.existed ? c.name + " is already in your contractors" : c.name + " added to your contractors");
      })
      .catch(() => showToast("Could not add this contractor. Try again."))
      .finally(() => setAdding(null));
  };

  if (items === null) {
    return <div className="card card-pad" style={{ color:"var(--ink-3)", fontSize:13.5 }}>Loading the directory…</div>;
  }

  return (
    <React.Fragment>
      <div className="toolbar" style={{ marginBottom:14 }}>
        <input className="dv-input" style={{ maxWidth:260 }} placeholder="Search name or service…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="dv-input" style={{ maxWidth:180 }} value={county} onChange={(e) => setCounty(e.target.value)}>
          {counties.map((x) => <option key={x} value={x}>{x === "All" ? "All counties" : x}</option>)}
        </select>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {filtered.length} listed contractor{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      {error && (
        <div className="card card-pad" style={{ color:"var(--warn)", fontSize:13.5, marginBottom:12 }}>
          Could not load the directory. Check your connection and reopen this tab.
        </div>
      )}

      {!error && filtered.length === 0 && (
        <div className="card" style={{ textAlign:"center", padding:"44px 24px" }}>
          <div style={{ fontWeight:700, color:"var(--ink-2)", marginBottom:6 }}>
            {q || county !== "All" ? "No listed contractors match" : "No listed contractors yet"}
          </div>
          <div style={{ fontSize:13.5, color:"var(--ink-3)", maxWidth:460, margin:"0 auto" }}>
            Contractors appear here when they claim the profile link from a tender email and opt in to the directory. Invite yours with the Invite to profile button on their card.
          </div>
        </div>
      )}

      <div className="ct-list ct-list-1col">
        {filtered.map((c) => (
          <div className="card card-pad" key={c.id} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
            <div className="avatar" style={{ flex:"none" }}>{initialsFor(c.name)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <b style={{ fontSize:14.5 }}>{c.name}</b>
                {c.county && <Pill tone="muted">{c.county}</Pill>}
                {c.insuranceValid && <Pill tone="ok" dot>Insurance on file</Pill>}
                {c.claimed && <Pill tone="accent">Verified profile</Pill>}
              </div>
              {c.services && <div style={{ fontSize:12.5, color:"var(--ink-2)", marginTop:3 }}>{c.services}</div>}
              {c.bio && <div style={{ fontSize:12.5, color:"var(--ink-3)", marginTop:5, lineHeight:1.5 }}>{c.bio}</div>}
              <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:6 }}>
                {(c.documentCount || 0)} document{(c.documentCount || 0) === 1 ? "" : "s"} on file{typeof c.rating === "number" ? " · rated " + c.rating + "/100" : ""}
              </div>
            </div>
            <button className="btn" disabled={!!addedIds[c.id] || addingId === c.id}
              style={addedIds[c.id] ? { opacity:.65 } : null}
              onClick={() => addToMine(c)}>
              <Icon name={addedIds[c.id] ? "check" : "plus"} size={14} />
              {addedIds[c.id] ? "Added" : addingId === c.id ? "Adding…" : "Add to my contractors"}
            </button>
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

function ContractorsView({ go }) {
  const [openId, setOpenId]                   = React.useState(null);
  const [reqModal, setReqModal]               = React.useState(null); // { c, doc }
  const [pendingOverride, setPendingOverride] = React.useState({});
  const [filter, setFilter]                   = React.useState("All");
  const [invitingId, setInvitingId]           = React.useState(null);
  const { showToast, toastNode } = useViewToast();

  const contractors = HL.contractors.map((c) =>
    pendingOverride[c.id]
      ? { ...c, pendingUpload:true, pendingSince:pendingOverride[c.id] }
      : c
  );

  const handleSent = (id) => {
    setPendingOverride((prev) => ({ ...prev, [id]: "just now" }));
  };

  const handleRequest = (c, doc) => setReqModal({ c, doc: doc || null });

  /* Send the contractor their no-login profile/claim link. Real backend rows
     only — the guard means sample ids like "c1" never reach the API. */
  const handleInvite = (c) => {
    if (!isRealContractorId(c.id) || invitingId) return;
    setInvitingId(c.id);
    const token = localStorage.getItem("bor.token") || "";
    fetch((window.HL_API_BASE || "/api") + "/contractors/" + c.id + "/claim-invite", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })).catch(() => ({ ok: false, b: null })))
      .then(({ ok, b }) => {
        if (!ok || !b || !b.url) throw new Error("invite_failed");
        if (b.emailed) {
          showToast("Profile invite emailed to " + (c.email && c.email !== "—" ? c.email : c.name));
        } else {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(b.url).catch(() => {});
          }
          showToast("No email on file. Invite link copied: " + b.url);
        }
      })
      .catch(() => showToast("Could not create the invite. Try again."))
      .finally(() => setInvitingId(null));
  };

  /* KPIs */
  const total      = contractors.length;
  const approved   = contractors.filter((c) => c.status === "compliant").length;
  const actionNeed = contractors.filter((c) => c.status === "expiring" || c.status === "blocked").length;
  const suspended  = contractors.filter((c) => c.status === "blocked").length;

  /* Documents expiring within 30 days (incl. already expired) */
  const docs30 = contractors.reduce((s, c) => {
    const ex = CONTRACTOR_EXTRA[c.id];
    if (!ex) return s;
    return s + ex.docs.filter((d) => d.status === "expiring" || d.status === "expired").length;
  }, 0);

  /* Detail view */
  if (openId) {
    const c = contractors.find((x) => x.id === openId);
    return (
      <React.Fragment>
        <ContractorDetail c={c} onBack={() => setOpenId(null)}
          onRequest={handleRequest}
          onReRequest={handleRequest} />
        {reqModal && (
          <RequestDocsModal
            c={reqModal.c} doc={reqModal.doc}
            onClose={() => setReqModal(null)}
            onSent={handleSent} />
        )}
        {toastNode}
      </React.Fragment>
    );
  }

  /* List view */
  const tabs = ["All", "Approved", "Action needed", "Suspended", "Directory"];
  const filtered = contractors.filter((c) => {
    if (filter === "All")            return true;
    if (filter === "Approved")       return c.status === "compliant";
    if (filter === "Action needed")  return c.status === "expiring";
    if (filter === "Suspended")      return c.status === "blocked";
    return true;
  });

  return (
    <div className="content-inner">
      {reqModal && (
        <RequestDocsModal
          c={reqModal.c} doc={reqModal.doc}
          onClose={() => setReqModal(null)}
          onSent={handleSent} />
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">Contractor accreditation</h1>
          <p className="page-desc">
            Approved suppliers with live insurance, accreditation and operative checks.
            Anyone without a current PL or EL cover, RAMS or a required staff cert is automatically gated from being dispatched.
          </p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn"><Icon name="plus" size={15} />Add contractor</button>
          <button className="btn btn-primary" onClick={() => handleRequest(contractors.find((c) => c.status === "blocked") || contractors[0], null)}>
            <Icon name="send" size={15} />Request documents
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div><span className="kpi-label">Approved</span></div>
          <div className="kpi-val">{approved}<small>/{total}</small></div>
          <div className="kpi-foot">cleared to attend site today</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="alertCircle" size={16} /></div><span className="kpi-label">Action needed</span></div>
          <div className="kpi-val" style={{ color: actionNeed ? "var(--warn)" : "var(--ok)" }}>{actionNeed}</div>
          <div className="kpi-foot">documents or certs need attention</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Suspended</span></div>
          <div className="kpi-val" style={{ color: suspended ? "var(--crit)" : "var(--ok)" }}>{suspended}</div>
          <div className="kpi-foot">gated — cannot be dispatched</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Docs expiring 30d</span></div>
          <div className="kpi-val">{docs30}</div>
          <div className="kpi-foot">across all approved contractors</div>
        </div>
      </div>

      <AutoReminderCard reminders={HL.reminders} />

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {filter === "Directory" ? "Find and add contractors" : filtered.length + " of " + total + " contractors"}
        </div>
      </div>

      {filter === "Directory" ? (
        <DirectoryPanel showToast={showToast} />
      ) : (
        <div className="ct-list ct-list-1col">
          {filtered.map((c) => (
            <ContractorCard key={c.id} c={c}
              onOpen={setOpenId}
              onRequest={handleRequest}
              onInvite={handleInvite}
              inviting={invitingId === c.id} />
          ))}
        </div>
      )}
      {toastNode}
    </div>
  );
}

Object.assign(window, { ContractorsView, CertCard, StaffBlock, countCerts, STATUS_META });

/* ════════════════════ asset_19_c52fcaaa.js ════════════════════ */
;
/* HazardLink — AI Assistant page (grounded, chat-style) */

/* ============================================================
   Grounding helpers — every fact in this view points back at a
   real record in the seed data. The respondTo() function only
   answers from these references.
   ============================================================ */

/* Find anything we need in the existing seed data. */
const AS_FACTS = (() => {
  const ppmOverdue = HL.ppmTasks.filter((t) => t.status === "overdue");
  const liveSpills = HL.spillAlerts.filter((a) => a.state === "new");
  const offlineHangers = HL.deviceBuildings
    .flatMap((b) => b.devices.map((d) => ({ ...d, building: b.name })))
    .filter((d) => d.type === "Hanger" && !d.online);
  const lowBatHangers = HL.deviceBuildings
    .flatMap((b) => b.devices.map((d) => ({ ...d, building: b.name })))
    .filter((d) => d.type === "Hanger" && d.battery !== null && d.battery < 20);
  const lowStock = HL.parts.filter((p) => p.status === "low" || p.status === "out");
  const expiringCerts = [];
  HL.ownStaff.forEach((s) => s.certs.forEach((c) => {
    if (c.status === "expiring") expiringCerts.push({ who: s.name, cert: c.name, days: c.inDays });
  }));
  return { ppmOverdue, liveSpills, offlineHangers, lowBatHangers, lowStock, expiringCerts };
})();

const AS_USER  = { name:"", initials:"" };

/* ============================================================
   "Needs your attention today" — AI-curated priority list
   ============================================================ */
const ATTENTION_ITEMS = [];

/* ============================================================
   Pre-loaded conversation — every AI claim is grounded with
   `sources` that point at real records in the seed data.
   ============================================================ */
const SEEDED_MESSAGES = [];

/* ============================================================
   Suggested example questions — fill the box on click
   ============================================================ */
const SUGGESTED = [
  "What live spills are open right now?",
  "Any low-stock parts about to run out?",
  "Show me unpaid invoices this week",
  "Which hangers are offline or low on battery?",
  "Recommend a technician for an HVAC job",
  "Are there any patrols missed today?",
  "Summarise this week's compliance status",
];

/* ============================================================
   Keyword-routed canned responses — used by submit().
   Each response is itself grounded; if we don't recognise the
   question we admit it instead of inventing an answer.
   ============================================================ */
function respondTo(q) {
  const s = q.toLowerCase();
  const has = (k) => s.includes(k);

  if (has("live spill") || has("spills now") || has("open spill") || (has("spill") && (has("right now") || has("open") || has("live")))) {
    const live = AS_FACTS.liveSpills;
    if (live.length === 0) {
      return { text:"No live spills on any site right now.", sources:[{ kind:"summary", id:"spillAlerts", go:"spills", tone:"ok" }] };
    }
    const txt = live.length + " live spill" + (live.length === 1 ? "" : "s") + " right now: "
      + live.map((s) => `${s.id} at ${s.site} (${s.location}, ${s.severity} severity, since ${s.raisedAt})`).join("; ")
      + ". Hanger sensors are confirming all of them — they're not user-reported.";
    return { text: txt, sources:[
      ...live.map((sp) => ({ kind:"spill", id: sp.id, go:"spills", tone: sp.severity === "high" ? "crit" : sp.severity === "medium" ? "warn" : "muted" })),
      { kind:"summary", id:"sensor-confirmed", go:"devices", tone:"accent" },
    ]};
  }

  if (has("low stock") || has("parts") || has("reorder") || has("out of stock")) {
    const low = AS_FACTS.lowStock;
    if (low.length === 0) return { text:"All consumable parts are at or above their minimum.", sources:[{ kind:"summary", id:"parts", go:"parts", tone:"ok" }] };
    const txt = low.length + " part" + (low.length === 1 ? " is" : "s are") + " at or below minimum: "
      + low.slice(0, 4).map((p) => `${p.id} ${p.name} (${p.onHand} on hand, min ${p.min}, supplier ${p.supplier})`).join("; ")
      + (low.length > 4 ? `; and ${low.length - 4} more in the parts table.` : ".")
      + " Automation AU-103 will raise purchase orders for any that drop further.";
    return { text: txt, sources:[
      ...low.slice(0, 3).map((p) => ({ kind:"part", id: p.id, go:"parts", tone:"maint" })),
      { kind:"automation", id:"AU-103 (auto-PO)", go:"automations", tone:"accent" },
    ]};
  }

  if (has("invoice") || has("unpaid") || has("overdue invoice") || has("billing")) {
    return { text:"No unpaid invoices on record right now.",
      sources:[{ kind:"summary", id:"invoices", go:"billing", tone:"ok" }]};
  }

  if (has("hanger") || has("offline") || has("low battery") || has("sensor")) {
    const off = AS_FACTS.offlineHangers;
    const low = AS_FACTS.lowBatHangers;
    const txt = (off.length || 0) + " hanger" + (off.length === 1 ? "" : "s") + " offline, " + (low.length || 0) + " on low battery: "
      + [
        ...off.map((d) => `${d.id} at ${d.building} (last seen ${d.lastSeen})`),
        ...low.map((d) => `${d.id} at ${d.building} (battery ${d.battery}%)`),
      ].join("; ") + ". Floor-plan pins for these are orange or carry the low-battery badge.";
    return { text: txt, sources:[
      ...off.slice(0, 2).map((d) => ({ kind:"device", id: d.id, go:"devices", tone:"warn" })),
      ...low.slice(0, 2).map((d) => ({ kind:"device", id: d.id, go:"devices", tone:"warn" })),
    ]};
  }

  if (has("hvac") || has("technician") || has("recommend") || has("assign")) {
    return { text:"There's no one on the roster yet, so I can't recommend a technician. Add staff and their certs and I'll match the best fit by site, competency and availability.",
      sources:[{ kind:"summary", id:"no staff on roster", go:"team", tone:"muted" }]};
  }

  if (has("patrol") || has("missed")) {
    return { text:"No patrols are scheduled, so there are no missed checkpoints to report.",
      sources:[{ kind:"summary", id:"patrols", go:"security", tone:"ok" }]};
  }

  if (has("attention") || has("needs my attention") || has("priorities") || has("what should i") || has("top of the list") || (has("today") && (has("attention") || has("focus") || has("priorit") || has("need") || has("important") || has("urgent") || has("my")))) {
    /* Optional "at {site}" filter — built from the org's OWN sites (HL.sites
       is hydrated from the backend), never from a hardcoded demo list. */
    const siteHints = (HL.sites || []).map((x) => ({
      key: String(x.name || "").toLowerCase(),
      name: x.name,
    })).filter((h) => h.key);
    const hint = siteHints.find((h) =>
      s.includes(h.key) ||
      h.key.split(/\s+/).some((w) => w.length > 3 && s.includes(w)));
    const items = hint
      ? ATTENTION_ITEMS.filter((it) => it.meta.toLowerCase().includes(hint.key))
      : ATTENTION_ITEMS;

    if (items.length === 0) {
      return hint
        ? { text:`Nothing on the priority list at ${hint.name} right now — every live spill, PPM, work order, cert and invoice is within target for that site today.`,
            sources:[{ kind:"site", id: hint.name, go:"site", tone:"ok" }]}
        : { text:"Nothing needs your attention right now — every live spill, PPM, work order, cert and invoice is within target across the estate.",
            sources:[{ kind:"summary", id:"all within target", go:null, tone:"ok" }]};
    }

    const lead = hint
      ? `${items.length} item${items.length === 1 ? "" : "s"} need your attention at ${hint.name} today.`
      : `${items.length} item${items.length === 1 ? "" : "s"} need your attention today, across the estate.`;
    const bullets = items.map((it) => {
      const meta = it.meta.split(" · ")[0];
      return `${it.title} (${meta})`;
    }).join("; ");
    const text = `${lead} Top of the list: ${bullets}. Open any of the source chips below to jump straight to the record.`;

    const KIND_TO_GO = { spill:"spills", ppm:"ppm", workorder:"maintenance", part:"parts",
      cert:"contractors", invoice:"billing", patrol:"security" };
    const KIND_TO_SRC = { spill:"spill", ppm:"ppm", workorder:"workorder", part:"part",
      cert:"cert", invoice:"invoice", patrol:"site" };

    const sources = items.map((it) => ({
      kind: KIND_TO_SRC[it.kind] || "summary",
      id: (it.meta.match(/\b[A-Z]+-\d+\b/) || [it.title.split(" — ")[0]])[0],
      go: KIND_TO_GO[it.kind] || it.go,
      tone: it.tone,
    }));
    return { text, sources };
  }

  if (has("log a job") || has("log a fault") || has("log a work order") || has("create a work order") || has("draft a job") || has("raise a wo") || (has("log") && (has("job") || has("fault") || has("leak") || has("radiator")))) {
    return { text:"I can draft work orders once you've added sites, assets and staff — right now there's nothing to match a job against. Set those up and I'll turn what you say into a confirm-before-dispatch draft.",
      sources:[{ kind:"summary", id:"no sites or assets yet", go:"maintenance", tone:"muted" }]};
  }

  if (has("compliance") || has("week") || has("summarise") || has("summary")) {
    return { text:"Nothing to report this week — no overdue PPMs, work orders past SLA, blocked contractors, expiring certs or overdue invoices on record. Everything is within target.",
      sources:[{ kind:"summary", id:"all within target", go:null, tone:"ok" }]};
  }

  /* I don't know — say so. Never invent. */
  return {
    text:"I don't have data on that in HazardLink — I can only answer from your real records (work orders, sensors, certs, invoices, schedules). Try a question about live spills, overdue PPMs, contractor compliance, low stock, or scheduling and I'll pull from the actual records.",
    sources:[{ kind:"meta", id:"grounded — no data for this", go:null, tone:"muted" }],
    nogo:true,
  };
}

/* ============================================================
   Source-chip tone + icon helpers
   ============================================================ */
const SRC_ICON = {
  ppm:"clock", site:"mapPin", contractor:"user", staff:"users",
  cert:"award", schedule:"calendar", spill:"alertTri", part:"package",
  invoice:"creditCard", device:"monitor", automation:"sparkles",
  workorder:"wrench", summary:"sparkles", meta:"sparkles",
};

function SourceChips({ sources }) {
  return (
    <div className="as-sources">
      <span className="as-sources-cap"><Icon name="link" size={11} />Sources</span>
      {sources.map((s, i) => (
        <span key={i} className={"as-source as-src-" + (s.tone || "muted") + (s.go ? " clickable" : "")}>
          <Icon name={SRC_ICON[s.kind] || "file"} size={11} />
          {s.id}
        </span>
      ))}
    </div>
  );
}

/* ============================================================
   Message bubbles
   ============================================================ */
function UserMsg({ msg }) {
  return (
    <div className="as-msg as-msg-user">
      <div className="as-bubble as-bubble-user">
        {msg.isVoice && <span className="as-msg-mic" title="Spoken question"><Icon name="mic" size={10} /></span>}
        {msg.text}
      </div>
      <div className="as-avatar as-avatar-user">{AS_USER.initials}</div>
    </div>
  );
}

function AIMsg({ msg, onSrc, onConfirmWO, onDeclineWO, onSpeak, speakingId }) {
  const isSpeaking = speakingId === msg.id;
  return (
    <div className="as-msg as-msg-ai">
      <div className="as-avatar as-avatar-ai"><Icon name="sparkles" size={15} /></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div className={"as-bubble as-bubble-ai" + (msg.correction ? " as-bubble-correction" : "") + (isSpeaking ? " as-bubble-speaking" : "")}>
          {msg.correction && (
            <div className="as-correction-cap">
              <Icon name="alertCircle" size={12} />Correcting an assumption — grounded in your data
            </div>
          )}
          {msg.thinking ? (
            <div className="as-thinking">
              <span className="as-dot" /><span className="as-dot" /><span className="as-dot" />
              <span>Reading records…</span>
            </div>
          ) : (
            <React.Fragment>
              {msg.text}
              {onSpeak && !msg.draftWO && (
                <button className={"as-speak-mini" + (isSpeaking ? " on" : "")}
                  onClick={() => onSpeak(msg.id, msg.text)}
                  title={isSpeaking ? "Stop speaking" : "Read aloud"}>
                  <Icon name={isSpeaking ? "x" : "activity"} size={11} />
                  {isSpeaking ? "Speaking…" : "Read aloud"}
                </button>
              )}
            </React.Fragment>
          )}
        </div>
        {msg.draftWO && (
          <div className="as-draft-wo">
            <div className="as-draft-cap">
              <Icon name="mic" size={11} />Drafted from your voice · confirm to dispatch
            </div>
            <div className="as-draft-row"><span className="k">Title</span><b>{msg.draftWO.title}</b></div>
            <div className="as-draft-row"><span className="k">Site</span><b>{msg.draftWO.site}</b></div>
            <div className="as-draft-row"><span className="k">Asset</span><b style={{ fontFamily:"var(--mono)", fontSize:13 }}>{msg.draftWO.asset}</b></div>
            <div className="as-draft-row"><span className="k">Priority</span>
              <b><PriorityPill p={msg.draftWO.priority} /></b>
            </div>
            <div className="as-draft-row"><span className="k">Assign to</span><b>{msg.draftWO.assignee}</b></div>
            <div className="as-draft-row"><span className="k">SLA target</span><b style={{ fontFamily:"var(--mono)" }}>{msg.draftWO.slaResponse}</b></div>
            {msg.confirmed ? (
              <div className="as-draft-done">
                <Icon name="checkCircle" size={14} /> Work order {msg.draftWO.id} dispatched
              </div>
            ) : msg.declined ? (
              <div className="as-draft-decl">Draft discarded — nothing dispatched.</div>
            ) : (
              <div className="as-draft-actions">
                <button className="btn" onClick={() => onDeclineWO && onDeclineWO(msg.id)}>
                  <Icon name="x" size={13} />Discard
                </button>
                <button className="btn btn-primary" onClick={() => onConfirmWO && onConfirmWO(msg.id, msg.draftWO)}>
                  <Icon name="check" size={13} />Confirm &amp; dispatch
                </button>
              </div>
            )}
          </div>
        )}
        {msg.sources && msg.sources.length > 0 && (
          <SourceChips sources={msg.sources.map((s) => ({ ...s, go: s.go && !msg.nogo ? s.go : null }))} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Attention card
   ============================================================ */
function AttentionCard({ item, onOpen }) {
  return (
    <button className={"as-att-card as-att-" + item.tone} onClick={() => item.go && onOpen(item.go)}>
      <div className={"as-att-ico as-att-ico-" + item.tone}>
        <Icon name={item.ico} size={14} />
      </div>
      <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
        <div className="as-att-title">{item.title}</div>
        <div className="as-att-meta">{item.meta}</div>
      </div>
      <span className={"pill pill-" + item.tone}>{item.pill}</span>
    </button>
  );
}

/* ============================================================
   Inline mic — listens straight into the textarea, no overlay.
   Cycles through a bank of plausible spoken questions so the
   demo always produces editable text in the box. */
const MIC_QUESTIONS = [
  "What needs my attention today?",
  "Log a job — leaking radiator on level 2",
  "Are there any low-stock parts about to run out?",
  "Which hangers are offline right now?",
  "Summarise this week's compliance status",
  "Are all the contractors compliant this week?",
  "Any patrols missed today?",
];

/* Curated suggested questions — grouped, friendly, with icons.
   These are the headline ways into the assistant. */
const ASK_SUGGESTIONS = [
  { q:"What needs my attention today?",   icon:"sparkles",   tone:"accent" },
  { q:"Which jobs are overdue?",           icon:"clock",       tone:"warn"   },
  { q:"Any contractors not compliant?",    icon:"user",         tone:"crit"  },
  { q:"What's low on stock?",              icon:"package",      tone:"warn"  },
  { q:"Are any spills live right now?",     icon:"alertTri",     tone:"crit"  },
  { q:"Who should I send to a job?",        icon:"users",         tone:"accent" },
  { q:"Show unpaid invoices",                icon:"creditCard",   tone:"crit"  },
];

/* ============================================================
   Main Assistant view
   ============================================================ */
function AssistantView({ go }) {
  const [messages, setMessages] = React.useState(SEEDED_MESSAGES);
  const [input, setInput] = React.useState("");
  const [busy,  setBusy]  = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [cycleIdx, setCycleIdx] = React.useState(0);
  const [speakingId, setSpeakingId] = React.useState(null);
  const speakTimer = React.useRef(null);
  const endRef = React.useRef(null);

  /* Inline mic state — fills the textarea word by word, no overlay. */
  const [micState, setMicState] = React.useState("idle"); // idle | listening
  const micTimer = React.useRef(null);

  React.useEffect(() => () => {
    if (speakTimer.current) clearTimeout(speakTimer.current);
    if (micTimer.current)   clearInterval(micTimer.current);
  }, []);

  React.useEffect(() => {
    endRef.current && endRef.current.scrollIntoView({ behavior:"smooth", block:"end" });
  }, [messages]);

  /* Mocked speech synthesis — marks a message as "speaking" for
     a duration based on its text length, then auto-clears. */
  const speakReply = (id, text) => {
    setSpeakingId(id);
    const wpm = 180; /* avg speaking rate */
    const words = (text || "").trim().split(/\s+/).length;
    const ms = Math.max(2200, Math.min(8000, (words / wpm) * 60_000));
    if (speakTimer.current) clearTimeout(speakTimer.current);
    speakTimer.current = setTimeout(() => setSpeakingId(null), ms);
  };
  const stopSpeak = () => {
    if (speakTimer.current) clearTimeout(speakTimer.current);
    setSpeakingId(null);
  };
  const toggleSpeak = (id, text) => {
    if (speakingId === id) stopSpeak();
    else speakReply(id, text);
  };

  const send = (raw, isVoice) => {
    const text = (raw == null ? input : raw).trim();
    if (!text || busy) return;
    const uid = Date.now();
    const userMsg = { id: uid, role:"user", text, isVoice: !!isVoice };
    const thinking = { id: uid + 1, role:"ai", thinking: true };
    setMessages((ms) => [...ms, userMsg, thinking]);
    setInput("");
    setBusy(true);
    setTimeout(() => {
      const r = respondTo(text);
      const aiMsg = { id: uid + 1, role:"ai", text: r.text, sources: r.sources, nogo: r.nogo, draftWO: r.draftWO };
      setMessages((ms) => ms.map((m) => m.id === uid + 1 ? aiMsg : m));
      setBusy(false);
    }, 700 + Math.random() * 500);
  };

  const confirmWO = (msgId, wo) => {
    setMessages((ms) => ms.map((m) => m.id === msgId ? { ...m, confirmed: true } : m));
  };
  const declineWO = (msgId) => {
    setMessages((ms) => ms.map((m) => m.id === msgId ? { ...m, declined: true } : m));
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* Inline mic — fills the textarea word-by-word from a rotating bank.
     User reviews + edits before pressing Send. No overlay, no popup. */
  const startMic = () => {
    if (micState === "listening") {
      /* tap-again → stop early, leave what was typed in the box */
      if (micTimer.current) clearInterval(micTimer.current);
      setMicState("idle");
      return;
    }
    const q = MIC_QUESTIONS[cycleIdx % MIC_QUESTIONS.length];
    setCycleIdx(cycleIdx + 1);
    setInput("");
    setMicState("listening");
    const words = q.split(/\s+/);
    let i = 0;
    micTimer.current = setInterval(() => {
      if (i >= words.length) {
        clearInterval(micTimer.current);
        setTimeout(() => setMicState("idle"), 350);
        return;
      }
      const w = words[i];
      setInput((cur) => (cur ? cur + " " : "") + w);
      i++;
    }, 120);
  };

  return (
    <div className="content-inner content-inner-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">HazardLink AI assistant</h1>
          <p className="page-desc">Plain-English answers grounded in your real HazardLink data. It reads your work orders, sensors, certs and invoices — and it tells you when it doesn't know rather than guessing.</p>
        </div>
        <div className="as-ground-chip">
          <Icon name="shield" size={13} />Grounded · only your real records
        </div>
      </div>

      {/* Needs your attention */}
      <div className="card as-att-card-shell">
        <div className="card-head">
          <Icon name="sparkles" size={14} style={{ color:"var(--accent)" }} />
          <h3 style={{ margin:0 }}>Needs your attention today</h3>
          <span className="sub">AI-curated · open any card to jump straight to the record</span>
          <span className="head-act"><Pill tone="accent" dot>{ATTENTION_ITEMS.length} items</Pill></span>
        </div>
        <div className="as-att-grid">
          {ATTENTION_ITEMS.map((it) => (
            <AttentionCard key={it.id} item={it} onOpen={go} />
          ))}
        </div>
      </div>

      <div className="as-shell">
        <div className="as-chat card">
          <div className="card-head">
            <div className="as-bot-tile"><Icon name="sparkles" size={15} /></div>
            <h3 style={{ margin:0 }}>Ask HazardLink</h3>
            <span className="sub">Reads from your data only · says "I don't know" when it has to</span>
          </div>

          <div className="as-chat-body">
            {messages.map((m) => m.role === "user"
              ? <UserMsg key={m.id} msg={m} />
              : <AIMsg key={m.id} msg={m}
                  onConfirmWO={confirmWO} onDeclineWO={declineWO}
                  onSpeak={toggleSpeak} speakingId={muted ? null : speakingId} />
            )}
            <div ref={endRef} />
          </div>

          {/* Suggested chips — small row above the input when conversation has content */}
          {messages.length > 0 && (
            <div className="as-chips">
              <span className="as-chips-cap">Try</span>
              {ASK_SUGGESTIONS.slice(0, 5).map((s) => (
                <button key={s.q} className="as-chip" onClick={() => send(s.q)}>
                  <Icon name={s.icon} size={11} />{s.q}
                </button>
              ))}
            </div>
          )}

          {messages.length === 0 && (
            <div className="as-empty">
              <div className="as-empty-ico"><Icon name="sparkles" size={22} /></div>
              <h3>Ask HazardLink anything about your sites</h3>
              <p>Plain-English answers, grounded in your real records. Pick a common question or type your own.</p>
              <div className="as-empty-grid">
                {ASK_SUGGESTIONS.map((s) => (
                  <button key={s.q} className={"as-big-chip as-big-chip-" + s.tone}
                    onClick={() => send(s.q)}>
                    <span className="as-big-chip-ico"><Icon name={s.icon} size={15} /></span>
                    <span>{s.q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="as-input-row">
            <div className={"as-input" + (micState === "listening" ? " as-input-listening" : "")}>
              <Icon name="sparkles" size={15} />
              <textarea rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={micState === "listening" ? "" : 'Ask something like "what jobs are overdue today?"'} />
              {micState === "listening" && (
                <span className="as-listen-hint">
                  <span className="as-listen-dot" />Listening…
                </span>
              )}
              <button className={"as-mic-btn" + (micState === "listening" ? " as-mic-btn-on" : "")}
                onClick={startMic}
                title={micState === "listening" ? "Tap to stop" : "Tap to talk — we'll type it for you"}>
                <Icon name="mic" size={14} />
              </button>
              <button className="btn btn-primary as-send-btn"
                onClick={() => send()}
                disabled={busy || !input.trim()}
                style={{ opacity: busy || !input.trim() ? .5 : 1 }}>
                <Icon name="send" size={14} />Send
              </button>
            </div>
            <div className="as-ground-foot">
              <Icon name="shield" size={11} />
              HazardLink AI only answers from your real records. If it doesn't have the data, it'll say so — it never invents facts and it won't just agree.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AssistantView });

/* ════════════════════ asset_23_6fc65753.js ════════════════════ */
;
/* HazardLink — Billing (quotes + invoices + accounting integrations) */

/* ============================================================
   Seed data — realistic Irish customers + line items
   ============================================================ */
const BILL_CUSTOMERS = [];

const VAT_DEFAULT = 23;

const SEED_QUOTES = [];

const SEED_INVOICES = [];

const SEED_INTEGRATIONS = [
  { id:"xero",   name:"Xero",        desc:"Sync customers, invoices and payments. Auto-allocate paid invoices.",      letter:"X", color:"#13B5EA", connected:false, lastSync:"—" },
  { id:"sage",   name:"Sage",         desc:"Push invoices to Sage Business Cloud Accounting.",                       letter:"S", color:"#00DC06", connected:false, lastSync:"—" },
  { id:"qbooks", name:"QuickBooks",   desc:"Two-way sync of customers and invoices with QuickBooks Online.",         letter:"Q", color:"#2CA01C", connected:false, lastSync:"—" },
];

/* ============================================================
   Helpers
   ============================================================ */
const billCustomer = (id) => BILL_CUSTOMERS.find((c) => c.id === id) || { name:"—", site:"—" };

const lineTotal = (it) => Number(it.qty || 0) * Number(it.unit || 0);
const sumLines  = (items) => items.reduce((s, it) => s + lineTotal(it), 0);

const fmtEur = (n) =>
  "€" + Number(n || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUOTE_STATUS_TONE = { Draft:"muted", Sent:"accent", Accepted:"ok",  Declined:"crit" };
const INV_STATUS_TONE   = { Draft:"muted", Sent:"accent", Paid:"ok",      Overdue:"crit" };

const todayLabel = () => "20 Jun 2026";

/* ============================================================
   Shared line-item builder (used by quote + invoice modal)
   ============================================================ */
function LineItemBuilder({ items, onChange, vatRate }) {
  const update = (i, patch) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add    = () => onChange([...items, { desc:"", qty:1, unit:0 }]);

  const subtotal = sumLines(items);
  const vat      = subtotal * (Number(vatRate || 0) / 100);
  const total    = subtotal + vat;

  return (
    <div className="bill-items">
      <div className="bill-items-head">
        <div>Description</div>
        <div className="bill-num-col">Qty</div>
        <div className="bill-num-col">Unit price</div>
        <div className="bill-num-col">Total</div>
        <div />
      </div>
      {items.map((it, i) => (
        <div className="bill-item-row" key={i}>
          <input className="dv-input bill-desc" value={it.desc}
            placeholder="Service or part"
            onChange={(e) => update(i, { desc: e.target.value })} />
          <input className="dv-input bill-num" type="number" min="0" step="1"
            value={it.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} />
          <input className="dv-input bill-num" type="number" min="0" step="0.01"
            value={it.unit} onChange={(e) => update(i, { unit: Number(e.target.value) })} />
          <div className="bill-num-cell">{fmtEur(lineTotal(it))}</div>
          <button className="icon-btn bill-rm" onClick={() => remove(i)} disabled={items.length === 1}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <button className="btn btn-sm bill-add-row" onClick={add}>
        <Icon name="plus" size={13} />Add line item
      </button>

      <div className="bill-totals">
        <div className="bill-total-row"><span>Subtotal</span><b>{fmtEur(subtotal)}</b></div>
        <div className="bill-total-row"><span>VAT ({vatRate || 0}%)</span><b>{fmtEur(vat)}</b></div>
        <div className="bill-total-row bill-grand"><span>Total</span><b>{fmtEur(total)}</b></div>
      </div>
    </div>
  );
}

/* ============================================================
   Builder modal — quote or invoice
   ============================================================ */
function DocBuilderModal({ kind, vatRate, prefill, onClose, onSave }) {
  const isInvoice = kind === "invoice";
  const [customer, setCustomer] = React.useState(prefill?.customer || "");
  const [summary,  setSummary]  = React.useState(prefill?.summary  || "");
  const [notes,    setNotes]    = React.useState(prefill?.notes    || "");
  const [due,      setDue]      = React.useState(prefill?.due      || "04 Jul 2026");
  const [items,    setItems]    = React.useState(prefill?.items    || [{ desc:"", qty:1, unit:0 }]);

  const canSave = customer && summary && items.some((it) => it.desc && it.qty > 0 && it.unit > 0);

  const save = (status) => {
    if (!canSave) return;
    onSave({
      customer, summary, notes, items,
      status,
      ...(isInvoice ? { due } : {}),
      date: todayLabel(),
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal bill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name={isInvoice ? "file" : "edit"} size={18} /></div>
          <div>
            <h3>{isInvoice ? "New invoice" : "New quote"}</h3>
            <p>{isInvoice ? "Bill a customer for completed work." : "Quote the customer for a piece of work. They can accept it from the email link."}</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body bill-modal-body">
          <div className="bill-form-grid">
            <div className="ai-field">
              <label>Customer</label>
              <select className="dv-input" value={customer} onChange={(e) => setCustomer(e.target.value)}>
                <option value="">Pick a customer…</option>
                {BILL_CUSTOMERS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.site}</option>
                ))}
              </select>
            </div>
            {isInvoice && (
              <div className="ai-field">
                <label>Due date</label>
                <input className="dv-input" value={due} onChange={(e) => setDue(e.target.value)} placeholder="dd MMM yyyy" />
              </div>
            )}
            <div className="ai-field bill-form-full">
              <label>{isInvoice ? "Invoice summary" : "Quote summary"}</label>
              <input className="dv-input" value={summary} onChange={(e) => setSummary(e.target.value)}
                placeholder={isInvoice ? "e.g. HVAC service — June 2026" : "e.g. Quarterly fire alarm test"} />
            </div>
          </div>

          <LineItemBuilder items={items} onChange={setItems} vatRate={vatRate} />

          <div className="ai-field bill-form-full" style={{ marginTop:14 }}>
            <label>Notes (visible to the customer)</label>
            <textarea className="dv-input" rows={2} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Site instructions, scope notes, payment terms…" />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          {isInvoice ? (
            <React.Fragment>
              <button className="btn" disabled={!canSave} style={{ opacity: canSave ? 1 : .5 }}
                onClick={() => save("Draft")}><Icon name="file" size={14} />Save as draft</button>
              <button className="btn btn-primary" disabled={!canSave} style={{ opacity: canSave ? 1 : .5 }}
                onClick={() => save("Sent")}><Icon name="send" size={14} />Send invoice</button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button className="btn" disabled={!canSave} style={{ opacity: canSave ? 1 : .5 }}
                onClick={() => save("Draft")}><Icon name="file" size={14} />Save as draft</button>
              <button className="btn btn-primary" disabled={!canSave} style={{ opacity: canSave ? 1 : .5 }}
                onClick={() => save("Sent")}><Icon name="send" size={14} />Send quote</button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Invoice detail panel
   ============================================================ */
function InvoiceDetailPanel({ inv, vatRate, onClose, onMarkPaid, onSend, onDownload }) {
  const cust     = billCustomer(inv.customer);
  const subtotal = sumLines(inv.items);
  const vat      = subtotal * (vatRate / 100);
  const total    = subtotal + vat;

  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel bill-panel">
        <div className="panel-head">
          <div className="bill-panel-ico"><Icon name="file" size={17} /></div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{inv.id}</div>
            <div className="bill-panel-sub">
              {cust.name} · {inv.date}
            </div>
          </div>
          <Pill tone={INV_STATUS_TONE[inv.status]} dot>{inv.status}</Pill>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="panel-body">
          <div className="panel-section">
            <div className="bill-detail-summary">{inv.summary}</div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Bill to</div>
            <div className="bill-bill-to">
              <div className="bill-bill-name">{cust.name}</div>
              <div className="bill-bill-line">{cust.contact} · {cust.email}</div>
              <div className="bill-bill-line"><Icon name="mapPin" size={11} />{cust.site}</div>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Line items</div>
            <div className="bill-detail-table">
              <div className="bill-detail-th">
                <div>Description</div>
                <div className="bill-num-col">Qty</div>
                <div className="bill-num-col">Unit</div>
                <div className="bill-num-col">Total</div>
              </div>
              {inv.items.map((it, i) => (
                <div className="bill-detail-tr" key={i}>
                  <div>{it.desc}</div>
                  <div className="bill-num-cell">{it.qty}</div>
                  <div className="bill-num-cell">{fmtEur(it.unit)}</div>
                  <div className="bill-num-cell"><b>{fmtEur(lineTotal(it))}</b></div>
                </div>
              ))}
            </div>
            <div className="bill-totals bill-totals-detail">
              <div className="bill-total-row"><span>Subtotal</span><b>{fmtEur(subtotal)}</b></div>
              <div className="bill-total-row"><span>VAT ({vatRate}%)</span><b>{fmtEur(vat)}</b></div>
              <div className="bill-total-row bill-grand"><span>Total due</span><b>{fmtEur(total)}</b></div>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Payment</div>
            <div className="auto-detail-box">
              <div className="auto-detail-row"><span className="k">Status</span>
                <span className="v"><Pill tone={INV_STATUS_TONE[inv.status]} dot>{inv.status}</Pill></span>
              </div>
              <div className="auto-detail-row"><span className="k">Issued</span><span className="v">{inv.date}</span></div>
              <div className="auto-detail-row"><span className="k">Due</span><span className="v">{inv.due}</span></div>
              {inv.status === "Paid" && inv.paidDate && (
                <div className="auto-detail-row"><span className="k">Paid</span>
                  <span className="v">{inv.paidDate} · {inv.method}</span></div>
              )}
            </div>
          </div>

          {inv.notes && (
            <div className="panel-section">
              <div className="panel-label">Notes</div>
              <div className="bill-notes">{inv.notes}</div>
            </div>
          )}

          <div className="panel-section panel-actions">
            {inv.status !== "Sent" && inv.status !== "Paid" && (
              <button className="btn" onClick={onSend}><Icon name="send" size={14} />Send</button>
            )}
            {inv.status !== "Paid" && (
              <button className="btn btn-primary" onClick={onMarkPaid}><Icon name="check" size={14} />Mark paid</button>
            )}
            <button className="btn" onClick={onDownload}><Icon name="file" size={14} />Download PDF</button>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ============================================================
   Tabs
   ============================================================ */
function QuotesTab({ quotes, vatRate, onNew, onSend, onConvert, onMarkDeclined }) {
  return (
    <React.Fragment>
      <div className="toolbar" style={{ marginBottom:12 }}>
        <div style={{ fontSize:13, color:"var(--ink-3)" }}>
          {quotes.length} quote{quotes.length === 1 ? "" : "s"} · {quotes.filter((q) => q.status === "Sent").length} awaiting response
        </div>
        <button className="btn btn-primary" style={{ marginLeft:"auto" }} onClick={onNew}>
          <Icon name="plus" size={15} />New quote
        </button>
      </div>
      <div className="card">
        <div className="bill-table-head bill-q-head">
          <div>Number</div><div>Customer · site</div><div>Summary</div><div>Total</div><div>Status</div><div>Date</div><div />
        </div>
        {quotes.map((q) => {
          const subtotal = sumLines(q.items);
          const total    = subtotal * (1 + vatRate / 100);
          const cust     = billCustomer(q.customer);
          return (
            <div className="bill-table-row bill-q-row" key={q.id}>
              <div className="bill-id">{q.id}</div>
              <div>
                <div className="bill-cust">{cust.name}</div>
                <div className="bill-cust-sub"><Icon name="mapPin" size={10} />{cust.site}</div>
              </div>
              <div className="bill-summary">{q.summary}</div>
              <div className="bill-amount">{fmtEur(total)}</div>
              <div><Pill tone={QUOTE_STATUS_TONE[q.status]} dot>{q.status}</Pill></div>
              <div className="bill-date">{q.date}</div>
              <div className="bill-actions">
                {q.status === "Draft" && (
                  <button className="btn btn-sm btn-primary" onClick={() => onSend(q.id)}>
                    <Icon name="send" size={12} />Send
                  </button>
                )}
                {q.status === "Sent" && (
                  <button className="btn btn-sm" onClick={() => onMarkDeclined(q.id)}>
                    Mark declined
                  </button>
                )}
                {q.status === "Accepted" && (
                  <button className="btn btn-sm btn-primary" onClick={() => onConvert(q.id)}>
                    <Icon name="arrowRight" size={12} />Convert to invoice
                  </button>
                )}
                {q.status === "Declined" && (
                  <span className="bill-action-muted">No further action</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

function InvoicesTab({ invoices, vatRate, onNew, onOpen, onMarkPaid, onSend }) {
  return (
    <React.Fragment>
      <div className="toolbar" style={{ marginBottom:12 }}>
        <div style={{ fontSize:13, color:"var(--ink-3)" }}>
          {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {invoices.filter((i) => i.status === "Overdue").length} overdue
        </div>
        <button className="btn btn-primary" style={{ marginLeft:"auto" }} onClick={onNew}>
          <Icon name="plus" size={15} />New invoice
        </button>
      </div>
      <div className="card">
        <div className="bill-table-head bill-inv-head">
          <div>Number</div><div>Customer</div><div>Summary</div><div>Amount</div><div>Status</div><div>Due</div><div />
        </div>
        {invoices.map((inv) => {
          const subtotal = sumLines(inv.items);
          const total    = subtotal * (1 + vatRate / 100);
          const cust     = billCustomer(inv.customer);
          return (
            <div className="bill-table-row bill-inv-row" key={inv.id} onClick={() => onOpen(inv.id)}>
              <div className="bill-id">{inv.id}</div>
              <div>
                <div className="bill-cust">{cust.name}</div>
                <div className="bill-cust-sub"><Icon name="mapPin" size={10} />{cust.site}</div>
              </div>
              <div className="bill-summary">{inv.summary}</div>
              <div className="bill-amount">{fmtEur(total)}</div>
              <div><Pill tone={INV_STATUS_TONE[inv.status]} dot>{inv.status}</Pill></div>
              <div className="bill-date">{inv.due}</div>
              <div className="bill-actions" onClick={(e) => e.stopPropagation()}>
                {inv.status === "Draft" && (
                  <button className="btn btn-sm" onClick={() => onSend(inv.id)}>
                    <Icon name="send" size={12} />Send
                  </button>
                )}
                {inv.status !== "Paid" && inv.status !== "Draft" && (
                  <button className="btn btn-sm btn-primary" onClick={() => onMarkPaid(inv.id)}>
                    <Icon name="check" size={12} />Mark paid
                  </button>
                )}
                {inv.status === "Paid" && (
                  <span className="bill-action-muted">Paid {inv.paidDate}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

function SettingsTab({ integrations, onToggleIntegration, vatRate, setVat, prefix, setPrefix }) {
  return (
    <div className="bill-settings">
      <div className="card card-pad">
        <div className="settings-group-label">Accounting integrations</div>
        <p style={{ fontSize:13, color:"var(--ink-2)", margin:"0 0 14px", lineHeight:1.55, maxWidth:520 }}>
          Connect HazardLink to your accounting package so invoices, customers and payments sync automatically.
        </p>
        <div className="integration-grid">
          {integrations.map((i) => (
            <div key={i.id} className={"integration-card" + (i.connected ? " on" : "")}>
              <div className="integration-head">
                <div className="integration-tile bill-int-tile" style={{ color:i.color }}>{i.letter}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="integration-name">{i.name}</div>
                  <div className="integration-desc">{i.desc}</div>
                </div>
                <button className={"toggle" + (i.connected ? " on" : "")} onClick={() => onToggleIntegration(i.id)}>
                  <span className="toggle-knob" />
                </button>
              </div>
              <div className="integration-foot">
                {i.connected ? <Icon name="checkCircle" size={12} /> : <Icon name="link" size={12} />}
                <span>{i.connected ? "Connected · last synced " + i.lastSync : "Not connected"}</span>
                {i.connected && (
                  <button className="btn btn-sm" style={{ marginLeft:"auto" }}><Icon name="activity" size={12} />Sync now</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="settings-group-label">VAT &amp; numbering</div>
        <div className="settings-row-grid">
          <div className="settings-field">
            <label>Standard VAT rate</label>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input className="dv-input" type="number" min="0" max="100" step="0.5"
                value={vatRate} onChange={(e) => setVat(Number(e.target.value))}
                style={{ maxWidth: 140 }} />
              <span style={{ fontSize:13, color:"var(--ink-3)" }}>% — applied to every line item subtotal</span>
            </div>
          </div>
          <div className="settings-field">
            <label>Invoice number prefix</label>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input className="dv-input" value={prefix} onChange={(e) => setPrefix(e.target.value)}
                style={{ maxWidth: 140 }} />
              <span style={{ fontSize:13, color:"var(--ink-3)" }}>e.g. {prefix}-2075, {prefix}-2076…</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="settings-group-label">Payment details on invoices</div>
        <div className="settings-row-grid">
          <div className="settings-field">
            <label>Trading name</label>
            <input className="dv-input" defaultValue="HazardLink Operations Ltd." />
          </div>
          <div className="settings-field">
            <label>VAT number</label>
            <input className="dv-input" defaultValue="IE 3456789KW" />
          </div>
          <div className="settings-field">
            <label>IBAN</label>
            <input className="dv-input" defaultValue="IE32 AIBK 9311 1234 5678 90" />
          </div>
          <div className="settings-field">
            <label>BIC</label>
            <input className="dv-input" defaultValue="AIBKIE2D" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function BillingView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [tab,       setTab]       = React.useState("quotes");
  const [quotes,    setQuotes]    = React.useState(SEED_QUOTES);
  const [invoices,  setInvoices]  = React.useState(SEED_INVOICES);
  const [integrations, setIntegrations] = React.useState(SEED_INTEGRATIONS);
  const [vatRate,   setVatRate]   = React.useState(VAT_DEFAULT);
  const [prefix,    setPrefix]    = React.useState("INV");
  const [builder,   setBuilder]   = React.useState(null); // { kind, prefill }
  const [openInvId, setOpenInvId] = React.useState(null);
  const { showToast, toastNode } = useViewToast();

  /* Site scope — quotes/invoices inherit the customer's site */
  const scopedQuotes   = site ? quotes  .filter((q) => billCustomer(q.customer).site === site.name) : quotes;
  const scopedInvoices = site ? invoices.filter((i) => billCustomer(i.customer).site === site.name) : invoices;

  /* ---- KPI metrics ---- */
  const outstanding = scopedInvoices
    .filter((i) => i.status === "Sent" || i.status === "Overdue")
    .reduce((s, i) => s + sumLines(i.items) * (1 + vatRate / 100), 0);
  const overdue = scopedInvoices
    .filter((i) => i.status === "Overdue")
    .reduce((s, i) => s + sumLines(i.items) * (1 + vatRate / 100), 0);
  const paidThisMonth = scopedInvoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + sumLines(i.items) * (1 + vatRate / 100), 0);
  const quotesAwaiting = scopedQuotes.filter((q) => q.status === "Sent").length;

  /* ---- Mutations ---- */
  const nextQuoteId = () => "Q-" + (3015 + quotes.filter((q) => q.id.startsWith("Q-")).length - SEED_QUOTES.length);
  const nextInvId   = () => prefix + "-" + (2075 + invoices.filter((i) => i.id.startsWith(prefix + "-")).length - SEED_INVOICES.length);

  const saveQuote = (q) => {
    const newQ = { id: nextQuoteId(), ...q };
    setQuotes((qs) => [newQ, ...qs]);
    setBuilder(null);
    showToast(`Quote ${newQ.id} ${q.status === "Sent" ? "sent" : "saved as draft"}`);
  };
  const saveInvoice = (inv) => {
    const newI = { id: nextInvId(), ...inv };
    setInvoices((is) => [newI, ...is]);
    setBuilder(null);
    showToast(`Invoice ${newI.id} ${inv.status === "Sent" ? "sent" : "saved as draft"}`);
  };

  const sendQuote = (id) => {
    setQuotes((qs) => qs.map((q) => q.id === id ? { ...q, status:"Sent" } : q));
    showToast("Quote sent to customer");
  };
  const acceptQuote = (id) => {
    setQuotes((qs) => qs.map((q) => q.id === id ? { ...q, status:"Accepted" } : q));
  };
  const declineQuote = (id) => {
    setQuotes((qs) => qs.map((q) => q.id === id ? { ...q, status:"Declined" } : q));
    showToast("Quote marked as declined");
  };
  const convertToInvoice = (qid) => {
    const q = quotes.find((x) => x.id === qid);
    if (!q) return;
    setBuilder({
      kind:"invoice",
      prefill:{
        customer: q.customer,
        summary:  q.summary,
        items:    q.items.map((it) => ({ ...it })),
        notes:    q.notes,
        due:      "04 Jul 2026",
      },
      sourceQuoteId: qid,
    });
  };

  const sendInvoice = (id) => {
    setInvoices((is) => is.map((i) => i.id === id ? { ...i, status:"Sent" } : i));
    showToast("Invoice sent");
  };
  const markPaid = (id) => {
    setInvoices((is) => is.map((i) => i.id === id
      ? { ...i, status:"Paid", paidDate: todayLabel(), method:"Bank transfer (AIB)" }
      : i));
    showToast("Invoice marked paid");
  };
  const downloadPdf = () => showToast("PDF queued for download");

  const toggleIntegration = (id) => {
    setIntegrations((ints) => ints.map((i) => i.id === id
      ? { ...i, connected: !i.connected, lastSync: !i.connected ? "Just now" : i.lastSync }
      : i));
  };

  /* For demo realism, also auto-accept any quote that's currently 'Sent'
     when the user opens the convert flow. (Keep it simple — show Accept
     buttons on Sent quotes too via a small inline gesture.) */

  const openInv = invoices.find((i) => i.id === openInvId);

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-desc">Quotes and invoices for everything HazardLink delivers — synced to your accounting package. VAT at {vatRate}% across the Republic.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {/* Live export — pulls the org's real invoices from the backend as a
              Xero/Sage-importable CSV (hlDownloadCsv defined in the Reports view). */}
          <button className="btn" onClick={() => hlDownloadCsv("/invoices/export.csv", "invoices.csv")}>
            <Icon name="file" size={15} />Export CSV (Xero/Sage)
          </button>
          {tab === "quotes" && (
            <button className="btn btn-primary" onClick={() => setBuilder({ kind:"quote" })}>
              <Icon name="plus" size={15} />New quote
            </button>
          )}
          {tab === "invoices" && (
            <button className="btn btn-primary" onClick={() => setBuilder({ kind:"invoice" })}>
              <Icon name="plus" size={15} />New invoice
            </button>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--accent-soft)", color:"var(--accent)" }}><Icon name="creditCard" size={16} /></div>
            <span className="kpi-label">Outstanding unpaid</span>
          </div>
          <div className="kpi-val">{fmtEur(outstanding)}</div>
          <div className="kpi-foot">across {invoices.filter((i) => i.status === "Sent" || i.status === "Overdue").length} invoices</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--crit-soft)", color:"var(--crit)" }}><Icon name="alertTri" size={16} /></div>
            <span className="kpi-label">Overdue total</span>
          </div>
          <div className="kpi-val">{fmtEur(overdue)}</div>
          <div className="kpi-foot">{invoices.filter((i) => i.status === "Overdue").length} overdue customer{invoices.filter((i) => i.status === "Overdue").length === 1 ? "" : "s"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--ok-soft)", color:"var(--ok)" }}><Icon name="checkCircle" size={16} /></div>
            <span className="kpi-label">Paid this month</span>
          </div>
          <div className="kpi-val">{fmtEur(paidThisMonth)}</div>
          <div className="kpi-foot">{invoices.filter((i) => i.status === "Paid").length} invoices settled</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--maint-soft)", color:"var(--maint)" }}><Icon name="edit" size={16} /></div>
            <span className="kpi-label">Quotes awaiting</span>
          </div>
          <div className="kpi-val">{quotesAwaiting}</div>
          <div className="kpi-foot">sent quotes pending response</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginTop:6 }}>
        {[
          { id:"quotes",   label:`Quotes (${quotes.length})` },
          { id:"invoices", label:`Invoices (${invoices.length})` },
          { id:"settings", label:"Settings" },
        ].map((t) => (
          <button key={t.id} className={"tab-btn" + (tab === t.id ? " on" : "")}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "quotes" && (
        <QuotesTab quotes={scopedQuotes} vatRate={vatRate}
          onNew={() => setBuilder({ kind:"quote" })}
          onSend={sendQuote}
          onConvert={convertToInvoice}
          onMarkDeclined={declineQuote} />
      )}
      {tab === "invoices" && (
        <InvoicesTab invoices={scopedInvoices} vatRate={vatRate}
          onNew={() => setBuilder({ kind:"invoice" })}
          onOpen={setOpenInvId}
          onMarkPaid={markPaid}
          onSend={sendInvoice} />
      )}
      {tab === "settings" && (
        <SettingsTab integrations={integrations} onToggleIntegration={toggleIntegration}
          vatRate={vatRate} setVat={setVatRate} prefix={prefix} setPrefix={setPrefix} />
      )}

      {builder && (
        <DocBuilderModal
          kind={builder.kind}
          prefill={builder.prefill}
          vatRate={vatRate}
          onClose={() => setBuilder(null)}
          onSave={(payload) => {
            if (builder.kind === "quote") saveQuote(payload);
            else {
              saveInvoice(payload);
              if (builder.sourceQuoteId) {
                /* Mark the source quote as converted (kept Accepted but
                   action button hidden because no longer the latest). */
                acceptQuote(builder.sourceQuoteId);
              }
            }
          }}
        />
      )}
      {openInv && (
        <InvoiceDetailPanel
          inv={openInv}
          vatRate={vatRate}
          onClose={() => setOpenInvId(null)}
          onSend={() => { sendInvoice(openInv.id); }}
          onMarkPaid={() => { markPaid(openInv.id); }}
          onDownload={downloadPdf} />
      )}
      {toastNode}
    </div>
  );
}

Object.assign(window, { BillingView });

/* ════════════════════ asset_35_45c72c34.js ════════════════════ */
;
/* HazardLink — Automations engine */

/* ── Authed JSON helper for the live backend (shared across views) ──────────
   Bearer token + HL_API_BASE (dev proxy or prod origin). Returns
   { ok, status, b } with b = parsed JSON body or null. */
function hlApi(path, opts) {
  opts = opts || {};
  const headers = { authorization: "Bearer " + (localStorage.getItem("bor.token") || "") };
  if (opts.body) headers["content-type"] = "application/json";
  return fetch((window.HL_API_BASE || "/api") + path, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then((r) =>
    r.json().then((b) => ({ ok: r.ok, status: r.status, b })).catch(() => ({ ok: r.ok, status: r.status, b: null }))
  );
}

/* ── Built-in automations — LIVE, wired to the backend ──────────────────────
   These run on the org right now (escalation timers, reminder jobs). The
   timers save with one click; the rest are always on. Nothing here is a mock. */
function BuiltInAutomations({ showToast }) {
  const [s, setS]             = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [val, setVal]         = React.useState("");
  const [busy, setBusy]       = React.useState(false);

  React.useEffect(() => {
    hlApi("/settings").then(({ ok, b }) => { if (ok && b) setS(b); else setS(false); });
  }, []);

  const NUMBER_ROWS = [
    { key:"ackMinutes", icon:"alertTri", tone:"crit", title:"Spill escalation",
      desc:"A spill alert nobody acknowledges in time escalates up the chain automatically.",
      unit:"min", put:"/settings/ack-timer", body:(v)=>({ minutes:v }), max:120 },
    { key:"resolutionMinutes", icon:"clock", tone:"warn", title:"Overdue spill flag",
      desc:"A spill still open after this long is flagged overdue and chased.",
      unit:"min", put:"/settings/resolution-timer", body:(v)=>({ minutes:v }), max:720 },
    { key:"expectedCleaningMinutes", icon:"droplet", tone:"clean", title:"Cleaning response target",
      desc:"The response-time target your spill reporting measures against.",
      unit:"min", put:"/settings/expected-cleaning-time", body:(v)=>({ minutes:v }), max:240 },
    { key:"lowBatteryThreshold", icon:"activity", tone:"accent", title:"Low-battery alerts",
      desc:"Alert automatically when a sensor battery falls below this level.",
      unit:"%", put:"/settings/low-battery-threshold", body:(v)=>({ pct:v }), max:99 },
  ];
  const ALWAYS_ON = [
    { icon:"clock",      title:"PPM auto-chase",            desc:"Planned maintenance emails the assigned contractor before the due date, and chases it." },
    { icon:"award",      title:"Certificate expiry alerts", desc:"Staff and contractor certs nearing expiry notify admins before they lapse." },
    { icon:"creditCard", title:"Invoice overdue chase",     desc:"A sent invoice past its due date flips to overdue and notifies the team." },
    { icon:"user",       title:"Lone-worker escalation",    desc:"A missed check-in alerts your escalation contacts with the worker's last confirmation." },
    { icon:"bell",       title:"Microsoft Teams cards",     desc:"Org-wide alerts post a card to your Teams channel once a webhook is set in Settings → Integrations." },
  ];

  const startEdit = (row) => { setEditing(row.key); setVal(String(s[row.key] ?? "")); };
  const save = (row) => {
    const v = parseInt(val, 10);
    if (!v || v < 1 || v > row.max) { showToast("Enter a number between 1 and " + row.max); return; }
    setBusy(true);
    hlApi(row.put, { method:"PUT", body: row.body(v) })
      .then(({ ok }) => {
        if (!ok) { showToast("Could not save — check your access."); return; }
        setS((p) => ({ ...p, [row.key]: v }));
        setEditing(null);
        showToast(row.title + " set to " + v + " " + row.unit);
      })
      .finally(() => setBusy(false));
  };
  const toggleAlarm = () => {
    const next = !s.defaultAudibleAlarm;
    hlApi("/settings/default-audible-alarm", { method:"PUT", body:{ enabled: next } }).then(({ ok }) => {
      if (!ok) { showToast("Could not save — check your access."); return; }
      setS((p) => ({ ...p, defaultAudibleAlarm: next }));
      showToast(next ? "New sensors will sound the audible alarm" : "Audible alarm off for new sensors");
    });
  };

  if (s === null) {
    return <div className="card card-pad" style={{ marginBottom:18, color:"var(--ink-3)", fontSize:13.5 }}>Loading your live automations…</div>;
  }
  if (s === false) {
    return <div className="card card-pad" style={{ marginBottom:18, color:"var(--warn)", fontSize:13.5 }}>Could not load your automation settings. Refresh to try again.</div>;
  }

  const row = (icon, tone, title, desc, right) => (
    <div key={title} style={{ display:"flex", gap:12, alignItems:"center", padding:"11px 0", borderTop:"1px solid var(--line)" }}>
      <div className="kpi-ico" style={{ background:softBg(tone), color:solid(tone), flex:"none" }}><Icon name={icon} size={15} /></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:13.5 }}>{title}</div>
        <div style={{ fontSize:12.5, color:"var(--ink-3)", marginTop:1 }}>{desc}</div>
      </div>
      {right}
    </div>
  );

  return (
    <div className="card" style={{ marginBottom:18 }}>
      <div className="card-head">
        <h3>Built-in automations</h3>
        <span className="sub">Live on your organisation right now. The timers are yours to tune — one click, saved.</span>
      </div>
      <div className="card-pad" style={{ paddingTop:0 }}>
        {NUMBER_ROWS.map((r) => row(r.icon, r.tone, r.title, r.desc,
          editing === r.key ? (
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <input className="dv-input" type="number" autoFocus value={val} min={1} max={r.max}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(r); if (e.key === "Escape") setEditing(null); }}
                style={{ width:76 }} />
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save(r)}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => startEdit(r)} title="Change">
              {String(s[r.key] ?? "—")} {r.unit}<Icon name="edit" size={12} />
            </button>
          )
        ))}
        {row("wifi", "muted", "Audible alarm on new sensors",
          "Whether newly-registered wet-floor sensors sound their local alarm by default.",
          <Toggle on={!!s.defaultAudibleAlarm} onChange={toggleAlarm} />)}
        {ALWAYS_ON.map((r) => row(r.icon, "muted", r.title, r.desc,
          <Pill tone="ok" dot>Always on</Pill>))}
      </div>
    </div>
  );
}

/* ============================================================
   Catalogues for the builder + plain-English helpers
   ============================================================ */
const AUTO_TRIGGERS = [
  { id:"spill",        disc:"clean",  label:"A wet-floor sign is lifted",
    condPrefix:"and",  condChoices:["not cleared within 5 min","not cleared within 10 min","not cleared within 15 min","escalates to a SECOND time within 24h"] },
  { id:"wo-overdue",   disc:"maint",  label:"A work order goes overdue" },
  { id:"part-min",     disc:"maint",  label:"A part drops below its minimum" },
  { id:"insp-fail",    disc:"clean",  label:"A cleaning inspection fails an item" },
  { id:"cert-exp",     disc:"secure", label:"A contractor certificate is expiring",
    condPrefix:"within", condChoices:["7 days","14 days","30 days"] },
  { id:"incident",     disc:"secure", label:"An incident is logged",
    condPrefix:"with",  condChoices:["high severity","medium severity","any severity"] },
  { id:"patrol-miss",  disc:"secure", label:"A patrol checkpoint is missed" },
  { id:"lone-miss",    disc:"secure", label:"A lone-worker check-in is missed" },
  { id:"ppm-overdue",  disc:"maint",  label:"A PPM task goes overdue" },
];

const AUTO_ACTIONS = [
  { kind:"createWO",    icon:"wrench",  tone:"maint",  label:"Create a maintenance work order" },
  { kind:"assign",      icon:"users",   tone:"accent", label:"Reassign / assign to",
    targets:["a backup contractor","Maeve O'Connor (supervisor)","AquaFix Plumbing","PowerLock Electrical","the on-shift team"] },
  { kind:"email",       icon:"send",    tone:"muted",  label:"Send email to",
    targets:["the contractor","the site manager","the duty manager","the on-shift supervisor","the requester"] },
  { kind:"sms",         icon:"phone",   tone:"accent", label:"Send SMS to",
    targets:["the on-shift cleaner","the duty manager","the contractor","the supervisor"] },
  { kind:"push",        icon:"bell",    tone:"accent", label:"Send push to",
    targets:["the duty manager","the site team","mobile staff"] },
  { kind:"raisePO",     icon:"package", tone:"maint",  label:"Raise a purchase order to the supplier" },
  { kind:"escalate",    icon:"flag",    tone:"crit",   label:"Escalate to",
    targets:["the site manager","the duty manager","the head of operations"] },
  { kind:"addToReport", icon:"file",    tone:"muted",  label:"Add it to",
    targets:["the daily report","the compliance report","the weekly site review"] },
  { kind:"block",       icon:"shield",  tone:"crit",   label:"Block site access if it lapses" },
];

const findAction = (k) => AUTO_ACTIONS.find((a) => a.kind === k);
const findTrigger = (id) => AUTO_TRIGGERS.find((t) => t.id === id);

/* Render an action as a plain-English phrase */
function actionPhrase(a) {
  const meta = findAction(a.kind);
  if (!meta) return "";
  if (meta.targets && a.target) return meta.label.toLowerCase() + " " + a.target;
  return meta.label.toLowerCase();
}

function triggerPhrase(t) {
  const meta = findTrigger(t.event);
  if (!meta) return "";
  let s = meta.label.toLowerCase();
  if (t.condition && meta.condPrefix) s += " " + meta.condPrefix + " " + t.condition;
  return s;
}

function rulePhrase(rule) {
  const when = "When " + triggerPhrase(rule.trigger);
  const then = rule.actions.map(actionPhrase);
  if (then.length === 0) return when + ", then …";
  if (then.length === 1) return when + ", then " + then[0] + ".";
  const last = then[then.length - 1];
  return when + ", then " + then.slice(0, -1).join(", ") + " and " + last + ".";
}

/* ============================================================
   Seed rules — across all three disciplines
   ============================================================ */
const SEED_RULES = [];

/* Recent automated actions feed */
const SEED_ACTIVITY = [];

/* ============================================================
   Rule card
   ============================================================ */
function RuleCard({ rule, onToggle, onOpen }) {
  const meta = discMeta[rule.disc];
  const triggerLabel = triggerPhrase(rule.trigger);
  const condTail = (rule.trigger.condition && findTrigger(rule.trigger.event)?.condPrefix)
    ? findTrigger(rule.trigger.event).condPrefix + " " + rule.trigger.condition
    : null;

  return (
    <div className={"auto-card" + (rule.on ? "" : " off") + " auto-card-" + rule.disc}>
      <button className="auto-card-body" onClick={onOpen}>
        <div className="auto-card-top">
          <div className="auto-card-head">
            <span className={"pill " + meta.pill}><Icon name={meta.icon} size={12} />{meta.label}</span>
            <span className="auto-id">{rule.id}</span>
          </div>
          <div className="auto-title">{rule.title}</div>
        </div>

        <div className="auto-flow">
          <div className="auto-step">
            <div className="auto-step-label">When</div>
            <div className="auto-step-body">
              <div className="auto-step-event">{findTrigger(rule.trigger.event).label}</div>
              {condTail && <div className="auto-step-cond">{condTail}</div>}
            </div>
          </div>
          <div className="auto-arrow"><Icon name="arrowRight" size={14} /></div>
          <div className="auto-step">
            <div className="auto-step-label">Then</div>
            <div className="auto-step-actions">
              {rule.actions.map((a, i) => {
                const am = findAction(a.kind);
                return (
                  <div key={i} className={"auto-action auto-action-" + am.tone}>
                    <Icon name={am.icon} size={12} />
                    <span>{actionPhrase(a)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </button>

      <div className="auto-card-foot">
        <div className="auto-stat">
          <div className="auto-stat-l">Last run</div>
          <div className="auto-stat-v">{rule.lastRun}</div>
        </div>
        <div className="auto-stat">
          <div className="auto-stat-l">Times triggered</div>
          <div className="auto-stat-v auto-stat-n">{rule.runCount}</div>
        </div>
        <div className="auto-toggle-wrap" onClick={(e) => e.stopPropagation()}>
          <span className={"auto-on-label" + (rule.on ? " on" : "")}>{rule.on ? "On" : "Off"}</span>
          <button className={"toggle" + (rule.on ? " on" : "")} onClick={onToggle}>
            <span className="toggle-knob" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Builder modal — pick trigger then actions, live preview
   ============================================================ */
function BuilderModal({ onClose, onSave }) {
  const [triggerId, setTriggerId] = React.useState("");
  const [condition,  setCondition]  = React.useState("");
  const [actions,    setActions]    = React.useState([{ kind:"", target:"" }]);

  const trigger = findTrigger(triggerId);
  const disc = trigger ? trigger.disc : "maint";

  React.useEffect(() => {
    // when trigger changes, pre-select first condition choice
    if (trigger && trigger.condChoices) setCondition(trigger.condChoices[0]);
    else setCondition("");
  }, [triggerId]);

  const updAction = (i, patch) =>
    setActions((s) => s.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  const addAction = () => setActions((s) => [...s, { kind:"", target:"" }]);
  const rmAction  = (i) => setActions((s) => s.length === 1 ? s : s.filter((_, idx) => idx !== i));

  const validActions = actions.filter((a) => a.kind && (!findAction(a.kind).targets || a.target));
  const canSave = triggerId && validActions.length > 0;

  const preview = canSave
    ? rulePhrase({ trigger:{ event:triggerId, condition }, actions:validActions })
    : null;

  const save = () => {
    if (!canSave) return;
    const meta = discMeta[disc];
    const newRule = {
      id: "AU-" + (107 + Math.floor(Math.random() * 800)),
      disc, title: deriveTitle(triggerId, validActions, meta.label),
      desc: "Created just now.",
      trigger: { event: triggerId, condition },
      actions: validActions,
      on: true, lastRun: "—", runCount: 0,
    };
    onSave(newRule);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="sparkles" size={18} /></div>
          <div>
            <h3>New automation</h3>
            <p>Pick a trigger and one or more actions. The system runs this hands-off.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body builder-body">
          {/* Live preview */}
          <div className={"builder-preview" + (preview ? "" : " empty")}>
            <span className="builder-preview-cap"><Icon name="sparkles" size={12} />Live preview</span>
            <div className="builder-preview-text">
              {preview || "Pick a trigger and at least one action to see the rule in plain English."}
            </div>
          </div>

          {/* Trigger section */}
          <div className="builder-section">
            <div className="builder-step-head">
              <span className="builder-step-num">1</span>
              <div>
                <div className="builder-step-title">Trigger</div>
                <div className="builder-step-sub">The event that kicks the rule off.</div>
              </div>
            </div>
            <div className="builder-row">
              <label>Event</label>
              <select className="dv-input" value={triggerId} onChange={(e) => setTriggerId(e.target.value)}>
                <option value="">Choose an event…</option>
                {AUTO_TRIGGERS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            {trigger && trigger.condChoices && (
              <div className="builder-row">
                <label>Condition</label>
                <select className="dv-input" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {trigger.condChoices.map((c) => (
                    <option key={c} value={c}>{trigger.condPrefix} {c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Actions section */}
          <div className="builder-section">
            <div className="builder-step-head">
              <span className="builder-step-num">2</span>
              <div>
                <div className="builder-step-title">Actions</div>
                <div className="builder-step-sub">What the system does — pick one or more.</div>
              </div>
              <button className="btn btn-sm builder-add-action" onClick={addAction}>
                <Icon name="plus" size={13} />Add action
              </button>
            </div>

            {actions.map((a, i) => {
              const meta = findAction(a.kind);
              return (
                <div className="builder-action-row" key={i}>
                  <div className="builder-action-num">{i + 1}</div>
                  <select className="dv-input" value={a.kind}
                    onChange={(e) => updAction(i, { kind: e.target.value, target: "" })}>
                    <option value="">Choose an action…</option>
                    {AUTO_ACTIONS.map((ac) => (
                      <option key={ac.kind} value={ac.kind}>{ac.label}</option>
                    ))}
                  </select>
                  {meta && meta.targets && (
                    <select className="dv-input" value={a.target}
                      onChange={(e) => updAction(i, { target: e.target.value })}>
                      <option value="">Pick a recipient…</option>
                      {meta.targets.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  <button className="icon-btn builder-rm" onClick={() => rmAction(i)}
                    disabled={actions.length === 1} title="Remove action">
                    <Icon name="x" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave}
            style={{ opacity: canSave ? 1 : .5 }} onClick={save}>
            <Icon name="check" size={15} />Save automation
          </button>
        </div>
      </div>
    </div>
  );
}

function deriveTitle(triggerId, actions, discLabel) {
  const t = findTrigger(triggerId);
  if (!t) return discLabel + " automation";
  const firstKind = actions[0]?.kind;
  const verb = {
    createWO:"create work order", assign:"reassign", email:"email", sms:"SMS",
    push:"push notify", raisePO:"raise PO", escalate:"escalate",
    addToReport:"add to report", block:"block access",
  }[firstKind] || "act";
  return t.label.replace(/^A(n)? /, "") + " → " + verb;
}

/* ============================================================
   Rule detail panel
   ============================================================ */
function RuleDetailPanel({ rule, activity, onClose, onToggle, onDelete }) {
  const meta = discMeta[rule.disc];
  const ruleActivity = activity.filter((a) => a.rule === rule.id);

  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel">
        <div className="panel-head">
          <span className={"pill " + meta.pill}><Icon name={meta.icon} size={12} />{meta.label}</span>
          <div style={{ flex:1 }}>
            <div className="panel-title">{rule.title}</div>
            <div style={{ fontSize:11.5, color:"var(--ink-3)", fontFamily:"var(--mono)", marginTop:3 }}>
              {rule.id}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="panel-body">
          <div className="panel-section">
            <div className="panel-label">Plain English</div>
            <div className="auto-detail-sentence">{rulePhrase(rule)}</div>
            <div className="auto-detail-desc">{rule.desc}</div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Trigger</div>
            <div className="auto-detail-box">
              <div className="auto-detail-row">
                <span className="k">Event</span>
                <span className="v">{findTrigger(rule.trigger.event).label}</span>
              </div>
              {rule.trigger.condition && (
                <div className="auto-detail-row">
                  <span className="k">Condition</span>
                  <span className="v">{findTrigger(rule.trigger.event).condPrefix} {rule.trigger.condition}</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Actions</div>
            <div className="auto-detail-actions">
              {rule.actions.map((a, i) => {
                const am = findAction(a.kind);
                return (
                  <div key={i} className={"auto-detail-action auto-action-" + am.tone}>
                    <div className="auto-detail-action-ico"><Icon name={am.icon} size={14} /></div>
                    <div>
                      <div className="auto-detail-action-l">{am.label}{a.target ? ":" : ""}</div>
                      {a.target && <div className="auto-detail-action-t">{a.target}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Stats</div>
            <div className="auto-detail-stats">
              <div><div className="n">{rule.runCount}</div><div className="l">Times triggered</div></div>
              <div><div className="n auto-detail-n-small">{rule.lastRun}</div><div className="l">Last run</div></div>
              <div><div className="n auto-detail-n-small">{rule.on ? "Active" : "Paused"}</div><div className="l">Status</div></div>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Recent runs ({ruleActivity.length})</div>
            <div className="auto-mini-feed">
              {ruleActivity.length === 0 && (
                <div style={{ padding:"18px 0", fontSize:12.5, color:"var(--ink-3)", textAlign:"center" }}>
                  No automated actions yet.
                </div>
              )}
              {ruleActivity.map((a) => (
                <div className="auto-mini-row" key={a.id}>
                  <div className={"auto-mini-ico tone-" + a.tone}><Icon name={a.icon} size={12} /></div>
                  <div className="auto-mini-body">
                    <div className="auto-mini-text">{a.text}</div>
                    <div className="auto-mini-meta">{a.when} · {a.t}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-section panel-actions">
            <button className={"btn" + (rule.on ? "" : " btn-primary")} onClick={onToggle}>
              <Icon name={rule.on ? "x" : "check"} size={15} />{rule.on ? "Pause" : "Enable"}
            </button>
            <button className="btn"><Icon name="edit" size={15} />Edit</button>
            <button className="btn auto-btn-danger" onClick={onDelete}><Icon name="trash" size={15} />Delete</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function AutomationsView({ go }) {
  const [rules,    setRules]    = React.useState(SEED_RULES);
  const [activity, setActivity] = React.useState(SEED_ACTIVITY);
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [openRuleId,  setOpenRuleId]  = React.useState(null);
  const [filter, setFilter] = React.useState("All");
  const { showToast, toastNode } = useViewToast();

  const tabs = ["All", "Cleaning", "Maintenance", "Security", "Paused"];
  const filtered = rules.filter((r) => {
    if (filter === "All")          return true;
    if (filter === "Paused")       return !r.on;
    if (filter === "Cleaning")     return r.disc === "clean";
    if (filter === "Maintenance")  return r.disc === "maint";
    if (filter === "Security")     return r.disc === "secure";
    return true;
  });

  const toggleRule = (id) => {
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, on: !r.on } : r));
    const r = rules.find((x) => x.id === id);
    showToast(r.on ? `Paused “${r.title}”` : `Enabled “${r.title}”`);
  };

  const saveRule = (rule) => {
    setRules((rs) => [rule, ...rs]);
    setBuilderOpen(false);
    showToast("Automation created — " + rule.id);
  };

  const deleteRule = (id) => {
    setRules((rs) => rs.filter((r) => r.id !== id));
    setOpenRuleId(null);
    showToast("Automation deleted");
  };

  const openRule = rules.find((r) => r.id === openRuleId);

  const onCt   = rules.filter((r) => r.on).length;
  const runsToday = activity.filter((a) => a.when === "Today").length;
  const supplierEmails = activity.filter((a) => a.icon === "send").length;

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Automations</h1>
          <p className="page-desc">Rules that run themselves. When something happens, the system does the obvious next thing so cleaning, maintenance and security teams stay hands-off.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setBuilderOpen(true)}>
          <Icon name="plus" size={15} />New automation
        </button>
      </div>

      <div className="kpi-row kpi-row-auto">
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--accent-soft)", color:"var(--accent)" }}><Icon name="sparkles" size={16} /></div>
            <div className="kpi-label">Active rules</div>
          </div>
          <div className="kpi-val">{onCt}<small> / {rules.length}</small></div>
          <div className="kpi-foot">Across cleaning, maintenance &amp; security</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--ok-soft)", color:"var(--ok)" }}><Icon name="activity" size={16} /></div>
            <div className="kpi-label">Automated actions today</div>
          </div>
          <div className="kpi-val">{runsToday}</div>
          <div className="kpi-foot">No human in the loop</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--maint-soft)", color:"var(--maint)" }}><Icon name="package" size={16} /></div>
            <div className="kpi-label">PO &amp; emails sent</div>
          </div>
          <div className="kpi-val">{supplierEmails}</div>
          <div className="kpi-foot">Auto-issued to suppliers and contractors</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:"var(--crit-soft)", color:"var(--crit)" }}><Icon name="flag" size={16} /></div>
            <div className="kpi-label">Escalations</div>
          </div>
          <div className="kpi-val">{activity.filter((a) => a.icon === "flag").length}</div>
          <div className="kpi-foot">Auto-escalated to managers</div>
        </div>
      </div>

      <BuiltInAutomations showToast={showToast} />

      <div className="auto-grid">
        {/* Left column — rules */}
        <div>
          <div className="toolbar">
            <div className="seg">
              {tabs.map((t) => (
                <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
              ))}
            </div>
            <div style={{ marginLeft:"auto", fontSize:13, color:"var(--ink-3)" }}>
              {filtered.length} rule{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="auto-list">
            {filtered.length === 0 && (
              <div className="empty">
                <div className="empty-ico"><Icon name="sparkles" size={28} /></div>
                <h3>No rules match this filter</h3>
                <p>Switch filters or create a new automation to get started.</p>
              </div>
            )}
            {filtered.map((r) => (
              <RuleCard key={r.id} rule={r}
                onToggle={() => toggleRule(r.id)}
                onOpen={() => setOpenRuleId(r.id)} />
            ))}
          </div>
        </div>

        {/* Right column — recent automated actions */}
        <div className="card auto-log-card">
          <div className="card-head">
            <h3>Recent automated actions</h3>
            <span className="sub">What the system did on its own</span>
          </div>
          <div className="auto-log-list">
            {Object.entries(activity.reduce((m, a) => {
              (m[a.when] = m[a.when] || []).push(a); return m;
            }, {})).map(([day, items]) => (
              <React.Fragment key={day}>
                <div className="auto-log-day">{day}</div>
                {items.map((a) => {
                  const rule = rules.find((r) => r.id === a.rule);
                  return (
                    <button key={a.id} className="auto-log-row"
                      onClick={() => rule && setOpenRuleId(rule.id)}>
                      <div className={"auto-log-ico tone-" + a.tone}><Icon name={a.icon} size={13} /></div>
                      <div className="auto-log-body">
                        <div className="auto-log-text">{a.text}</div>
                        <div className="auto-log-meta">
                          <span className="auto-log-time">{a.t}</span>
                          <span className="auto-log-sep" />
                          <span className="auto-log-rule">{a.rule}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {builderOpen && <BuilderModal onClose={() => setBuilderOpen(false)} onSave={saveRule} />}
      {openRule && (
        <RuleDetailPanel rule={openRule} activity={activity}
          onClose={() => setOpenRuleId(null)}
          onToggle={() => toggleRule(openRule.id)}
          onDelete={() => deleteRule(openRule.id)} />
      )}
      {toastNode}
    </div>
  );
}

Object.assign(window, { AutomationsView });

/* ════════════════════ asset_47_247d981f.js ════════════════════ */
;
/* HazardLink — Competency (cert health grouped by company, with chase actions) */

const _COMP_STATUS = {
  compliant: { tone:"ok",   label:"All current",     icon:"checkCircle" },
  expiring:  { tone:"warn", label:"Expiring soon",    icon:"clock" },
  blocked:   { tone:"crit", label:"Action required",  icon:"alertTri" },
};

function _chaseKey(personId, certName) {
  return personId + "::" + certName;
}

function _peopleNeedingUpdate(co) {
  return co.staff
    .map((p) => {
      const badCerts = p.certs.filter((c) => c.status === "expired" || c.status === "expiring");
      return badCerts.length ? { person: p, badCerts } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ax = a.badCerts.some((c) => c.status === "expired") ? 0 : 1;
      const bx = b.badCerts.some((c) => c.status === "expired") ? 0 : 1;
      return ax - bx;
    });
}

function _enrichCompany(co) {
  const all = co.staff.flatMap((p) => p.certs);
  const expiredCount  = all.filter((c) => c.status === "expired").length;
  const expiringCount = all.filter((c) => c.status === "expiring").length;
  const needing = _peopleNeedingUpdate(co);
  const status = expiredCount > 0 ? "blocked" : expiringCount > 0 ? "expiring" : "compliant";
  return { ...co, expiredCount, expiringCount, needing, status };
}

/* ---------- Cert chase row (in detail view) ---------- */
function ChaseCertRow({ person, cert, chased, onChase }) {
  const tone   = cert.status === "expired" ? "crit" : "warn";
  const label  = cert.status === "expired" ? "Expired" : "Expiring";
  let dateLine = cert.status === "expired"
    ? "Expired " + cert.expires
    : cert.inDays != null
      ? (cert.inDays < 0 ? "Expired " + Math.abs(cert.inDays) + " day" + (Math.abs(cert.inDays) !== 1 ? "s" : "") + " ago" : "Expires in " + cert.inDays + " day" + (cert.inDays !== 1 ? "s" : "") + " (" + cert.expires + ")")
      : "Expires " + cert.expires;

  return (
    <div className={"chase-cert chase-cert-" + cert.status}>
      <div className="chase-cert-info">
        <div className="chase-cert-name">{cert.name}</div>
        <div className="chase-cert-meta">
          <Pill tone={tone} dot>{label}</Pill>
          <span>{dateLine}</span>
        </div>
      </div>
      {chased ? (
        <span className="chase-done"><Icon name="check" size={14} />Chased just now</span>
      ) : (
        <button className="btn btn-sm" onClick={() => onChase(person, cert)}>
          <Icon name="send" size={13} />Chase
        </button>
      )}
    </div>
  );
}

function ChasePersonBlock({ entry, chasedSet, onChase, onChaseAll }) {
  const { person, badCerts } = entry;
  const expired = badCerts.filter((c) => c.status === "expired").length;
  const pillTone = expired > 0 ? "crit" : "warn";
  const pillLabel = expired > 0
    ? `${expired} expired`
    : `${badCerts.length} expiring`;

  const allChased = badCerts.every((c) => chasedSet.has(_chaseKey(person.id, c.name)));

  return (
    <div className={"staff-block" + (expired > 0 ? " blocked" : "")}>
      <div className="staff-head">
        <div className="staff-av">{person.initials}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="staff-name">{person.name}</div>
          <div className="staff-role">{person.role}{person.sites ? " · " + person.sites : ""}</div>
        </div>
        <Pill tone={pillTone} dot>{pillLabel}</Pill>
        {!allChased && badCerts.length > 1 && (
          <button className="btn btn-sm" style={{ marginLeft:8 }} onClick={() => onChaseAll(person, badCerts)}>
            <Icon name="send" size={13} />Chase all
          </button>
        )}
      </div>
      <div className="chase-cert-list">
        {badCerts.map((c, i) => (
          <ChaseCertRow person={person} cert={c}
            chased={chasedSet.has(_chaseKey(person.id, c.name))}
            onChase={onChase} key={i} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Company detail (drill-in) ---------- */
function CompanyDetail({ co, chasedSet, onBack, onChase, onChaseAll }) {
  const m = _COMP_STATUS[co.status];
  const totalBad = co.expiredCount + co.expiringCount;

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to companies
      </button>

      <div className="wo-detail-head">
        <div className="ct-av-lg">{co.initials}</div>
        <div style={{ flex:1 }}>
          <div className="wo-num">{co.isInternal ? "In-house team" : "Contractor"}</div>
          <h1 style={{ margin:"4px 0 8px" }}>{co.name}</h1>
          <div className="tags">
            <Pill tone={m.tone} dot icon={m.icon}>{m.label}</Pill>
            <Pill tone="muted">{co.type}</Pill>
            <Pill tone="muted" icon="user">{`${co.staff.length} staff`}</Pill>
          </div>
        </div>
        {co.needing.length > 0 && (
          <button className="btn btn-primary" onClick={() => onChaseAll(co, "company")}>
            <Icon name="send" size={15} />{`Chase all (${totalBad})`}
          </button>
        )}
      </div>

      {co.status === "blocked" && !co.isInternal && (
        <div className="block-banner">
          <Icon name="alertTri" size={22} />
          <div>
            <b>Not permitted on site</b>
            <p>At least one ticket is expired. Until everyone listed below is back in date, {co.name} cannot be assigned a new work order.</p>
          </div>
        </div>
      )}
      {co.status === "blocked" && co.isInternal && (
        <div className="block-banner">
          <Icon name="alertTri" size={22} />
          <div>
            <b>Action required on our own team</b>
            <p>Tickets below are out of date. Get them renewed before the next attend.</p>
          </div>
        </div>
      )}

      {co.needing.length === 0 ? (
        <div className="empty" style={{ background:"var(--surface)", border:"1px solid var(--line)", borderRadius:"var(--radius)" }}>
          <div className="empty-ico" style={{ background:"var(--ok-soft)", color:"var(--ok)" }}><Icon name="checkCircle" size={28} /></div>
          <h3>Everyone is current</h3>
          <p>No expired or expiring tickets across {co.staff.length} {co.staff.length === 1 ? "person" : "people"} at {co.name}.</p>
        </div>
      ) : (
        <React.Fragment>
          <div className="comp-detail-sub">
            <Icon name="alertTri" size={15} />
            <span>{`${co.needing.length} of ${co.staff.length} ${co.staff.length === 1 ? "person needs" : "people need"} their tickets up to date`}</span>
            <span className="ar-sep" />
            <span>Chase emails are sent to {co.contact} ({co.email})</span>
          </div>
          {co.needing.map((entry) => (
            <ChasePersonBlock entry={entry} key={entry.person.id}
              chasedSet={chasedSet} onChase={onChase} onChaseAll={onChaseAll} />
          ))}
        </React.Fragment>
      )}
    </div>
  );
}

/* ---------- Company card (list view) ---------- */
function CompanyCard({ co, chasedSet, onOpen, onChaseAll }) {
  const m = _COMP_STATUS[co.status];
  const total = co.staff.length;
  const needing = co.needing.length;
  const totalBad = co.expiredCount + co.expiringCount;

  // are all bad certs already chased?
  const allChased = co.needing.every((e) =>
    e.badCerts.every((c) => chasedSet.has(_chaseKey(e.person.id, c.name)))
  );

  return (
    <div className={"ct-card comp-card" + (co.status === "blocked" ? " blocked" : "")}>
      {co.status === "blocked" && !co.isInternal && (
        <div className="block-strip">
          <Icon name="alertTri" size={14} />
          Not permitted on site until tickets are renewed
        </div>
      )}

      <div className="ct-card-body">
        <div className="ct-card-head">
          <div className="ct-av">{co.initials}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="ct-name">{co.name}</div>
            <div className="ct-type">
              {co.isInternal ? "In-house team · " : "Contractor · "}{co.type}
            </div>
          </div>
          <Pill tone={m.tone} dot>{m.label}</Pill>
        </div>

        <div className="comp-stats">
          <div className="comp-stat">
            <div className="comp-stat-n">{total}</div>
            <div className="comp-stat-l">staff on file</div>
          </div>
          <div className="comp-stat-divider" />
          <div className="comp-stat">
            <div className="comp-stat-n" style={{ color: needing ? (co.expiredCount ? "var(--crit)" : "var(--warn)") : "var(--ok)" }}>
              {needing}<small>/{total}</small>
            </div>
            <div className="comp-stat-l">need certs updated</div>
          </div>
        </div>

        {needing > 0 && (
          <div className="comp-breakdown">
            {co.expiredCount > 0 && (
              <span className="comp-bd comp-bd-crit">
                <span className="dot" />{`${co.expiredCount} expired`}
              </span>
            )}
            {co.expiringCount > 0 && (
              <span className="comp-bd comp-bd-warn">
                <span className="dot" />{`${co.expiringCount} expiring soon`}
              </span>
            )}
          </div>
        )}

        <div className="ct-actions">
          <button className="btn btn-primary" onClick={() => onOpen(co.id)}>
            {needing > 0 ? "Open and chase" : "Open"}
            <Icon name="chevronRight" size={14} />
          </button>
          {needing > 0 && (
            allChased ? (
              <span className="chase-done" style={{ flex:1, justifyContent:"center" }}>
                <Icon name="check" size={14} />Reminders sent
              </span>
            ) : (
              <button className="btn" onClick={() => onChaseAll(co, "company")}>
                <Icon name="send" size={14} />{`Chase all (${totalBad})`}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Top-level view ---------- */
function CompetencyView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [openId, setOpenId]   = React.useState(null);
  const [filter, setFilter]   = React.useState("All");
  const [chased, setChased]   = React.useState(() => new Set());
  const [toast, setToast]     = React.useState(null);
  const toastTimer = React.useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  /* Companies: in-house team + every contractor (site-scoped if globalSite set) */
  const companies = React.useMemo(() => {
    const siteName = site ? site.name : null;
    const matchesSite = (staff) => {
      if (!siteName) return true;
      const s = (staff.sites || "").toString();
      return s === "All sites" || s.includes(siteName);
    };
    const inHouseStaff = HL.ownStaff.filter(matchesSite);
    const inHouse = {
      id:"hl", initials:"HL", isInternal:true,
      name:"HazardLink in-house team",
      type:"Facilities, cleaning, security and maintenance",
      contact:"Aoife Kelly", email:"aoife@hazardlink.ie",
      staff: inHouseStaff,
    };
    const fromContractors = HL.contractors.map((c) => ({
      id:c.id, initials:c.initials, isInternal:false,
      name:c.name, type:c.type,
      contact:c.contact, email:c.email,
      staff:c.staff.filter(matchesSite),
    })).filter((c) => c.staff.length > 0);
    const out = [inHouse, ...fromContractors].filter((c) => c.staff.length > 0);
    return out.map(_enrichCompany);
  }, [site && site.name]);

  /* Chase actions */
  const chaseOne = (person, cert) => {
    setChased((prev) => {
      const next = new Set(prev);
      next.add(_chaseKey(person.id, cert.name));
      return next;
    });
    showToast(`Reminder sent — ${person.name}, ${cert.name}`);
  };

  const chaseAll = (target, scope) => {
    // target is either a company (scope === "company") or a person object
    setChased((prev) => {
      const next = new Set(prev);
      let count = 0;
      if (scope === "company") {
        target.needing.forEach((e) => e.badCerts.forEach((c) => {
          next.add(_chaseKey(e.person.id, c.name)); count++;
        }));
        showToast(`${count} reminder${count !== 1 ? "s" : ""} sent to ${target.contact}`);
      } else {
        // chase one person's bag of bad certs
        const personArg = target; // person object
        const certs = scope;       // bad-certs array
        certs.forEach((c) => {
          next.add(_chaseKey(personArg.id, c.name)); count++;
        });
        showToast(`${count} reminder${count !== 1 ? "s" : ""} sent to ${personArg.name}`);
      }
      return next;
    });
  };

  /* Top-level metrics across all companies */
  const totalPeople    = companies.reduce((s, c) => s + c.staff.length, 0);
  const peopleNeeding  = companies.reduce((s, c) => s + c.needing.length, 0);
  const totalExpired   = companies.reduce((s, c) => s + c.expiredCount, 0);
  const totalExpiring  = companies.reduce((s, c) => s + c.expiringCount, 0);

  const detail = openId ? companies.find((c) => c.id === openId) : null;

  /* Detail view */
  if (detail) {
    return (
      <React.Fragment>
        <CompanyDetail co={detail}
          chasedSet={chased}
          onBack={() => setOpenId(null)}
          onChase={chaseOne}
          onChaseAll={chaseAll} />
        {toast && (
          <div className="toast">
            <Icon name="send" size={16} />{toast}
          </div>
        )}
      </React.Fragment>
    );
  }

  /* List view */
  const tabs = ["All", "Action needed", "All current"];
  const shown = companies.filter((c) => {
    if (filter === "All")           return true;
    if (filter === "Action needed") return c.needing.length > 0;
    if (filter === "All current")   return c.needing.length === 0;
    return true;
  });

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Competency</h1>
          <p className="page-desc">Every team and contractor with site access, grouped by company. Open one to see exactly who needs their tickets renewed and chase them by email.</p>
        </div>
        <button className="btn"><Icon name="plus" size={15} />Add staff member</button>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("muted"), color:solid("muted") }}><Icon name="user" size={16} /></div><span className="kpi-label">Companies</span></div>
          <div className="kpi-val">{companies.length}</div>
          <div className="kpi-foot">in-house team plus contractors</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="user" size={16} /></div><span className="kpi-label">People with site access</span></div>
          <div className="kpi-val">{totalPeople}</div>
          <div className="kpi-foot">{`${totalPeople - peopleNeeding} fully in date`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="clock" size={16} /></div><span className="kpi-label">Tickets expiring soon</span></div>
          <div className="kpi-val" style={{ color: totalExpiring ? "var(--warn)" : "var(--ok)" }}>{totalExpiring}</div>
          <div className="kpi-foot">within 90 days</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div><span className="kpi-label">Tickets expired</span></div>
          <div className="kpi-val" style={{ color: totalExpired ? "var(--crit)" : "var(--ok)" }}>{totalExpired}</div>
          <div className="kpi-foot">renew before next attend</div>
        </div>
      </div>

      <div className="card auto-rem-card" style={{ marginBottom:16 }}>
        <div className="card-head">
          <div className="ar-ico"><Icon name="bell" size={15} /></div>
          <div>
            <h3>Auto reminders are running</h3>
            <div className="sub">Every company is emailed automatically 30, 14 and 3 days before each ticket expires, and again the day it lapses. Chase manually below for anything that's already overdue.</div>
          </div>
          <span className="head-act"><Pill tone="ok" dot>Active</Pill></span>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:12.5, color:"var(--ink-3)" }}>
          {`${shown.length} of ${companies.length} companies`}
        </div>
      </div>

      <div className="comp-grid">
        {shown.map((co) => (
          <CompanyCard co={co} key={co.id}
            chasedSet={chased}
            onOpen={setOpenId}
            onChaseAll={chaseAll} />
        ))}
      </div>

      {toast && (
        <div className="toast">
          <Icon name="send" size={16} />{toast}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CompetencyView });

/* ════════════════════ asset_34_e0db4836.js ════════════════════ */
;
/* HazardLink — Statutory compliance & SFG20 register */

const CMP_CATEGORIES = [
  { id:"fire",       label:"Fire safety",                icon:"alertTri", tone:"crit"   },
  { id:"electrical", label:"Electrical",                 icon:"activity", tone:"warn"   },
  { id:"gas",        label:"Gas",                        icon:"beaker",   tone:"warn"   },
  { id:"water",      label:"Water hygiene · Legionella", icon:"droplet",  tone:"clean"  },
  { id:"lift",       label:"Lifts",                      icon:"layers",   tone:"secure" },
  { id:"hvac",       label:"HVAC",                       icon:"monitor",  tone:"maint"  },
  { id:"emlight",    label:"Emergency lighting",         icon:"sun",      tone:"warn"   },
];

const CMP_STATUS_META = {
  compliant:  { label:"Compliant",  tone:"ok"    },
  "due-soon": { label:"Due soon",    tone:"warn"  },
  overdue:    { label:"Overdue",     tone:"crit"  },
  expired:    { label:"Expired",     tone:"crit"  },
};

const CMP_TASKS = [];

/* ============================================================
   Site scoring
   ============================================================ */
function cmpSiteScore(siteName, tasks) {
  const siteTasks = tasks.filter((t) => t.site === siteName);
  if (siteTasks.length === 0) return null;
  const ok = siteTasks.filter((t) => t.status === "compliant").length;
  return Math.round((ok / siteTasks.length) * 100);
}

/* ============================================================
   Detail panel
   ============================================================ */
function CmpTaskPanel({ task, onClose, onUpload }) {
  const cat = CMP_CATEGORIES.find((c) => c.id === task.category);
  const sm = CMP_STATUS_META[task.status];
  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg(cat.tone), color:solid(cat.tone), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name={cat.icon} size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{task.title}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2, fontFamily:"var(--mono)" }}>{task.id} · {task.sfg}</div>
          </div>
          <Pill tone={sm.tone} dot>{sm.label}</Pill>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div className="panel-section">
            <div className="auto-detail-box">
              <div className="auto-detail-row"><span className="k">Category</span><span className="v">{cat.label}</span></div>
              <div className="auto-detail-row"><span className="k">SFG20 schedule</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{task.sfg}</span></div>
              <div className="auto-detail-row"><span className="k">Frequency</span><span className="v">{task.freq}</span></div>
              <div className="auto-detail-row"><span className="k">Site</span><span className="v">{task.site}</span></div>
              <div className="auto-detail-row"><span className="k">Last completed</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{task.lastDone}</span></div>
              <div className="auto-detail-row"><span className="k">Next due</span><span className="v" style={{ fontFamily:"var(--mono)", color: task.status === "overdue" || task.status === "expired" ? "var(--crit)" : task.status === "due-soon" ? "var(--warn)" : undefined }}>{task.nextDue}</span></div>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-label">Certificate</div>
            {task.cert ? (
              <div className="cmp-cert">
                <div className="cmp-cert-ico"><Icon name="file" size={16} /></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="cmp-cert-name">{task.cert}</div>
                  <div className="cmp-cert-meta">Signed by competent person · stamped {task.lastDone}</div>
                </div>
                <button className="btn btn-sm"><Icon name="file" size={12} />Download</button>
              </div>
            ) : (
              <div className="cmp-cert cmp-cert-missing">
                <div className="cmp-cert-ico cmp-cert-ico-missing"><Icon name="alertTri" size={16} /></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="cmp-cert-name">No certificate on file</div>
                  <div className="cmp-cert-meta">Upload a signed PDF to bring this task back into compliance.</div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => onUpload(task)}>
                  <Icon name="plus" size={12} />Upload
                </button>
              </div>
            )}
          </div>

          <div className="panel-section panel-actions">
            <button className="btn"><Icon name="wrench" size={14} />Raise work order</button>
            <button className="btn btn-primary" onClick={() => onUpload(task)}>
              <Icon name="plus" size={14} />Upload certificate
            </button>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

function CmpUploadModal({ task, onClose, onSubmit }) {
  const [signedBy,  setSignedBy]  = React.useState("");
  const [dateDone,  setDateDone]  = React.useState("20 Jun 2026");
  const [nextDue,   setNextDue]   = React.useState("");
  const [filename,  setFilename]  = React.useState("");
  const canSave = signedBy && filename;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth:520 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="file" size={18} /></div>
          <div>
            <h3>Upload certificate</h3>
            <p>{task ? task.title : "Statutory record"} · {task ? task.sfg : ""}</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="ai-field">
            <label>Certificate file</label>
            <div className="cmp-upload-zone"
              onClick={() => {
                const name = "CMP-" + Math.floor(Math.random() * 9000 + 1000) + ".pdf";
                setFilename(name);
              }}>
              {filename ? (
                <React.Fragment>
                  <Icon name="checkCircle" size={20} />
                  <div className="cmp-upload-name">{filename}</div>
                  <div className="cmp-upload-sub">Click to choose a different file</div>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <Icon name="file" size={22} />
                  <div className="cmp-upload-name">Drop the signed PDF here</div>
                  <div className="cmp-upload-sub">Click to choose · accepts PDF stamped by competent person</div>
                </React.Fragment>
              )}
            </div>
          </div>
          <div className="ai-field">
            <label>Signed by (competent person)</label>
            <input className="dv-input" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Name · qualification · company" />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="ai-field">
              <label>Date completed</label>
              <input className="dv-input" value={dateDone} onChange={(e) => setDateDone(e.target.value)} />
            </div>
            <div className="ai-field">
              <label>Next due (optional override)</label>
              <input className="dv-input" value={nextDue} onChange={(e) => setNextDue(e.target.value)} placeholder="auto from frequency" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave}
            style={{ opacity: canSave ? 1 : .5 }}
            onClick={() => onSubmit({ taskId: task?.id, signedBy, dateDone, nextDue, filename })}>
            <Icon name="check" size={15} />Save certificate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function ComplianceView({ go }) {
  const { site: globalSite } = React.useContext(SiteContext);
  const [tasks,    setTasks]    = React.useState(CMP_TASKS);
  const [siteF,    setSiteF]    = React.useState(globalSite ? globalSite.name : "All sites");
  const [catF,     setCatF]     = React.useState("all");
  const [statusF,  setStatusF]  = React.useState("all");
  const [openTask, setOpenTask] = React.useState(null);
  const [uploadFor,setUploadFor]= React.useState(null);
  const { showToast, toastNode } = useViewToast();

  /* When the global site filter changes (top-bar picker), sync the local one. */
  React.useEffect(() => {
    setSiteF(globalSite ? globalSite.name : "All sites");
  }, [globalSite && globalSite.name]);

  const sites = HL.sites.map((s) => s.name);

  const filtered = tasks.filter((t) => {
    if (siteF !== "All sites" && t.site !== siteF) return false;
    if (catF !== "all" && t.category !== catF) return false;
    if (statusF !== "all" && t.status !== statusF) return false;
    return true;
  });

  /* Group by category */
  const grouped = CMP_CATEGORIES
    .map((c) => ({ cat: c, rows: filtered.filter((t) => t.category === c.id) }))
    .filter((g) => g.rows.length > 0);

  /* Site-scoped task pool — used by KPIs and the per-site chart so both
     mirror the global scope, not just the list below. */
  const scopedTasks = globalSite ? tasks.filter((t) => t.site === globalSite.name) : tasks;

  /* Top KPIs */
  const total      = scopedTasks.length;
  const compliant  = scopedTasks.filter((t) => t.status === "compliant").length;
  const dueSoon    = scopedTasks.filter((t) => t.status === "due-soon").length;
  const overdue    = scopedTasks.filter((t) => t.status === "overdue").length;
  const expired    = scopedTasks.filter((t) => t.status === "expired").length;
  const pct        = total ? Math.round((compliant / total) * 100) : 0;

  const saveCertificate = ({ taskId, dateDone, filename }) => {
    setTasks((ts) => ts.map((t) => t.id === taskId
      ? { ...t, lastDone: dateDone, status:"compliant", cert: filename }
      : t));
    setUploadFor(null);
    setOpenTask(null);
    showToast("Certificate uploaded — task back in compliance");
  };

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Statutory compliance</h1>
          <p className="page-desc">Every legal-duty task across the estate, indexed to SFG20 — fire safety, electrical, gas, water hygiene, lifts, HVAC and emergency lighting. Certificates are signed-off by a competent person.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setUploadFor({})}>
          <Icon name="plus" size={15} />Upload certificate
        </button>
      </div>

      {openTask && (
        <CmpTaskPanel task={openTask} onClose={() => setOpenTask(null)} onUpload={setUploadFor} />
      )}
      {uploadFor && (
        <CmpUploadModal task={uploadFor.id ? uploadFor : null}
          onClose={() => setUploadFor(null)} onSubmit={saveCertificate} />
      )}

      {/* KPIs */}
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(5,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div>
            <span className="kpi-label">Compliance</span>
          </div>
          <div className="kpi-val">{pct}<small>%</small></div>
          <div className="kpi-foot">{compliant} of {total} tasks compliant</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="check" size={16} /></div>
            <span className="kpi-label">Compliant</span>
          </div>
          <div className="kpi-val">{compliant}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="clock" size={16} /></div>
            <span className="kpi-label">Due soon</span>
          </div>
          <div className="kpi-val">{dueSoon}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div>
            <span className="kpi-label">Overdue</span>
          </div>
          <div className="kpi-val">{overdue}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="x" size={16} /></div>
            <span className="kpi-label">Expired</span>
          </div>
          <div className="kpi-val">{expired}</div>
        </div>
      </div>

      {/* Per-site scores */}
      <div className="card" style={{ marginBottom:18 }}>
        <div className="card-head">
          <h3>{globalSite ? "Compliance score — " + globalSite.name : "Compliance score by site"}</h3>
          <span className="sub">% of statutory tasks compliant</span>
        </div>
        <div className="cmp-sites">
          {(globalSite ? [globalSite.name] : sites).map((sName) => {
            const score = cmpSiteScore(sName, tasks);
            if (score === null) return null;
            const tone = score >= 95 ? "ok" : score >= 80 ? "warn" : "crit";
            return (
              <div key={sName} className="cmp-site-row">
                <div className="cmp-site-name">{sName}</div>
                <div className="cmp-site-bar">
                  <i style={{ width: score + "%", background: solid(tone) }} />
                </div>
                <div className="cmp-site-pct" style={{ color: solid(tone) }}>{score}<small>%</small></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="toolbar" style={{ marginBottom:14 }}>
        <div className="cmp-filter">
          <label>Site</label>
          <select className="dv-input" value={siteF} onChange={(e) => setSiteF(e.target.value)}>
            <option>All sites</option>
            {sites.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="cmp-filter">
          <label>Category</label>
          <select className="dv-input" value={catF} onChange={(e) => setCatF(e.target.value)}>
            <option value="all">All categories</option>
            {CMP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="cmp-filter">
          <label>Status</label>
          <select className="dv-input" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.keys(CMP_STATUS_META).map((s) => <option key={s} value={s}>{CMP_STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div style={{ marginLeft:"auto", fontSize:13, color:"var(--ink-3)" }}>
          {filtered.length} of {total} tasks
        </div>
      </div>

      {/* Grouped table */}
      {grouped.length === 0 && (
        <div className="empty" style={{ background:"var(--surface)", border:"1px solid var(--line)", borderRadius:"var(--radius)" }}>
          <div className="empty-ico"><Icon name="checkCircle" size={28} /></div>
          <h3>No matching compliance tasks</h3>
          <p>Loosen the filters or pick a different category.</p>
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.cat.id} className="card" style={{ marginBottom:14 }}>
          <div className="card-head">
            <div style={{ width:28, height:28, borderRadius:7, background:softBg(g.cat.tone), color:solid(g.cat.tone), display:"grid", placeItems:"center", flex:"none" }}>
              <Icon name={g.cat.icon} size={13} />
            </div>
            <h3 style={{ margin:0 }}>{g.cat.label}</h3>
            <span className="sub">{g.rows.length} task{g.rows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="cmp-table-head">
            <div>Task</div><div>SFG20</div><div>Site</div><div>Freq</div><div>Last done</div><div>Next due</div><div>Status</div><div>Cert</div>
          </div>
          {g.rows.map((t) => (
            <div key={t.id} className="cmp-row" onClick={() => setOpenTask(t)}>
              <div>
                <div className="cmp-title">{t.title}</div>
                <div className="cmp-id">{t.id}</div>
              </div>
              <div className="cmp-sfg">{t.sfg}</div>
              <div className="cmp-site-cell">{t.site}</div>
              <div className="cmp-freq">{t.freq}</div>
              <div className="cmp-date">{t.lastDone}</div>
              <div className={"cmp-date" + (t.status === "overdue" || t.status === "expired" ? " crit" : t.status === "due-soon" ? " warn" : "")}>{t.nextDue}</div>
              <div><Pill tone={CMP_STATUS_META[t.status].tone} dot>{CMP_STATUS_META[t.status].label}</Pill></div>
              <div>
                {t.cert
                  ? <span className="cmp-has-cert"><Icon name="file" size={11} /></span>
                  : <button className="cmp-no-cert" onClick={(e) => { e.stopPropagation(); setUploadFor(t); }}>
                      <Icon name="plus" size={11} />Upload
                    </button>}
              </div>
            </div>
          ))}
        </div>
      ))}

      {toastNode}
    </div>
  );
}

Object.assign(window, { ComplianceView });

/* ════════════════════ asset_16_3aee4028.js ════════════════════ */
;
/* HazardLink — SLA engine for work orders */

/* ============================================================
   SLA targets per priority (in minutes for response / resolution)
   ============================================================ */
// Blank for a new org — the SLA tier cards appear once SLA targets are defined.
const SLA_TARGETS = {};

/* ============================================================
   Performance — current month (computed locally so the numbers
   match the breaches list below). Each priority has on-target %
   for response and resolution.
   ============================================================ */
const SLA_PERFORMANCE = {
  High:   { responsePct: 0, resolutionPct: 0, total: 0,  responseBreaches: 0, resolutionBreaches: 0 },
  Medium: { responsePct: 0, resolutionPct: 0, total: 0,  responseBreaches: 0, resolutionBreaches: 0 },
  Low:    { responsePct: 0, resolutionPct: 0, total: 0,  responseBreaches: 0, resolutionBreaches: 0 },
};

/* ============================================================
   Active SLA tracked jobs — at-risk + breached
   `etaMin` is minutes remaining; negative means past target.
   ============================================================ */
const SLA_TRACKED = [];

/* ============================================================
   Helpers
   ============================================================ */
function slaFmtETA(min) {
  if (min === null || min === undefined) return "—";
  const abs = Math.abs(min);
  const d = Math.floor(abs / 1440);
  const h = Math.floor((abs % 1440) / 60);
  const m = abs % 60;
  const parts = [];
  if (d) parts.push(d + "d");
  if (h) parts.push(h + "h");
  if (!d && m) parts.push(m + "m");
  return parts.join(" ") || "0m";
}
function slaToneFor(etaMin) {
  if (etaMin < 0) return "crit";
  if (etaMin < 60) return "warn";
  return "accent";
}

function SlaCountdown({ etaMin }) {
  const tone = slaToneFor(etaMin);
  const breached = etaMin < 0;
  return (
    <span className={"sla-countdown sla-tone-" + tone + (breached ? " breached" : "")}>
      <Icon name="clock" size={11} />
      <b>{slaFmtETA(etaMin)}</b>
      <span>{breached ? "over target" : "to target"}</span>
    </span>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function SLAsView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [filter, setFilter] = React.useState("All");

  const ALL = site ? SLA_TRACKED.filter((s) => s.site === site.name) : SLA_TRACKED;
  const breachedCt = ALL.filter((j) => j.etaMin < 0).length;
  const atRiskCt   = ALL.filter((j) => j.etaMin >= 0 && j.etaMin < 60).length;
  const inFlightCt = ALL.length;

  const filtered = ALL.filter((j) => {
    if (filter === "All")      return true;
    if (filter === "Breached") return j.etaMin < 0;
    if (filter === "At risk")  return j.etaMin >= 0 && j.etaMin < 60;
    return j.priority === filter;
  });

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">SLAs</h1>
          <p className="page-desc">Every work order is on a priority-based response and resolution clock. The board flips a job to <b>Breached</b> when either clock runs past target, and rolls compliance into a monthly performance score.</p>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div>
            <span className="kpi-label">Currently breached</span>
          </div>
          <div className="kpi-val">{breachedCt}</div>
          <div className="kpi-foot">across response &amp; resolution clocks</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="clock" size={16} /></div>
            <span className="kpi-label">At risk (&lt; 1h left)</span>
          </div>
          <div className="kpi-val">{atRiskCt}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="activity" size={16} /></div>
            <span className="kpi-label">Live jobs on the clock</span>
          </div>
          <div className="kpi-val">{inFlightCt}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div>
            <span className="kpi-label">On-target this month</span>
          </div>
          <div className="kpi-val">0<small>%</small></div>
          <div className="kpi-foot">weighted across priorities</div>
        </div>
      </div>

      {/* Targets + performance cards */}
      <div className="sla-tier-grid">
        {Object.entries(SLA_TARGETS).map(([prio, t]) => {
          const p = SLA_PERFORMANCE[prio];
          return (
            <div key={prio} className={"sla-tier sla-tier-" + t.tone}>
              <div className="sla-tier-head">
                <div className={"sla-tier-pill sla-tier-pill-" + t.tone}>
                  <Icon name="flag" size={11} />{t.label}
                </div>
                <span className="sla-tier-prio">{prio} priority</span>
              </div>

              <div className="sla-tier-targets">
                <div className="sla-tgt">
                  <div className="sla-tgt-l">Response</div>
                  <div className="sla-tgt-v">{slaFmtETA(t.response)}</div>
                  <div className="sla-tgt-perf">{p.responsePct}<small>% on target</small></div>
                  <div className="sla-tgt-bar"><i style={{ width: p.responsePct + "%", background: t.color }} /></div>
                </div>
                <div className="sla-tgt">
                  <div className="sla-tgt-l">Resolution</div>
                  <div className="sla-tgt-v">{slaFmtETA(t.resolution)}</div>
                  <div className="sla-tgt-perf">{p.resolutionPct}<small>% on target</small></div>
                  <div className="sla-tgt-bar"><i style={{ width: p.resolutionPct + "%", background: t.color }} /></div>
                </div>
              </div>

              <div className="sla-tier-foot">
                <div className="sla-tier-foot-row">
                  <span>{p.total} jobs this month</span>
                  <span className="sla-tier-foot-breach">{p.responseBreaches + p.resolutionBreaches} breaches</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Breach + at-risk table */}
      <div className="toolbar" style={{ marginTop:18, marginBottom:14 }}>
        <div className="seg">
          {["All","Breached","At risk","High","Medium","Low"].map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div style={{ marginLeft:"auto", fontSize:13, color:"var(--ink-3)" }}>
          {filtered.length} job{filtered.length === 1 ? "" : "s"} on the clock
        </div>
      </div>

      <div className="card">
        <div className="sla-row sla-head">
          <div>ID</div><div>Job</div><div>Site</div><div>Priority</div><div>Clock</div><div>Status</div><div>Assignee</div>
        </div>
        {filtered.map((j) => {
          const t = SLA_TARGETS[j.priority];
          return (
            <div key={j.id} className={"sla-row" + (j.etaMin < 0 ? " sla-row-breach" : "")} onClick={() => go && go("maintenance")}>
              <div className="wo-id">{j.id}</div>
              <div>
                <div className="sla-job-title">{j.title}</div>
                <div className="sla-job-stage">{j.stage} clock · target {slaFmtETA(t[j.stage.toLowerCase()])}</div>
              </div>
              <div className="wo-site">{j.site}</div>
              <div><Pill tone={t.tone} dot>{j.priority}</Pill></div>
              <div><SlaCountdown etaMin={j.etaMin} /></div>
              <div><Pill tone={j.etaMin < 0 ? "crit" : "muted"} dot>{j.etaMin < 0 ? "Breached" : j.status}</Pill></div>
              <div className="sla-assignee">{j.assignee}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { SLAsView, SLA_TARGETS, SLA_PERFORMANCE, SLA_TRACKED, SlaCountdown, slaFmtETA });

/* ════════════════════ asset_45_856423b8.js ════════════════════ */
;
/* HazardLink — Permits to work */

/* Permit types — grouped by category for the request picker and the
   register filter. Each carries an icon, severity tone, and the checks
   that MUST be ticked before it can be approved. */
const PTW_CATEGORIES = [
  { id:"hot",        label:"Hot & fire",            icon:"alertTri"  },
  { id:"electrical", label:"Electrical",             icon:"activity"  },
  { id:"height",     label:"Height & access",        icon:"layers"    },
  { id:"confined",   label:"Confined & ground",      icon:"box"        },
  { id:"mech",       label:"Mechanical & pressure",  icon:"settings"  },
  { id:"hazmat",     label:"Hazardous materials",     icon:"shield"   },
  { id:"other",      label:"Other",                   icon:"clipboard"},
];

const PTW_TYPES = [
  /* Hot & fire */
  { id:"hot",          cat:"hot",        label:"Hot work",                                icon:"alertTri", tone:"crit"  },
  { id:"fire-impair",  cat:"hot",        label:"Fire system impairment",                  icon:"alertCircle", tone:"crit" },

  /* Electrical */
  { id:"electrical",   cat:"electrical", label:"Electrical isolation (LOTO)",             icon:"activity", tone:"warn"  },
  { id:"elec-live",    cat:"electrical", label:"Live electrical work (energised)",        icon:"alertTri", tone:"crit"  },

  /* Height & access */
  { id:"high",         cat:"height",     label:"Working at height",                       icon:"layers",   tone:"warn"  },
  { id:"roof",         cat:"height",     label:"Roof access / fragile surfaces",          icon:"layers",   tone:"crit"  },
  { id:"scaffold",     cat:"height",     label:"Scaffolding",                             icon:"box",      tone:"warn"  },

  /* Confined & ground */
  { id:"confined",     cat:"confined",   label:"Confined space entry",                    icon:"box",      tone:"crit"  },
  { id:"excavation",   cat:"confined",   label:"Excavation / ground works",               icon:"layers",   tone:"warn"  },

  /* Mechanical & pressure */
  { id:"loto-mech",    cat:"mech",       label:"Energy isolation / LOTO (mechanical)",    icon:"settings", tone:"warn"  },
  { id:"pressure",     cat:"mech",       label:"Pressure systems / pressure testing",     icon:"activity", tone:"crit"  },
  { id:"line-break",   cat:"mech",       label:"Line breaking / breaking containment",    icon:"droplet",  tone:"crit"  },
  { id:"lifting",      cat:"mech",       label:"Lifting operations (crane / hoist)",      icon:"package",  tone:"warn"  },

  /* Hazardous materials */
  { id:"asbestos",     cat:"hazmat",     label:"Asbestos work",                           icon:"alertTri", tone:"crit"  },
  { id:"coshh",        cat:"hazmat",     label:"Hazardous substances (COSHH)",            icon:"droplet",  tone:"warn"  },
  { id:"gas",          cat:"hazmat",     label:"Gas work",                                icon:"activity", tone:"crit"  },
  { id:"radiation",    cat:"hazmat",     label:"Radiation / radiography",                 icon:"alertCircle", tone:"crit" },

  /* Other */
  { id:"cold",         cat:"other",      label:"Cold work / general work",                icon:"check",    tone:"muted" },
  { id:"demolition",   cat:"other",      label:"Demolition",                              icon:"alertTri", tone:"crit"  },
  { id:"water",        cat:"other",      label:"Working near or over water",              icon:"droplet",  tone:"warn"  },
  { id:"lone",         cat:"other",      label:"Lone working",                            icon:"user",     tone:"warn"  },
  { id:"occupied",     cat:"other",      label:"Work in occupied / public areas",         icon:"users",    tone:"warn"  },
  { id:"traffic",      cat:"other",      label:"Traffic / vehicle movement areas",        icon:"truck",    tone:"warn"  },
];

const PTW_STATUS_META = {
  Requested: { tone:"warn",   icon:"clock"        },
  Approved:  { tone:"accent", icon:"check"        },
  Active:    { tone:"ok",     icon:"checkCircle"  },
  Closed:    { tone:"muted",  icon:"file"         },
};

/* Each permit type's required checks. These are what must be ticked
   before a manager can approve the permit. Specific to the hazard. */
const PTW_CHECKS = {
  "hot": [
    "Fire extinguisher present and serviceable",
    "Combustibles cleared from 1.5m radius",
    "Fire watch assigned for duration of work",
    "Post-work fire watch / monitoring for 60 min",
    "Gas / welding equipment certified in date",
    "Hot work permit form signed and posted at site",
  ],
  "fire-impair": [
    "Alternative fire watch arranged for impaired zone",
    "Alarm receiving centre (ARC) notified before isolation",
    "Insurer notified where required by policy",
    "Restore-by time agreed and documented",
    "Affected zone signage in place",
    "Isolation tagged at fire panel / sprinkler valve",
  ],
  "electrical": [
    "Lock-out tag-out (LOTO) applied at source",
    "Isolation verified by a competent person",
    "Test-for-dead with proving unit completed",
    "Earth and short-circuit applied where required",
    "Stored energy (capacitors / springs) discharged",
    "Safe-to-work statement signed by both parties",
  ],
  "elec-live": [
    "Justification for live work documented (no alternative)",
    "Competent person + certified standby person present",
    "Insulated tools and PPE inspected, in date",
    "Arc-flash boundary defined and barriered",
    "Risk assessment signed off by HV / electrical authority",
    "Fire-blanket and CO2 extinguisher to hand",
  ],
  "high": [
    "Access equipment inspected (MEWP / ladder / scaffold)",
    "Harness and anchor points checked, in date",
    "Exclusion zone barriered below the work area",
    "Rescue plan documented and discussed",
    "Weather conditions reviewed (wind < 15 m/s)",
    "Toolbox talk completed with all on the lift",
  ],
  "roof": [
    "Roof load-bearing / fragility survey reviewed",
    "Walkway boards and crawl boards in place over fragile areas",
    "Edge protection or fall-arrest rigged on all sides",
    "Anchor points tested and tagged within last 12 months",
    "Rescue plan from roof documented",
    "Permit posted at roof access point",
  ],
  "scaffold": [
    "Scafftag inspected and signed within last 7 days",
    "Erection / dismantle by competent (CISRS) scaffolders only",
    "Base plates and sole boards confirmed on solid ground",
    "Toe boards, mid-rail and guard-rail on all working lifts",
    "Public exclusion below the lift in place",
    "Loading limit posted on the structure",
  ],
  "confined": [
    "Atmosphere test completed (O2, LEL, CO, H2S)",
    "Continuous atmospheric monitoring in place",
    "Forced ventilation running before and during entry",
    "Standby attendant assigned at the entry point",
    "Rescue plan documented; tripod and winch rigged",
    "Communication method confirmed (radio / line)",
  ],
  "excavation": [
    "Underground services located and CAT-scanned",
    "Service drawings reviewed against the dig area",
    "Shoring / battering / benching plan in place",
    "Spoil set back at least 1m from the edge",
    "Edge protection / barriers around the excavation",
    "Access ladder secured and projecting 1m above edge",
  ],
  "loto-mech": [
    "All energy sources identified (mech, hydraulic, pneumatic)",
    "Each source isolated and locked at source",
    "Stored energy (springs, gravity, pressure) bled / blocked",
    "Try-out test confirms zero motion",
    "LOTO tag fixed with name, date and reason",
    "Re-energisation steps written and held by isolator",
  ],
  "pressure": [
    "System depressurised and locked off before work",
    "Pressure-test pressure agreed and documented",
    "Test medium (water / nitrogen / air) specified",
    "Exclusion zone in place during the test",
    "Pressure-relief device verified and in date",
    "Calibrated test gauge in date and recorded",
  ],
  "line-break": [
    "Line drained, vented and depressurised",
    "Double block & bleed or equivalent isolation confirmed",
    "Contents identified on SDS, PPE selected accordingly",
    "Drip tray / containment in place under the joint",
    "Spill kit and eye-wash within reach",
    "Receiving container ready before breaking the line",
  ],
  "lifting": [
    "Lift plan signed by appointed person",
    "Crane / hoist within statutory examination (LOLER) date",
    "Lifting accessories tagged and within proof-load date",
    "Slinger / banksman appointed and identified",
    "Exclusion zone barriered around the lift radius",
    "Wind / ground conditions reviewed against limits",
  ],
  "asbestos": [
    "Asbestos register / refurbishment survey reviewed",
    "Licensed contractor confirmed (HSA / HSE notification)",
    "Enclosure or controlled area established (NPU running)",
    "Decontamination unit / 3-stage airlock in place",
    "Personal air-monitoring arranged for the shift",
    "Clearance certificate to be issued before reoccupation",
  ],
  "coshh": [
    "Safety Data Sheet (SDS) reviewed for every substance",
    "COSHH assessment in place for the task",
    "Correct PPE selected (gloves, RPE, eye protection)",
    "Spill kit suitable for the substance to hand",
    "Local exhaust ventilation (LEV) running where required",
    "Waste route and container labelled and ready",
  ],
  "gas": [
    "Gas Safe / RGI registered operative confirmed",
    "Supply isolated at meter / cylinder and locked",
    "Gas tightness test completed and recorded",
    "Purge procedure documented and followed",
    "Gas detector in date and on continuous read",
    "No ignition sources within the work area",
  ],
  "radiation": [
    "RPA (Radiation Protection Adviser) consulted",
    "Controlled area set up with signage and barriers",
    "Source / X-ray equipment registered and in date",
    "Personal dosimeters issued to all operatives",
    "Pre-shoot survey and post-shoot survey scheduled",
    "Emergency procedure for source recovery posted",
  ],
  "cold": [
    "Task risk assessment reviewed and signed",
    "Correct PPE confirmed for the activity",
    "Tools and equipment inspected before use",
    "Housekeeping plan agreed (waste, walkways)",
    "Toolbox talk completed with all operatives",
  ],
  "demolition": [
    "Pre-demolition survey reviewed (incl. asbestos)",
    "Structural engineer sequence of demolition signed",
    "Exclusion zone barriered (>1.5x structure height)",
    "Services proven isolated upstream of the structure",
    "Dust suppression (water / damping) in place",
    "Plant operators CPCS / CSCS certified",
  ],
  "water": [
    "Buoyancy aids worn by all near or over water",
    "Throw-line and life-ring at the work position",
    "Rescue craft / standby boat arrangements confirmed",
    "Banksman watching the water side",
    "Tides / currents / weather reviewed before start",
    "Lone working prohibited for this activity",
  ],
  "lone": [
    "Hazard assessment confirms task suitable for lone work",
    "Check-in / check-out times agreed with supervisor",
    "Lone-worker device or phone signal confirmed",
    "Escalation contact briefed and reachable",
    "Emergency procedure understood by the worker",
  ],
  "occupied": [
    "Work scheduled outside core occupancy hours",
    "Affected zones barriered with public signage",
    "Building user / FM notified of the activity",
    "Noise / dust controls in place during operation",
    "Tools and materials secured against public access",
    "Site security / reception briefed on the work",
  ],
  "traffic": [
    "Traffic management plan (TMP) signed off",
    "Banksman / traffic marshal appointed and identified",
    "Hi-vis worn by all on foot in the area",
    "Vehicle exclusion zone barriered around the work",
    "Speed limit and route diversion signage posted",
    "Reversing alarms / cameras confirmed working",
  ],
};

const SEED_PERMITS = [];

/* ============================================================
   Permit detail panel
   ============================================================ */
function PtwPanel({ permit, onClose, onApprove, onActivate, onClose: _close, onCloseOut }) {
  const t = PTW_TYPES.find((x) => x.id === permit.type);
  const sm = PTW_STATUS_META[permit.status];
  const allChecked = permit.checks.every((c) => c.done);

  return (
    <React.Fragment>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="panel">
        <div className="panel-head">
          <div style={{ width:36, height:36, borderRadius:9, background:softBg(t.tone), color:solid(t.tone), display:"grid", placeItems:"center", flex:"none" }}>
            <Icon name={t.icon} size={17} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="panel-title">{permit.title}</div>
            <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2, fontFamily:"var(--mono)" }}>
              {permit.id} · {t.label}
            </div>
          </div>
          <Pill tone={sm.tone} icon={sm.icon}>{permit.status}</Pill>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="panel-body">
          <div className="panel-section">
            <div className="auto-detail-box">
              <div className="auto-detail-row"><span className="k">Site</span><span className="v"><Icon name="mapPin" size={11} />{permit.site}</span></div>
              <div className="auto-detail-row"><span className="k">Contractor</span><span className="v">{permit.contractor}</span></div>
              <div className="auto-detail-row"><span className="k">Linked work order</span><span className="v" style={{ fontFamily:"var(--mono)", color:"var(--accent-ink)" }}>{permit.workOrder}</span></div>
              <div className="auto-detail-row"><span className="k">Valid from</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{permit.validFrom}</span></div>
              <div className="auto-detail-row"><span className="k">Valid to</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{permit.validTo}</span></div>
              <div className="auto-detail-row"><span className="k">Approver</span><span className="v">{permit.approver}{permit.approvedAt ? " · " + permit.approvedAt : ""}</span></div>
            </div>
          </div>

          {permit.notes && (
            <div className="panel-section">
              <div className="panel-label">Notes</div>
              <div className="bill-notes">{permit.notes}</div>
            </div>
          )}

          <div className="panel-section">
            <div className="panel-label">Required checks ({permit.checks.filter((c) => c.done).length}/{permit.checks.length})</div>
            <div className="ptw-checks">
              {permit.checks.map((c, i) => (
                <div key={i} className={"ptw-check" + (c.done ? " on" : "")}>
                  <div className="ptw-check-box">
                    {c.done ? <Icon name="check" size={11} /> : <span />}
                  </div>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-section panel-actions">
            {permit.status === "Requested" && (
              <button className="btn btn-primary" disabled={!allChecked}
                style={{ opacity: allChecked ? 1 : .5 }} onClick={onApprove}>
                <Icon name="check" size={14} />Approve permit
              </button>
            )}
            {permit.status === "Approved" && (
              <button className="btn btn-primary" onClick={onActivate}>
                <Icon name="checkCircle" size={14} />Mark active on site
              </button>
            )}
            {permit.status === "Active" && (
              <button className="btn btn-primary" onClick={onCloseOut}>
                <Icon name="check" size={14} />Close out permit
              </button>
            )}
            <button className="btn"><Icon name="file" size={14} />Download form (PDF)</button>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ============================================================
   Request modal
   ============================================================ */
function PtwRequestModal({ onClose, onSubmit }) {
  const [type, setType]         = React.useState("");
  const [catFilter, setCatFilter] = React.useState("all");
  const [search, setSearch]       = React.useState("");
  const [site, setSite]         = React.useState("");
  const [contractor, setCtr]    = React.useState("");
  const [workOrder, setWO]      = React.useState("");
  const [validFrom, setVf]      = React.useState("21 Jun 08:00");
  const [validTo,   setVt]      = React.useState("21 Jun 16:00");
  const [notes, setNotes]       = React.useState("");

  const canSave = type && site && contractor && validFrom && validTo;

  const save = () => {
    if (!canSave) return;
    onSubmit({
      type, site, contractor, workOrder, validFrom, validTo, notes,
      title: PTW_TYPES.find((x) => x.id === type).label + " — " + (notes.split(/[\.\,\n]/)[0] || "new permit"),
    });
  };

  const meta = PTW_TYPES.find((x) => x.id === type);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth:620 }}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="shield" size={18} /></div>
          <div>
            <h3>Request permit to work</h3>
            <p>Submit a permit request. A manager must approve before the work can start.</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="ai-field">
            <label>Permit type</label>
            <div className="ptw-type-search">
              <Icon name="search" size={13} />
              <input className="dv-input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search permit types… (e.g. asbestos, height, gas)" />
            </div>
            <div className="ptw-cat-tabs">
              <button className={"ptw-cat-tab" + (catFilter === "all" ? " on" : "")}
                onClick={() => setCatFilter("all")}>All</button>
              {PTW_CATEGORIES.map((c) => (
                <button key={c.id}
                  className={"ptw-cat-tab" + (catFilter === c.id ? " on" : "")}
                  onClick={() => setCatFilter(c.id)}>
                  <Icon name={c.icon} size={11} />{c.label}
                </button>
              ))}
            </div>
            <div className="ptw-type-groups">
              {PTW_CATEGORIES.filter((c) => catFilter === "all" || c.id === catFilter).map((c) => {
                const types = PTW_TYPES
                  .filter((p) => p.cat === c.id)
                  .filter((p) => !search.trim() || p.label.toLowerCase().includes(search.trim().toLowerCase()));
                if (types.length === 0) return null;
                return (
                  <div key={c.id} className="ptw-type-group">
                    <div className="ptw-type-group-cap">
                      <Icon name={c.icon} size={11} />{c.label}
                    </div>
                    <div className="ptw-type-row">
                      {types.map((p) => (
                        <button key={p.id}
                          className={"ptw-type-chip" + (type === p.id ? " on" : "")}
                          onClick={() => setType(p.id)}>
                          <div className={"ptw-type-ico ptw-type-ico-" + p.tone}><Icon name={p.icon} size={14} /></div>
                          <span>{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="ai-field">
              <label>Site</label>
              <select className="dv-input" value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">Pick a site…</option>
                {HL.sites.map((s) => <option key={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="ai-field">
              <label>Contractor</label>
              <input className="dv-input" value={contractor} onChange={(e) => setCtr(e.target.value)} placeholder="e.g. AquaFix Plumbing" />
            </div>
            <div className="ai-field">
              <label>Linked work order (optional)</label>
              <input className="dv-input" value={workOrder} onChange={(e) => setWO(e.target.value)} placeholder="e.g. WO-2041" />
            </div>
            <div className="ai-field"><label>&nbsp;</label></div>
            <div className="ai-field">
              <label>Valid from</label>
              <input className="dv-input" value={validFrom} onChange={(e) => setVf(e.target.value)} />
            </div>
            <div className="ai-field">
              <label>Valid to</label>
              <input className="dv-input" value={validTo} onChange={(e) => setVt(e.target.value)} />
            </div>
            <div className="ai-field" style={{ gridColumn:"1 / -1" }}>
              <label>Notes for the approver</label>
              <textarea className="dv-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Scope, hazards, controls and any context the approver needs to know…" />
            </div>
          </div>

          {meta && (
            <div className="ptw-preview">
              <div className="ptw-preview-cap"><Icon name="shield" size={12} />Required checks for {meta.label.toLowerCase()}</div>
              <ul>{PTW_CHECKS[type].map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave}
            style={{ opacity: canSave ? 1 : .5 }} onClick={save}>
            <Icon name="send" size={15} />Submit request
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Main view
   ============================================================ */
function PermitsView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [permits,   setPermits]   = React.useState(SEED_PERMITS);
  const [filter,    setFilter]    = React.useState("All");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [openId,    setOpenId]    = React.useState(null);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const { showToast, toastNode } = useViewToast();

  const tabs = ["All", "Requested", "Approved", "Active", "Closed"];
  const scoped = site ? permits.filter((p) => p.site === site.name) : permits;
  const filtered = scoped
    .filter((p) => filter === "All" ? true : p.status === filter)
    .filter((p) => {
      if (typeFilter === "all") return true;
      const t = PTW_TYPES.find((x) => x.id === p.type);
      return t && t.cat === typeFilter;
    });

  const counts = {
    Requested: scoped.filter((p) => p.status === "Requested").length,
    Approved:  scoped.filter((p) => p.status === "Approved").length,
    Active:    scoped.filter((p) => p.status === "Active").length,
    Closed:    scoped.filter((p) => p.status === "Closed").length,
  };

  const update = (id, patch) => setPermits((ps) => ps.map((p) => p.id === id ? { ...p, ...patch } : p));

  const approve = (id) => {
    update(id, { status:"Approved", approvedAt:"just now" });
    showToast("Permit approved · site access linked");
  };
  const activate = (id) => {
    update(id, { status:"Active" });
    showToast("Permit marked active on site");
  };
  const closeOut = (id) => {
    update(id, { status:"Closed" });
    showToast("Permit closed out");
  };

  const submitNew = (payload) => {
    const id = "PTW-" + (2015 + permits.length - SEED_PERMITS.length);
    setPermits((ps) => [{
      id, status:"Requested",
      checks: PTW_CHECKS[payload.type].map((c) => ({ label: c, done: false })),
      ...payload,
    }, ...ps]);
    setRequestOpen(false);
    showToast("Permit " + id + " requested · awaiting approval");
  };

  const open = permits.find((p) => p.id === openId);

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Permits to work</h1>
          <p className="page-desc">The full set of permit types used across facilities and maintenance — from hot work and electrical isolation to confined space, asbestos, lifting and radiation. Contractor requests a permit, a manager approves, the system unlocks site access for the validity window.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setRequestOpen(true)}>
          <Icon name="plus" size={15} />Request permit
        </button>
      </div>

      {requestOpen && <PtwRequestModal onClose={() => setRequestOpen(false)} onSubmit={submitNew} />}
      {open && (
        <PtwPanel permit={open}
          onClose={() => setOpenId(null)}
          onApprove={() => approve(open.id)}
          onActivate={() => activate(open.id)}
          onCloseOut={() => closeOut(open.id)} />
      )}

      {/* KPIs */}
      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="clock" size={16} /></div>
            <span className="kpi-label">Awaiting approval</span>
          </div>
          <div className="kpi-val">{counts.Requested}</div>
          <div className="kpi-foot">manager action needed</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="check" size={16} /></div>
            <span className="kpi-label">Approved</span>
          </div>
          <div className="kpi-val">{counts.Approved}</div>
          <div className="kpi-foot">ready to go active</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("ok"), color:solid("ok") }}><Icon name="checkCircle" size={16} /></div>
            <span className="kpi-label">Active on site</span>
          </div>
          <div className="kpi-val">{counts.Active}</div>
          <div className="kpi-foot">site access live</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("muted"), color:solid("muted") }}><Icon name="file" size={16} /></div>
            <span className="kpi-label">Closed today</span>
          </div>
          <div className="kpi-val">{counts.Closed}</div>
        </div>
      </div>

      {/* Filter strip */}
      <div className="toolbar" style={{ marginBottom:12 }}>
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div className="ptw-type-filter">
          <Icon name="shield" size={12} />
          <select className="dv-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All permit types</option>
            {PTW_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft:"auto", fontSize:13, color:"var(--ink-3)" }}>
          {filtered.length} permit{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Permit cards */}
      <div className="ptw-grid">
        {filtered.map((p) => {
          const meta = PTW_TYPES.find((x) => x.id === p.type);
          const sm = PTW_STATUS_META[p.status];
          const checks = p.checks.filter((c) => c.done).length;
          return (
            <button key={p.id} className={"ptw-card ptw-card-" + meta.tone} onClick={() => setOpenId(p.id)}>
              <div className="ptw-card-top">
                <div className={"ptw-type-ico ptw-type-ico-" + meta.tone}><Icon name={meta.icon} size={14} /></div>
                <span className="ptw-card-type">{meta.label}</span>
                <span className="ptw-card-id">{p.id}</span>
              </div>
              <div className="ptw-card-title">{p.title}</div>
              <div className="ptw-card-meta">
                <span><Icon name="mapPin" size={11} />{p.site}</span>
                <span className="ptw-card-sep" />
                <span><Icon name="user" size={11} />{p.contractor}</span>
              </div>
              <div className="ptw-card-validity">
                <div className="ptw-validity-row"><span className="k">Valid</span><span className="v">{p.validFrom} → {p.validTo}</span></div>
                <div className="ptw-validity-row"><span className="k">Linked WO</span><span className="v" style={{ color:"var(--accent-ink)", fontFamily:"var(--mono)" }}>{p.workOrder}</span></div>
                <div className="ptw-validity-row"><span className="k">Approver</span><span className="v">{p.approver}</span></div>
                <div className="ptw-validity-row"><span className="k">Checks</span><span className="v">{checks}/{p.checks.length}</span></div>
              </div>
              <div className="ptw-card-foot">
                <Pill tone={sm.tone} icon={sm.icon}>{p.status}</Pill>
                {p.status === "Requested" && <span className="ptw-card-action">Tap to review &amp; approve →</span>}
                {p.status === "Approved"  && <span className="ptw-card-action">Awaiting activation →</span>}
                {p.status === "Active"    && <span className="ptw-card-action">Live · access unlocked →</span>}
              </div>
            </button>
          );
        })}
      </div>

      {toastNode}
    </div>
  );
}

Object.assign(window, { PermitsView });

/* ════════════════════ asset_36_475eb798.js ════════════════════ */
;
/* HazardLink — Team view: staff roster, time-off overview, profiles */

const TEAM_GROUPS = [
  { id: "supervisors", label: "Supervisors", icon: "award",   tone: "accent" },
  { id: "technicians", label: "Technicians", icon: "wrench",  tone: "maint" },
  { id: "guards",      label: "Guards",      icon: "shield",  tone: "secure" },
  { id: "cleaners",    label: "Cleaners",    icon: "droplet", tone: "clean" },
];

// 7 days, Mon-Sun. Each is either null (off) or { start, end, site, disc }
function rotaFor(pattern, home, other) {
  const sec = home;
  switch (pattern) {
    case "sup-mon-fri":
      return [
        { start:"09:00", end:"17:30", site:home,                 disc:"accent" },
        { start:"09:00", end:"17:30", site:other || home,        disc:"accent" },
        { start:"09:00", end:"17:30", site:home,                 disc:"accent" },
        { start:"09:00", end:"17:30", site:other || home,        disc:"accent" },
        { start:"09:00", end:"17:30", site:home,                 disc:"accent" },
        null, null,
      ];
    case "sup-site-lead":
      return [
        { start:"07:30", end:"16:00", site:home,                 disc:"accent" },
        { start:"07:30", end:"16:00", site:home,                 disc:"accent" },
        { start:"07:30", end:"16:00", site:home,                 disc:"accent" },
        { start:"07:30", end:"16:00", site:home,                 disc:"accent" },
        { start:"07:30", end:"16:00", site:home,                 disc:"accent" },
        null, null,
      ];
    case "tech-mon-fri":
      return [
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"16:30", site:other || home,        disc:"maint" },
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        null, null,
      ];
    case "tech-tue-sat":
      return [
        null,
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"16:30", site:home,                 disc:"maint" },
        { start:"08:00", end:"14:00", site:home,                 disc:"maint" },
        null,
      ];
    case "clean-early":
      return [
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        null, null,
      ];
    case "clean-late":
      return [
        { start:"14:00", end:"22:00", site:home,                 disc:"clean" },
        null,
        { start:"14:00", end:"22:00", site:home,                 disc:"clean" },
        { start:"14:00", end:"22:00", site:home,                 disc:"clean" },
        { start:"14:00", end:"22:00", site:home,                 disc:"clean" },
        { start:"08:00", end:"14:00", site:home,                 disc:"clean" },
        null,
      ];
    case "clean-mixed":
      return [
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"14:00", site:other || home,        disc:"clean" },
        null,
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"14:00", site:home,                 disc:"clean" },
        { start:"06:00", end:"12:00", site:other || home,        disc:"clean" },
        null,
      ];
    case "guard-nights":
      return [
        null,
        { start:"22:00", end:"06:00", site:home,                 disc:"secure" },
        { start:"22:00", end:"06:00", site:home,                 disc:"secure" },
        { start:"22:00", end:"06:00", site:home,                 disc:"secure" },
        { start:"22:00", end:"06:00", site:home,                 disc:"secure" },
        null,
        { start:"22:00", end:"06:00", site:home,                 disc:"secure" },
      ];
    case "guard-days":
      return [
        { start:"14:00", end:"22:00", site:home,                 disc:"secure" },
        { start:"14:00", end:"22:00", site:home,                 disc:"secure" },
        null,
        { start:"14:00", end:"22:00", site:home,                 disc:"secure" },
        { start:"14:00", end:"22:00", site:home,                 disc:"secure" },
        { start:"10:00", end:"18:00", site:home,                 disc:"secure" },
        null,
      ];
    case "guard-mixed":
      return [
        { start:"06:00", end:"14:00", site:home,                 disc:"secure" },
        { start:"06:00", end:"14:00", site:home,                 disc:"secure" },
        { start:"06:00", end:"14:00", site:home,                 disc:"secure" },
        null,
        { start:"14:00", end:"22:00", site:home,                 disc:"secure" },
        { start:"14:00", end:"22:00", site:home,                 disc:"secure" },
        null,
      ];
    default:
      return [null, null, null, null, null, null, null];
  }
}

function nextWeekRota(thisWeek) {
  // Mild variation for the following week: rotate off days by 1 to keep it readable.
  return thisWeek.slice(1).concat([thisWeek[0]]);
}

/* ---------- Static team data ---------- */

const TEAM_DATA_RAW = [];

// Pre-compute rotas for each person
const TEAM_DATA = TEAM_DATA_RAW.map((p) => {
  const thisWeek = rotaFor(p.pattern, p.homeSite, p.otherSite);
  // For people on leave this week, replace those days with a leave marker
  const tw = thisWeek.map((d, i) => p.thisWeekLeave.includes(i)
    ? { leave:true, label:"Annual leave" }
    : d);
  return { ...p, rota: { thisWeek: tw, nextWeek: nextWeekRota(thisWeek) } };
});

const STATUS_META_TEAM = {
  "on-shift": { label:"On shift",  tone:"ok" },
  "off":       { label:"Off",       tone:"muted" },
  "on-leave":  { label:"On leave",  tone:"warn" },
};

const REQ_STATUS_META = {
  approved: { label:"Approved", tone:"ok" },
  pending:  { label:"Pending",  tone:"warn" },
  declined: { label:"Declined", tone:"crit" },
};

// "This week" anchor — Mon 15 Jun 2026. Today is Fri 19 Jun.
const WEEK_DOW   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const WEEK_DATES_THIS = [15, 16, 17, 18, 19, 20, 21];
const WEEK_DATES_NEXT = [22, 23, 24, 25, 26, 27, 28];
const TODAY_INDEX = 4; // Fri

function fmtRange(from, to) {
  // "2026-06-29" → "29 Jun"
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parse = (s) => {
    const [, mo, d] = s.split("-");
    return d.replace(/^0/, "") + " " + m[parseInt(mo, 10) - 1];
  };
  if (from === to) return parse(from);
  return parse(from) + " — " + parse(to);
}
function daysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  return Math.round((b - a) / 86400000) + 1;
}

/* ===========================================================
   Time off overview strip — at the top of the team page
   =========================================================== */
function TimeOffOverview({ staff, pendingCount, onJumpToPending }) {
  // Build per-day list of people on leave this week from staff.thisWeekLeave
  const days = WEEK_DOW.map((dow, i) => {
    const onLeave = staff.filter((p) => p.thisWeekLeave.includes(i));
    return { dow, date: WEEK_DATES_THIS[i], today: i === TODAY_INDEX, onLeave };
  });

  return (
    <div className="card tof-card" style={{ marginBottom: 20 }}>
      <div className="tof-head">
        <div style={{ width:34, height:34, borderRadius:9, background:"var(--warn-soft)", color:"#92400e", display:"grid", placeItems:"center", flex:"none" }}>
          <Icon name="calendar" size={18} />
        </div>
        <div>
          <div className="tof-title">Who's off this week</div>
          <div className="tof-sub">Week of Mon 15 Jun — Sun 21 Jun, 2026</div>
        </div>
        {pendingCount > 0 && (
          <button className="tof-pending" onClick={onJumpToPending}>
            <Icon name="clock" size={15} />
            <span><b>{pendingCount}</b> pending request{pendingCount === 1 ? "" : "s"} to approve</span>
            <Icon name="chevronRight" size={14} />
          </button>
        )}
      </div>
      <div className="tof-strip">
        {days.map((d, i) => (
          <div key={i} className={"tof-day" + (d.today ? " today" : "")}>
            <div className="tof-day-head">
              <span className="tof-day-dow">{d.dow}</span>
              <span className="tof-day-date">{d.date}</span>
            </div>
            {d.onLeave.length === 0
              ? <div className="tof-day-empty">No one off</div>
              : d.onLeave.map((p) => (
                  <div className="tof-chip" key={p.id}>
                    <span className="tof-chip-av">{p.initials}</span>
                    <span>{p.name.split(" ")[0]}</span>
                  </div>
                ))
            }
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
   Staff row
   =========================================================== */
function StaffRow({ p, onOpen }) {
  const s = STATUS_META_TEAM[p.status];
  return (
    <button className="staff-row" onClick={() => onOpen(p)}>
      <div className="staff-av-row">{p.initials}</div>
      <div>
        <div className="staff-row-nm">{p.name}</div>
        <div className="staff-row-rl">{p.role}</div>
      </div>
      <div className="staff-row-site hide-md">
        <Icon name="mapPin" size={13} />{p.homeSite}
      </div>
      <div className="hide-md" style={{ fontSize:12, color:"var(--ink-3)" }}>
        Joined {p.joined}
      </div>
      <div><Pill tone={s.tone} dot>{s.label}</Pill></div>
      <Icon name="chevronRight" size={16} />
    </button>
  );
}

/* ===========================================================
   Team list page
   =========================================================== */
function TeamList({ staff, onOpen, onJumpToPending }) {
  const pendingCount = staff.reduce(
    (n, p) => n + p.history.filter((r) => r.status === "pending").length, 0
  );

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-desc">In-house staff, weekly rota and time off. Click anyone to open their profile.</p>
        </div>
      </div>

      <TimeOffOverview staff={staff} pendingCount={pendingCount} onJumpToPending={onJumpToPending} />

      <div className="team-grid">
        {TEAM_GROUPS.map((g) => {
          const members = staff.filter((p) => p.group === g.id);
          if (members.length === 0) return null;
          return (
            <div key={g.id}>
              <div className="team-group-head">
                <div className="tg-ico" style={{ background:softBg(g.tone), color:solid(g.tone) }}>
                  <Icon name={g.icon} size={15} />
                </div>
                <h3>{g.label}</h3>
                <span className="tg-count">{members.length}</span>
              </div>
              <div className="card">
                {members.map((p) => <StaffRow key={p.id} p={p} onOpen={onOpen} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===========================================================
   Schedule tab — Mon-Sun grid
   =========================================================== */
function Shift({ s }) {
  if (s == null) return <div className="rota-off">Off</div>;
  if (s.leave) {
    return (
      <div className="shift leave">
        <div className="shift-time"><Icon name="sun" size={12} />All day</div>
        <div className="shift-site">{s.label}</div>
      </div>
    );
  }
  const dMeta = { clean:"Cleaning", maint:"Maintenance", secure:"Security", accent:"Management" };
  const dIco  = { clean:"droplet", maint:"wrench", secure:"shield", accent:"award" };
  const overnight = parseInt(s.start, 10) >= 18;
  return (
    <div className={"shift disc-" + s.disc}>
      <div className="shift-time">
        {overnight ? <Icon name="moon" size={12} /> : <Icon name="clock" size={12} />}
        {s.start}–{s.end}
      </div>
      <div className="shift-site">{s.site}</div>
      <div className="shift-disc"><Icon name={dIco[s.disc]} size={11} />{dMeta[s.disc]}</div>
    </div>
  );
}

function ScheduleTab({ person }) {
  const [week, setWeek] = React.useState("this");
  const rota  = week === "this" ? person.rota.thisWeek : person.rota.nextWeek;
  const dates = week === "this" ? WEEK_DATES_THIS : WEEK_DATES_NEXT;
  const todayIdx = week === "this" ? TODAY_INDEX : -1;
  const totalHours = rota.reduce((n, s) => {
    if (s == null || s.leave) return n;
    const h = parseInt(s.end, 10) - parseInt(s.start, 10);
    return n + (h < 0 ? h + 24 : h);
  }, 0);
  const shiftCount = rota.filter((s) => s && !s.leave).length;

  return (
    <div>
      <div className="rota-bar">
        <div className="seg">
          <button className={week === "this" ? "on" : ""} onClick={() => setWeek("this")}>This week</button>
          <button className={week === "next" ? "on" : ""} onClick={() => setWeek("next")}>Next week</button>
        </div>
        <div className="rota-bar-title">
          {week === "this" ? "Mon 15 Jun — Sun 21 Jun" : "Mon 22 Jun — Sun 28 Jun"} · {shiftCount} shift{shiftCount === 1 ? "" : "s"}, {totalHours}h
        </div>
      </div>

      <div className="rota-grid">
        {WEEK_DOW.map((dow, i) => (
          <div key={i} className={"rota-col" + (i === todayIdx ? " today" : "")}>
            <div className="rota-col-head">
              <span className="rota-dow">{dow}</span>
              <span className="rota-date">{dates[i]}</span>
            </div>
            <Shift s={rota[i]} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
   Time off tab
   =========================================================== */
function AllowanceRing({ used, total }) {
  const size = 132;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const remaining = total - used;
  const pct = used / total;
  return (
    <div className="allowance-ring" style={{ width:size, height:size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--ok)" strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={c * pct} strokeLinecap="round"
          style={{ transform:"rotate(-90deg)", transformOrigin:"50% 50%", transition:"stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="av-n">
        <div className="av-big">{remaining}</div>
        <div className="av-cap">of {total} days left</div>
      </div>
    </div>
  );
}

function TimeOffTab({ person, onRequest, onAct, pendingFocus }) {
  const ordered = [...person.history].sort((a, b) => {
    const order = { pending:0, approved:1, declined:2 };
    return order[a.status] - order[b.status];
  });
  const used = person.used + person.history
    .filter((r) => r.status === "approved" && new Date(r.from) >= new Date("2026-06-15"))
    .reduce((n, r) => n + r.days, 0);
  const approved = person.history.filter((r) => r.status === "approved").length;
  const pending  = person.history.filter((r) => r.status === "pending").length;
  const declined = person.history.filter((r) => r.status === "declined").length;

  const pendingRef = React.useRef(null);
  React.useEffect(() => {
    if (pendingFocus && pendingRef.current) {
      pendingRef.current.style.outline = "2px solid var(--accent)";
      pendingRef.current.style.outlineOffset = "4px";
      pendingRef.current.style.borderRadius = "12px";
      const t = setTimeout(() => {
        if (pendingRef.current) pendingRef.current.style.outline = "";
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [pendingFocus]);

  return (
    <div className="tof-tab-grid">
      <div className="card allowance-card">
        <div className="panel-label" style={{ marginBottom:0 }}>Annual leave allowance</div>
        <AllowanceRing used={person.used} total={person.allowance} />
        <div>
          <div className="allowance-row"><span className="k">Allowance, 2026</span><span className="v">{person.allowance} days</span></div>
          <div className="allowance-row"><span className="k">Taken</span><span className="v">{person.used} days</span></div>
          <div className="allowance-row"><span className="k">Approved upcoming</span><span className="v">{approved} request{approved === 1 ? "" : "s"}</span></div>
          {pending > 0 && <div className="allowance-row"><span className="k">Pending</span><span className="v" style={{ color:"var(--warn)" }}>{pending} request{pending === 1 ? "" : "s"}</span></div>}
          {declined > 0 && <div className="allowance-row"><span className="k">Declined</span><span className="v" style={{ color:"var(--ink-3)" }}>{declined}</span></div>}
        </div>
        <button className="btn btn-primary" style={{ justifyContent:"center" }} onClick={onRequest}>
          <Icon name="plus" size={15} />Request time off
        </button>
      </div>

      <div>
        <div className="card req-card" ref={pendingRef}>
          <div className="card-head">
            <h3>Leave requests</h3>
            <span className="sub">{ordered.length} total · newest pending first</span>
          </div>
          {ordered.length === 0 && (
            <div style={{ padding:"30px", textAlign:"center", color:"var(--ink-3)", fontSize:13.5 }}>
              No requests yet.
            </div>
          )}
          {ordered.map((r) => {
            const meta = REQ_STATUS_META[r.status];
            const reqIco = { Annual:"sun", Sick:"alertCircle", Unpaid:"clock", Other:"calendar" };
            return (
              <div className={"req-row" + (r.status === "pending" ? " pending" : "")} key={r.id}>
                <div className="req-ico"><Icon name={reqIco[r.type] || "calendar"} size={15} /></div>
                <div>
                  <div className="req-type">{r.type} leave · {r.days} day{r.days === 1 ? "" : "s"}</div>
                  <div className="req-dates"><Icon name="calendar" size={11} />{fmtRange(r.from, r.to)}</div>
                  {r.note && <div className="req-note">"{r.note}"</div>}
                </div>
                <div className="req-meta">
                  <Pill tone={meta.tone} dot>{meta.label}</Pill>
                  <span>· submitted {r.submitted}</span>
                </div>
                <div className="req-actions">
                  {r.status === "pending" ? (
                    <React.Fragment>
                      <button className="btn btn-decline" onClick={() => onAct(r.id, "declined")}>
                        <Icon name="x" size={13} />Decline
                      </button>
                      <button className="btn btn-approve" onClick={() => onAct(r.id, "approved")}>
                        <Icon name="check" size={13} />Approve
                      </button>
                    </React.Fragment>
                  ) : (
                    <span style={{ fontSize:11.5, color:"var(--ink-3)", fontFamily:"var(--mono)" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Details tab
   =========================================================== */
function DetailsTab({ person }) {
  const groupLabel = TEAM_GROUPS.find((g) => g.id === person.group).label;
  return (
    <div className="det-grid">
      <div className="card card-pad">
        <div className="panel-label">Employment</div>
        <div className="info-row"><span className="k">Full name</span><span className="v">{person.name}</span></div>
        <div className="info-row"><span className="k">Role</span><span className="v">{person.role}</span></div>
        <div className="info-row"><span className="k">Team</span><span className="v">{groupLabel}</span></div>
        <div className="info-row"><span className="k">Home site</span><span className="v">{person.homeSite}</span></div>
        <div className="info-row"><span className="k">Reports to</span><span className="v">{person.manager}</span></div>
        <div className="info-row" style={{ borderBottom:"none" }}><span className="k">Joined</span><span className="v">{person.joined}</span></div>
      </div>
      <div className="card card-pad">
        <div className="panel-label">Contact</div>
        <div className="info-row"><span className="k">Email</span><span className="v" style={{ fontFamily:"var(--mono)", fontSize:12.5 }}>{person.email}</span></div>
        <div className="info-row"><span className="k">Phone</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{person.phone}</span></div>
        <div className="info-row" style={{ borderBottom:"none" }}><span className="k">Emergency</span><span className="v" style={{ fontSize:12.5 }}>{person.emergency}</span></div>
      </div>
    </div>
  );
}

/* ===========================================================
   Staff profile page
   =========================================================== */
function StaffProfile({ person, onBack, onAct, onRequest, focusPending }) {
  const [tab, setTab] = React.useState("schedule");
  const status = STATUS_META_TEAM[person.status];
  const groupLabel = TEAM_GROUPS.find((g) => g.id === person.group).label;

  React.useEffect(() => {
    if (focusPending) setTab("time-off");
  }, [focusPending]);

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to team
      </button>

      <div className="staff-prof-head">
        <div className="staff-av-xl">{person.initials}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 className="staff-prof-name">{person.name}</h1>
          <div className="staff-prof-sub">
            <span>{person.role}</span>
            <span className="sp-sep" />
            <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
              <Icon name="mapPin" size={13} />{person.homeSite}
            </span>
            <span className="sp-sep" />
            <span>{groupLabel}</span>
          </div>
        </div>
        <Pill tone={status.tone} dot>{status.label}</Pill>
        <button className="btn" onClick={onRequest}>
          <Icon name="plus" size={14} />Request time off
        </button>
      </div>

      <div className="tabs">
        <button className={"tab-btn" + (tab === "schedule" ? " on" : "")} onClick={() => setTab("schedule")}>Schedule</button>
        <button className={"tab-btn" + (tab === "time-off" ? " on" : "")} onClick={() => setTab("time-off")}>Time off</button>
        <button className={"tab-btn" + (tab === "details"  ? " on" : "")} onClick={() => setTab("details")}>Details</button>
      </div>

      {tab === "schedule" && <ScheduleTab person={person} />}
      {tab === "time-off" && <TimeOffTab person={person} onRequest={onRequest} onAct={onAct} pendingFocus={focusPending} />}
      {tab === "details"  && <DetailsTab  person={person} />}
    </div>
  );
}

/* ===========================================================
   Top-level view
   =========================================================== */
function TeamView({ go }) {
  const [staff, setStaff]       = React.useState(TEAM_DATA);
  const [openId, setOpenId]     = React.useState(null);
  const [modal, setModal]       = React.useState(null);     // { personId } or null
  const [focusPending, setFocusPending] = React.useState(false);
  const { showToast, toastNode } = useViewToast();

  const open = openId ? staff.find((p) => p.id === openId) : null;

  const handleAct = (reqId, newStatus) => {
    setStaff((all) => all.map((p) => {
      const hit = p.history.find((r) => r.id === reqId);
      if (!hit) return p;
      const history = p.history.map((r) => r.id === reqId ? { ...r, status: newStatus } : r);
      return { ...p, history };
    }));
    showToast(newStatus === "approved" ? "Leave request approved" : "Leave request declined");
  };

  const handleSubmitRequest = (vals) => {
    const personId = modal.personId;
    const from = vals.from, to = vals.to || vals.from;
    const id = "r-new-" + Date.now();
    const days = (() => { try { return Math.max(1, daysBetween(from, to)); } catch (e) { return 1; } })();
    setStaff((all) => all.map((p) => p.id === personId
      ? { ...p, history: [{ id, type: vals.type, from, to, days, status:"pending", note: vals.note || "", submitted:"just now" }, ...p.history] }
      : p));
    showToast("Leave request submitted for approval");
  };

  const handleJumpToPending = () => {
    // find first staff member with a pending request, open them, focus pending
    const first = staff.find((p) => p.history.some((r) => r.status === "pending"));
    if (first) {
      setOpenId(first.id);
      setFocusPending(true);
    }
  };

  // Reset focusPending after opening
  React.useEffect(() => {
    if (focusPending && openId) {
      const t = setTimeout(() => setFocusPending(false), 100);
      return () => clearTimeout(t);
    }
  }, [focusPending, openId]);

  return (
    <React.Fragment>
      {open ? (
        <StaffProfile
          person={open}
          onBack={() => setOpenId(null)}
          onAct={handleAct}
          onRequest={() => setModal({ personId: open.id })}
          focusPending={focusPending}
        />
      ) : (
        <TeamList staff={staff} onOpen={(p) => setOpenId(p.id)} onJumpToPending={handleJumpToPending} />
      )}

      {modal && (
        <SimpleAddModal
          title={"Request time off — " + (staff.find((p) => p.id === modal.personId) || {}).name}
          subtitle="Submit a leave request. It will sit in pending until a supervisor approves it."
          icon="calendar"
          submitLabel="Submit request" submitIcon="send"
          successTitle="Request submitted"
          successCopy="Your request is pending. You'll be notified when it's approved or declined."
          fields={[
            { id:"type", label:"Leave type", type:"select",
              options:["Annual","Sick","Unpaid","Other"], default:"Annual" },
            { id:"from", label:"Start date",  type:"date" },
            { id:"to",   label:"End date",    type:"date" },
            { id:"note", label:"Note (optional)", type:"textarea", rows:3,
              placeholder:"e.g. Family wedding in Donegal", required:false },
          ]}
          onSubmit={handleSubmitRequest}
          onClose={() => setModal(null)} />
      )}

      {toastNode}
    </React.Fragment>
  );
}

Object.assign(window, { TeamView });

/* ════════════════════ asset_40_a28498e1.js ════════════════════ */
;
/* HazardLink — Reports view */

/* ── Authed export helpers ─────────────────────────────────────────────
   Hit the live backend with the signed-in user's bearer token. live.tsx
   sets window.HL_API_BASE once ("/api" behind the Vite proxy in dev, the
   Render origin in prod) so this plain-JS prototype code can build URLs. */
function hlAuthedFetch(path) {
  const token = localStorage.getItem("bor.token") || "";
  return fetch((window.HL_API_BASE || "/api") + path, {
    headers: { authorization: "Bearer " + token },
  });
}

/* Open the printable HTML audit pack in a new tab. */
function hlOpenAuditPack() {
  hlAuthedFetch("/reports/audit-pack")
    .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
    .then((html) => {
      const w = window.open("", "_blank");
      if (!w) { window.alert("Pop-up blocked. Allow pop-ups for this site to open the audit pack."); return; }
      w.document.write(html);
      w.document.close();
    })
    .catch(() => window.alert("Could not build the audit pack. Check you have report-export access and try again."));
}

/* Fetch an authed CSV endpoint and trigger a browser download. */
function hlDownloadCsv(path, filename) {
  hlAuthedFetch(path)
    .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.blob(); })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    })
    .catch(() => window.alert("Could not download the CSV. Check your access and try again."));
}

function HorizBars({ data, color, max }) {
  if (!data || data.length === 0) return null;
  const m = max || Math.max(...data.map((d) => d.v)) || 1;
  return (
    <div className="bar-group">
      {data.map((d, i) => (
        <div className="bar-row" key={i}>
          <div style={{ fontSize:12.5, color:"var(--ink-2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.l}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width:(d.v / m * 100) + "%", background: color || "var(--accent)" }} />
          </div>
          <div className="bar-num">{d.v}{d.unit || (max === 100 ? "%" : "")}</div>
        </div>
      ))}
    </div>
  );
}

function LineSparkline({ data, color }) {
  color = color || "var(--accent)";
  if (!data || data.length < 2) return null;
  const vals = data.map((d) => d.v);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = (max - min) || 1;
  const H = 100, W = 100, padT = 8, padB = 22, padL = 0, padR = 0;
  const h = H - padT - padB;
  const w = (W - padL - padR) / (data.length - 1);
  const pts = data.map((d, i) => ({
    x: padL + i * w,
    y: padT + (1 - (d.v - min) / range) * h,
  }));
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x + "," + p.y).join(" ");
  const areaPath = "M" + padL + "," + (H - padB) + " " + pts.map((p) => "L" + p.x + "," + p.y).join(" ") + " L" + (W - padR) + "," + (H - padB) + " Z";

  return (
    <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={{ width:"100%", height:120 }}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t, i) => (
        <line key={i} x1={padL} y1={padT + t * h} x2={W - padR} y2={padT + t * h} stroke="var(--line)" strokeWidth=".5" />
      ))}
      <path d={areaPath} fill="url(#lg)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
      {data.map((d, i) => (
        <text key={i} x={pts[i].x} y={H - 4} fontSize="6" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="var(--ink-3)">{d.l}</text>
      ))}
      {data.map((d, i) => (
        <text key={i} x={pts[i].x} y={pts[i].y - 5} fontSize="6.5" textAnchor="middle" fill={color} fontWeight="700">{d.v}</text>
      ))}
    </svg>
  );
}

function ReportsView({ go }) {
  const { site } = React.useContext(SiteContext);
  const [period, setPeriod] = React.useState("month");
  const r = HL.reportData;

  /* When scoped to a single site, keep only that site's row in the per-site charts. */
  const shortName = site ? site.name.split(/[\s,]/)[0] : null;
  const filterRows = (rows) => site
    ? rows.filter((row) => row.l.toLowerCase().includes(shortName.toLowerCase()))
    : rows;
  const pmCompliance = filterRows(r.pmCompliance);
  const cleanScores  = filterRows(r.cleanScores);

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-desc">
            {site
              ? <React.Fragment>Cleaning, maintenance and security at <b>{site.name}</b> — ready to share with the client.</React.Fragment>
              : "Cleaning, maintenance and security across all sites — ready to share with clients and stakeholders."}
          </p>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <div className="seg">
            {[["month","This month"],["quarter","This quarter"],["year","This year"]].map(([v,l]) => (
              <button key={v} className={period === v ? "on" : ""} onClick={() => setPeriod(v)}>{l}</button>
            ))}
          </div>
          <button className="btn" onClick={hlOpenAuditPack}>
            <Icon name="shield" size={15} />Audit pack
          </button>
          <button className="btn" onClick={() => hlDownloadCsv("/reports/energy.csv", "energy-readings.csv")}>
            <Icon name="file" size={15} />Energy CSV
          </button>
          <button className="btn"><Icon name="file" size={15} />Export PDF</button>
        </div>
      </div>

      <div className="stat-strip">
        {r.summary.map((s, i) => (
          <div className="stat-box card" key={i}>
            <div className="n">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="report-grid">
        <div className="card chart-card">
          <div className="chart-title">PM compliance{site ? " — " + site.name : " by site"}</div>
          <div className="chart-sub">Planned maintenance completed on time this period (%)</div>
          <HorizBars data={pmCompliance} color="var(--ok)" max={100} />
        </div>

        <div className="card chart-card">
          <div className="chart-title">Mean time to repair (MTTR)</div>
          <div className="chart-sub">Average calendar days from fault logged to work order closed</div>
          <LineSparkline data={r.mttr} color="var(--accent)" />
        </div>

        <div className="card chart-card">
          <div className="chart-title">Cleaning scores{site ? " — " + site.name : " by site"}</div>
          <div className="chart-sub">Average inspection score across all rounds this period (%)</div>
          <HorizBars data={cleanScores} color="var(--clean)" max={100} />
        </div>

        <div className="card chart-card">
          <div className="chart-title">Incidents by type</div>
          <div className="chart-sub">Total incidents logged{site ? " at " + site.name : " across all sites"} this period</div>
          <HorizBars data={r.incidentsByType} color="var(--secure)" />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ReportsView, HorizBars, LineSparkline, hlAuthedFetch, hlOpenAuditPack, hlDownloadCsv });

/* ════════════════════ asset_50_fbe6ef22.js ════════════════════ */
;
/* HazardLink — Audit log */

const AUDIT_ACTION_META = {
  created:      { tone:"accent", icon:"plus" },
  updated:      { tone:"warn",   icon:"edit" },
  deleted:      { tone:"crit",   icon:"trash" },
  approved:     { tone:"ok",     icon:"check" },
  declined:     { tone:"crit",   icon:"x" },
  resolved:     { tone:"ok",     icon:"checkCircle" },
  acknowledged: { tone:"warn",   icon:"check" },
  viewed:       { tone:"muted",  icon:"file" },
  exported:     { tone:"muted",  icon:"send" },
  signed_in:    { tone:"muted",  icon:"user" },
  signed_out:   { tone:"muted",  icon:"user" },
  invited:      { tone:"accent", icon:"send" },
  deactivated:  { tone:"crit",   icon:"x" },
  scanned:      { tone:"accent", icon:"scan" },
  printed:      { tone:"muted",  icon:"file" },
  uploaded:     { tone:"accent", icon:"plus" },
};

const AUDIT_ENTRIES = [];

const AUDIT_ACTION_TYPES   = ["All actions","created","updated","deleted","approved","declined","resolved","acknowledged","invited","deactivated","exported","scanned","signed_in"];
const AUDIT_DATE_RANGES    = ["Today","Last 7 days","Last 30 days","All time"];

function _matchesDateRange(entry, range) {
  if (range === "All time") return true;
  if (range === "Today")    return entry.date === "Today";
  if (range === "Last 7 days") return ["Today","Yesterday","2 days ago","3 days ago","4 days ago","5 days ago","6 days ago"].includes(entry.date);
  return true;
}

function AuditLogView({ go }) {
  const [range,  setRange]  = React.useState("Last 7 days");
  const [user,   setUser]   = React.useState("All users");
  const [act,    setAct]    = React.useState("All actions");
  const [query,  setQuery]  = React.useState("");

  const users = ["All users", ...Array.from(new Set(AUDIT_ENTRIES.map((e) => e.user))).sort()];

  const filtered = AUDIT_ENTRIES.filter((e) => {
    if (!_matchesDateRange(e, range)) return false;
    if (user !== "All users" && e.user !== user) return false;
    if (act  !== "All actions" && e.action !== act) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (![e.target, e.detail, e.user, e.targetType].some((s) => s && s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // Group by date
  const grouped = filtered.reduce((m, e) => {
    (m[e.dateLabel] = m[e.dateLabel] || []).push(e);
    return m;
  }, {});

  const grid = "70px 220px 130px 1fr 110px";

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="page-desc">Every change across HazardLink — who did what, when and on which record. Tamper-evident, exportable.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn"><Icon name="send" size={15} />Export CSV</button>
        </div>
      </div>

      <div className="card audit-filter-bar">
        <div className="audit-filter">
          <label>Date range</label>
          <select className="dv-input" value={range} onChange={(e) => setRange(e.target.value)}>
            {AUDIT_DATE_RANGES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="audit-filter">
          <label>User</label>
          <select className="dv-input" value={user} onChange={(e) => setUser(e.target.value)}>
            {users.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="audit-filter">
          <label>Action</label>
          <select className="dv-input" value={act} onChange={(e) => setAct(e.target.value)}>
            {AUDIT_ACTION_TYPES.map((a) => <option key={a} value={a}>{a === "signed_in" ? "signed in" : a}</option>)}
          </select>
        </div>
        <div className="audit-filter grow">
          <label>Search</label>
          <div className="audit-search">
            <Icon name="search" size={14} />
            <input className="dv-input" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="ID, target, detail, user…" />
          </div>
        </div>
        <div className="audit-filter">
          <label>&nbsp;</label>
          <button className="btn" onClick={() => { setRange("Last 7 days"); setUser("All users"); setAct("All actions"); setQuery(""); }}>
            Reset
          </button>
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", margin:"16px 4px 10px" }}>
        <div style={{ fontSize:13, color:"var(--ink-3)" }}>
          {filtered.length} of {AUDIT_ENTRIES.length} entries
        </div>
        <div style={{ fontSize:11.5, color:"var(--ink-3)", fontFamily:"var(--mono)" }}>
          newest first
        </div>
      </div>

      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:grid }}>
          <div>Time</div>
          <div>User</div>
          <div>Action</div>
          <div>Target & detail</div>
          <div>Type</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--ink-3)", fontSize:13.5 }}>
            No entries match these filters.
          </div>
        )}
        {Object.entries(grouped).map(([dayLabel, entries]) => (
          <React.Fragment key={dayLabel}>
            <div className="audit-day-sep">{dayLabel}</div>
            {entries.map((e) => {
              const meta = AUDIT_ACTION_META[e.action] || AUDIT_ACTION_META.viewed;
              const isSystem = e.role === "System" || e.role === "Sensor" || e.user === "AI agent";
              return (
                <div className="wo-row audit-row" style={{ gridTemplateColumns:grid }} key={e.id}>
                  <div className="audit-time">{e.t}</div>
                  <div className="audit-user">
                    <div className={"audit-av" + (isSystem ? " audit-av-sys" : "")}>{e.initials}</div>
                    <div>
                      <div className="audit-user-nm">{e.user}</div>
                      <div className="audit-user-rl">{e.role}</div>
                    </div>
                  </div>
                  <div>
                    <span className={"audit-act audit-act-" + meta.tone}>
                      <Icon name={meta.icon} size={11} />{e.action.replace("_", " ")}
                    </span>
                  </div>
                  <div className="audit-target">
                    <span className="audit-target-id">{e.target}</span>
                    <div className="audit-target-detail">{e.detail}</div>
                  </div>
                  <div className="audit-type">{e.targetType}</div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AuditLogView, AUDIT_ENTRIES });

/* ════════════════════ asset_27_143ec2a4.js ════════════════════ */
;
/* HazardLink — Users (admin) */

const ROLE_META = {
  "admin":       { label:"Admin",       tone:"secure" },
  "supervisor":  { label:"Supervisor",  tone:"accent" },
  "field staff": { label:"Field staff", tone:"muted"  },
};

const STATUS_META_USERS = {
  "active":       { label:"Active",       tone:"ok" },
  "invited":      { label:"Invite sent",  tone:"accent" },
  "on-leave":     { label:"On leave",     tone:"warn" },
  "deactivated":  { label:"Deactivated",  tone:"muted" },
};

const HL_USERS_INITIAL = [];

const SITE_OPTIONS = ["All sites"];

/* ===========================================================
   List view
   =========================================================== */
function UsersView({ go }) {
  const [users,  setUsers]  = React.useState(HL_USERS_INITIAL);
  const [filter, setFilter] = React.useState("All");
  const [query,  setQuery]  = React.useState("");
  const [openId, setOpenId] = React.useState(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const { showToast, toastNode } = useViewToast();

  if (openId) {
    const u = users.find((x) => x.id === openId);
    if (!u) { setOpenId(null); return null; }
    return (
      <React.Fragment>
        <UserDetail
          user={u}
          onBack={() => setOpenId(null)}
          onSave={(patch) => { setUsers((all) => all.map((x) => x.id === u.id ? { ...x, ...patch } : x)); showToast("User updated"); }}
          onResend={() => showToast("Invite resent to " + u.email)}
          onDeactivate={() => { setUsers((all) => all.map((x) => x.id === u.id ? { ...x, status:"deactivated", lastActive:"just now" } : x)); showToast(u.name + " deactivated"); }}
          onReactivate={() => { setUsers((all) => all.map((x) => x.id === u.id ? { ...x, status:"active", lastActive:"just now" } : x)); showToast(u.name + " reactivated"); }}
        />
        {toastNode}
      </React.Fragment>
    );
  }

  const tabs = ["All","Admins","Supervisors","Field staff","Inactive"];
  const matchTab = (u) => {
    if (filter === "All")          return u.status !== "deactivated";
    if (filter === "Admins")       return u.role === "admin";
    if (filter === "Supervisors")  return u.role === "supervisor";
    if (filter === "Field staff")  return u.role === "field staff";
    if (filter === "Inactive")     return u.status === "deactivated" || u.status === "invited";
    return true;
  };
  const matchQuery = (u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [u.name, u.email, u.sites].some((s) => s && s.toLowerCase().includes(q));
  };

  const rows = users.filter(matchTab).filter(matchQuery);

  const counts = {
    total: users.filter((u) => u.status !== "deactivated").length,
    admins: users.filter((u) => u.role === "admin" && u.status !== "deactivated").length,
    supervisors: users.filter((u) => u.role === "supervisor" && u.status !== "deactivated").length,
    field: users.filter((u) => u.role === "field staff" && u.status !== "deactivated").length,
  };

  const grid = "44px 1.2fr 1.2fr 160px 200px 130px 130px 24px";

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-desc">Everyone with a HazardLink login — admins, supervisors and field staff. Invite, edit and audit access.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={() => { window.__settingsInitialTab = "roles"; go("settings"); }}>
            <Icon name="lock" size={14} />Manage roles &amp; permissions
          </button>
          <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
            <Icon name="plus" size={15} />Invite user
          </button>
        </div>
      </div>

      {inviteOpen && (
        <SimpleAddModal
          title="Invite a new user"
          subtitle="They'll get an email with a link to set up their account."
          icon="send"
          submitLabel="Send invite" submitIcon="send"
          successTitle="Invite sent"
          successCopy="They'll appear in the users list as 'Invite sent' until they accept."
          fields={[
            { id:"email",  label:"Email address",  type:"email",  placeholder:"name@hazardlink.ie" },
            { id:"role",   label:"Role",           type:"select", default:"field staff", options:["admin","supervisor","field staff"] },
            { id:"sites",  label:"Sites",          type:"select", default:"All sites",   options:SITE_OPTIONS },
            { id:"note",   label:"Welcome note (optional)", type:"textarea", rows:3, placeholder:"Welcome to the team!", required:false },
          ]}
          onSubmit={(vals) => {
            const id = "u-new-" + Date.now();
            const initials = vals.email.split("@")[0].slice(0,2).toUpperCase();
            const name = vals.email.split("@")[0].split(/[._]/).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
            setUsers((all) => [{ id, name, email:vals.email, role:vals.role, sites:vals.sites, lastActive:"never", status:"invited", initials, joined:"just now", mfa:false, manager:"—", phone:"—" }, ...all]);
            showToast("Invite sent to " + vals.email);
          }}
          onClose={() => setInviteOpen(false)} />
      )}

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("muted"), color:solid("muted") }}><Icon name="users" size={16} /></div><span className="kpi-label">Active users</span></div>
          <div className="kpi-val">{counts.total}</div>
          <div className="kpi-foot">across the organisation</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("secure"), color:solid("secure") }}><Icon name="shield" size={16} /></div><span className="kpi-label">Admins</span></div>
          <div className="kpi-val">{counts.admins}</div>
          <div className="kpi-foot">full system access</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="award" size={16} /></div><span className="kpi-label">Supervisors</span></div>
          <div className="kpi-val">{counts.supervisors}</div>
          <div className="kpi-foot">site-level access</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ico" style={{ background:softBg("clean"), color:solid("clean") }}><Icon name="user" size={16} /></div><span className="kpi-label">Field staff</span></div>
          <div className="kpi-val">{counts.field}</div>
          <div className="kpi-foot">on the floor</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {tabs.map((t) => (
            <button key={t} className={filter === t ? "on" : ""} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div className="search users-search" style={{ marginLeft:"auto" }}>
          <Icon name="search" size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users…" />
        </div>
      </div>

      <div className="card">
        <div className="wo-head" style={{ gridTemplateColumns:grid }}>
          <div></div>
          <div>Name</div>
          <div>Email</div>
          <div>Role</div>
          <div>Sites</div>
          <div>Last active</div>
          <div>Status</div>
          <div></div>
        </div>
        {rows.length === 0 && (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"var(--ink-3)", fontSize:13.5 }}>
            No users match this view.
          </div>
        )}
        {rows.map((u) => {
          const role = ROLE_META[u.role];
          const status = STATUS_META_USERS[u.status];
          return (
            <div className="wo-row" key={u.id} style={{ gridTemplateColumns:grid }} onClick={() => setOpenId(u.id)}>
              <div className="staff-av-row">{u.initials}</div>
              <div>
                <div className="wo-title" style={{ fontSize:13.5 }}>{u.name}</div>
                <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2 }}>{u.mfa ? "MFA on" : "MFA off"} · joined {u.joined}</div>
              </div>
              <div style={{ fontSize:13, color:"var(--ink-2)", fontFamily:"var(--mono)", fontVariantNumeric:"tabular-nums", overflow:"hidden", textOverflow:"ellipsis" }}>{u.email}</div>
              <div><Pill tone={role.tone} dot>{role.label}</Pill></div>
              <div style={{ fontSize:12.5, color:"var(--ink-2)" }}>
                <Icon name="mapPin" size={11} style={{ verticalAlign:"middle", marginRight:4, color:"var(--ink-3)" }} />
                {u.sites}
              </div>
              <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>{u.lastActive}</div>
              <div><Pill tone={status.tone} dot>{status.label}</Pill></div>
              <Icon name="chevronRight" size={16} />
            </div>
          );
        })}
      </div>

      {toastNode}
    </div>
  );
}

/* ===========================================================
   User detail (full page)
   =========================================================== */
function UserDetail({ user, onBack, onSave, onResend, onDeactivate, onReactivate }) {
  const [role, setRole]   = React.useState(user.role);
  const [sites, setSites] = React.useState(user.sites);
  const dirty = role !== user.role || sites !== user.sites;

  const roleMeta   = ROLE_META[user.role];
  const statusMeta = STATUS_META_USERS[user.status];

  const activity = [];

  return (
    <div className="content-inner">
      <button className="back-link" onClick={onBack}>
        <Icon name="arrowLeft" size={16} />Back to users
      </button>

      <div className="staff-prof-head">
        <div className="staff-av-xl">{user.initials}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 className="staff-prof-name">{user.name}</h1>
          <div className="staff-prof-sub">
            <span style={{ fontFamily:"var(--mono)", fontSize:13 }}>{user.email}</span>
            <span className="sp-sep" />
            <span>Manager: {user.manager}</span>
            <span className="sp-sep" />
            <span>Joined {user.joined}</span>
          </div>
        </div>
        <Pill tone={statusMeta.tone} dot>{statusMeta.label}</Pill>
        {user.status === "invited" && (
          <button className="btn" onClick={onResend}><Icon name="send" size={14} />Resend invite</button>
        )}
        {user.status === "deactivated"
          ? <button className="btn btn-primary" onClick={onReactivate}><Icon name="check" size={14} />Reactivate</button>
          : <button className="btn btn-decline" onClick={onDeactivate}><Icon name="x" size={14} />Deactivate</button>}
      </div>

      <div className="det-grid">
        <div className="card card-pad">
          <div className="panel-label">Access</div>
          <div className="ai-field">
            <label>Role</label>
            <select className="dv-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin — full system access</option>
              <option value="supervisor">Supervisor — site-level access</option>
              <option value="field staff">Field staff — mobile-only</option>
            </select>
          </div>
          <div className="ai-field" style={{ marginTop:12 }}>
            <label>Sites</label>
            <select className="dv-input" value={sites} onChange={(e) => setSites(e.target.value)}>
              {SITE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="info-row" style={{ marginTop:16 }}><span className="k">Current role</span><span className="v"><Pill tone={roleMeta.tone} dot>{roleMeta.label}</Pill></span></div>
          <div className="info-row"><span className="k">Phone</span><span className="v" style={{ fontFamily:"var(--mono)" }}>{user.phone}</span></div>
          <div className="info-row" style={{ borderBottom:"none" }}>
            <span className="k">Two-factor</span>
            <span className="v"><Pill tone={user.mfa ? "ok" : "warn"} dot>{user.mfa ? "MFA enabled" : "MFA off"}</Pill></span>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            <button className="btn" style={{ flex:1 }} onClick={onBack}>Cancel</button>
            <button className="btn btn-primary"
              disabled={!dirty}
              style={{ flex:1, opacity: dirty ? 1 : .55 }}
              onClick={() => onSave({ role, sites })}>
              <Icon name="check" size={14} />Save changes
            </button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="panel-label">Recent activity</div>
          <div className="stepper" style={{ marginTop:6 }}>
            {activity.map((a, i) => <Step s={a} key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { UsersView, UserDetail, HL_USERS_INITIAL, ROLE_META, STATUS_META_USERS });

/* ════════════════════ asset_38_908f0664.js ════════════════════ */
;
/* HazardLink — My profile (signed-in user). Reads from the Users record so
   the page stays consistent with the canonical Users data. */

function MyProfileView({ go }) {
  /* Source of truth: the first user in the Users seed (Aoife Kelly).
     We fall back to literal values if that file hasn't loaded yet. */
  const ME = (typeof HL_USERS_INITIAL !== "undefined" && HL_USERS_INITIAL[0]) || {
    id: "u1",
    name: "Aoife Kelly",
    email: "aoife.kelly@hazardlink.ie",
    role: "admin",
    sites: "All sites",
    lastActive: "now",
    status: "active",
    initials: "AK",
    joined: "Jan 2021",
    mfa: true,
    phone: "+353 87 555 0101",
  };

  const [name,  setName]  = React.useState(ME.name);
  const [email, setEmail] = React.useState(ME.email);
  const [phone, setPhone] = React.useState(ME.phone);
  const [mfa,   setMfa]   = React.useState(!!ME.mfa);
  const { showToast, toastNode } = useViewToast();

  const dirty =
    name  !== ME.name  ||
    email !== ME.email ||
    phone !== ME.phone ||
    mfa   !== !!ME.mfa;

  const reset = () => {
    setName(ME.name); setEmail(ME.email); setPhone(ME.phone); setMfa(!!ME.mfa);
  };

  const goPrefs = () => {
    if (go) go("notifications");
    /* Two rAFs so the new view has actually rendered before we scroll. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el       = document.querySelector(".pref-card");
      const scroller = document.querySelector(".content");
      if (el && scroller) scroller.scrollTop = Math.max(0, el.offsetTop - 20);
    }));
  };

  return (
    <div className="content-inner">
      <div className="staff-prof-head">
        <div className="prof-av-wrap">
          <div className="staff-av-xl">{ME.initials}</div>
          <button className="prof-av-edit" type="button"
            aria-label="Change profile photo"
            title="Change photo"
            onClick={() => showToast("Photo upload coming soon")}>
            <Icon name="camera" size={13} />
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="staff-prof-name">{ME.name}</h1>
          <div className="staff-prof-sub" style={{ flexWrap: "wrap", rowGap: 4 }}>
            <Pill tone="secure" dot>Admin · Full system access</Pill>
            <span className="sp-sep" />
            <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{ME.email}</span>
            <span className="sp-sep" />
            <span>Member since {ME.joined}</span>
          </div>
        </div>
        <Pill tone="ok" dot>Active</Pill>
      </div>

      <div className="det-grid">
        {/* Personal details — editable */}
        <div className="card card-pad">
          <div className="panel-label">Personal details</div>

          <div className="prof-field">
            <label>Full name</label>
            <input className="dv-input" value={name}
              onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="prof-field">
            <label>Email address</label>
            <input className="dv-input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="prof-field">
            <label>Phone</label>
            <input className="dv-input" value={phone}
              onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="btn"
              style={{ flex: 1, opacity: dirty ? 1 : .55 }}
              disabled={!dirty}
              onClick={reset}>
              Cancel
            </button>
            <button className="btn btn-primary"
              disabled={!dirty}
              style={{ flex: 1, opacity: dirty ? 1 : .55 }}
              onClick={() => showToast("Profile updated")}>
              <Icon name="check" size={14} />Save changes
            </button>
          </div>
        </div>

        {/* Access & security */}
        <div className="card card-pad">
          <div className="panel-label">Access & security</div>

          <div className="info-row">
            <span className="k">Role</span>
            <span className="v"><Pill tone="secure" dot>Admin</Pill></span>
          </div>
          <div className="info-row">
            <span className="k">Sites covered</span>
            <span className="v">
              <Icon name="mapPin" size={11}
                style={{ verticalAlign: "middle", marginRight: 4, color: "var(--ink-3)" }} />
              {ME.sites}
            </span>
          </div>
          <div className="info-row">
            <span className="k">Member since</span>
            <span className="v">{ME.joined}</span>
          </div>
          <div className="info-row">
            <span className="k">Last active</span>
            <span className="v">{ME.lastActive}</span>
          </div>

          <div className="prof-toggle-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="prof-toggle-lbl">Two-factor authentication</div>
              <div className="prof-toggle-sub">
                {mfa
                  ? "Authenticator app enrolled — required at every sign-in"
                  : "Off — strongly recommended for admin accounts"}
              </div>
            </div>
            <button className={"prof-switch" + (mfa ? " on" : "")}
              type="button" role="switch" aria-checked={mfa}
              aria-label="Two-factor authentication"
              onClick={() => setMfa((v) => !v)}>
              <span className="prof-switch-knob" />
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <button className="btn"
              onClick={() => showToast("Password reset email sent to " + ME.email)}>
              <Icon name="lock" size={14} />Change password
            </button>
            <button className="btn" onClick={goPrefs}>
              <Icon name="bell" size={14} />Notification preferences
            </button>
          </div>
        </div>
      </div>

      {toastNode}
    </div>
  );
}

Object.assign(window, { MyProfileView });

/* ════════════════════ asset_42_4de19d59.js ════════════════════ */
;
/* HazardLink — Settings (Organisation, Sites, Disciplines, Billing, Integrations) */

const SETTINGS_TABS = [
  { id:"org",          label:"Organisation",       icon:"shield" },
  { id:"sites",        label:"Sites",               icon:"mapPin" },
  { id:"disciplines",  label:"Disciplines",         icon:"layers" },
  { id:"roles",        label:"Roles & permissions", icon:"lock" },
  { id:"security",     label:"Account & security",  icon:"lock" },
  { id:"billing",      label:"Billing",             icon:"creditCard" },
  { id:"integrations", label:"Integrations",        icon:"link" },
];

/* ===========================================================
   Organisation tab
   =========================================================== */
function OrgSettings({ showToast }) {
  const [vals, setVals] = React.useState({
    orgName:     "",
    contact:     "",
    tz:          "Europe/Dublin",
    currency:    "EUR (€)",
    locale:      "English (Ireland)",
    address:     "",
    brand:       "#2563EB",
  });
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));

  return (
    <div className="settings-card">
      <div className="card card-pad">
        <div className="settings-row-grid">
          <div className="settings-field">
            <label>Organisation name</label>
            <input className="dv-input" value={vals.orgName} onChange={(e) => set("orgName", e.target.value)} />
          </div>
          <div className="settings-field">
            <label>Contact email</label>
            <input className="dv-input" value={vals.contact} onChange={(e) => set("contact", e.target.value)} />
          </div>
          <div className="settings-field">
            <label>Time zone</label>
            <select className="dv-input" value={vals.tz} onChange={(e) => set("tz", e.target.value)}>
              <option>Europe/Dublin</option>
              <option>Europe/London</option>
              <option>Europe/Paris</option>
              <option>UTC</option>
            </select>
          </div>
          <div className="settings-field">
            <label>Currency</label>
            <select className="dv-input" value={vals.currency} onChange={(e) => set("currency", e.target.value)}>
              <option>EUR (€)</option>
              <option>GBP (£)</option>
              <option>USD ($)</option>
            </select>
          </div>
          <div className="settings-field">
            <label>Locale</label>
            <select className="dv-input" value={vals.locale} onChange={(e) => set("locale", e.target.value)}>
              <option>English (Ireland)</option>
              <option>English (UK)</option>
              <option>English (US)</option>
              <option>Français</option>
            </select>
          </div>
          <div className="settings-field">
            <label>Brand colour</label>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <span className="color-swatch" style={{ background: vals.brand }} />
              <input className="dv-input" value={vals.brand} onChange={(e) => set("brand", e.target.value)} style={{ flex:1, fontFamily:"var(--mono)" }} />
            </div>
          </div>
          <div className="settings-field" style={{ gridColumn:"1 / -1" }}>
            <label>Registered address</label>
            <textarea className="dv-input" rows={2} value={vals.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="settings-field" style={{ gridColumn:"1 / -1" }}>
            <label>Organisation logo</label>
            <div className="logo-drop">
              <div className="logo-tile" style={{ background: vals.brand }}>
                <Icon name="shield" size={20} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:650 }}>No logo uploaded</div>
                <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2 }}>Upload a square SVG</div>
              </div>
              <button className="btn">Replace</button>
            </div>
          </div>
        </div>
      </div>
      <div className="settings-actions">
        <button className="btn">Cancel</button>
        <button className="btn btn-primary" onClick={() => showToast("Organisation settings saved")}>
          <Icon name="check" size={14} />Save changes
        </button>
      </div>
    </div>
  );
}

/* ===========================================================
   Sites tab
   =========================================================== */
function SitesSettings({ showToast }) {
  const [sites, setSites] = React.useState(() => HL.sites.map((s) => ({
    ...s,
    type:   s.id === "s2" ? "Logistics hub" : s.id === "s4" ? "Healthcare" : s.id === "s5" ? "Leisure" : s.id === "s6" ? "Public sector" : s.id === "s3" ? "Commercial office" : "Retail",
    manager: s.id === "s2" ? "Owen Farrell" : s.id === "s3" ? "Maeve O'Connor" : "Aoife Kelly",
    sla:     s.id === "s2" ? "Same-day" : s.id === "s4" ? "Critical: 4h" : "Standard: 8h",
  })));
  const [editing, setEditing] = React.useState(null);

  const save = (id, patch) => {
    setSites((all) => all.map((s) => s.id === id ? { ...s, ...patch } : s));
    setEditing(null);
    showToast("Site updated");
  };

  return (
    <div className="settings-card">
      <div className="card">
        <div className="card-head">
          <h3>{sites.length} sites</h3>
          <div className="head-act">
            <button className="btn"><Icon name="plus" size={14} />Add site</button>
          </div>
        </div>
        {sites.map((s) => {
          const isEdit = editing === s.id;
          return (
            <div className="site-edit-row" key={s.id}>
              {!isEdit ? (
                <React.Fragment>
                  <div style={{ display:"flex", alignItems:"center", gap:11 }}>
                    <span className="sdot" style={{ background: s.status === "ok" ? "var(--ok)" : "var(--warn)" }} />
                    <div>
                      <div className="sname" style={{ fontSize:14 }}>{s.name}</div>
                      <div className="sloc">{s.loc} · {s.type}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:12.5, color:"var(--ink-2)" }}>{s.manager}</div>
                  <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>{s.sla}</div>
                  <button className="btn btn-sm" onClick={() => setEditing(s.id)}>
                    <Icon name="edit" size={13} />Edit
                  </button>
                </React.Fragment>
              ) : (
                <SiteRowEditor s={s} onCancel={() => setEditing(null)} onSave={(patch) => save(s.id, patch)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function SiteRowEditor({ s, onCancel, onSave }) {
  const [name, setName] = React.useState(s.name);
  const [loc,  setLoc]  = React.useState(s.loc);
  const [type, setType] = React.useState(s.type);
  const [mgr,  setMgr]  = React.useState(s.manager);
  const [sla,  setSla]  = React.useState(s.sla);
  return (
    <div style={{ gridColumn:"1 / -1", padding:14, background:"var(--surface-2)", borderRadius:10, display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12 }}>
      <div className="settings-field"><label>Site name</label><input className="dv-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="settings-field"><label>Location</label><input className="dv-input" value={loc} onChange={(e) => setLoc(e.target.value)} /></div>
      <div className="settings-field"><label>Type</label>
        <select className="dv-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option>Retail</option><option>Logistics hub</option><option>Commercial office</option><option>Healthcare</option><option>Leisure</option><option>Public sector</option>
        </select>
      </div>
      <div className="settings-field"><label>Site manager</label><input className="dv-input" value={mgr} onChange={(e) => setMgr(e.target.value)} /></div>
      <div className="settings-field"><label>SLA</label>
        <select className="dv-input" value={sla} onChange={(e) => setSla(e.target.value)}>
          <option>Same-day</option><option>Critical: 4h</option><option>Standard: 8h</option><option>Best effort: 48h</option>
        </select>
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave({ name, loc, type, manager: mgr, sla })}>Save</button>
      </div>
    </div>
  );
}

/* ===========================================================
   Disciplines tab
   =========================================================== */
function DisciplinesSettings({ showToast }) {
  const [discs, setDiscs] = React.useState([
    { id:"clean",  label:"Cleaning",    colour:"#0d9488", enabled:true,  sla:"30 min",  assign:"Nearest cleaner on shift",      desc:"Rounds, spills, inspections, signs" },
    { id:"maint",  label:"Maintenance", colour:"#b45309", enabled:true,  sla:"Same-day", assign:"AI tender to approved contractors", desc:"Work orders, PPM, parts, meters" },
    { id:"secure", label:"Security",    colour:"#4f46e5", enabled:true,  sla:"15 min",   assign:"Guard on duty",                  desc:"Patrols, incidents, lone-workers" },
  ]);
  const set = (id, k, v) => setDiscs((ds) => ds.map((d) => d.id === id ? { ...d, [k]: v } : d));

  return (
    <div className="settings-card">
      {discs.map((d) => (
        <div className="card disc-settings" key={d.id}>
          <div className="disc-settings-head">
            <div className="disc-ico" style={{ background:softBg(d.id), color: d.colour }}>
              <Icon name={d.id === "clean" ? "droplet" : d.id === "maint" ? "wrench" : "shield"} size={17} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"var(--font-head)", fontSize:15, fontWeight:750, letterSpacing:"-.01em" }}>{d.label}</div>
              <div style={{ fontSize:12, color:"var(--ink-3)", marginTop:2 }}>{d.desc}</div>
            </div>
            <Toggle on={d.enabled} onChange={(v) => { set(d.id, "enabled", v); showToast(d.label + (v ? " enabled" : " disabled")); }} />
          </div>
          <div className="settings-row-grid">
            <div className="settings-field">
              <label>Display name</label>
              <input className="dv-input" value={d.label} onChange={(e) => set(d.id, "label", e.target.value)} />
            </div>
            <div className="settings-field">
              <label>Discipline colour</label>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <span className="color-swatch" style={{ background: d.colour }} />
                <input className="dv-input" value={d.colour} onChange={(e) => set(d.id, "colour", e.target.value)} style={{ flex:1, fontFamily:"var(--mono)" }} />
              </div>
            </div>
            <div className="settings-field">
              <label>Default SLA threshold</label>
              <select className="dv-input" value={d.sla} onChange={(e) => set(d.id, "sla", e.target.value)}>
                <option>5 min</option><option>10 min</option><option>15 min</option><option>30 min</option><option>1 hour</option><option>Same-day</option><option>48 hours</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Auto-assign rule</label>
              <select className="dv-input" value={d.assign} onChange={(e) => set(d.id, "assign", e.target.value)}>
                <option>Nearest cleaner on shift</option>
                <option>AI tender to approved contractors</option>
                <option>Guard on duty</option>
                <option>Round-robin within team</option>
                <option>Manual assign</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      <div className="settings-actions">
        <button className="btn">Cancel</button>
        <button className="btn btn-primary" onClick={() => showToast("Discipline settings saved")}>
          <Icon name="check" size={14} />Save changes
        </button>
      </div>
    </div>
  );
}

/* ===========================================================
   Billing tab
   =========================================================== */
function BillingSettings({ showToast }) {
  const invoices = [];
  return (
    <div className="settings-card">
      <div className="card plan-card">
        <div className="plan-head">
          <div>
            <div className="plan-tag">Current plan</div>
            <div className="plan-name">Pro — Operations</div>
            <div className="plan-sub">€2,450 / month · billed monthly · renews 1 Jul 2026</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn">Switch to annual · save 15%</button>
            <button className="btn btn-primary">Manage plan</button>
          </div>
        </div>
        <div className="plan-stats">
          <div className="plan-stat">
            <div className="plan-stat-n">0<small>/25</small></div>
            <div className="plan-stat-l">User seats</div>
            <div className="plan-bar"><i style={{ width:"0%", background:"var(--warn)" }} /></div>
          </div>
          <div className="plan-stat">
            <div className="plan-stat-n">0</div>
            <div className="plan-stat-l">Sites included</div>
            <div className="plan-stat-foot">up to 10 on Pro</div>
          </div>
          <div className="plan-stat">
            <div className="plan-stat-n">∞</div>
            <div className="plan-stat-l">Work orders</div>
            <div className="plan-stat-foot">unlimited</div>
          </div>
          <div className="plan-stat">
            <div className="plan-stat-n">0 GB</div>
            <div className="plan-stat-l">Document storage</div>
            <div className="plan-bar"><i style={{ width:"0%", background:"var(--ok)" }} /></div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="panel-label">Billing details</div>
        <div className="settings-row-grid">
          <div className="settings-field">
            <label>Billing email</label>
            <input className="dv-input" defaultValue="" />
          </div>
          <div className="settings-field">
            <label>VAT number</label>
            <input className="dv-input" defaultValue="" />
          </div>
          <div className="settings-field">
            <label>Payment method</label>
            <div className="card-method">
              <div className="card-method-ico"><Icon name="creditCard" size={16} /></div>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>No card on file</div>
                <div style={{ fontSize:11.5, color:"var(--ink-3)" }}>—</div>
              </div>
              <button className="btn btn-sm" style={{ marginLeft:"auto" }}>Update card</button>
            </div>
          </div>
          <div className="settings-field">
            <label>Next invoice</label>
            <div className="next-invoice">
              <span style={{ fontFamily:"var(--mono)", fontSize:14, fontWeight:800 }}>€0.00</span>
              <span style={{ fontSize:12, color:"var(--ink-3)", marginLeft:6 }}>—</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Invoice history</h3>
          <div className="head-act">
            <button className="btn"><Icon name="send" size={14} />Export all</button>
          </div>
        </div>
        {invoices.map((inv) => (
          <div className="invoice-row" key={inv.id}>
            <div className="invoice-ico"><Icon name="file" size={14} /></div>
            <div>
              <div style={{ fontWeight:700, fontSize:13.5 }}>{inv.id}</div>
              <div style={{ fontSize:11.5, color:"var(--ink-3)", marginTop:2 }}>{inv.date}</div>
            </div>
            <div className="invoice-amt">{inv.amt}</div>
            <Pill tone="ok" dot>{inv.status}</Pill>
            <button className="btn btn-sm"><Icon name="file" size={13} />PDF</button>
          </div>
        ))}
      </div>

      <div className="settings-actions">
        <button className="btn">Cancel</button>
        <button className="btn btn-primary" onClick={() => showToast("Billing details saved")}>
          <Icon name="check" size={14} />Save changes
        </button>
      </div>
    </div>
  );
}

/* ===========================================================
   Integrations tab
   =========================================================== */
/* Each entry carries an honest status:
     "builtin" — the code is live in the product, switching on platform-side
     "csv"     — works today via file export, direct API sync planned
     "planned" — genuinely on the roadmap, nothing behind it yet
   Microsoft Teams is NOT in this list — it has a real connect card above. */
const INTEGRATIONS_INITIAL = [
  { id:"twilio", name:"SMS & WhatsApp",   cat:"Comms",      status:"builtin", desc:"Critical escalations by text and WhatsApp. Built into notification preferences; switching on with our SMS provider setup — nothing needed on your side." },
  { id:"xero",   name:"Xero",             cat:"Accounting", status:"csv",     desc:"Invoices export as Xero-ready CSV today from Billing. Direct API sync is planned." },
  { id:"sage",   name:"Sage",             cat:"Accounting", status:"csv",     desc:"The same invoice CSV imports into Sage today. Direct API sync is planned." },
  { id:"ms365",  name:"Microsoft 365",    cat:"SSO",        status:"planned", desc:"Single sign-on and directory sync" },
  { id:"google", name:"Google Workspace", cat:"SSO",        status:"planned", desc:"SAML SSO via Google" },
  { id:"slack",  name:"Slack",            cat:"Comms",      status:"planned", desc:"Post alerts to a channel" },
  { id:"sap",    name:"SAP S/4HANA",      cat:"ERP",        status:"planned", desc:"Two-way asset and PO sync" },
  { id:"s3",     name:"AWS S3",           cat:"Storage",    status:"planned", desc:"Off-site backup of documents" },
  { id:"webhook",name:"Custom webhook",   cat:"Developer",  status:"planned", desc:"POST every event to your endpoint" },
];

function IntegrationsSettings({ showToast }) {
  const items = INTEGRATIONS_INITIAL;
  const grouped = items.reduce((m, x) => { (m[x.cat] = m[x.cat] || []).push(x); return m; }, {});

  // No switches on catalogue cards — a switch promises a connection. Each card
  // states plainly what works today, what's built and being switched on, and
  // what's genuinely still planned.
  const statusPill = (s) =>
    s === "builtin" ? <Pill tone="ok" dot>Built in</Pill>
    : s === "csv"   ? <Pill tone="accent" dot>Works today</Pill>
    :                 <Pill tone="muted">Planned</Pill>;
  const statusFoot = (s) =>
    s === "builtin" ? "Live in the product — being switched on, nothing needed from you"
    : s === "csv"   ? "Working now via export — one-click API sync is planned"
    :                 "On the roadmap";

  return (
    <div className="settings-card">
      <TeamsWebhookCard showToast={showToast} />
      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat}>
          <div className="settings-group-label">{cat}</div>
          <div className="integration-grid">
            {list.map((it) => (
              <div className="integration-card" key={it.id}>
                <div className="integration-head">
                  <div className="integration-tile">{it.name[0]}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="integration-name">{it.name}</div>
                    <div className="integration-desc">{it.desc}</div>
                  </div>
                  {statusPill(it.status)}
                </div>
                <div className="integration-foot">
                  <span>{statusFoot(it.status)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===========================================================
   Account & security tab — REAL two-factor authentication.
   Wired to the live backend (/auth/2fa/*): enrol shows a scannable
   QR from the server, confirming returns one-time recovery codes,
   and sign-in then requires the 6-digit code. Nothing mocked.
   =========================================================== */
function SecuritySettings({ showToast }) {
  const [status, setStatus]     = React.useState(null);  // {enrolled, enrolledAt, required} | false on error
  const [mode, setMode]         = React.useState("idle"); // idle | setup | recovery | disable
  const [setup, setSetup]       = React.useState(null);   // { qrDataUrl, secret }
  const [code, setCode]         = React.useState("");
  const [busy, setBusy]         = React.useState(false);
  const [recovery, setRecovery] = React.useState([]);

  const load = () => hlApi("/auth/2fa/status").then(({ ok, b }) => setStatus(ok && b ? b : false));
  React.useEffect(() => { load(); }, []);

  const begin = () => {
    setBusy(true);
    hlApi("/auth/2fa/enrol", { method: "POST" })
      .then(({ ok, b }) => {
        if (!ok || !b || !b.qrDataUrl) { showToast("Could not start setup. Try again."); return; }
        setSetup({ qrDataUrl: b.qrDataUrl, secret: b.secret });
        setCode("");
        setMode("setup");
      })
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    if (!/^\d{6}$/.test(code.trim())) { showToast("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    hlApi("/auth/2fa/enrol/confirm", { method: "POST", body: { code: code.trim() } })
      .then(({ ok, b }) => {
        if (!ok) { showToast("That code didn't match. Check the app and try again."); return; }
        setRecovery((b && b.recoveryCodes) || []);
        setMode("recovery");
        setCode("");
        load();
        showToast("Two-factor authentication is on");
      })
      .finally(() => setBusy(false));
  };

  const disable = () => {
    if (!code.trim()) { showToast("Enter a 6-digit code or a recovery code."); return; }
    setBusy(true);
    hlApi("/auth/2fa/disable", { method: "POST", body: { code: code.trim() } })
      .then(({ ok }) => {
        if (!ok) { showToast("That code didn't match."); return; }
        setMode("idle");
        setCode("");
        load();
        showToast("Two-factor authentication is off");
      })
      .finally(() => setBusy(false));
  };

  if (status === null) {
    return <div className="settings-card"><div style={{ color:"var(--ink-3)", fontSize:13.5 }}>Checking your security settings…</div></div>;
  }
  if (status === false) {
    return <div className="settings-card"><div style={{ color:"var(--warn)", fontSize:13.5 }}>Could not load your security settings. Refresh to try again.</div></div>;
  }

  return (
    <div className="settings-card">
      <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
        <div className="kpi-ico" style={{ background: status.enrolled ? "var(--ok-soft)" : "var(--warn-soft)", color: status.enrolled ? "var(--ok)" : "var(--warn)", flex:"none" }}>
          <Icon name="lock" size={16} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <b style={{ fontSize:14.5 }}>Two-factor authentication</b>
            {status.enrolled
              ? <Pill tone="ok" dot>On</Pill>
              : status.required
                ? <Pill tone="warn" dot>Recommended for admins</Pill>
                : <Pill tone="muted" dot>Off</Pill>}
          </div>
          <p style={{ margin:"6px 0 0", fontSize:13, color:"var(--ink-2)", lineHeight:1.55, maxWidth:520 }}>
            Signing in asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) as well as the password. It protects the account even if the password leaks.
          </p>

          {mode === "idle" && !status.enrolled && (
            <button className="btn btn-primary" style={{ marginTop:14 }} disabled={busy} onClick={begin}>
              <Icon name="lock" size={14} />Set up two-factor
            </button>
          )}

          {mode === "idle" && status.enrolled && (
            <div style={{ marginTop:12, fontSize:12.5, color:"var(--ink-3)" }}>
              Enabled {status.enrolledAt ? "on " + String(status.enrolledAt).slice(0, 10) : ""}.
              <button className="btn btn-sm" style={{ marginLeft:12 }} onClick={() => { setMode("disable"); setCode(""); }}>Turn off</button>
            </div>
          )}

          {mode === "setup" && setup && (
            <div className="card card-pad" style={{ marginTop:14, maxWidth:480 }}>
              <div style={{ fontWeight:700, fontSize:13.5, marginBottom:8 }}>1 · Scan this with your authenticator app</div>
              <img src={setup.qrDataUrl} alt="Two-factor setup QR code" width="168" height="168"
                style={{ borderRadius:10, border:"1px solid var(--line)", background:"#fff", padding:6 }} />
              <div style={{ fontSize:12, color:"var(--ink-3)", margin:"8px 0 14px" }}>
                Can't scan? Enter this key manually: <span style={{ fontFamily:"var(--mono)", userSelect:"all" }}>{setup.secret}</span>
              </div>
              <div style={{ fontWeight:700, fontSize:13.5, marginBottom:8 }}>2 · Enter the 6-digit code it shows</div>
              <div style={{ display:"flex", gap:8 }}>
                <input className="dv-input" style={{ width:130, fontFamily:"var(--mono)", letterSpacing:"2px" }}
                  inputMode="numeric" maxLength={6} placeholder="123456" autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm(); }} />
                <button className="btn btn-primary" disabled={busy} onClick={confirm}>Verify &amp; turn on</button>
                <button className="btn btn-ghost" onClick={() => { setMode("idle"); setSetup(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {mode === "recovery" && (
            <div className="card card-pad" style={{ marginTop:14, maxWidth:480 }}>
              <div style={{ fontWeight:700, fontSize:13.5 }}>Save your recovery codes</div>
              <p style={{ margin:"6px 0 10px", fontSize:12.5, color:"var(--ink-2)", lineHeight:1.5 }}>
                Each code signs you in once if you lose your phone. Keep them somewhere safe — they are shown only this once.
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontFamily:"var(--mono)", fontSize:13, userSelect:"all" }}>
                {recovery.map((c) => <div key={c} style={{ padding:"6px 10px", background:"var(--surface-2)", borderRadius:8 }}>{c}</div>)}
              </div>
              <button className="btn btn-primary" style={{ marginTop:12 }} onClick={() => setMode("idle")}>
                <Icon name="check" size={14} />I've saved these
              </button>
            </div>
          )}

          {mode === "disable" && (
            <div className="card card-pad" style={{ marginTop:14, maxWidth:480 }}>
              <div style={{ fontWeight:700, fontSize:13.5, marginBottom:8 }}>Confirm with a code to turn off</div>
              <div style={{ display:"flex", gap:8 }}>
                <input className="dv-input" style={{ width:170, fontFamily:"var(--mono)" }}
                  placeholder="6-digit or recovery code" autoFocus
                  value={code} onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") disable(); }} />
                <button className="btn btn-danger" disabled={busy} onClick={disable}>Turn off</button>
                <button className="btn btn-ghost" onClick={() => setMode("idle")}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Live Microsoft Teams connection — org-wide alerts post a card to the
   channel behind this incoming-webhook URL. Wired to /settings/integrations. */
function TeamsWebhookCard({ showToast }) {
  const [saved, setSaved] = React.useState(null); // null loading | "" none | url
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy]   = React.useState(false);

  React.useEffect(() => {
    hlApi("/settings/integrations").then(({ ok, b }) => {
      const url = ok && b && b.teamsWebhookUrl ? b.teamsWebhookUrl : "";
      setSaved(url); setDraft(url);
    });
  }, []);

  const save = (next) => {
    setBusy(true);
    hlApi("/settings/integrations", { method:"PUT", body:{ teamsWebhookUrl: next || null } })
      .then(({ ok }) => {
        if (!ok) { showToast("Could not save — admin access is needed."); return; }
        setSaved(next || ""); setDraft(next || "");
        showToast(next ? "Teams connected — alerts will post to your channel" : "Teams disconnected");
      })
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ marginBottom:18 }}>
      <div className="settings-group-label">Live now</div>
      <div className="card card-pad" style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
        <div className="integration-tile" style={{ flex:"none" }}>T</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <b style={{ fontSize:13.5 }}>Microsoft Teams</b>
            {saved ? <Pill tone="ok" dot>Connected</Pill> : <Pill tone="muted" dot>Not connected</Pill>}
          </div>
          <p style={{ margin:"5px 0 10px", fontSize:12.5, color:"var(--ink-2)", lineHeight:1.5 }}>
            Paste an incoming-webhook URL from a Teams channel and org-wide alerts (overdue work, escalated spills, expiring certs) post there as cards.
          </p>
          {saved === null ? (
            <div style={{ fontSize:12.5, color:"var(--ink-3)" }}>Loading…</div>
          ) : (
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <input className="dv-input" style={{ flex:1, minWidth:240 }} placeholder="https://…webhook.office.com/…"
                value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn btn-primary" disabled={busy || !/^https:\/\//.test(draft.trim())} onClick={() => save(draft.trim())}>Save</button>
              {saved && <button className="btn btn-ghost" disabled={busy} onClick={() => save("")}>Remove</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   View shell
   =========================================================== */
function SettingsView({ go }) {
  // Allow other views (e.g. Users) to deep-link straight to a tab by stashing
  // window.__settingsInitialTab before navigating here.
  const initial = React.useMemo(() => {
    const t = (typeof window !== "undefined" && window.__settingsInitialTab) || null;
    if (typeof window !== "undefined") delete window.__settingsInitialTab;
    return SETTINGS_TABS.some((x) => x.id === t) ? t : "org";
  }, []);
  const [tab, setTab] = React.useState(initial);
  const { showToast, toastNode } = useViewToast();

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-desc">Organisation-wide setup — your brand, sites, disciplines, billing and integrations.</p>
        </div>
      </div>

      <div className="tabs settings-tabs">
        {SETTINGS_TABS.map((t) => (
          <button key={t.id} className={"tab-btn settings-tab" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === "org"          && <OrgSettings              showToast={showToast} />}
      {tab === "sites"        && <SitesSettings            showToast={showToast} />}
      {tab === "disciplines"  && <DisciplinesSettings      showToast={showToast} />}
      {tab === "roles"        && <RolesPermissionsSettings showToast={showToast} />}
      {tab === "security"     && <SecuritySettings         showToast={showToast} />}
      {tab === "billing"      && <BillingSettings          showToast={showToast} />}
      {tab === "integrations" && <IntegrationsSettings     showToast={showToast} />}

      {toastNode}
    </div>
  );
}

Object.assign(window, { SettingsView });

/* ════════════════════ asset_20_33637aaf.js ════════════════════ */
;
/* HazardLink — Notifications page (feed + preferences). */

function NotifTypeChip({ type, on, onClick, count }) {
  if (type === null || type === "all") {
    return (
      <button className={"ntype-chip" + (on ? " on" : "")} onClick={onClick}>
        <span className="ntype-ico ntype-ico-all"><Icon name="layers" size={11} /></span>
        <span>All</span>
        {count != null && <span className="ntype-count">{count}</span>}
      </button>
    );
  }
  const m = NOTIF_TYPES[type];
  return (
    <button className={"ntype-chip" + (on ? " on" : "")} onClick={onClick}>
      <span className="ntype-ico" style={{ background: m.soft, color: m.color }}>
        <Icon name={m.icon} size={11} />
      </span>
      <span>{m.label}</span>
      {count != null && <span className="ntype-count">{count}</span>}
    </button>
  );
}

function PrefMatrix({ prefs, setPref, resetPrefs, showToast }) {
  return (
    <div className="card pref-card">
      <div className="pref-head">
        <div>
          <h3>Notification preferences</h3>
          <p>Pick which event types reach you, and how. Channel rates billed against your Brevo and Twilio accounts.</p>
        </div>
        <button className="btn" onClick={() => { resetPrefs(); showToast("Preferences reset to defaults"); }}>
          <Icon name="rotateCw" size={14} />Reset to defaults
        </button>
      </div>

      <div className="pref-matrix">
        <div className="pref-mrow pref-mhead">
          <div className="pref-mtype">Event type</div>
          {NOTIF_CHANNELS.map((c) => (
            <div key={c.id} className="pref-mcell pref-mcol-head">
              <span className="pref-col-ico"><Icon name={c.icon} size={13} /></span>
              <div>
                <div className="pref-col-lbl">{c.label}</div>
                <div className="pref-col-sub">{c.sub}</div>
              </div>
            </div>
          ))}
        </div>
        {NOTIF_TYPE_ORDER.map((tk) => {
          const m = NOTIF_TYPES[tk];
          const p = prefs[tk] || {};
          return (
            <div className="pref-mrow" key={tk}>
              <div className="pref-mtype">
                <span className="pref-mtype-ico" style={{ background: m.soft, color: m.color }}>
                  <Icon name={m.icon} size={13} />
                </span>
                <span>{m.label}</span>
              </div>
              {NOTIF_CHANNELS.map((c) => (
                <div className="pref-mcell" key={c.id}>
                  <Toggle on={!!p[c.id]} onChange={(v) => {
                    setPref(tk, c.id, v);
                    showToast(v ? `${m.label} → ${c.label} on` : `${m.label} → ${c.label} off`);
                  }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="pref-foot">
        <Icon name="info" size={12} />
        <span>Critical safety events (spills, lone-worker, incidents) always bypass quiet hours.</span>
      </div>
    </div>
  );
}

function ActionPill({ action, onClick }) {
  if (!action) return null;
  const tone = action.tone || "muted";
  return (
    <button className={"notif-action notif-action-" + tone}
      onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}>
      <Icon name={action.icon || "arrowRight"} size={12} />
      {action.label}
    </button>
  );
}

function NotificationsView({ go }) {
  const { items, readSet, prefs, unreadCount,
          markRead, markUnread, markAllRead, setPref, resetPrefs } = useNotifs();
  const { showToast, toastNode } = useViewToast();

  const [typeFilter, setTypeFilter] = React.useState("all"); // all | spills | maintenance | ...
  const [readFilter, setReadFilter] = React.useState("all"); // all | unread | read

  // Counts per type, on the full set (so the chips don't change shape as you click).
  const typeCounts = React.useMemo(() => {
    const m = {};
    items.forEach((n) => { m[n.type] = (m[n.type] || 0) + 1; });
    return m;
  }, [items]);

  const filtered = items.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (readFilter === "unread" && readSet.has(n.id)) return false;
    if (readFilter === "read"   && !readSet.has(n.id)) return false;
    return true;
  });

  const today   = filtered.filter((n) => n.bucket === "today");
  const earlier = filtered.filter((n) => n.bucket === "earlier");

  const openItem = (n) => {
    markRead(n.id);
    if (go && n.view) go(n.view);
  };
  const doAction = (n) => {
    markRead(n.id);
    showToast(`${n.action.label} — ${n.title.replace(/\s+—.*$/, "")}`);
  };

  const renderRow = (n) => {
    const unread = !readSet.has(n.id);
    const m = NOTIF_TYPES[n.type];
    return (
      <div key={n.id} className={"feed-row" + (unread ? " unread" : "")}>
        <button className="feed-row-main" onClick={() => openItem(n)}>
          <span className="feed-ico" style={{ background: m.soft, color: m.color }}>
            <Icon name={m.icon} size={16} />
          </span>
          <span className="feed-body">
            <span className="feed-title">
              {unread && <span className="notif-unread-dot" />}
              {n.title}
            </span>
            <span className="feed-context">{n.context}</span>
            <span className="feed-tags">
              <span className="feed-type-tag" style={{ color: m.color }}>
                <span className="feed-type-dot" style={{ background: m.color }} />
                {m.label}
              </span>
              <span className="feed-sep">·</span>
              <span className="feed-time">{n.time}</span>
              {!unread && <React.Fragment><span className="feed-sep">·</span><span className="feed-read-tag">Read</span></React.Fragment>}
            </span>
          </span>
        </button>
        <div className="feed-row-actions">
          <ActionPill action={n.action} onClick={() => doAction(n)} />
          <button className="feed-readtoggle"
            title={unread ? "Mark as read" : "Mark as unread"}
            onClick={() => unread ? markRead(n.id) : markUnread(n.id)}>
            <Icon name={unread ? "check" : "rotateCw"} size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="content-inner">
      <div className="page-head">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-desc">Every alert the system has fired at you — filterable, actionable, and tuned by event type and channel.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={() => { markAllRead(); showToast("All notifications marked read"); }}
            disabled={unreadCount === 0} style={{ opacity: unreadCount === 0 ? .55 : 1 }}>
            <Icon name="check" size={14} />Mark all read
          </button>
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="bell" size={16} /></div>
            <span className="kpi-label">Unread</span>
          </div>
          <div className="kpi-val">{unreadCount}<small>/{items.length}</small></div>
          <div className="kpi-foot">across all event types</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("warn"), color:solid("warn") }}><Icon name="activity" size={16} /></div>
            <span className="kpi-label">Today</span>
          </div>
          <div className="kpi-val">{items.filter((n) => n.bucket === "today").length}</div>
          <div className="kpi-foot">in the last 12 hours</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("crit"), color:solid("crit") }}><Icon name="alertTri" size={16} /></div>
            <span className="kpi-label">Critical</span>
          </div>
          <div className="kpi-val">{items.filter((n) => n.severity === "crit").length}</div>
          <div className="kpi-foot">spills, lone-worker, incidents</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <div className="kpi-ico" style={{ background:softBg("accent"), color:solid("accent") }}><Icon name="send" size={16} /></div>
            <span className="kpi-label">Delivered last 24h</span>
          </div>
          <div className="kpi-val">0</div>
          <div className="kpi-foot">in-app · email · sms</div>
        </div>
      </div>

      <div className="notif-toolbar">
        <div className="ntype-row">
          <NotifTypeChip type={null} on={typeFilter === "all"} onClick={() => setTypeFilter("all")} count={items.length} />
          {NOTIF_TYPE_ORDER.map((tk) => (
            <NotifTypeChip key={tk} type={tk} on={typeFilter === tk}
              onClick={() => setTypeFilter(tk)}
              count={typeCounts[tk] || 0} />
          ))}
        </div>
        <div className="seg" style={{ marginLeft:"auto" }}>
          {[
            { id:"all",    label:"All" },
            { id:"unread", label:`Unread${unreadCount > 0 ? " · " + unreadCount : ""}` },
            { id:"read",   label:"Read" },
          ].map((s) => (
            <button key={s.id} className={readFilter === s.id ? "on" : ""}
              onClick={() => setReadFilter(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="card notif-feed-card">
        {filtered.length === 0 && (
          <div className="notif-empty notif-empty-page">
            <Icon name="checkCircle" size={28} />
            <div>Nothing to show here</div>
            <small>Try a different filter — or you really are all caught up.</small>
          </div>
        )}
        {today.length > 0 && (
          <React.Fragment>
            <div className="feed-group-label">Today</div>
            {today.map(renderRow)}
          </React.Fragment>
        )}
        {earlier.length > 0 && (
          <React.Fragment>
            <div className="feed-group-label">Earlier</div>
            {earlier.map(renderRow)}
          </React.Fragment>
        )}
      </div>

      <PrefMatrix prefs={prefs} setPref={setPref} resetPrefs={resetPrefs} showToast={showToast} />

      {toastNode}
    </div>
  );
}

/* The original Notification rules screen had a Toggle component that other
   views relied on. Keep it exported here so nothing else breaks. */
function Toggle({ on, onChange, disabled }) {
  return (
    <button className={"toggle" + (on ? " on" : "") + (disabled ? " disabled" : "")}
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on} disabled={disabled}>
      <span className="toggle-knob" />
    </button>
  );
}

Object.assign(window, { NotificationsView, Toggle });

/* ════════════════════ asset_31_b90c7fc3.js ════════════════════ */
;
/* HazardLink — misc helpers */

function Placeholder({ title, desc, icon }) {
  return (
    <div className="content-inner">
      <div className="empty">
        <div className="empty-ico"><Icon name={icon} size={28} /></div>
        <h3>{title}</h3>
        <p>{desc}</p>
        <button className="btn btn-primary"><Icon name="plus" size={15} />Get started</button>
      </div>
    </div>
  );
}

Object.assign(window, { Placeholder });

/* ════════════════════ asset_22_9295cebd.js ════════════════════ */
;
/* HazardLink — AI voice-to-work-order modal */

const SPOKEN = "";

const PARSED = [];

function AIModal({ onClose, onCreate }) {
  const [phase, setPhase] = React.useState("listening"); // listening | parsed
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i += 2;
      setTyped(SPOKEN.slice(0, i));
      if (i >= SPOKEN.length) {
        clearInterval(iv);
        setTimeout(() => setPhase("parsed"), 650);
      }
    }, 28);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-ico"><Icon name="sparkles" size={20} /></div>
          <div>
            <h3>Voice to work order</h3>
            <p>{phase === "listening" ? "Listening — speak the fault while you're standing in front of it" : "Here's the structured job — confirm and create"}</p>
          </div>
          <button className="icon-btn close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="modal-body">
          {phase === "listening" ? (
            <div className="mic-stage">
              <div className="mic-orb listening"><Icon name="mic" size={32} /></div>
              <div className="wave">
                {Array.from({ length: 9 }).map((_, i) => (
                  <i key={i} style={{ animationDelay: (i * 0.09) + "s", background: "var(--accent)" }} />
                ))}
              </div>
              <div className="transcript">
                {typed}<span className="cursor" />
              </div>
            </div>
          ) : (
            <div className="ai-fields">
              {PARSED.map((f, i) => (
                <div className="ai-field" key={i} style={{ animationDelay: (i * 0.08) + "s" }}>
                  <label>{f.label}</label>
                  <div className="field-val">
                    <Icon name={f.icon} size={16} className="lead" />
                    {f.pill ? <Pill tone={f.pill} dot>{f.value}</Pill> : <span>{f.value}</span>}
                    <span className="ai-tag"><Icon name="sparkles" size={11} />{f.tag || "from voice"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={phase !== "parsed"}
            style={{ opacity: phase === "parsed" ? 1 : .5 }}
            onClick={onCreate}>
            <Icon name="check" size={15} />Create work order
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AIModal });

/* ════════════════════ asset_30_1d32c6a0.js ════════════════════ */
;
/* HazardLink — main app */

const TWEAK_DEFAULTS = {
  "accent":  "#2563EB",
  "dark":    false,
  "density": "comfortable"
};

function App() {
  const [view, setView]             = React.useState("dashboard");
  const [workOrders, setWorkOrders] = React.useState(HL.workOrders);
  const [feed, setFeed]             = React.useState(HL.feed);
  const [aiOpen, setAiOpen]         = React.useState(false);
  const [scanOpen, setScanOpen]     = React.useState(false);
  const [pendingScan, setPendingScan] = React.useState(null); // { kind, id, ts }
  const [toast, setToast]           = React.useState(null);
  const [flashId, setFlashId]       = React.useState(null);
  const [site, setSite]             = React.useState(null);
  const [team, setTeam]             = React.useState(() =>
    (typeof readDefaultTeam === "function" ? readDefaultTeam() : null)
  );
  const [perms, setPermsState]      = React.useState(() =>
    (typeof readStoredPerms === "function" ? readStoredPerms() : DEFAULT_PERMS)
  );
  const [previewRole, setPreviewRoleState] = React.useState(() =>
    (typeof readStoredPreviewRole === "function" ? readStoredPreviewRole() : null)
  );
  const setPerms = React.useCallback((p) => {
    setPermsState(p);
    if (typeof writeStoredPerms === "function") writeStoredPerms(p);
  }, []);
  const setPreviewRole = React.useCallback((r) => {
    setPreviewRoleState(r);
    if (typeof writeStoredPreviewRole === "function") writeStoredPreviewRole(r);
  }, []);
  const permsCtx = React.useMemo(
    () => ({ perms, setPerms, previewRole, setPreviewRole }),
    [perms, setPerms, previewRole, setPreviewRole]
  );

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.documentElement.className = t.dark ? "theme-dark" : "";
    document.documentElement.style.setProperty("--accent",     t.accent);
    document.documentElement.style.setProperty("--accent-ink", shade(t.accent));
    document.documentElement.style.setProperty("--topbar-h",   t.density === "compact" ? "56px" : "64px");
  }, [t]);

  const go = (v) => {
    setView(v);
    requestAnimationFrame(() => document.querySelector(".content")?.scrollTo(0, 0));
  };

  const matchSite = (siteName) => !site || siteName === site.name;
  const openCount   = workOrders.filter((w) => w.status !== "Done" && matchSite(w.site)).length;
  const liveSpills  = HL.spillAlerts.filter((a) => a.state === "new" && matchSite(a.site)).length;
  const offlineDev  = HL.deviceBuildings.filter((b) => matchSite(b.name)).flatMap((b) => b.devices).filter((d) => !d.online).length;
  const blockedCt   = HL.contractors.filter((c) => c.status === "blocked").length;
  const ppmOverdue  = HL.ppmTasks.filter((t) => t.status === "overdue" && matchSite(t.site)).length;
  const automations = 0;
  const unassigned  = 0;
  const billingOverdue = 0;
  const compliance     = 0;
  const slaBreach      = 0;
  const permitsPending = 0;

  const handleCreate = () => {
    // The demo used to inject a fabricated work order ("Aviva Office Tower")
    // here. In the live product the AI must NEVER invent a job at a site the
    // org doesn't have — so until voice→job is wired to the backend, this
    // closes honestly and creates nothing.
    setAiOpen(false);
    go("maintenance");
    setToast("Voice work orders are being wired up — nothing was created. Use New work order for now.");
    setTimeout(() => setToast(null), 5200);
  };

  let content;
  switch (view) {
    case "dashboard":   content = <Dashboard     go={go} feed={feed} />; break;
    case "portfolio":   content = <PortfolioView go={go} />; break;
    case "site":        content = <SiteView      go={go} />; break;
    case "scheduling":  content = <SchedulingView go={go} />; break;
    case "cleaning":    content = <CleaningView  go={go} />; break;
    case "spills":      content = <SpillsView    go={go} />; break;
    case "floorplan":   content = <FloorPlanView go={go} />; break;
    case "devices":     content = <DevicesView   go={go} />; break;
    case "maintenance": content = <Maintenance   go={go} workOrders={workOrders} openWO={() => go("wo")} flashId={flashId} onCreate={() => setAiOpen(true)} />; break;
    case "wo":          content = <WorkOrder     go={go} />; break;
    case "maint-overview": content = <MaintenanceOverview go={go} />; break;
    case "ppm":         content = <PPMView       go={go} />; break;
    case "meters":      content = <MetersView    go={go} />; break;
    case "parts":       content = <PartsView     go={go} onScan={() => setScanOpen(true)}
                                                  pendingScan={pendingScan && pendingScan.kind === "part" ? pendingScan : null}
                                                  onConsumeScan={() => setPendingScan(null)} />; break;
    case "timesheets":  content = <TimesheetsView go={go} />; break;
    case "competency":  content = <CompetencyView go={go} />; break;
    case "compliance":  content = <ComplianceView go={go} />; break;
    case "slas":        content = <SLAsView       go={go} />; break;
    case "permits":     content = <PermitsView    go={go} />; break;
    case "security":    content = <SecurityView  go={go} />; break;
    case "visitors":    content = <VisitorsView  go={go} />; break;
    case "sds":         content = <SDSView       go={go} />; break;
    case "assets":      content = <AssetsView    go={go} onScan={() => setScanOpen(true)}
                                                  pendingScan={pendingScan && pendingScan.kind === "asset" ? pendingScan : null}
                                                  onConsumeScan={() => setPendingScan(null)} />; break;
    case "contractors": content = <ContractorsView go={go} />; break;
    case "clientportal": content = <ClientPortalView go={go} />; break;
    case "forms":       content = <FormsView         go={go} />; break;
    case "assistant":   content = <AssistantView   go={go} />; break;
    case "billing":     content = <BillingView    go={go} />; break;
    case "automations": content = <AutomationsView go={go} />; break;
    case "team":        content = <TeamView       go={go} />; break;
    case "reports":     content = <ReportsView   go={go} />; break;
    case "audit":       content = <AuditLogView  go={go} />; break;
    case "users":       content = <UsersView     go={go} />; break;
    case "profile":     content = <MyProfileView go={go} />; break;
    case "settings":    content = <SettingsView  go={go} />; break;
    case "notifications": content = <NotificationsView go={go} />; break;
    default:            content = <Dashboard     go={go} feed={feed} />;
  }

  return (
    <SiteContext.Provider value={{ site, setSite }}>
      <TeamContext.Provider value={{ team, setTeam }}>
      <PermissionsContext.Provider value={permsCtx}>
      <div className="app">
        <Sidebar view={view} go={go} counts={{ maint: openCount, spills: liveSpills, devices: offlineDev, blocked: blockedCt, ppmOverdue, automations, unassigned, billingOverdue, compliance, slaBreach, permitsPending }} />
        <div className="main">
          <TopBar view={view} onAI={() => go("assistant")} onScan={() => setScanOpen(true)} go={go} />
          <div className="content">
            <PreviewBanner />
            {content}
          </div>
        </div>

        {aiOpen && <AIModal onClose={() => setAiOpen(false)} onCreate={handleCreate} />}

        {scanOpen && (
          <ScannerModal
            onClose={() => setScanOpen(false)}
            onResolve={(t) => {
              setScanOpen(false);
              setPendingScan({ kind: t.kind, id: t.id, ts: Date.now() });
              go(t.kind === "part" ? "parts" : "assets");
            }} />
        )}

        {toast && (
          <div className="toast">
            <Icon name="checkCircle" size={18} />{toast}
            <button className="undo" onClick={() => go("maintenance")}>View</button>
          </div>
        )}

        <TweaksPanel>
          <TweakSection label="Brand" />
          <TweakColor   label="Accent colour" value={t.accent}
            options={["#2563EB","#0d9488","#4f46e5","#0b1220"]}
            onChange={(v) => setTweak("accent", v)} />
          <TweakToggle  label="Dark mode" value={t.dark}  onChange={(v) => setTweak("dark", v)} />
          <TweakSection label="Layout" />
          <TweakRadio   label="Density" value={t.density} options={["comfortable","compact"]}
            onChange={(v) => setTweak("density", v)} />
        </TweaksPanel>
      </div>
      </PermissionsContext.Provider>
      </TeamContext.Provider>
    </SiteContext.Provider>
  );
}

function shade(hex) {
  try {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * .82); g = Math.round(g * .82); b = Math.round(b * .82);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  } catch(e) { return hex; }
}

/* self-mount stripped — host app mounts <App/> */

export { App };
