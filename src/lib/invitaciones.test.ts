import { describe, expect, it } from "vitest";
import { codigoValido, enlaceInvitacion, formatearCodigo, mensajeInvitacion, normalizarCodigo } from "./invitaciones";

describe("código de invitación", () => {
  it("lo escrito se limpia: mayúsculas, sin espacios ni guiones", () => {
    expect(normalizarCodigo(" k7mp-2xq9 ")).toBe("K7MP2XQ9");
    expect(normalizarCodigo("K7MP 2XQ9")).toBe("K7MP2XQ9");
  });

  it("8 caracteres, sin 0/O ni 1/I (los que se confunden)", () => {
    expect(codigoValido("K7MP2XQ9")).toBe(true);
    expect(codigoValido("K7MP2XQ")).toBe(false);
    expect(codigoValido("K7MP2XQ90")).toBe(false);
    expect(codigoValido("K7MP2XO9")).toBe(false);
    expect(codigoValido("K7MP2X19")).toBe(false);
    expect(codigoValido("k7mp2xq9")).toBe(false); // primero se normaliza
  });

  it("se muestra en dos grupos de cuatro", () => {
    expect(formatearCodigo("K7MP2XQ9")).toBe("K7MP-2XQ9");
  });

  it("el enlace y el mensaje llevan el código", () => {
    const enlace = enlaceInvitacion("https://comandacomi.vercel.app/", "K7MP2XQ9");
    expect(enlace).toBe("https://comandacomi.vercel.app/unirme?codigo=K7MP2XQ9");
    const m = mensajeInvitacion({ nombre: "Carlos", restaurante: "Picnic Delicias", enlace, codigo: "K7MP2XQ9" });
    expect(m).toContain("equipo de Picnic Delicias");
    expect(m).toContain(enlace);
    expect(m).toContain("K7MP-2XQ9");
  });
});
