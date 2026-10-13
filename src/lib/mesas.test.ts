import { describe, expect, it } from "vitest";
import { siguienteNombreDeMesa } from "./mesas";

describe("nombre que se propone para una mesa nueva", () => {
  it("sigue la numeración que ya hay, aunque falten números o estén en desorden", () => {
    expect(siguienteNombreDeMesa(["Mesa 1", "Mesa 2", "Mesa 6"])).toBe("Mesa 7");
    expect(siguienteNombreDeMesa(["mesa 12", " Mesa 3 ", "Barra"])).toBe("Mesa 13");
  });

  it("sin mesas propone la primera; con nombres propios no propone nada", () => {
    expect(siguienteNombreDeMesa([])).toBe("Mesa 1");
    expect(siguienteNombreDeMesa(["Barra", "Terraza", "Mesa grande"])).toBe("");
  });
});
