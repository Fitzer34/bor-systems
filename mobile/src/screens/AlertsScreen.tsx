import { useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, Switch, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { useAuth } from "../auth";
import { registerForPushAsync } from "../notifications";

interface ActiveAlert {
  id: string;
  hangerId: string;
  status: "open" | "acknowledged" | "closed";
  openedAt: string;
  zoneName: string | null;
  floorName: string | null;
}

type Nav = NativeStackNavigationProp<{ AlertDetail: { id: string } }>;

export function AlertsScreen({ navigation }: { navigation: Nav }) {
  const { user, setOnDuty, logout } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["active-alerts"],
    queryFn: () => api<{ alerts: ActiveAlert[] }>("/alerts/active"),
    refetchInterval: 5_000,
  });

  useEffect(() => { registerForPushAsync(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#f1f5f9" }}>
      <View style={{ backgroundColor: "white", padding: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#e2e8f0" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "600" }}>{user?.name}</Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>{user?.role}</Text>
        </View>
        <Text style={{ marginRight: 8, color: user?.onDuty ? "#16a34a" : "#64748b" }}>
          {user?.onDuty ? "On duty" : "Off duty"}
        </Text>
        <Switch value={user?.onDuty ?? false} onValueChange={setOnDuty} />
        <TouchableOpacity onPress={logout} style={{ marginLeft: 12 }}>
          <Text style={{ color: "#64748b" }}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data?.alerts ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={{ color: "#64748b", textAlign: "center", marginTop: 40 }}>
              No active alerts. All signs are on their hangers.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate("AlertDetail", { id: item.id })}
            style={{
              backgroundColor: "white",
              borderRadius: 10,
              padding: 14,
              marginBottom: 10,
              borderWidth: 1,
              borderColor: item.status === "open" ? "#fca5a5" : "#fcd34d",
            }}
          >
            <Text style={{ fontWeight: "500" }}>
              {(item.floorName ?? "Unknown floor")} — {(item.zoneName ?? "Unassigned")}
            </Text>
            <Text style={{ color: "#64748b", marginTop: 4, fontSize: 12 }}>
              Lifted {timeAgo(item.openedAt)} · {item.status === "open" ? "UNACKNOWLEDGED" : "IN PROGRESS"}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min === 1) return "1 minute ago";
  if (min < 60) return `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  return `${hr} hour${hr === 1 ? "" : "s"} ago`;
}
