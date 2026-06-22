import { Stack } from "expo-router";
import { PaywallFlowProvider } from "@/src/paywallFlow";

export default function PaywallLayout() {
  return (
    <PaywallFlowProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#060F09" }, gestureEnabled: false }} />
    </PaywallFlowProvider>
  );
}
