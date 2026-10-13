import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { esRutaPublica, zonaDeRuta } from "./rutas-publicas";

describe("rutas públicas (las que ve un cliente sin cuenta)", () => {
  it("pedir y seguimiento lo son, con y sin subruta", () => {
    expect(esRutaPublica("/pedir/picnic-delicias")).toBe(true);
    expect(esRutaPublica("/pedir")).toBe(true);
    expect(esRutaPublica("/seguimiento/123e4567-e89b-42d3-a456-426614174000")).toBe(true);
  });

  it("las pantallas del personal no lo son (ni las que solo se parecen)", () => {
    for (const ruta of ["/", "/inicio", "/pedidos", "/pedidos-en-linea", "/pedido/nuevo", "/plancha", "/sc", "/pedirx", "/seguimientos"]) {
      expect(esRutaPublica(ruta), ruta).toBe(false);
    }
  });

  it("cada ruta sabe a quién le habla (para la pantalla de «no existe»)", () => {
    expect(zonaDeRuta("/pedir/un-local-que-ya-no-esta")).toBe("pedir");
    expect(zonaDeRuta("/pedir")).toBe("pedir");
    expect(zonaDeRuta("/seguimiento/123e4567-e89b-42d3-a456-426614174000")).toBe("seguimiento");
    for (const ruta of ["/", "/inicio", "/cualquier-cosa", "/pedidos/abc/cobrar", "/pedirx", "/seguimientos", "/plancha/otra"]) {
      expect(zonaDeRuta(ruta), ruta).toBe("personal");
    }
  });

  it("el service worker tiene la misma regla (public/sw.js no puede importar este archivo)", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    const regla = /const RUTAS_PUBLICAS = (\/.+\/);/.exec(sw);
    expect(regla, "public/sw.js debe declarar RUTAS_PUBLICAS").not.toBeNull();
    const re = eval(regla![1]) as RegExp; // regla escrita por nosotros en un archivo del repositorio
    for (const ruta of ["/pedir", "/pedir/x", "/seguimiento/abc", "/", "/inicio", "/pedidos", "/pedirx", "/seguimientos", "/pedidos-en-linea"]) {
      expect(re.test(ruta), ruta).toBe(esRutaPublica(ruta));
    }
  });
});
