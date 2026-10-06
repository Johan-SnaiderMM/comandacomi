import { describe, expect, it } from "vitest";
import { CATEGORIAS_GASTO } from "@/lib/gastos";
import { esquemaGasto } from "./gasto";

describe("esquema de gasto", () => {
  it("acepta cada categoría y rellena nota y 'de caja'", () => {
    for (const c of CATEGORIAS_GASTO) {
      const r = esquemaGasto.safeParse({ monto: 35000, categoria: c.valor });
      expect(r.success, c.valor).toBe(true);
      if (r.success) expect(r.data).toMatchObject({ nota: "", deCaja: true });
    }
  });

  it("rechaza montos no enteros, cero, negativos o gigantes", () => {
    for (const monto of [0, -5, 12.5, 100_000_000]) {
      expect(esquemaGasto.safeParse({ monto, categoria: "gas" }).success, String(monto)).toBe(false);
    }
    expect(esquemaGasto.safeParse({ monto: 0, categoria: "gas" }).error?.issues[0].message).toMatch(/cuánto fue/);
  });

  it("rechaza categorías inventadas y notas largas; recorta espacios", () => {
    expect(esquemaGasto.safeParse({ monto: 1000, categoria: "lujos" }).error?.issues[0].message).toMatch(/categoría/);
    expect(esquemaGasto.safeParse({ monto: 1000, categoria: "gas", nota: "x".repeat(121) }).success).toBe(false);
    const r = esquemaGasto.safeParse({ monto: 1000, categoria: "gas", nota: "  pipeta  " });
    expect(r.success && r.data.nota).toBe("pipeta");
  });

  it("'de caja' puede ser falso (se pagó por transferencia)", () => {
    const r = esquemaGasto.safeParse({ monto: 1000, categoria: "carnes", deCaja: false });
    expect(r.success && r.data.deCaja).toBe(false);
  });
});
