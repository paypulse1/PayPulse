import { isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { PinSignInStage } from "./MerchantSignInStages"

vi.mock("./lib/swiftpay", () => ({
  hasTrustedDevice: () => true,
  createGoogleLoginChallenge: vi.fn(),
  createTelegramLoginChallenge: vi.fn(),
}))

vi.mock("./lib/biometric", () => ({
  supportsBiometricLogin: () => false,
  hasBiometricLogin: () => false,
}))

type Props = Parameters<typeof PinSignInStage>[0]

function stage(overrides: Partial<Props> = {}) {
  const props: Props = {
    busy: false,
    email: "merchant@example.com",
    error: "",
    onEmailChange: vi.fn(),
    onBiometric: vi.fn(),
    authProviderConfig: null,
    authProviderConfigError: "",
    passkeysSupported: false,
    onPasskey: vi.fn(),
    onGoogleCredential: vi.fn(),
    onTelegramToken: vi.fn(),
    onError: vi.fn(),
    pin: "",
    onPinChange: vi.fn(),
    onSubmit: vi.fn(),
    onForgotPin: vi.fn(),
    onUseDifferentEmail: vi.fn(),
    providerVerified: false,
    emailReadOnly: false,
    ...overrides,
  }
  const root = PinSignInStage(props)
  const elements: ReactElement<Record<string, unknown>>[] = []
  function visit(node: ReactNode) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!isValidElement<Record<string, unknown>>(node)) return
    elements.push(node)
    visit(node.props.children as ReactNode)
  }
  visit(root)
  return { props, root, elements }
}

describe("merchant MPIN sign-in", () => {
  it("retains one secure native input, four masked slots and keyboard/autofill support", () => {
    const { root, elements, props } = stage({ pin: "12" })
    const input = elements.find(
      (node) => node.props.className === "auth-mpin-input",
    )!
    expect(input.props).toMatchObject({
      type: "password",
      inputMode: "none",
      pattern: "[0-9]{4}",
      maxLength: 4,
      autoComplete: "one-time-code",
      required: true,
      value: "12",
    })
    expect(input.props.autoFocus).toBeUndefined()
    const html = renderToStaticMarkup(root)
    expect(html.match(/class="is-filled"/g)).toHaveLength(2)
    expect(html).toContain('class="auth-mpin-slots" aria-hidden="true"')
    expect(html).toContain('aria-label="MPIN keypad"')
    expect(elements.find((node) => node.type === "form")!.props.onSubmit).toBe(
      props.onSubmit,
    )
  })

  it("sanitizes typed or pasted values and limits the MPIN to four digits", () => {
    const { elements, props } = stage()
    const input = elements.find(
      (node) => node.props.className === "auth-mpin-input",
    )!
    const change = input.props.onChange as (event: {
      target: { value: string }
    }) => void
    change({ target: { value: "a1 2-345" } })
    expect(props.onPinChange).toHaveBeenCalledWith("1234")
  })

  it("appends keypad digits and deletes only the last digit without submitting", () => {
    const { elements, props } = stage({ pin: "12" })
    const zero = elements.find(
      (node) => node.props["aria-label"] === "Enter 0",
    )!
    const remove = elements.find(
      (node) => node.props["aria-label"] === "Delete last MPIN digit",
    )!
    expect(zero.props.type).toBe("button")
    const enterZero = zero.props.onClick as () => void
    const deleteLast = remove.props.onClick as () => void
    enterZero()
    deleteLast()
    expect(props.onPinChange).toHaveBeenNthCalledWith(1, "120")
    expect(props.onPinChange).toHaveBeenNthCalledWith(2, "1")
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it("disables input, keypad and recovery while a sign-in is pending", () => {
    const { elements } = stage({ busy: true, pin: "1234", error: "Try again" })
    expect(
      elements.find((node) => node.type === "form")!.props["aria-busy"],
    ).toBe(true)
    for (const node of elements.filter(
      (node) =>
        node.type === "input" ||
        node.props.className === "auth-mpin-key" ||
        node.props.onClick,
    )) {
      expect(node.props.disabled).toBe(true)
    }
    const input = elements.find(
      (node) => node.props.className === "auth-mpin-input",
    )!
    expect(input.props["aria-invalid"]).toBe(true)
    expect(input.props["aria-describedby"]).toBe("signin-pin-help signin-error")
  })

  it("prevents overfilling four slots and disables delete when empty", () => {
    const complete = stage({ pin: "1234" }).elements
    const digits = complete.filter((node) =>
      /^Enter [0-9]$/.test(String(node.props["aria-label"])),
    )
    expect(digits).toHaveLength(10)
    expect(digits.every((node) => node.props.disabled)).toBe(true)
    const empty = stage().elements
    expect(
      empty.find(
        (node) => node.props["aria-label"] === "Delete last MPIN digit",
      )!.props.disabled,
    ).toBe(true)
  })

  it("keeps recovery/account switching and locks provider-verified identity", () => {
    const { elements, props, root } = stage({
      providerVerified: true,
      emailReadOnly: true,
    })
    const email = elements.find((node) => node.props.type === "email")!
    expect(email.props.readOnly).toBe(true)
    expect(
      elements.find((node) => node.props.onClick === props.onForgotPin),
    ).toBeDefined()
    expect(
      elements.find((node) => node.props.onClick === props.onUseDifferentEmail),
    ).toBeDefined()
    expect(renderToStaticMarkup(root)).toContain(
      "Use a different sign-in method",
    )
  })
})
