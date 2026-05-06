import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "./src/auth";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AlertsScreen } from "./src/screens/AlertsScreen";
import { AlertDetailScreen } from "./src/screens/AlertDetailScreen";

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });

function Root() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: "Active alerts" }} />
            <Stack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: "Alert" }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  );
}
