import { isIP } from "node:net"

export function createPinnedLookup(address) {
  const family = isIP(address)
  if (family === 0) {
    throw new TypeError("Pinned DNS lookup requires a valid IPv4 or IPv6 address.")
  }

  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options
      options = undefined
    }

    if (typeof callback !== "function") {
      return
    }

    if (options && typeof options === "object" && options.all) {
      callback(null, [{ address, family }])
      return
    }

    callback(null, address, family)
  }
}
