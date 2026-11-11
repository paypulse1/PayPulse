import { describe, expect, it } from "vitest"
import {
  VIRTUAL_ACCOUNT_INSTITUTION_CODE,
  virtualAccountInformationFromProvider,
  virtualAccountInformationFromRow,
} from "./virtual-account-info.js"

describe("Virtual Account information", () => {
  it("maps the documented SwiftPay QR Ph fields and preserves the payment reference", () => {
    expect(
      virtualAccountInformationFromProvider(
        {
          bankAccountNumber: " 120000234109 ",
          instapayBankCode: " CUOBPHM2XXX ",
          referenceNo: "PAY-12345",
        },
        "LOCAL-67890",
      ),
    ).toEqual({
      bankAccountNumber: "120000234109",
      instapayBankCode: "CUOBPHM2XXX",
      referenceNo: "PAY-12345",
    })
  })

  it("uses the local reference when SwiftPay omits its reference", () => {
    expect(
      virtualAccountInformationFromProvider(
        { bankAccountNumber: "120000234109", instapayBankCode: "CUOBPHM2XXX" },
        "LOCAL-67890",
      ).referenceNo,
    ).toBe("LOCAL-67890")
  })

  it("does not expose malformed provider fields", () => {
    expect(
      virtualAccountInformationFromProvider(
        {
          bankAccountNumber: "120\n000",
          instapayBankCode: "X".repeat(33),
          referenceNo: "",
        },
        "LOCAL-67890",
      ),
    ).toEqual({
      bankAccountNumber: undefined,
      instapayBankCode: undefined,
      referenceNo: "LOCAL-67890",
    })
  })

  it("only returns stored details for Virtual Account payment links", () => {
    const row = {
      payment_institution_code: VIRTUAL_ACCOUNT_INSTITUTION_CODE,
      virtual_account_bank_account_number: "120000234109",
      virtual_account_instapay_bank_code: "CUOBPHM2XXX",
      virtual_account_reference_no: "PAY-12345",
      reference_no: "LOCAL-67890",
    }

    expect(virtualAccountInformationFromRow(row)).toEqual({
      bankAccountNumber: "120000234109",
      instapayBankCode: "CUOBPHM2XXX",
      referenceNo: "PAY-12345",
    })
    expect(
      virtualAccountInformationFromRow({
        ...row,
        payment_institution_code: "GCASH",
      }),
    ).toBeUndefined()
  })
})
