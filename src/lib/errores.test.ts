import { describe, expect, it } from "vitest";
import { esFalloPasajero, mensajeDeError, MENSAJE_GENERICO } from "./errores";

describe("fallo pasajero o rechazo definitivo", () => {
  it("lo que la base rechaza por una regla o por los datos NO se reintenta", () => {
    for (const codigo of ["P0001", "P0002", "42501", "23505", "23503", "23514", "22P02", "42883", "PGRST202"]) {
      expect(esFalloPasajero(codigo), codigo).toBe(false);
    }
  });

  it("lo que no llegó a la base o la encontró ocupada SÍ se reintenta", () => {
    for (const codigo of ["", undefined, "PGRST000", "PGRST003", "08006", "40001", "40P01", "53300", "57014", "57P01", "55P03"]) {
      expect(esFalloPasajero(codigo), String(codigo)).toBe(true);
    }
  });
});

describe("mensaje para la pantalla", () => {
  it("los errores de negocio se muestran tal cual y los técnicos se cambian por uno genérico", () => {
    expect(mensajeDeError({ codigo: "P0001", mensaje: "Este pedido ya está cobrado." })).toBe("Este pedido ya está cobrado.");
    expect(mensajeDeError({ codigo: "42501", mensaje: "Solo el dueño puede hacer esto." })).toBe("Solo el dueño puede hacer esto.");
    expect(mensajeDeError({ codigo: "42501", mensaje: "permission denied for table pedidos" })).toBe(MENSAJE_GENERICO);
    expect(mensajeDeError({ codigo: "57014", mensaje: "canceling statement due to statement timeout" })).toBe(MENSAJE_GENERICO);
    expect(mensajeDeError({ mensaje: "TypeError: fetch failed" })).toBe(MENSAJE_GENERICO);
  });
});
