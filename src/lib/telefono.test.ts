import { describe, expect, it } from "vitest";
import { esTelefonoDeEjemplo, formatearTelefono } from "./telefono";

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

describe("esTelefonoDeEjemplo", () => {
  it("reconoce el bloque inventado de la demo", () => {
    expect(esTelefonoDeEjemplo("+573000000101")).toBe(true);
    expect(esTelefonoDeEjemplo("+573000000108")).toBe(true);
  });
  it("no marca números reales ni vacíos", () => {
    expect(esTelefonoDeEjemplo("+573001234567")).toBe(false);
    expect(esTelefonoDeEjemplo("+573104445566")).toBe(false);
    expect(esTelefonoDeEjemplo(null)).toBe(false);
  });
});
