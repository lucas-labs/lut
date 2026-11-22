// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ColorPicker, hexToHsv, hsvToHex, parseHex } from "./color-picker"

describe("colour conversions", () => {
  it("reads a hex with or without # in any case, and rejects anything else", () => {
    expect(parseHex("#FF8800")).toBe("#ff8800")
    expect(parseHex(" ff8800 ")).toBe("#ff8800")
    expect(parseHex("#f80")).toBeNull()
    expect(parseHex("red")).toBeNull()
  })

  it.each(["#ff0000", "#00ff00", "#0000ff", "#ff8800", "#123456", "#000000", "#ffffff"])(
    "turns %s into hue, saturation and value and back",
    (hex) => {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  )

  it("places the primary hues", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv("#00ff00").h).toBe(120)
    expect(hexToHsv("#0000ff").h).toBe(240)
    expect(hexToHsv("#808080").s).toBe(0)
  })
})

describe("ColorPicker", () => {
  let host: HTMLElement
  let root: Root
  const onApply = vi.fn<(hex: string) => void>()

  beforeEach(() => {
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    onApply.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const render = (initial: string) =>
    act(async () => root.render(createElement(ColorPicker, { initial, onApply })))
  const hex = () => host.querySelector<HTMLInputElement>('input[aria-label="Hex color"]')
  const apply = () => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Apply")
  const slider = (label: string) => host.querySelector<HTMLElement>(`[role="slider"][aria-label="${label}"]`)
  const key = (el: HTMLElement | null, k: string, shiftKey = false) =>
    act(async () => {
      el?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: k, shiftKey }))
    })
  function type(value: string) {
    const input = hex()
    if (!input) return
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  it("starts from the given colour and applies it", async () => {
    await render("#ff0000")
    expect(hex()?.value).toBe("#ff0000")
    expect(slider("Hue")?.getAttribute("aria-valuenow")).toBe("0")
    await act(async () => apply()?.click())
    expect(onApply).toHaveBeenCalledWith("#ff0000")
  })

  it("keeps Apply off while the hex is not a colour", async () => {
    await render("#ff0000")
    await act(async () => type("#ff00"))
    expect(hex()?.getAttribute("aria-invalid")).toBe("true")
    expect(apply()?.disabled).toBe(true)
    await key(hex(), "Enter")
    expect(onApply).not.toHaveBeenCalled()
  })

  it("follows a typed hex and applies it with Enter", async () => {
    await render("#ff0000")
    await act(async () => type("0000FF"))
    expect(slider("Hue")?.getAttribute("aria-valuenow")).toBe("240")
    await key(hex(), "Enter")
    expect(onApply).toHaveBeenCalledWith("#0000ff")
  })

  it("moves the hue and the saturation with the arrow keys", async () => {
    await render("#ff0000")
    await key(slider("Hue"), "ArrowRight", true)
    expect(slider("Hue")?.getAttribute("aria-valuenow")).toBe("10")
    await key(slider("Saturation and brightness"), "ArrowLeft", true)
    expect(slider("Saturation and brightness")?.getAttribute("aria-valuenow")).toBe("90")
    expect(hex()?.value).not.toBe("#ff0000")
  })
})
