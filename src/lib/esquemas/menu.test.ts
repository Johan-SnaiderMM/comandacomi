import { describe, expect, it } from "vitest";
import { ICONOS_CATEGORIA } from "@/lib/iconos-categoria";
import { esquemaCategoria, esquemaDisponibilidad, esquemaProducto } from "./menu";

const U = "123e4567-e89b-42d3-a456-426614174000";

describe("esquema de plato", () => {
  it("acepta un plato nuevo y rellena los valores por defecto", () => {
    const r = esquemaProducto.safeParse({ categoriaId: U, nombre: "  Perro caliente ", precio: 9000 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ id: null, nombre: "Perro caliente", disponible: true, activo: true });
  });

  it("el precio es un entero de pesos: no acepta decimales ni negativos (0 sí: cortesías)", () => {
    expect(esquemaProducto.safeParse({ categoriaId: U, nombre: "X", precio: 9000.5 }).success).toBe(false);
    expect(esquemaProducto.safeParse({ categoriaId: U, nombre: "X", precio: -1 }).success).toBe(false);
    expect(esquemaProducto.safeParse({ categoriaId: U, nombre: "X", precio: 0 }).success).toBe(true);
    expect(esquemaProducto.safeParse({ categoriaId: U, nombre: "X", precio: 10_000_001 }).success).toBe(false);
  });

  it("exige nombre y categoría válidos", () => {
    expect(esquemaProducto.safeParse({ categoriaId: U, nombre: "  ", precio: 1 }).error?.issues[0].message).toMatch(/nombre/);
    expect(esquemaProducto.safeParse({ categoriaId: "x", nombre: "Y", precio: 1 }).error?.issues[0].message).toMatch(/categoría/);
    expect(esquemaProducto.safeParse({ categoriaId: U, nombre: "x".repeat(61), precio: 1 }).success).toBe(false);
  });
});

describe("otros esquemas del menú", () => {
  it("categoría: nombre obligatorio, icono y activa opcionales", () => {
    expect(esquemaCategoria.safeParse({ nombre: "Postres" }).success).toBe(true);
    expect(esquemaCategoria.safeParse({ nombre: " " }).success).toBe(false);
    const r = esquemaCategoria.safeParse({ nombre: "Postres", icono: "🍰" });
    expect(r.success && r.data).toMatchObject({ id: null, icono: "🍰", activa: true });
  });

  it("disponibilidad", () => {
    expect(esquemaDisponibilidad.safeParse({ productoId: U, disponible: false }).success).toBe(true);
    expect(esquemaDisponibilidad.safeParse({ productoId: "x", disponible: false }).success).toBe(false);
  });

  it("hay 12 emojis para elegir, sin repetir", () => {
    expect(ICONOS_CATEGORIA).toHaveLength(12);
    expect(new Set(ICONOS_CATEGORIA).size).toBe(12);
  });
});
