import test from "node:test";
import assert from "node:assert/strict";

import { getSession, saveSession } from "./swiftpay.ts";

class MockStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

function installSessionStorage(storage: MockStorage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

test("getSession rejects malformed session objects", () => {
  const storage = new MockStorage();
  installSessionStorage(storage);
  storage.setItem("drpay_session", JSON.stringify({ accessToken: "abc" }));

  assert.equal(getSession(), null);
  assert.equal(storage.getItem("drpay_session"), null);
});

test("getSession accepts a valid verified session", () => {
  const storage = new MockStorage();
  installSessionStorage(storage);
  const validSession = {
    accessToken: "abc123",
    expiresAt: Date.now() + 60_000,
    email: "merchant@example.com",
    role: "merchant",
  } as const;

  saveSession(validSession);

  assert.deepEqual(getSession(), validSession);
});
