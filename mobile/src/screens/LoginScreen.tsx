import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../auth";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await login(email, password);
    } catch {
      setErr("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f1f5f9" }}>
      <View style={{ backgroundColor: "white", padding: 24, borderRadius: 12, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "600" }}>HazardLink</Text>
        <Text style={{ color: "#64748b" }}>Sign in</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        <TextInput
          secureTextEntry
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          style={{ borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        {err && <Text style={{ color: "#dc2626" }}>{err}</Text>}
        <TouchableOpacity
          onPress={onSubmit}
          disabled={busy}
          style={{ backgroundColor: "#0f172a", borderRadius: 6, paddingVertical: 12, alignItems: "center", opacity: busy ? 0.5 : 1 }}
        >
          {busy ? <ActivityIndicator color="white" /> : <Text style={{ color: "white", fontWeight: "500" }}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
