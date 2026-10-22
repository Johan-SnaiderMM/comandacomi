import { describe, expect, it } from "vitest";
import { esquemaPedidoCliente, esquemaTokenSeguimiento } from "./publico";

const U = "123e4567-e89b-42d3-a456-426614174000";
const base = {
  slug: "picnic-delicias",
  tipo: "llevar" as const,
  nombre: "Marta Gómez",
  telefono: "300 123 4567",
  items: [{ productoId: U, cantidad: 2 }],
  aceptaDatos: true as const,
};

describe("esquema del pedido de un cliente en línea", () => {
  it("sin aceptar la política de datos no pasa (Ley 1581)", () => {
    for (const aceptaDatos of [undefined, false, "si", 1]) {
      const r = esquemaPedidoCliente.safeParse({ ...base, aceptaDatos });
      expect(r.success, String(aceptaDatos)).toBe(false);
      expect(r.error?.issues[0].message).toMatch(/acepta el tratamiento de tus datos/);
    }
  });

  it("acepta un pedido para recoger y rellena los vacíos", () => {
    const r = esquemaPedidoCliente.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.direccion).toBe("");
      expect(r.data.notas).toBe("");
      expect(r.data.items[0]).toMatchObject({ cantidad: 2, adiciones: [], notas: "" });
    }
  });

  it("el domicilio exige dirección; recoger no", () => {
    const sin = esquemaPedidoCliente.safeParse({ ...base, tipo: "domicilio" });
    expect(sin.success).toBe(false);
    expect(sin.error?.issues[0].message).toMatch(/dirección/);
    expect(esquemaPedidoCliente.safeParse({ ...base, tipo: "domicilio", direccion: "  Cra 7  " }).success).toBe(true);
    expect(esquemaPedidoCliente.safeParse({ ...base, tipo: "domicilio", direccion: "abc" }).success).toBe(false);
  });

  it("pide nombre y celular con mensajes claros", () => {
    expect(esquemaPedidoCliente.safeParse({ ...base, nombre: " " }).error?.issues[0].message).toBe("Escribe tu nombre.");
    expect(esquemaPedidoCliente.safeParse({ ...base, telefono: "123" }).error?.issues[0].message).toBe("Escribe tu número de celular.");
  });

  it("no acepta tipos que no son de cliente (mesa) ni pedidos vacíos", () => {
    expect(esquemaPedidoCliente.safeParse({ ...base, tipo: "mesa" }).success).toBe(false);
    expect(esquemaPedidoCliente.safeParse({ ...base, items: [] }).error?.issues[0].message).toMatch(/al menos un plato/);
  });

  it("limita cantidades, adiciones y cantidad de platos", () => {
    expect(esquemaPedidoCliente.safeParse({ ...base, items: [{ productoId: U, cantidad: 21 }] }).success).toBe(false);
    expect(esquemaPedidoCliente.safeParse({ ...base, items: [{ productoId: U, cantidad: 0 }] }).success).toBe(false);
    expect(esquemaPedidoCliente.safeParse({ ...base, items: [{ productoId: U, cantidad: 1, adiciones: Array(9).fill(U) }] }).success).toBe(false);
    expect(esquemaPedidoCliente.safeParse({ ...base, items: Array.from({ length: 31 }, () => ({ productoId: U, cantidad: 1 })) }).success).toBe(false);
  });

  it("el campo trampa 'sitio' rechaza lo que llene un programa", () => {
    expect(esquemaPedidoCliente.safeParse({ ...base, sitio: "" }).success).toBe(true);
    expect(esquemaPedidoCliente.safeParse({ ...base, sitio: "http://spam.example" }).success).toBe(false);
  });

  it("ignora precios o totales que alguien intente colar", () => {
    const r = esquemaPedidoCliente.safeParse({ ...base, total: 1, items: [{ productoId: U, cantidad: 1, precio: 1, subtotal: 1 }] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("total" in r.data).toBe(false);
      expect("precio" in r.data.items[0]).toBe(false);
    }
  });
});

describe("código de seguimiento", () => {
  it("solo acepta un uuid", () => {
    expect(esquemaTokenSeguimiento.safeParse(U).success).toBe(true);
    expect(esquemaTokenSeguimiento.safeParse("123").success).toBe(false);
    expect(esquemaTokenSeguimiento.safeParse("' or 1=1 --").success).toBe(false);
  });
});
