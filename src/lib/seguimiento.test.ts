import { describe, expect, it } from "vitest";
import type { EtapaPedido, SeguimientoPublico } from "@/lib/publico/tipos";
import { intervaloDeConsulta, minutosRestantes, pasosDeSeguimiento, progresoDePlatos, seguimientoTerminado } from "./seguimiento";

const AHORA = "2026-10-12T15:30:00.000Z";

function seguimiento(etapa: EtapaPedido, extra: Partial<SeguimientoPublico["pedido"]> = {}): SeguimientoPublico {
  return {
    ahora: AHORA,
    restaurante: { nombre: "Picnic Delicias", slug: "picnic-delicias" },
    pedido: {
      numero: 42,
      tipo: "llevar",
      origen: "cliente",
      etapa,
      created_at: "2026-10-12T15:00:00.000Z",
      confirmado_at: etapa === "por_confirmar" ? null : "2026-10-12T15:02:00.000Z",
      listo_at: null,
      entregado_at: null,
      tiempo_estimado_min: null,
      total: 25000,
      contacto_nombre: "Marta",
      direccion: null,
      motivo: null,
      ...extra,
    },
    items: [],
  };
}

describe("pasos del seguimiento", () => {
  it("por confirmar: solo 'enviado' está hecho y es el actual", () => {
    const pasos = pasosDeSeguimiento(seguimiento("por_confirmar"));
    expect(pasos.map((p) => p.hecho)).toEqual([true, false, false, false, false]);
    expect(pasos.map((p) => p.actual)).toEqual([true, false, false, false, false]);
  });

  it("preparando: aceptado hecho, 'preparando' es el actual", () => {
    const pasos = pasosDeSeguimiento(seguimiento("preparando"));
    expect(pasos.map((p) => p.hecho)).toEqual([true, true, false, false, false]);
    expect(pasos.find((p) => p.actual)?.clave).toBe("preparando");
    expect(pasos[1].hora).toBe("2026-10-12T15:02:00.000Z");
  });

  it("listo: el paso 'listo' es el actual y cambia el texto según sea domicilio o recoger", () => {
    const recoger = pasosDeSeguimiento(seguimiento("listo", { listo_at: "2026-10-12T15:20:00.000Z" }));
    expect(recoger.find((p) => p.actual)?.clave).toBe("listo");
    expect(recoger.find((p) => p.clave === "listo")?.etiqueta).toBe("Listo para recoger");
    const domicilio = pasosDeSeguimiento(seguimiento("listo", { tipo: "domicilio" }));
    expect(domicilio.find((p) => p.clave === "listo")?.etiqueta).toMatch(/hacia tu dirección/);
  });

  it("entregado: todo hecho", () => {
    const pasos = pasosDeSeguimiento(seguimiento("entregado"));
    expect(pasos.every((p) => p.hecho)).toBe(true);
  });

  it("cancelado: solo queda 'enviado' (no hay camino que seguir)", () => {
    const pasos = pasosDeSeguimiento(seguimiento("cancelado"));
    expect(pasos).toHaveLength(1);
    expect(pasos[0].actual).toBe(false);
  });
});

describe("tiempo restante", () => {
  it("cuenta desde que el restaurante aceptó, con la hora del servidor", () => {
    // aceptado 15:02 + 20 min = 15:22; ahora 15:30 → ya pasó
    expect(minutosRestantes(seguimiento("preparando", { tiempo_estimado_min: 20 }))).toBe(0);
    // aceptado 15:02 + 45 min = 15:47; ahora 15:30 → faltan 17
    expect(minutosRestantes(seguimiento("preparando", { tiempo_estimado_min: 45 }))).toBe(17);
  });

  it("redondea hacia arriba los minutos a medias", () => {
    const s = seguimiento("preparando", { tiempo_estimado_min: 30 });
    expect(minutosRestantes({ ...s, ahora: "2026-10-12T15:31:30.000Z" })).toBe(1); // faltan 30 s
  });

  it("es null sin estimación o fuera de la preparación", () => {
    expect(minutosRestantes(seguimiento("preparando"))).toBeNull();
    expect(minutosRestantes(seguimiento("por_confirmar", { tiempo_estimado_min: 20 }))).toBeNull();
    expect(minutosRestantes(seguimiento("listo", { tiempo_estimado_min: 20 }))).toBeNull();
  });
});

describe("progreso de platos", () => {
  it("cuenta unidades: 2 hamburguesas listas + 1 papas sin hacer = 2 de 3", () => {
    const r = progresoDePlatos([
      { cantidad: 2, listo: true },
      { cantidad: 1, listo: false },
    ]);
    expect(r).toEqual({ listos: 2, total: 3, lineasListas: 1, lineas: 2 });
  });

  it("un pedido sin platos no rompe", () => {
    expect(progresoDePlatos([])).toEqual({ listos: 0, total: 0, lineasListas: 0, lineas: 0 });
  });
});

describe("cuándo dejar de consultar y cada cuánto", () => {
  it("entregado y cancelado terminan; el resto sigue", () => {
    expect(seguimientoTerminado("entregado")).toBe(true);
    expect(seguimientoTerminado("cancelado")).toBe(true);
    expect(seguimientoTerminado("por_confirmar")).toBe(false);
    expect(seguimientoTerminado("preparando")).toBe(false);
    expect(seguimientoTerminado("listo")).toBe(false);
  });

  it("consulta más seguido al principio y más espaciado si lleva rato igual", () => {
    expect(intervaloDeConsulta(0)).toBe(8_000);
    expect(intervaloDeConsulta(119.9)).toBe(8_000);
    expect(intervaloDeConsulta(120)).toBe(11_000);
    expect(intervaloDeConsulta(599.9)).toBe(11_000);
    expect(intervaloDeConsulta(600)).toBe(20_000);
    expect(intervaloDeConsulta(3_600)).toBe(20_000);
  });
});
