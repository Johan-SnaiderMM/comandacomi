/**
 * Cuida la velocidad en gama baja: lo que se descarga en el celular debe ser poco.
 * Zod (validación) es solo del servidor: ningún componente "use client" puede importarlo, ni directa ni
 * indirectamente (esto ya pasó una vez: una constante en un archivo de esquemas metió 390 KB en el navegador).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.join(process.cwd(), "src");

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const TODOS = archivos(RAIZ);
const CONTENIDO = new Map(TODOS.map((f) => [f, fs.readFileSync(f, "utf8")]));

function resolver(desde: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(RAIZ, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(desde), spec) : null;
  if (!base) return null;
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (CONTENIDO.has(cand)) return cand;
  }
  return null;
}

function importaciones(archivo: string): string[] {
  const src = CONTENIDO.get(archivo) ?? "";
  // "import … from 'x'" y "import 'x'"; se ignoran los `import type` (no llegan al navegador).
  return [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

function arrastraZod(archivo: string, vistos = new Set<string>()): string[] | null {
  if (vistos.has(archivo)) return null;
  vistos.add(archivo);
  for (const spec of importaciones(archivo)) {
    if (spec === "zod" || spec.startsWith("zod/")) return [archivo];
    const dest = resolver(archivo, spec);
    if (dest && !(CONTENIDO.get(dest) ?? "").startsWith('"use server"')) {
      const cadena = arrastraZod(dest, vistos);
      if (cadena) return [archivo, ...cadena];
    }
  }
  return null;
}

describe("peso de lo que se descarga en el celular", () => {
  const clientes = TODOS.filter((f) => (CONTENIDO.get(f) ?? "").trimStart().startsWith('"use client"'));

  it("hay componentes de cliente que revisar", () => {
    expect(clientes.length).toBeGreaterThan(20);
  });

  it.each(clientes.map((f) => [path.relative(RAIZ, f), f]))("%s no arrastra Zod al navegador", (_nombre, archivo) => {
    const cadena = arrastraZod(archivo);
    expect(cadena?.map((c) => path.relative(RAIZ, c)).join(" → ")).toBeUndefined();
  });

  it("los componentes de cliente no importan código de servidor (server-only)", () => {
    for (const f of clientes) {
      for (const spec of importaciones(f)) {
        const dest = resolver(f, spec);
        const src = dest ? (CONTENIDO.get(dest) ?? "") : "";
        expect(src.includes('import "server-only"'), `${path.relative(RAIZ, f)} importa ${spec}, que es solo de servidor`).toBe(false);
      }
    }
  });
});
