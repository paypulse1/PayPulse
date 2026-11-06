import { describe, expect, it, vi } from "vitest"
import { createPinnedLookup } from "./pinned-lookup.js"

describe("createPinnedLookup", () => {
  it("returns a pinned address for regular lookup requests", () => {
    const callback = vi.fn()

    createPinnedLookup("203.0.113.8")("example.test", {}, callback)

    expect(callback).toHaveBeenCalledWith(null, "203.0.113.8", 4)
  })

  it("supports callback-style lookup calls without an explicit callback argument", () => {
    const callback = vi.fn()

    createPinnedLookup("198.51.100.7")("example.test", callback)

    expect(callback).toHaveBeenCalledWith(null, "198.51.100.7", 4)
  })

  it("returns a pinned address list when Node requests all addresses", () => {
    const callback = vi.fn()

    createPinnedLookup("2001:4860:4860::8888")(
      "example.test",
      { all: true },
      callback,
    )

    expect(callback).toHaveBeenCalledWith(null, [
      { address: "2001:4860:4860::8888", family: 6 },
    ])
  })

  it("rejects invalid pinned addresses", () => {
    expect(() => createPinnedLookup("not-an-ip")).toThrow(
      "Pinned DNS lookup requires a valid IPv4 or IPv6 address.",
    )
  })
})
