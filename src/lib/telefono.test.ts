import { describe, expect, it } from "vitest";
import { formatearTelefono } from "./telefono";

describe("formatearTelefono", () => {
  it("celular colombiano en grupos de 3-3-4", () => {
    expect(formatearTelefono("+573001234567")).toBe("300 123 4567");
    expect(formatearTelefono("+573000000105")).toBe("300 000 0105");
  });
  it("otros formatos y vacíos", () => {
    expect(formatearTelefono("+14155550100")).toBe("+14155550100");
    expect(formatearTelefono(null)).toBe("");
    expect(formatearTelefono(undefined)).toBe("");
  });
});
