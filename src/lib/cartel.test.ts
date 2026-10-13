import { describe, expect, it } from "vitest";
import { partirEnRenglones } from "./cartel";

// Para la prueba, cada letra mide 10: "ancho 100" = caben 10 letras por renglón.
const medir = (t: string) => t.length * 10;

describe("el nombre del local en el cartel del QR", () => {
  it("un nombre corto va en un renglón; uno largo se parte por palabras", () => {
    expect(partirEnRenglones(medir, "FLADI", 100)).toEqual(["FLADI"]);
    expect(partirEnRenglones(medir, "LA PLANCHA DE DON BETO", 100)).toEqual(["LA PLANCHA", "DE DON", "BETO"]);
    expect(partirEnRenglones(medir, "  PICNIC   DELICIAS ", 200)).toEqual(["PICNIC DELICIAS"]);
  });

  it("si no cabe en los renglones permitidos, se recorta con puntos suspensivos", () => {
    expect(partirEnRenglones(medir, "LA PLANCHA DE DON BETO", 100, 2)).toEqual(["LA PLANCHA", "DE DON…"]);
  });

  it("una palabra más larga que el renglón se deja entera (no se inventa un corte)", () => {
    expect(partirEnRenglones(medir, "SUPERCALIFRAGILISTICO", 100)).toEqual(["SUPERCALIFRAGILISTICO"]);
    expect(partirEnRenglones(medir, "", 100)).toEqual([]);
  });
});
