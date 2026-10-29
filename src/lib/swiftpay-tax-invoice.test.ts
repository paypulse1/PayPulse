import assert from "node:assert/strict"
import { afterEach, test, vi } from "vitest"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

test("uploads tax invoice PDFs through the authenticated API", async () => {
  vi.stubEnv("VITE_DRPAY_BACKEND_URL", "https://api.example.test")
  vi.stubGlobal("sessionStorage", {
    getItem: () =>
      JSON.stringify({
        accessToken: "admin-token",
        expiresAt: Date.now() + 60_000,
        email: "admin@example.test",
        role: "super_admin",
      }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })
  vi.stubGlobal("window", {
    location: {
      hostname: "admin.example.test",
      origin: "https://admin.example.test",
    },
  })

  const requests: { url: string; options?: RequestInit }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ url: String(input), options })
      const body =
        requests.length === 1
          ? { uploadId: "c1b6c674-4297-4e51-95a8-19fa7e2157c3", fileName: "form.pdf", completed: false }
          : requests.length === 2
            ? { uploadId: "c1b6c674-4297-4e51-95a8-19fa7e2157c3" }
            : { code: "checkout-code", paymentUrl: "https://pay.example.test" }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }),
  )

  const { createAdminTaxInvoice } = await import("./swiftpay.ts")
  const attachment = new File(["%PDF-1.7\ninvoice"], "form.pdf", {
    type: "application/pdf",
  })
  await createAdminTaxInvoice(
    {
      description: "BIR Form 2307",
      amount: 125,
      customerEmail: "customer@example.test",
      payeeName: "",
      payeeTin: "",
      payeeAddress: "",
      payorName: "",
      payorTin: "",
      payorAddress: "",
    },
    "tax-invoice-test",
    attachment,
  )

  assert.equal(requests.length, 3)
  assert.equal(
    requests[1].url,
    "https://api.example.test/v1/admin/tax-invoice-attachments/c1b6c674-4297-4e51-95a8-19fa7e2157c3",
  )
  assert.equal(requests[1].options?.method, "POST")
  assert.equal(
    new Headers(requests[1].options?.headers).get("Content-Type"),
    "application/pdf",
  )
  assert.equal(requests[1].options?.body, attachment)
  assert.equal(
    requests[2].url,
    "https://api.example.test/v1/admin/tax-invoices",
  )
})
