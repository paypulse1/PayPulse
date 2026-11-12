import { Capacitor } from "@capacitor/core";
import { AccessControl, NativeBiometric } from "@capgo/capacitor-native-biometric";

const ENABLED_PREFIX = "drpay_biometric_enabled_";
const DISMISSED_PREFIX = "drpay_biometric_offer_dismissed_";

function credentialServer(email: string) {
  return `drpay-merchant://${encodeURIComponent(email.trim().toLowerCase())}`;
}

export function supportsBiometricLogin() {
  return Capacitor.getPlatform() === "android";
}

export async function isBiometricLoginAvailable() {
  if (!supportsBiometricLogin()) return false;
  const availability = await NativeBiometric.isAvailable({ useFallback: false });
  return availability.strongBiometryIsAvailable;
}

export function hasBiometricLogin(email: string) {
  return localStorage.getItem(`${ENABLED_PREFIX}${email.trim().toLowerCase()}`) === "true";
}

export function wasBiometricOfferDismissed(email: string) {
  return localStorage.getItem(`${DISMISSED_PREFIX}${email.trim().toLowerCase()}`) === "true";
}

export function markBiometricOfferDismissed(email: string) {
  localStorage.setItem(`${DISMISSED_PREFIX}${email.trim().toLowerCase()}`, "true");
}

export function markBiometricLoginEnabled(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  localStorage.setItem(`${ENABLED_PREFIX}${normalizedEmail}`, "true");
  localStorage.removeItem(`${DISMISSED_PREFIX}${normalizedEmail}`);
}

export function markBiometricLoginDisabled(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  localStorage.removeItem(`${ENABLED_PREFIX}${normalizedEmail}`);
  localStorage.setItem(`${DISMISSED_PREFIX}${normalizedEmail}`, "true");
}

export function createBiometricSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function storeBiometricSecret(email: string, secret: string) {
  await NativeBiometric.setCredentials({
    username: email.trim().toLowerCase(),
    password: secret,
    server: credentialServer(email),
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
    authValidityDuration: 0,
    title: "Enable DRPAY biometric sign-in",
  });
}

export async function readBiometricSecret(
  email: string,
  purpose: "sign-in" | "transfer" = "sign-in",
) {
  const isTransfer = purpose === "transfer"
  const credentials = await NativeBiometric.getSecureCredentials({
    server: credentialServer(email),
    title: isTransfer ? "Authorize transfer" : "Sign in to DRPAY",
    subtitle: isTransfer
      ? "Confirm the transfer with your enrolled biometric"
      : "Confirm your identity to access your merchant account",
    description: isTransfer
      ? "Use your enrolled biometric to approve this transfer."
      : "Use your enrolled biometric to continue.",
    negativeButtonText: isTransfer ? "Cancel" : "Use MPIN",
    maxAttempts: 3,
  });
  if (credentials.username !== email.trim().toLowerCase() || !/^[A-Za-z0-9_-]{43}$/.test(credentials.password)) {
    throw new Error("Biometric sign-in credentials are invalid. Use your MPIN or verify this device by email.");
  }
  return credentials.password;
}

export async function deleteBiometricSecret(email: string) {
  await NativeBiometric.deleteCredentials({ server: credentialServer(email) });
}
