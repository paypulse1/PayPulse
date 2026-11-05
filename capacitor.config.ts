import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ph.drpays.merchant",
  appName: "DRPAY",
  webDir: "dist",
  plugins: {
    PushNotifications: {
      presentationOptions: ["alert", "sound", "badge"],
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
