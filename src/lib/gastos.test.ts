import { describe, expect, it } from "vitest";
import { CATEGORIAS_GASTO, ETIQUETA_CATEGORIA } from "./gastos";

describe("categorías de gasto", () => {
  it("son 10, sin repetir valor ni etiqueta", () => {
    expect(CATEGORIAS_GASTO).toHaveLength(10);
    expect(new Set(CATEGORIAS_GASTO.map((c) => c.valor)).size).toBe(10);
    expect(new Set(CATEGORIAS_GASTO.map((c) => c.etiqueta)).size).toBe(10);
  });

  it("cada una tiene etiqueta en español y 'Otros' va al final", () => {
    for (const c of CATEGORIAS_GASTO) expect(ETIQUETA_CATEGORIA[c.valor]).toBe(c.etiqueta);
    expect(CATEGORIAS_GASTO.at(-1)?.valor).toBe("otros");
  });
});
