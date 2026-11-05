import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ph.drpay.merchant",
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
