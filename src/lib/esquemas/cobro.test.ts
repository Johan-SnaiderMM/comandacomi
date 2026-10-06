import { describe, expect, it } from "vitest";
import { esquemaCliente, esquemaCobro } from "./cobro";

const U = "123e4567-e89b-42d3-a456-426614174000";
const efectivo = { medio: "efectivo", monto: 24000, recibido: 30000 };

describe("esquema de cobro", () => {
  it("acepta efectivo, transferencia y fiado, y pago mixto", () => {
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [efectivo] }).success).toBe(true);
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: 2500, pagos: [{ medio: "transferencia", monto: 26500, referencia: " M123 " }] }).success).toBe(true);
    expect(
      esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [{ medio: "efectivo", monto: 10000 }, { medio: "fiado", monto: 14000, clienteId: U }] }).success
    ).toBe(true);
  });

  it("recorta la referencia", () => {
    const r = esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [{ medio: "transferencia", monto: 1000, referencia: "  M123  " }] });
    expect(r.success && r.data.pagos[0].referencia).toBe("M123");
  });

  it("rechaza montos no enteros, cero o negativos (COP no usa decimales)", () => {
    for (const monto of [0, -1, 100.5, 1e9]) {
      expect(esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [{ medio: "efectivo", monto }] }).success, String(monto)).toBe(false);
    }
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: 10.5, pagos: [efectivo] }).success).toBe(false);
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: -1, pagos: [efectivo] }).success).toBe(false);
  });

  it("rechaza medios inventados, ids inválidos y cobros sin pagos", () => {
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [{ medio: "bitcoin", monto: 1000 }] }).success).toBe(false);
    expect(esquemaCobro.safeParse({ pedidoId: "x", propina: 0, pagos: [efectivo] }).success).toBe(false);
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [] }).error?.issues[0].message).toMatch(/cómo se paga/);
    expect(esquemaCobro.safeParse({ pedidoId: U, propina: 0, pagos: [{ medio: "fiado", monto: 1000, clienteId: "no" }] }).success).toBe(false);
  });
});

describe("esquema de cliente", () => {
  it("el nombre es obligatorio y el teléfono opcional", () => {
    expect(esquemaCliente.safeParse({ nombre: "  ", telefono: "" }).error?.issues[0].message).toMatch(/nombre/);
    const r = esquemaCliente.safeParse({ nombre: " Pepe Pérez " });
    expect(r.success && r.data).toEqual({ nombre: "Pepe Pérez", telefono: "" });
    expect(esquemaCliente.safeParse({ nombre: "x".repeat(61) }).success).toBe(false);
  });
});
