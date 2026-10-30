import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"
import {
  connectTronLink,
  observeTronLinkChanges,
  parseUsdtAmount,
  sendUsdtWithTronLink,
} from "./tronLink"

afterEach(() => {
  vi.unstubAllGlobals()
})

const assignedAddress = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC"
const destinationAddress = "TDvSsdrNM5eeXNL3czpa6AxLDHZA9nwe9K"

test("parses USDT to exact six-decimal base units", () => {
  assert.equal(parseUsdtAmount("0.000001"), 1n)
  assert.equal(parseUsdtAmount("25.005"), 25_005_000n)
  assert.equal(parseUsdtAmount("1.0000001"), null)
  assert.equal(parseUsdtAmount("1e2"), null)
})

test("connects only to the assigned account on TRON mainnet", async () => {
  const provider = {
    isTronLink: true,
    request: async ({ method }: { method: string }) =>
      method === "eth_requestAccounts" ? [assignedAddress] : "0x2b6653dc",
    tronWeb: {
      ready: true,
      defaultAddress: { base58: assignedAddress },
      contract: () => ({
        at: async () => ({
          transfer: () => ({ send: async () => "0".repeat(64) }),
        }),
      }),
    },
  }
  vi.stubGlobal("window", { tron: provider })

  const connection = await connectTronLink(assignedAddress)
  assert.equal(connection.address, assignedAddress)
  await assert.rejects(connectTronLink(destinationAddress))

  vi.stubGlobal("window", {
    tron: { ...provider, request: async () => "0x94a9059e" },
  })
  await assert.rejects(connectTronLink(assignedAddress), /TRON mainnet/)
})

test("clears connected state when TronLink account or network changes", () => {
  const listeners = new Map<string, () => void>()
  const provider = {
    isTronLink: true,
    request: async () => [],
    on: (event: "accountsChanged" | "chainChanged", listener: () => void) => {
      listeners.set(event, listener)
    },
    removeListener: (
      event: "accountsChanged" | "chainChanged",
      listener: () => void,
    ) => {
      if (listeners.get(event) === listener) listeners.delete(event)
    },
  }
  vi.stubGlobal("window", { tron: provider })
  let changed = 0
  const cleanup = observeTronLinkChanges(() => changed++)

  listeners.get("accountsChanged")?.()
  listeners.get("chainChanged")?.()
  assert.equal(changed, 2)

  cleanup()
  assert.equal(listeners.size, 0)
})

test("sends the exact raw USDT amount through the official contract", async () => {
  let contractAddress = ""
  let recipient = ""
  let rawAmount = ""
  let transactionOptions: {
    feeLimit: number
    from: string
    shouldPollResponse: boolean
  } | null = null
  const tronWeb = {
    ready: true,
    contract: () => ({
      at: async (address: string) => {
        contractAddress = address
        return {
          transfer: (to: string, amount: string) => {
            recipient = to
            rawAmount = amount
            return {
              send: async (options: NonNullable<typeof transactionOptions>) => {
                transactionOptions = options
                return "a".repeat(64)
              },
            }
          },
        }
      },
    }),
  }

  const transactionId = await sendUsdtWithTronLink(
    tronWeb,
    assignedAddress,
    destinationAddress,
    "25005000",
  )

  assert.equal(contractAddress, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")
  assert.equal(recipient, destinationAddress)
  assert.equal(rawAmount, "25005000")
  assert.deepEqual(transactionOptions, {
    feeLimit: 100_000_000,
    from: assignedAddress,
    shouldPollResponse: false,
  })
  assert.equal(transactionId, "a".repeat(64))
})
