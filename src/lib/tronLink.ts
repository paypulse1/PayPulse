const TRON_MAINNET_CHAIN_ID = "0x2b6653dc"
const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

type TronTransactionResult = {
  txid?: unknown
  txID?: unknown
  transactionHash?: unknown
}

type TronContract = {
  transfer: (
    recipient: string,
    amount: string,
  ) => {
    send: (options: {
      feeLimit: number
      from: string
      shouldPollResponse: boolean
    }) => Promise<unknown>
  }
}

type TronWebClient = {
  ready: boolean
  defaultAddress?: { base58?: string }
  contract: () => {
    at: (address: string) => Promise<TronContract>
  }
}

type TronLinkProvider = {
  isTronLink?: boolean
  request: (request: { method: string }) => Promise<unknown>
  tronWeb?: TronWebClient | false
  on?: (event: "accountsChanged" | "chainChanged", listener: () => void) => void
  removeListener?: (
    event: "accountsChanged" | "chainChanged",
    listener: () => void,
  ) => void
}

declare global {
  interface Window {
    tron?: TronLinkProvider
  }
}

export function parseUsdtAmount(value: string) {
  const normalized = value.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) return null
  const [whole, fraction = ""] = normalized.split(".")
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
}

export async function connectTronLink(expectedAddress: string) {
  const provider = window.tron
  if (!provider?.isTronLink) {
    throw new Error(
      "TronLink was not found. Open DRPAY in the TronLink DApp browser or a browser with the TronLink extension.",
    )
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" })
  const chainId = await provider.request({ method: "eth_chainId" })
  if (chainId !== TRON_MAINNET_CHAIN_ID) {
    throw new Error(
      "Switch TronLink to the TRON mainnet before withdrawing USDT.",
    )
  }
  if (!Array.isArray(accounts) || accounts[0] !== expectedAddress) {
    throw new Error(
      "The connected TronLink account must match your DRPAY-assigned TRON address.",
    )
  }

  const tronWeb = provider.tronWeb
  if (!tronWeb || !tronWeb.ready) {
    throw new Error("TronLink is still connecting. Try again shortly.")
  }
  if (tronWeb.defaultAddress?.base58 !== expectedAddress) {
    throw new Error(
      "The active TronLink account changed. Reconnect your assigned TRON address.",
    )
  }

  return { provider, address: expectedAddress, tronWeb }
}

export function observeTronLinkChanges(onChange: () => void) {
  const provider = window.tron
  if (!provider?.on) return () => {}

  provider.on("accountsChanged", onChange)
  provider.on("chainChanged", onChange)
  return () => {
    provider.removeListener?.("accountsChanged", onChange)
    provider.removeListener?.("chainChanged", onChange)
  }
}

export async function sendUsdtWithTronLink(
  tronWeb: TronWebClient,
  from: string,
  to: string,
  rawAmount: string,
) {
  const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT)
  const result = await contract.transfer(to, rawAmount).send({
    feeLimit: 100_000_000,
    from,
    shouldPollResponse: false,
  })

  const transaction =
    typeof result === "object" && result !== null
      ? result as TronTransactionResult
      : null
  const transactionId =
    typeof result === "string"
      ? result
      : transaction?.txid || transaction?.txID || transaction?.transactionHash

  if (
    typeof transactionId !== "string" ||
    !/^[0-9a-f]{64}$/i.test(transactionId)
  ) {
    throw new Error(
      "TronLink did not return a valid transaction ID. Check your wallet activity before retrying.",
    )
  }
  return transactionId
}
