import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";

interface ActiveAlert { id: string; status: "open" | "acknowledged" | "closed" }

const BASE_TITLE = "Zero Slip Systems";

function playDing(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch {
    /* audio not allowed yet (browsers require a user gesture); silently ignore */
  }
}

export function ActiveAlertsWatcher(): null {
  const { user } = useAuth();
  const lastOpenCount = useRef<number | null>(null);
  const lastTotalCount = useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
    enabled: !!user,
  });

  useEffect(() => {
    if (!data) return;
    const total = data.alerts.length;
    const open = data.alerts.filter((a) => a.status === "open").length;

    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;

    if (lastOpenCount.current !== null && open > lastOpenCount.current) playDing();
    if (lastTotalCount.current !== null && total > lastTotalCount.current && open === lastOpenCount.current) {
      // alert count grew but only with acknowledged alerts (rare); skip ding
    }

    lastOpenCount.current = open;
    lastTotalCount.current = total;
  }, [data]);

  useEffect(() => {
    return () => { document.title = BASE_TITLE; };
  }, []);

  return null;
}
