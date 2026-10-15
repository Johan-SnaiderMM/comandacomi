/**
 * El proxy (el "portero" que renueva la sesión) no corre en las consultas periódicas: así cada consulta es UNA
 * ejecución en Vercel y no dos. Esta prueba fija qué rutas se lo saltan y exige que las que piden sesión la renueven
 * ellas mismas (si no, la plancha, que pasa el día en la misma pantalla, perdería la sesión a la hora).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

const patron = new RegExp(`^${config.matcher[0]}$`);
const pasaPorElProxy = (ruta: string) => patron.test(ruta);

describe("el proxy y las consultas periódicas", () => {
  it("las consultas periódicas no pasan por el proxy", () => {
    expect(pasaPorElProxy("/api/pulso")).toBe(false);
    expect(pasaPorElProxy("/api/plancha")).toBe(false);
    expect(pasaPorElProxy("/api/seguimiento/2b7c1d1e-6a5b-4c3d-9e8f-0a1b2c3d4e5f")).toBe(false);
  });

  it("todo lo demás sí: pantallas, acciones del servidor y las otras rutas", () => {
    for (const ruta of ["/", "/inicio", "/pedidos", "/plancha", "/sc", "/api/foto", "/api/foto-plato", "/pedir/picnic-delicias"]) {
      expect(pasaPorElProxy(ruta), ruta).toBe(true);
    }
    for (const ruta of ["/_next/static/chunks/a.js", "/sw.js", "/icons/192.png", "/manifest.webmanifest"]) {
      expect(pasaPorElProxy(ruta), ruta).toBe(false);
    }
  });

  it("las que piden sesión la renuevan ellas mismas (obtenerUsuario → getClaims)", () => {
    for (const ruta of ["pulso", "plancha"]) {
      const codigo = fs.readFileSync(path.resolve(`src/app/api/${ruta}/route.ts`), "utf8");
      expect(codigo, ruta).toMatch(/await obtenerUsuario\(\)/);
    }
    // El seguimiento es público (sin sesión): no tiene nada que renovar.
    const seguimiento = fs.readFileSync(path.resolve("src/app/api/seguimiento/[token]/route.ts"), "utf8");
    expect(seguimiento).not.toMatch(/obtenerUsuario/);
  });
});
