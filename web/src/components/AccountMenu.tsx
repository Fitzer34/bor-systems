import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

/* ─── AccountMenu ─────────────────────────────────────────────────────────────
 *
 * The right-aligned avatar in the desktop header. Click the avatar to open a
 * dropdown with the signed-in user's identity and account links; closes on
 * outside-click or Escape. "Sign out" is visually separated at the bottom.
 *
 * Light-theme styling to match the page content (the sidebar is dark; the
 * header sits over the white content area).
 */

/** "cleaner" → "Field staff" in the UI only. */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  cleaner: "Field staff",
};

/** Initials from a display name (max 2 letters). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click + Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/50"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold overflow-hidden">
          {user.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials(user.name)
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hidden sm:block text-slate-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg z-50"
        >
          {/* Signed-in identity */}
          <div className="px-3 py-2.5 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900 truncate">{user.name}</div>
            <div className="text-xs text-slate-500 truncate">{ROLE_LABEL[user.role] ?? user.role}</div>
            <div className="text-xs text-slate-400 truncate">{user.email}</div>
          </div>

          <MenuLink onClick={() => go("/profile")}>My profile</MenuLink>
          <MenuLink onClick={() => go("/profile")}>Account &amp; security</MenuLink>
          <MenuLink onClick={() => go("/notifications/preferences")}>Notification preferences</MenuLink>

          <div className="my-1 border-t border-slate-100" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition focus-visible:outline-none focus-visible:bg-slate-50"
    >
      {children}
    </button>
  );
}

export default AccountMenu;
