import { describe, expect, it } from "vitest";
import { esperaSiguiente, RITMO_AVISO, RITMO_AVISO_EN_CALMA, RITMO_PENDIENTES, RITMO_PLANCHA, ritmoCombinado } from "./ritmo";

describe("ritmo de las consultas", () => {
  it("empieza en el mínimo y se espacia ×1,5 por vuelta sin cambios, hasta el tope", () => {
    const esperas = [0, 1, 2, 3, 4, 10].map((n) => esperaSiguiente(RITMO_PLANCHA, n));
    expect(esperas).toEqual([4_000, 6_000, 8_000, 8_000, 8_000, 8_000]);
    expect([0, 1, 2, 3, 4].map((n) => esperaSiguiente(RITMO_AVISO, n))).toEqual([5_000, 7_500, 11_250, 16_875, 20_000]);
  });

  it("los topes que se prometieron: plancha 8 s, Pendientes y aviso 20 s, aviso en calma 60 s", () => {
    expect(esperaSiguiente(RITMO_PLANCHA, 99)).toBe(8_000);
    expect(esperaSiguiente(RITMO_PENDIENTES, 99)).toBe(20_000);
    expect(esperaSiguiente(RITMO_AVISO, 99)).toBe(20_000);
    expect(esperaSiguiente(RITMO_AVISO_EN_CALMA, 0)).toBe(60_000);
  });

  it("vueltas negativas o con decimales no rompen la cuenta", () => {
    expect(esperaSiguiente(RITMO_PLANCHA, -3)).toBe(4_000);
    expect(esperaSiguiente(RITMO_PLANCHA, 1.9)).toBe(6_000);
  });

  it("varias partes comparten la consulta: manda la más exigente", () => {
    expect(ritmoCombinado([RITMO_AVISO, RITMO_PLANCHA])).toEqual({ minMs: 4_000, maxMs: 8_000 });
    expect(ritmoCombinado([RITMO_AVISO, RITMO_PENDIENTES])).toEqual({ minMs: 5_000, maxMs: 20_000 });
    expect(ritmoCombinado([RITMO_AVISO_EN_CALMA, RITMO_PENDIENTES])).toEqual({ minMs: 8_000, maxMs: 20_000 });
  });

  it("las que solo escuchan no piden consultas; sin nadie que pida, no hay ritmo", () => {
    expect(ritmoCombinado([null, RITMO_PENDIENTES])).toEqual(RITMO_PENDIENTES);
    expect(ritmoCombinado([null])).toBeNull();
    expect(ritmoCombinado([])).toBeNull();
  });

  it("el tope nunca queda por debajo del mínimo", () => {
    expect(ritmoCombinado([{ minMs: 30_000, maxMs: 60_000 }, { minMs: 50_000, maxMs: 10_000 }])).toEqual({ minMs: 30_000, maxMs: 30_000 });
  });
});
