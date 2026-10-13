import { describe, expect, it } from "vitest";
import { veredictoDelDia } from "./inicio";

describe("¿voy ganando hoy?", () => {
  it("responde según ventas y gastos", () => {
    expect(veredictoDelDia(0, 0).titulo).toBe("Día sin movimiento");
    expect(veredictoDelDia(100000, 60000)).toMatchObject({ titulo: "Hoy vas ganando", tono: "bien" });
    expect(veredictoDelDia(60000, 60000).titulo).toBe("Hoy vas parejo");
    expect(veredictoDelDia(20000, 60000)).toMatchObject({ titulo: "Aún no cubres los gastos", tono: "alerta" });
  });

  it("un día que el dueño ya cerró no es un «día sin movimiento»", () => {
    expect(veredictoDelDia(0, 0, true)).toMatchObject({ titulo: "Día cerrado", tono: "neutro" });
    // Si después de cerrar se vendió algo, vuelve la respuesta de siempre (ya es la jornada siguiente).
    expect(veredictoDelDia(15000, 0, true).titulo).toBe("Hoy vas ganando");
  });
});
