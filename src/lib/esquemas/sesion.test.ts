import { describe, expect, it } from "vitest";
import { esquemaClaveNueva, esquemaEntrar } from "./sesion";

describe("entrar con correo y contraseña", () => {
  it("el correo se limpia (espacios y mayúsculas) y debe ser un correo", () => {
    expect(esquemaEntrar.parse({ correo: "  Dona.Marleny@Gmail.com ", clave: "x" }).correo).toBe("dona.marleny@gmail.com");
    expect(esquemaEntrar.safeParse({ correo: "marleny", clave: "x" }).error?.issues[0]?.message).toMatch(/correo completo/);
    expect(esquemaEntrar.safeParse({ correo: "a@b.co", clave: "" }).error?.issues[0]?.message).toMatch(/contraseña/);
  });
});

describe("contraseña nueva", () => {
  it("al menos 8 caracteres y las dos iguales", () => {
    expect(esquemaClaveNueva.safeParse({ clave: "corta", repetir: "corta" }).error?.issues[0]?.message).toMatch(/al menos 8/);
    expect(esquemaClaveNueva.safeParse({ clave: "asadero2026", repetir: "asadero2027" }).error?.issues[0]?.message).toMatch(/no son iguales/);
    expect(esquemaClaveNueva.safeParse({ clave: "asadero2026", repetir: "asadero2026" }).success).toBe(true);
  });
});
