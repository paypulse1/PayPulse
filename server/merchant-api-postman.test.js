import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { getBearerToken, hasApiKeyPermission } from "./access.js"

const collectionPath = fileURLToPath(
  new URL(
    "../public/postman/DRPAY-Merchant-API.postman_collection.json",
    import.meta.url,
  ),
)

describe("merchant API Postman collection", () => {
  it("contains only endpoints authorized for merchant-generated API keys", async () => {
    const collection = JSON.parse(await readFile(collectionPath, "utf8"))
    const requests = collection.item.flatMap((folder) => folder.item)

    expect(requests.length).toBeGreaterThan(0)
    for (const { request } of requests) {
      const method = request.method
      const rawUrl =
        typeof request.url === "string" ? request.url : request.url.raw
      const url = rawUrl
        .replace("{{baseUrl}}", "https://api.example.test")
        .replace("{{checkoutCode}}", "a".repeat(40))
      const path = new URL(url).pathname.replace(/^\/v1/, "") || "/"
      const scope = method === "POST" ? "payments:write" : "read"

      expect(
        hasApiKeyPermission(method, path, [scope]),
        `${method} ${path}`,
      ).toBe(true)
    }
  })

  it("parses bearer tokens from the authorization header without accepting other schemes", () => {
    expect(getBearerToken("Bearer drp_sandbox_1234567890abcdef")).toBe(
      "drp_sandbox_1234567890abcdef",
    )
    expect(getBearerToken("  bearer   token.value  ")).toBe("token.value")
    expect(getBearerToken("Basic secret")).toBeNull()
  })

  it("does not export an API key in the collection variables", async () => {
    const collection = JSON.parse(await readFile(collectionPath, "utf8"))
    const apiKey = collection.variable.find(
      (variable) => variable.key === "apiKey",
    )

    expect(apiKey.value).toBe("")
  })
})
