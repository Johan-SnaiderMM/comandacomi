/**
 * Toda pantalla del personal revisa su permiso al empezar (lib/permisos.ts) y, si no lo hay, muestra <SinPermiso>.
 * Una pantalla nueva que se olvide de hacerlo no le abre nada a nadie (la base rechaza lo que no le toca), pero le
 * mostraría a un mesero una pantalla vacía o con botones que fallan: esta prueba lo evita.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PANTALLAS, type Pantalla } from "@/lib/areas";

const APP = path.join(process.cwd(), "src", "app");
const GRUPOS = ["(app)", "(tarea)", "(cocina)"];
/** Las de todos: cada una se arma con lo que abre quien entra. */
const DE_TODOS = ["/inicio", "/mas"];

function paginas(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return paginas(p);
    return e.name === "page.tsx" ? [p] : [];
  });
}

/** src/app/(tarea)/pedidos/[id]/cobrar/page.tsx → /pedidos/[id]/cobrar */
const rutaDe = (archivo: string) =>
  "/" +
  path
    .relative(APP, path.dirname(archivo))
    .split(path.sep)
    .filter((s) => !/^\(.*\)$/.test(s))
    .join("/");

const TODAS = GRUPOS.flatMap((g) => paginas(path.join(APP, g))).map((archivo) => ({ archivo, ruta: rutaDe(archivo), fuente: fs.readFileSync(archivo, "utf8") }));

describe("cada pantalla del personal revisa su permiso", () => {
  it("se encontraron las pantallas", () => {
    expect(TODAS.length).toBeGreaterThan(12);
  });

  it.each(TODAS.filter((p) => !DE_TODOS.includes(p.ruta)).map((p) => [p.ruta, p]))("%s", (_ruta, p) => {
    const revisa = [...p.fuente.matchAll(/revisarPermiso\("(\w+)"\)/g)].map((m) => m[1]);
    expect(revisa, "llama a revisarPermiso(…)").toHaveLength(1);
    const pantalla = revisa[0] as Pantalla;
    expect(Object.hasOwn(PANTALLAS, pantalla), `"${pantalla}" no está en PANTALLAS`).toBe(true);
    // La regla que usa es la de su ruta (o la de la pantalla de la que cuelga: /fiado/[id] es "fiado").
    const regla = PANTALLAS[pantalla].ruta;
    expect(p.ruta === regla || p.ruta.startsWith(`${regla}/`), `${p.ruta} usa la regla de ${regla}`).toBe(true);
    expect(p.fuente).toContain(`<SinPermiso pantalla="${pantalla}"`);
  });

  it("ninguna regla de PANTALLAS se queda sin su pantalla", () => {
    const usadas = new Set(TODAS.flatMap((p) => [...p.fuente.matchAll(/revisarPermiso\("(\w+)"\)/g)].map((m) => m[1])));
    expect([...usadas].sort()).toEqual(Object.keys(PANTALLAS).sort());
  });
});
