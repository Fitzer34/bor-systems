import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ─── CommandPalette ─────────────────────────────────────────────────────────
 *
 * Keyboard-driven quick-navigation palette. Adapted from the "Command Palette"
 * design on 21st.dev (Magic MCP inspiration) — its multi-section, search-filtered,
 * fully-keyboard-navigable layout — but rebuilt as a clean, self-contained
 * presentational component for the HazardLink stack:
 *   - no shadcn/ui, no cmdk, no lucide-react, no framer-motion (icons are inline SVG)
 *   - HazardLink design system: light theme, white rounded-xl panel over a
 *     slate-900/40 backdrop, trust-blue (#2563EB / blue-600) selected row.
 *
 * Behaviour: text filters items (case-insensitive, label + group); results are
 * grouped under small uppercase headers; ArrowUp/ArrowDown move a single highlight
 * across the FLATTENED filtered list (wrap-around); Enter navigates the highlight;
 * Esc / backdrop click / row click close or navigate accordingly; hover moves the
 * highlight; the input auto-focuses on open. Honors prefers-reduced-motion.
 */

export interface CommandPaletteItem {
  label: string;
  group: string;
  to: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
  onNavigate: (to: string) => void;
}

/** One group header followed by its items, with each item's index into the
 *  flattened (highlight-able) list so a single highlight crosses all groups. */
interface RenderGroup {
  group: string;
  rows: { item: CommandPaletteItem; flatIndex: number }[];
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-slate-400"
      aria-hidden="true"
    >
      <circle cx={11} cy={11} r={7} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </svg>
  );
}

function EnterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  );
}

export function CommandPalette({ open, onClose, items, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Case-insensitive filter on label + group.
  const filtered = useMemo<CommandPaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Build ordered groups (first-seen order) carrying each row's flattened index.
  const groups = useMemo<RenderGroup[]>(() => {
    const out: RenderGroup[] = [];
    const byName = new Map<string, RenderGroup>();
    filtered.forEach((item, flatIndex) => {
      let g = byName.get(item.group);
      if (!g) {
        g = { group: item.group, rows: [] };
        byName.set(item.group, g);
        out.push(g);
      }
      g.rows.push({ item, flatIndex });
    });
    return out;
  }, [filtered]);

  // Reset state each time the palette opens, and focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    // rAF so the element is laid out before we focus it.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the highlight in range as the filtered list shrinks/grows.
  useEffect(() => {
    setHighlight((h) => {
      if (filtered.length === 0) return 0;
      return Math.min(h, filtered.length - 1);
    });
  }, [filtered.length]);

  // Scroll the highlighted row into view.
  useEffect(() => {
    if (!open) return;
    const node = rowRefs.current[highlight];
    if (node) node.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const commit = useCallback(
    (to: string) => {
      onNavigate(to);
      onClose();
    },
    [onNavigate, onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const count = filtered.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (count > 0) setHighlight((h) => (h + 1) % count); // wrap to top
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (count > 0) setHighlight((h) => (h - 1 + count) % count); // wrap to bottom
      } else if (e.key === "Enter") {
        e.preventDefault();
        const sel = filtered[highlight];
        if (sel) commit(sel.to);
      }
    },
    [filtered, highlight, commit, onClose],
  );

  // Reset the per-render refs map so stale rows can't be scrolled to.
  rowRefs.current = [];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] motion-safe:animate-[fadeIn_120ms_ease-out]"
      onMouseDown={(e) => {
        // Close only when the backdrop itself (not the panel) is pressed.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Keyframes kept inline so the component is fully self-contained. */}
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick navigation"
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg motion-safe:animate-[fadeIn_120ms_ease-out]"
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and actions…"
            aria-label="Search pages and actions"
            aria-controls="command-palette-list"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus-visible:ring-0"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-500 sm:inline-block">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="max-h-[55vh] overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No results for “{query}”
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.group} className="px-2 pb-1.5">
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {g.group}
                </div>
                {g.rows.map(({ item, flatIndex }) => {
                  const selected = flatIndex === highlight;
                  return (
                    <button
                      key={`${item.group}-${item.to}-${flatIndex}`}
                      ref={(el) => {
                        rowRefs.current[flatIndex] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onMouseEnter={() => setHighlight(flatIndex)}
                      onClick={() => commit(item.to)}
                      className={[
                        "relative flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50",
                        selected
                          ? "bg-blue-600/10 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {/* Trust-blue left accent on the selected row. */}
                      <span
                        aria-hidden="true"
                        className={[
                          "absolute inset-y-1 left-0 w-0.5 rounded-full bg-blue-600 transition-opacity",
                          selected ? "opacity-100" : "opacity-0",
                        ].join(" ")}
                      />
                      <span className="truncate font-medium">{item.label}</span>
                      {selected && (
                        <span className="ml-auto flex items-center gap-1 pl-3 text-blue-600">
                          <EnterIcon />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-sans text-[10px] font-medium text-slate-500">
              ↑
            </kbd>
            <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-sans text-[10px] font-medium text-slate-500">
              ↓
            </kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-sans text-[10px] font-medium text-slate-500">
              ↵
            </kbd>
            to open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 font-sans text-[10px] font-medium text-slate-500">
              Esc
            </kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
