import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "./api";
import { useAuth } from "./auth";

/**
 * Subscribe to the backend's Server-Sent Events stream once per logged-in
 * session. On every push the relevant React Query is invalidated, so any
 * mounted view that depends on that data refetches immediately. Plus we
 * fire desktop notifications on alert.open / alert.escalated.
 */
export function LiveEventsBridge(): null {
  const { user } = useAuth();
  const qc = useQueryClient();
  const seenAlertIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    if (!token) return;

    // Ask the browser for notification permission once. Browsers require
    // a user-gesture chain to grant — login itself counts as a gesture.
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }

    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

    const showAlertNotification = (title: string, body: string) => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const n = new Notification(title, {
          body,
          tag: "bor-alert",
          icon: "/favicon.ico",
          silent: false,
        });
        n.onclick = () => {
          window.focus();
          window.location.href = "/";
          n.close();
        };
      } catch {
        // older browsers; ignore
      }
    };

    es.addEventListener("alert.open", (ev) => {
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if (!seenAlertIds.current.has(data.alertId)) {
          seenAlertIds.current.add(data.alertId);
          showAlertNotification(
            "🚨 New spill alert",
            "A wet floor sign has been lifted. Tap to view.",
          );
        }
      } catch {
        showAlertNotification("New spill alert", "A wet floor sign has been lifted.");
      }
    });

    es.addEventListener("alert.escalated", () => {
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      showAlertNotification(
        "⚠️ Alert escalated",
        "A spill alert has been escalated to supervisors.",
      );
    });

    es.addEventListener("alert.acknowledged", () => {
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
    });
    es.addEventListener("alert.closed", () => {
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
    });

    es.addEventListener("dispatch.created", () => {
      qc.invalidateQueries({ queryKey: ["dispatches"] });
      showAlertNotification(
        "📨 New dispatch",
        "You've been dispatched to a zone. Tap to view.",
      );
    });
    es.addEventListener("dispatch.acknowledged", () => {
      qc.invalidateQueries({ queryKey: ["dispatches"] });
    });
    es.addEventListener("dispatch.completed", () => {
      qc.invalidateQueries({ queryKey: ["dispatches"] });
    });
    es.addEventListener("hanger.updated", () => {
      qc.invalidateQueries({ queryKey: ["hangers"] });
    });

    es.onerror = () => {
      // EventSource auto-reconnects; React Query 30s polling is the safety net.
    };

    return () => {
      es.close();
    };
  }, [user, qc]);

  return null;
}
