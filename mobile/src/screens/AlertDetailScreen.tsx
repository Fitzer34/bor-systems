import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert as RnAlert } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";

interface ActiveAlert {
  id: string;
  status: "open" | "acknowledged" | "closed";
  openedAt: string;
  zoneName: string | null;
  floorName: string | null;
}

type Route = RouteProp<{ AlertDetail: { id: string } }, "AlertDetail">;
type Nav = NativeStackNavigationProp<{ AlertDetail: { id: string } }>;

export function AlertDetailScreen({ route, navigation }: { route: Route; navigation: Nav }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });
  const alert = data?.alerts.find((a) => a.id === id);

  const ack = useMutation({
    mutationFn: () => api(`/alerts/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-alerts"] }),
    onError: () => RnAlert.alert("Could not acknowledge", "Already acknowledged or closed."),
  });

  const close = useMutation({
    mutationFn: (reason: "sign_damaged" | "sign_missing" | "manual") =>
      api(`/alerts/${id}/close`, { method: "POST", body: JSON.stringify({ reason, note: note || undefined }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-alerts"] });
      navigation.goBack();
    },
  });

  if (!alert) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: "#64748b" }}>This alert is no longer active. It may have been resolved.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>
        {alert.floorName ?? "Unknown floor"} — {alert.zoneName ?? "Unassigned"}
      </Text>
      <Text style={{ color: "#64748b" }}>
        Opened {new Date(alert.openedAt).toLocaleString()} · {alert.status}
      </Text>

      {alert.status === "open" && (
        <TouchableOpacity
          onPress={() => ack.mutate()}
          disabled={ack.isPending}
          style={{ backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 16, alignItems: "center", marginTop: 8, opacity: ack.isPending ? 0.5 : 1 }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>I'm on it</Text>
        </TouchableOpacity>
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Optional note (logged with closure)…"
        multiline
        style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 12, minHeight: 70, backgroundColor: "white" }}
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          onPress={() => close.mutate("sign_damaged")}
          style={{ flex: 1, borderWidth: 1, borderColor: "#f59e0b", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#b45309", fontWeight: "500" }}>Sign damaged</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => close.mutate("sign_missing")}
          style={{ flex: 1, borderWidth: 1, borderColor: "#dc2626", borderRadius: 8, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#b91c1c", fontWeight: "500" }}>Sign missing</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: "#64748b", fontSize: 12, marginTop: 8, textAlign: "center" }}>
        The alert auto-closes when the sign is physically replaced on the hanger.
      </Text>
    </ScrollView>
  );
}
