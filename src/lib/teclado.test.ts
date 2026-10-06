import { describe, expect, it } from "vitest";
import { aplicarTecla, FILAS_TECLADO, MAX_PESOS, type Tecla } from "./teclado";

const teclear = (teclas: Tecla[], inicial = 0) => teclas.reduce(aplicarTecla, inicial);

describe("teclado numérico", () => {
  it("escribe montos dígito a dígito", () => {
    expect(teclear(["2", "0", "0", "0", "0"])).toBe(20000);
    expect(teclear(["5", "0", "0", "0"])).toBe(5000);
  });

  it("'00' agrega dos ceros de un toque", () => {
    expect(teclear(["2", "0", "00"])).toBe(2000);
    expect(teclear(["5", "00", "0"])).toBe(5000);
    expect(teclear(["00"])).toBe(0); // 0 × 100 sigue en 0: no inventa dígitos
  });

  it("borrar quita el último dígito y se detiene en 0", () => {
    expect(teclear(["1", "2", "5", "borrar"])).toBe(12);
    expect(teclear(["borrar"], 5)).toBe(0);
    expect(teclear(["borrar", "borrar"])).toBe(0);
  });

  it("los ceros a la izquierda no cuentan", () => {
    expect(teclear(["0", "0", "7"])).toBe(7);
  });

  it("no pasa del tope de 8 dígitos (el toque se ignora)", () => {
    expect(teclear(["9", "9", "9", "9", "9", "9", "9", "9"])).toBe(MAX_PESOS);
    expect(aplicarTecla(MAX_PESOS, "9")).toBe(MAX_PESOS);
    expect(aplicarTecla(MAX_PESOS, "00")).toBe(MAX_PESOS);
    expect(aplicarTecla(10_000_000, "00")).toBe(10_000_000);
  });

  it("la disposición tiene 4 filas de 3 teclas y todas las cifras", () => {
    expect(FILAS_TECLADO).toHaveLength(4);
    FILAS_TECLADO.forEach((f) => expect(f).toHaveLength(3));
    const todas = FILAS_TECLADO.flat();
    for (const d of "0123456789") expect(todas).toContain(d);
    expect(todas).toContain("borrar");
  });
});
