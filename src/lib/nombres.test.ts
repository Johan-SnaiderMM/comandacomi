import { describe, expect, it } from "vitest";
import { nombreCorto } from "./nombres";

describe("nombreCorto", () => {
  it("usa el primer nombre", () => {
    expect(nombreCorto("Marleny Ríos")).toBe("Marleny");
    expect(nombreCorto("  Luisa   Gómez ")).toBe("Luisa");
    expect(nombreCorto("Camilo")).toBe("Camilo");
  });

  it("respeta Don, Doña, Señor y similares", () => {
    expect(nombreCorto("Don Jairo Cárdenas")).toBe("Don Jairo");
    expect(nombreCorto("Doña Nubia")).toBe("Doña Nubia");
    expect(nombreCorto("doña marta lucía")).toBe("doña marta");
    expect(nombreCorto("Sr. Pérez Gómez")).toBe("Sr. Pérez");
  });

  it("un tratamiento solo (sin nombre) se deja como está; vacío da vacío", () => {
    expect(nombreCorto("Don")).toBe("Don");
    expect(nombreCorto("   ")).toBe("");
  });
});
