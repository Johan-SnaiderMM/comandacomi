import { describe, expect, it } from "vitest";
import { esquemaAnulacion, esquemaCambioEstado, esquemaEnvio } from "./pedido";

const U = "123e4567-e89b-42d3-a456-426614174000";
const item = { productoId: U, cantidad: 1 };

describe("esquema de envío del pedido", () => {
  it("acepta un pedido de mesa válido y rellena los vacíos", () => {
    const r = esquemaEnvio.safeParse({ tipo: "mesa", mesaId: U, items: [item] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.items[0]).toMatchObject({ cantidad: 1, adiciones: [], notas: "" });
      expect(r.data.agregarA).toBeNull();
    }
  });

  it("mesa sin mesa y domicilio sin dirección se rechazan con mensaje claro", () => {
    expect(esquemaEnvio.safeParse({ tipo: "mesa", items: [item] }).error?.issues[0].message).toBe("Elige la mesa.");
    expect(esquemaEnvio.safeParse({ tipo: "domicilio", items: [item] }).error?.issues[0].message).toMatch(/dirección/);
    expect(esquemaEnvio.safeParse({ tipo: "domicilio", direccion: "   ", items: [item] }).success).toBe(false);
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [item] }).success).toBe(true);
  });

  it("rechaza pedidos vacíos, cantidades fuera de rango e ids inválidos", () => {
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [] }).error?.issues[0].message).toMatch(/al menos un plato/);
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [{ ...item, cantidad: 0 }] }).success).toBe(false);
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [{ ...item, cantidad: 100 }] }).success).toBe(false);
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [{ ...item, cantidad: 1.5 }] }).success).toBe(false);
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [{ productoId: "no-es-uuid", cantidad: 1 }] }).success).toBe(false);
    expect(esquemaEnvio.safeParse({ tipo: "volando", items: [item] }).success).toBe(false);
  });

  it("recorta espacios y limita el largo de las notas", () => {
    const r = esquemaEnvio.safeParse({ tipo: "llevar", items: [{ ...item, notas: "  sin cebolla  " }] });
    expect(r.success && r.data.items[0].notas).toBe("sin cebolla");
    expect(esquemaEnvio.safeParse({ tipo: "llevar", items: [{ ...item, notas: "x".repeat(121) }] }).success).toBe(false);
  });

  it("ignora campos de precio que alguien intente colar", () => {
    const r = esquemaEnvio.safeParse({ tipo: "llevar", items: [{ ...item, precio: 1, subtotal: 1 }], total: 1 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(JSON.stringify(r.data)).not.toContain("precio");
      expect(JSON.stringify(r.data)).not.toContain("total");
    }
  });
});

describe("otros esquemas", () => {
  it("cambio de estado", () => {
    expect(esquemaCambioEstado.safeParse({ pedidoId: U, estado: "listo" }).success).toBe(true);
    expect(esquemaCambioEstado.safeParse({ pedidoId: U, estado: "cocinando" }).success).toBe(false);
    expect(esquemaCambioEstado.safeParse({ pedidoId: "x", estado: "listo" }).success).toBe(false);
  });

  it("anulación exige un motivo de al menos 3 caracteres", () => {
    expect(esquemaAnulacion.safeParse({ id: U, motivo: "  ab " }).error?.issues[0].message).toMatch(/motivo/);
    expect(esquemaAnulacion.safeParse({ id: U, motivo: "Cliente se fue" }).success).toBe(true);
    expect(esquemaAnulacion.safeParse({ id: U, motivo: "x".repeat(201) }).success).toBe(false);
  });
});
