/* Assemble the claude.ai/design prototype's component files into one ES module.
 *
 * The prototype is ~47 classic scripts that share one global scope (each defines
 * top-level functions/consts and exposes some via Object.assign(window, …)).
 * We concatenate them in the prototype's own load order into a single module so
 * those cross-file references resolve in one shared lexical scope — preserving
 * the EXACT source — then provide React / ReactDOM / HL / primitives as imports
 * and export the top-level <App/>.
 *
 * Regenerate:  node web/src/prototype/assemble.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "_source");

// 1. Load order = the order the prototype's template loads its text/babel scripts.
const tpl = fs.readFileSync(path.join(SRC, "template.html"), "utf8");
const uuidOrder = [...tpl.matchAll(/type="text\/babel" src="([0-9a-f-]+)"/g)].map((m) => m[1]);

// Map first-8 hex of each UUID -> filename in _source.
const files = fs.readdirSync(SRC).filter((f) => /^asset_\d+_.*\.(js|jsx)$/.test(f));
const byPrefix = {};
for (const f of files) {
  const m = f.match(/^asset_\d+_([0-9a-f]+)\./);
  if (m) byPrefix[m[1]] = f;
}

// Excluded from concat — imported as real modules instead, or shipped by the host app.
const EXCLUDE = new Set([
  "038d8a47", // asset_03 — data (export const HL) -> ./data
  "88ce6ffd", // asset_05 — primitives/contexts/icons -> ./primitives
  "25531b16", // asset_00 — React UMD       (host app provides React)
  "49f6c9a9", // asset_01 — ReactDOM UMD     (host app provides ReactDOM)
  "4d9b8f26", // asset_02 — Babel standalone (Vite/esbuild transpiles JSX)
]);

const ordered = [];
const seen = new Set();
for (const u of uuidOrder) {
  const p8 = u.slice(0, 8);
  if (EXCLUDE.has(p8)) continue;
  const f = byPrefix[p8];
  if (f && !seen.has(f)) { ordered.push(f); seen.add(f); }
  else if (!f) console.error("!! no _source file for UUID", u);
}
// Append any component file not referenced in the template (safety net).
for (const f of files) {
  const m = f.match(/^asset_\d+_([0-9a-f]+)\./);
  if (m && !EXCLUDE.has(m[1]) && !seen.has(f)) { console.error("!! not in load order, appending:", f); ordered.push(f); seen.add(f); }
}

// 2. Minimal per-file transforms (collision renames + strip the self-mount).
function transform(file, s) {
  if (file.startsWith("asset_08_")) s = s.replace(/\bPinPopover\b/g, "PinPopoverSite");
  if (file.startsWith("asset_36_")) s = s.replace(/\bSTATUS_META\b/g, "STATUS_META_TEAM");
  s = s.replace(/ReactDOM\.createRoot\(\s*document\.getElementById\(["']root["']\)\s*\)\.render\(\s*<App\s*\/>\s*\);?/g,
                "/* self-mount stripped — host app mounts <App/> */");
  return s;
}

// 3. Emit.
const header = `// @ts-nocheck
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
`;

let body = "";
for (const f of ordered) {
  const raw = fs.readFileSync(path.join(SRC, f), "utf8");
  // Leading `;` guards against the previous file ending on a dangling
  // expression (each file was its own <script> in the prototype, an ASI boundary
  // concatenation removes).
  body += `\n/* ════════════════════ ${f} ════════════════════ */\n;\n` + transform(f, raw).trimEnd() + "\n";
}

fs.writeFileSync(path.join(__dirname, "bundle.tsx"), header + body + "\nexport { App };\n");
console.log("Assembled", ordered.length, "files -> bundle.tsx");
console.log("Order:", ordered.map((f) => f.slice(0, 8)).join(" "));
