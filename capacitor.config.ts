import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: process.env.DRPAY_ANDROID_APP_ID || "com.paypulse.merchant",
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
}

export default config
