import { describe, expect, it } from "vitest";
import {
  alternarNota, aItemsDeEnvio, BORRADOR_VACIO, cantidadDe, claveLinea, DESTINO_INICIAL, etiquetaDestino, faltaEnDestino,
  reducir, subtotalDe, totalBorrador, totalUnidades, type Borrador,
} from "./pedido-borrador";

const burger = { id: "p1", nombre: "Hamburguesa doble", precio: 19000 };
const gaseosa = { id: "p2", nombre: "Gaseosa", precio: 3500 };
const queso = { id: "m1", nombre: "Queso extra", precio: 2000 };
const tocineta = { id: "m2", nombre: "Tocineta", precio: 3000 };

describe("borrador del pedido", () => {
  it("un toque agrega 1; el segundo toque del mismo plato suma cantidad (misma línea)", () => {
    let b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: burger });
    b = reducir(b, { tipo: "agregar", producto: burger });
    expect(b.lineas).toHaveLength(1);
    expect(b.lineas[0].cantidad).toBe(2);
    expect(totalBorrador(b)).toBe(38000);
  });

  it("el mismo plato con otra adición o nota es una línea distinta", () => {
    let b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: burger });
    b = reducir(b, { tipo: "agregar", producto: burger, adiciones: [queso] });
    b = reducir(b, { tipo: "agregar", producto: burger, notas: "Sin cebolla" });
    expect(b.lineas).toHaveLength(3);
    expect(cantidadDe(b, "p1")).toBe(3);
  });

  it("la clave no depende del orden de las adiciones ni de mayúsculas/espacios en la nota", () => {
    expect(claveLinea("p1", ["b", "a"], " Sin Cebolla ")).toBe(claveLinea("p1", ["a", "b"], "sin cebolla"));
  });

  it("total = (precio + adiciones) × cantidad, sumado", () => {
    let b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: burger, adiciones: [queso, tocineta], cantidad: 2 });
    b = reducir(b, { tipo: "agregar", producto: gaseosa });
    expect(subtotalDe(b.lineas[0])).toBe((19000 + 2000 + 3000) * 2);
    expect(totalBorrador(b)).toBe(48000 + 3500);
    expect(totalUnidades(b)).toBe(3);
  });

  it("cambiar cantidad: sube, baja y al llegar a 0 la línea desaparece; tope 99", () => {
    let b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: burger });
    const clave = b.lineas[0].clave;
    b = reducir(b, { tipo: "cambiar", clave, delta: 2 });
    expect(b.lineas[0].cantidad).toBe(3);
    b = reducir(b, { tipo: "cambiar", clave, delta: -3 });
    expect(b.lineas).toHaveLength(0);

    b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: gaseosa, cantidad: 98 });
    b = reducir(b, { tipo: "cambiar", clave: b.lineas[0].clave, delta: 5 });
    expect(b.lineas[0].cantidad).toBe(99);
  });

  it("quitar, vaciar y restaurar", () => {
    let b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: burger });
    b = reducir(b, { tipo: "agregar", producto: gaseosa });
    b = reducir(b, { tipo: "quitar", clave: b.lineas[0].clave });
    expect(b.lineas.map((l) => l.productoId)).toEqual(["p2"]);
    const guardado: Borrador = b;
    expect(reducir(b, { tipo: "vaciar" })).toEqual(BORRADOR_VACIO);
    expect(reducir(BORRADOR_VACIO, { tipo: "restaurar", borrador: guardado })).toEqual(guardado);
  });

  it("al servidor se envían ids y cantidades, nunca precios", () => {
    const b = reducir(BORRADOR_VACIO, { tipo: "agregar", producto: burger, adiciones: [queso], notas: "Sin cebolla", cantidad: 2 });
    const items = aItemsDeEnvio(b);
    expect(items).toEqual([{ productoId: "p1", cantidad: 2, adiciones: ["m1"], notas: "Sin cebolla" }]);
    expect(JSON.stringify(items)).not.toContain("19000");
  });
});

describe("destino del pedido", () => {
  it("la mesa y la dirección son obligatorias según el tipo", () => {
    expect(faltaEnDestino(DESTINO_INICIAL)).toBe("Elige la mesa.");
    expect(faltaEnDestino({ ...DESTINO_INICIAL, mesaId: "m" })).toBeNull();
    expect(faltaEnDestino({ ...DESTINO_INICIAL, tipo: "llevar" })).toBeNull();
    expect(faltaEnDestino({ ...DESTINO_INICIAL, tipo: "domicilio" })).toMatch(/dirección/);
    expect(faltaEnDestino({ ...DESTINO_INICIAL, tipo: "domicilio", direccion: "  " })).toMatch(/dirección/);
    expect(faltaEnDestino({ ...DESTINO_INICIAL, tipo: "domicilio", direccion: "Cra 1 #2-3" })).toBeNull();
  });

  it("etiqueta corta para el botón", () => {
    expect(etiquetaDestino(DESTINO_INICIAL, null)).toBe("Elegir mesa");
    expect(etiquetaDestino({ ...DESTINO_INICIAL, mesaId: "m" }, "Mesa 3")).toBe("Mesa 3");
    expect(etiquetaDestino({ ...DESTINO_INICIAL, mesaId: "m", agregarA: "p" }, "Mesa 3")).toBe("Mesa 3 · agregar");
    expect(etiquetaDestino({ ...DESTINO_INICIAL, tipo: "llevar" }, null)).toBe("Para llevar");
    expect(etiquetaDestino({ ...DESTINO_INICIAL, tipo: "llevar", contactoNombre: "Daniela" }, null)).toBe("Llevar · Daniela");
    expect(etiquetaDestino({ ...DESTINO_INICIAL, tipo: "domicilio" }, null)).toBe("Domicilio");
  });
});

describe("notas rápidas", () => {
  it("alterna una nota en el texto sin duplicar", () => {
    let t = alternarNota("", "Sin cebolla");
    expect(t).toBe("Sin cebolla");
    t = alternarNota(t, "Sin salsa");
    expect(t).toBe("Sin cebolla, Sin salsa");
    t = alternarNota(t, "sin cebolla");
    expect(t).toBe("Sin salsa");
    expect(alternarNota("Sin salsa", "Sin salsa")).toBe("");
  });
});
