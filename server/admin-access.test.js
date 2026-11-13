import { describe, expect, it } from "vitest"
import { canAdminAccess } from "./admin-access.js"

describe("operations staff access", () => {
  it("keeps the super admin unrestricted and auditors read-only", () => {
    expect(canAdminAccess("super_admin", "DELETE", "/v1/admin/staff/1")).toBe(
      true,
    )
    expect(canAdminAccess("auditor", "GET", "/v1/admin/payments")).toBe(true)
    expect(canAdminAccess("auditor", "POST", "/v1/admin/payments")).toBe(
      false,
    )
  })

  it("limits finance and compliance mutations to their respective duties", () => {
    expect(
      canAdminAccess(
        "finance",
        "POST",
        "/v1/admin/payment-links/123/mark-paid",
      ),
    ).toBe(true)
    expect(
      canAdminAccess(
        "finance",
        "PATCH",
        "/v1/admin/merchants/a@example.com/kyb",
      ),
    ).toBe(false)
    expect(
      canAdminAccess(
        "compliance",
        "PATCH",
        "/v1/admin/merchants/a@example.com/kyb/status",
      ),
    ).toBe(true)
    expect(canAdminAccess("compliance", "GET", "/v1/admin/kyb")).toBe(true)
    expect(canAdminAccess("compliance", "PATCH", "/v1/admin/kyb/a@example.com")).toBe(
      false,
    )
    expect(canAdminAccess("super_admin", "PATCH", "/v1/admin/kyb/a@example.com")).toBe(
      true,
    )
    expect(
      canAdminAccess(
        "compliance",
        "POST",
        "/v1/admin/payment-links/123/mark-paid",
      ),
    ).toBe(false)
    expect(
      canAdminAccess(
        "finance",
        "POST",
        "/v1/admin/reconciliation/suspense/123/claim",
      ),
    ).toBe(true)
    expect(
      canAdminAccess(
        "auditor",
        "POST",
        "/v1/admin/reconciliation/suspense/123/resolve",
      ),
    ).toBe(false)
  })

  it("allows only super admins to change merchant maintenance mode", () => {
    expect(
    canAdminAccess("super_admin", "PUT", "/v1/admin/maintenance-mode"),
    ).toBe(true)
    expect(
    canAdminAccess("finance", "PUT", "/v1/admin/maintenance-mode"),
    ).toBe(false)
    expect(
    canAdminAccess("compliance", "PUT", "/v1/admin/maintenance-mode"),
    ).toBe(false)
    expect(
    canAdminAccess("auditor", "PUT", "/v1/admin/maintenance-mode"),
    ).toBe(false)
  })
})
