import { describe, expect, it } from "vitest";
import { avanzarDesde, irAPaso, leerGuia, PASOS, pasoEnRuta, pasoTrasNavegar, terminarGuia } from "./guia";

describe("recorrido guiado", () => {
  it("avanza solo cuando el usuario llega a la pantalla que se le pidió", () => {
    expect(pasoTrasNavegar(1, "/pedido/nuevo")).toBe(2); // tocó «Tomar»
    expect(pasoTrasNavegar(2, "/pedidos")).toBe(3); // envió el pedido
    expect(pasoTrasNavegar(3, "/pedidos/abc-123/cobrar")).toBe(4); // tocó «Cobrar»
    expect(pasoTrasNavegar(4, "/fiado")).toBe(5);
    expect(pasoTrasNavegar(7, "/mas")).toBe(8);
  });

  it("no avanza en otras pantallas ni en pasos que se pasan con botón", () => {
    expect(pasoTrasNavegar(1, "/pedidos")).toBe(1);
    expect(pasoTrasNavegar(2, "/pedido/nuevo")).toBe(2);
    expect(pasoTrasNavegar(0, "/inicio")).toBe(0);
    expect(pasoTrasNavegar(8, "/mas")).toBe(8);
  });

  it("cada paso sabe en qué pantalla ocurre y a dónde llevar al usuario", () => {
    for (const [i, p] of PASOS.entries()) {
      expect(p.titulo.length, `paso ${i}`).toBeGreaterThan(0);
      expect(p.ir.startsWith("/"), `paso ${i}`).toBe(true);
      // «Cobra» (paso 4) ocurre en /pedidos/<id>/cobrar, que necesita un pedido: se lleva a Pendientes para elegirlo.
      if (i !== 4) expect(pasoEnRuta(i, p.ir), `paso ${i}: «ir» debe estar dentro de «ruta»`).toBe(true);
    }
  });

  it("la pantalla de destino de cada paso es donde empieza el siguiente", () => {
    // Si el usuario llega a `alLlegarA`, el paso siguiente debe reconocer esa pantalla como suya.
    const muestras: Record<number, string> = { 1: "/pedido/nuevo", 2: "/pedidos", 3: "/pedidos/x/cobrar", 4: "/fiado", 5: "/gastos/nuevo", 6: "/cierre", 7: "/mas" };
    for (const [i, ruta] of Object.entries(muestras)) {
      expect(pasoEnRuta(Number(i) + 1, ruta), `paso ${Number(i) + 1}`).toBe(true);
    }
  });
});

describe("avanzar desde una pantalla de confirmación", () => {
  it("solo avanza si la guía está en ese paso", () => {
    irAPaso(4);
    avanzarDesde(3);
    expect(leerGuia()?.paso).toBe(4);
    avanzarDesde(4); // cobro confirmado
    expect(leerGuia()).toEqual({ paso: 5, abierta: true });
    terminarGuia();
    avanzarDesde(4); // sin guía activa no hace nada
    expect(leerGuia()).toBeNull();
  });
});
