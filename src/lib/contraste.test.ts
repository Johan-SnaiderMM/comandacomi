/**
 * Contraste de la paleta (WCAG 2.x) en modo claro Y en modo oscuro: los pares de color que la app usa de verdad, calculados
 * con la fórmula, no a ojo. Si cambias un token de `globals.css`, esto avisa si deja de leerse. Se usa al sol y de pie.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (...partes: string[]) => fs.readFileSync(path.join(process.cwd(), ...partes), "utf8").replace(/\r\n/g, "\n");

const css = leer("src", "app", "globals.css");
const bloque = (re: RegExp): string => {
  const m = css.match(re);
  if (!m) throw new Error(`globals.css no tiene ${re}`);
  return m[1];
};
const colores = (texto: string): Record<string, string> =>
  Object.fromEntries([...texto.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));

const CLARO = colores(bloque(/@theme \{([^}]*)\}/));
const BLOQUE_AUTO = bloque(/:root:not\(\[data-tema="claro"\]\) \{([^}]*)\}/);
const BLOQUE_FIJO = bloque(/:root\[data-tema="oscuro"\] \{([^}]*)\}/);
// El modo oscuro solo cambia algunos tokens: el resto (sol…) vale igual.
const OSCURO = { ...CLARO, ...colores(BLOQUE_FIJO) };
const BLANCO = "#ffffff";
const TINTA_FIJA = "#16140f";
const AJI_SOLIDO = "#c8261a";
const LISTO_SOLIDO = "#12703a";

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const MODOS: [string, Record<string, string>][] = [
  ["claro", CLARO],
  ["oscuro", OSCURO],
];

describe("la paleta de globals.css", () => {
  it("trae los tokens que usa la app, en claro y en oscuro", () => {
    for (const [, t] of MODOS) {
      for (const n of ["tinta", "tinta-2", "fondo", "papel", "marco", "sol", "sol-suave", "aji", "aji-suave", "listo", "listo-suave"]) {
        expect(t[n], n).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("calcula bien: negro sobre blanco es 21:1 y #777 sobre blanco no llega a 4,5", () => {
    expect(contraste("#000000", BLANCO)).toBeCloseTo(21, 5);
    expect(contraste("#777777", BLANCO)).toBeLessThan(4.5);
  });

  it("el modo oscuro de «seguir al celular» y el de «fijarlo» llevan los mismos colores", () => {
    const normal = (t: string) => t.replace(/\s+/g, " ").trim();
    expect(normal(BLOQUE_AUTO)).toBe(normal(BLOQUE_FIJO));
  });

  it("el texto llega a AA (4,5:1) sobre cada fondo donde se usa", () => {
    for (const [modo, t] of MODOS) {
      for (const f of [t.papel, t.fondo]) {
        for (const texto of ["tinta", "tinta-2", "aji", "listo"]) {
          expect(contraste(t[texto], f), `${texto} sobre ${f} (${modo})`).toBeGreaterThanOrEqual(4.5);
        }
      }
      // Las manchas suaves (deuda, listo, aviso) llevan texto de su mismo tono y la tinta.
      expect(contraste(t.tinta, t["sol-suave"]), `tinta sobre sol-suave (${modo})`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.aji, t["aji-suave"]), `aji sobre aji-suave (${modo})`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.tinta, t["aji-suave"]), `tinta sobre aji-suave (${modo})`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.listo, t["listo-suave"]), `listo sobre listo-suave (${modo})`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.tinta, t["listo-suave"]), `tinta sobre listo-suave (${modo})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sobre un relleno fuerte la letra llega a AA: tinta fija sobre sol, blanco sobre aji y listo sólidos", () => {
    for (const [modo, t] of MODOS) {
      expect(contraste(TINTA_FIJA, t.sol), `tinta sobre sol (${modo})`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(BLANCO, AJI_SOLIDO), `blanco sobre aji (${modo})`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(BLANCO, LISTO_SOLIDO), `blanco sobre listo (${modo})`).toBeGreaterThanOrEqual(4.5);
      // Un botón oscuro (`bg-tinta text-papel`) se lee en los dos modos.
      expect(contraste(t.papel, t.tinta), `papel sobre tinta (${modo})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("los bordes de 2 px y el anillo de foco (tinta) llegan a 3:1 sobre el papel y el fondo", () => {
    for (const [modo, t] of MODOS) {
      for (const f of [t.papel, t.fondo]) expect(contraste(t.tinta, f), `tinta sobre ${f} (${modo})`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los rellenos fuertes vuelven a su tono en modo oscuro (reglas de globals.css)", () => {
    expect(css).toContain(`--color-aji: ${AJI_SOLIDO};`);
    expect(css).toContain(`--color-listo: ${LISTO_SOLIDO};`);
    expect(css).toContain(`--color-tinta: ${TINTA_FIJA};`);
  });
});

describe("las clases que no deben volver", () => {
  const fuentes: [string, string][] = [];
  (function recorrer(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (/\.(tsx|css)$/.test(e.name)) fuentes.push([ruta, fs.readFileSync(ruta, "utf8")]);
    }
  })(path.join(process.cwd(), "src"));

  it("nadie pinta con blanco o negro fijos: se usan los tokens para que el modo oscuro funcione", () => {
    for (const [ruta, codigo] of fuentes) {
      expect(codigo, ruta).not.toMatch(/\b(?:bg|border|text|divide|ring|outline|fill|stroke)-(?:white|black)\b/);
    }
  });
});
