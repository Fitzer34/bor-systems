import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/* ─── Notifications centre — client data layer ─────────────────────────────────
 *
 * Hooks over the backend notifications API:
 *   GET  /notifications?unread=&limit=&before=  → the in-app feed (newest first)
 *   GET  /notifications/unread-count            → { count } for the bell badge
 *   POST /notifications/:id/read                → mark one read
 *   POST /notifications/read-all                → mark all read
 *
 * The bell badge stays live because live-events.tsx invalidates these query
 * keys whenever the SSE stream pushes a `notification.created` event.
 */

/** One feed row, exactly as the backend `user_notifications` table stores it. */
export interface AppNotification {
  id: string;
  organisationId: string;
  userId: string;
  /** Event type, e.g. "spill.open", "wo.overdue", "quote.awaiting_approval". */
  type: string;
  title: string;
  body: string;
  /** What this points at — "alert" | "job" | "ppm" | "part" | … (nullable). */
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Shared query keys so the SSE bridge can invalidate the same caches. */
export const NOTIFICATIONS_KEY = ["notifications"] as const;
export const NOTIFICATIONS_UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;

/**
 * Map an entity to the route that shows it. Only alerts have a per-id detail
 * route today; everything else lands on its list page (the row is highlighted
 * there). Returns null when there's nowhere sensible to go.
 */
export function notificationHref(n: Pick<AppNotification, "entityType" | "entityId">): string | null {
  switch (n.entityType) {
    case "alert":
      return n.entityId ? `/alerts/${n.entityId}` : "/";
    case "job":
      return "/maintenance";
    case "ppm":
      return "/ppms";
    case "part":
      return "/parts";
    case "checkpoint":
      return "/checkpoints";
    case "certification":
      return "/competency";
    case "lone_worker_session":
      return "/lone-worker";
    default:
      return null;
  }
}

/** Friendly label for an event type (used as a filter option + row chip). */
export function notificationTypeLabel(type: string): string {
  const map: Record<string, string> = {
    "spill.open": "Spill alert",
    "spill.escalated": "Spill escalated",
    "ppm.overdue": "PPM overdue",
    "wo.overdue": "Work order overdue",
    "part.low_stock": "Low stock",
    "cert.expiring": "Certificate expiring",
    "invoice.overdue": "Invoice overdue",
    "lone_worker.overdue": "Lone-worker check-in",
    "quote.awaiting_approval": "Quote awaiting approval",
    "patrol.missed": "Missed patrol",
  };
  if (map[type]) return map[type];
  // Fallback: "some.event_type" → "Some event type".
  return type
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The signed-in user's feed. Pass `{ unread: true }` to fetch only unread. */
export function useNotifications(opts: { unread?: boolean; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.unread) params.set("unread", "true");
  params.set("limit", String(opts.limit ?? 30));
  const qs = params.toString();
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, { unread: !!opts.unread, limit: opts.limit ?? 30 }],
    queryFn: () => api<{ notifications: AppNotification[] }>(`/notifications?${qs}`),
    refetchInterval: 30_000,
  });
}

/** Unread count for the bell badge. Polls as a safety net under the SSE push. */
export function useUnreadCount() {
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY,
    queryFn: () => api<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });
}

/** Invalidate both the feed and the badge (after a read / read-all / push). */
export function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY });
  };
}

/** Mark a single notification read. */
export function useMarkRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

/** Mark every notification read. */
export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: invalidate,
  });
}

/* ─── Preferences ──────────────────────────────────────────────────────────── */

export interface ChannelPrefs {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}
export type PreferencesMap = Record<string, ChannelPrefs>;

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api<{ preferences: PreferencesMap }>("/notifications/preferences"),
  });
}

export function useSetNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { eventType: string } & Partial<ChannelPrefs>) =>
      api<{ eventType: string; prefs: ChannelPrefs }>("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify(vars),
      }),
    // Optimistically flip the toggle so the matrix feels instant; reconcile on
    // settle. Roll back on error.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["notification-preferences"] });
      const prev = qc.getQueryData<{ preferences: PreferencesMap }>(["notification-preferences"]);
      if (prev) {
        const next: PreferencesMap = { ...prev.preferences };
        const cur = next[vars.eventType] ?? { inApp: true, email: false, sms: false };
        next[vars.eventType] = {
          inApp: vars.inApp ?? cur.inApp,
          email: vars.email ?? cur.email,
          sms: vars.sms ?? cur.sms,
        };
        qc.setQueryData(["notification-preferences"], { preferences: next });
      }
      return { prev };
    },
    onError: (_e, _v, ctxData) => {
      if (ctxData?.prev) qc.setQueryData(["notification-preferences"], ctxData.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
}
