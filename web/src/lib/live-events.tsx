import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "./api";
import { useAuth } from "./auth";

/**
 * Subscribe to the backend's Server-Sent Events stream once per logged-in
 * session. On every push the relevant React Query is invalidated, so any
 * mounted view that depends on that data refetches immediately — no manual
 * 5s polling needed.
 *
 * If the SSE connection drops (e.g. network blip, Render restart) the
 * browser's built-in EventSource reconnect kicks in automatically; the
 * existing 30s React Query polling acts as a safety net.
 */
export function LiveEventsBridge(): null {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;

    // EventSource doesn't support custom headers, so the JWT goes in the URL.
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

    const invalidateAlerts = () =>
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
    const invalidateDispatches = () =>
      qc.invalidateQueries({ queryKey: ["dispatches"] });
    const invalidateHangers = () =>
      qc.invalidateQueries({ queryKey: ["hangers"] });

    es.addEventListener("alert.open", invalidateAlerts);
    es.addEventListener("alert.acknowledged", invalidateAlerts);
    es.addEventListener("alert.closed", invalidateAlerts);
    es.addEventListener("alert.escalated", invalidateAlerts);
    es.addEventListener("dispatch.created", invalidateDispatches);
    es.addEventListener("dispatch.acknowledged", invalidateDispatches);
    es.addEventListener("dispatch.completed", invalidateDispatches);
    es.addEventListener("hanger.updated", invalidateHangers);

    es.onerror = () => {
      // EventSource auto-reconnects; the React Query 30s safety net still runs.
      // No need to do anything here.
    };

    return () => {
      es.close();
    };
  }, [user, qc]);

  return null;
}
