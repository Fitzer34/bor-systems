import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Spill alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF0000",
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== "granted") {
    const r = await Notifications.requestPermissionsAsync();
    status = r.status;
  }
  if (status !== "granted") return null;

  const token = (await Notifications.getDevicePushTokenAsync()).data;
  try {
    await api("/users/me/push-token", { method: "POST", body: JSON.stringify({ pushToken: token }) });
  } catch {
    // backend may be unreachable; will retry on next login
  }
  return token;
}
