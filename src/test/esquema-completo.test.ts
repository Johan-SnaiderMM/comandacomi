import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error: script de Node sin tipos
import { construir } from "../../scripts/unir-migraciones.mjs";

describe("supabase/esquema-completo.sql", () => {
  it("está al día con las migraciones (si falla: npm run esquema)", async () => {
    const esperado: string = await construir();
    const actual = fs.readFileSync(path.join(process.cwd(), "supabase", "esquema-completo.sql"), "utf8").replace(/\r\n/g, "\n");
    expect(actual).toBe(esperado);
  });
});
