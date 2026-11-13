import { describe, expect, it } from "vitest"
import { getMissingRequiredKybDocuments } from "./kyb-review.js"

describe("manual KYB document requirements", () => {
  it("requires business registration and both sides of the owner's ID", () => {
    expect(
      getMissingRequiredKybDocuments([
        "business_registration",
        "identity_front",
      ]),
    ).toEqual(["identity_back"])
  })

  it("accepts the required documents regardless of optional uploads", () => {
    expect(
      getMissingRequiredKybDocuments([
        "business_registration",
        "identity_front",
        "identity_back",
        "proof_of_address",
      ]),
    ).toEqual([])
  })
})
