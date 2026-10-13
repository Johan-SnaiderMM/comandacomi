/**
 * Migración 16, sobre Postgres real (PGlite): el día de trabajo cambia a la hora de corte (4 a. m.) o cuando el dueño
 * lo cierra a mano, no a medianoche.
 *
 * Las reglas de fecha se prueban con instantes FIJOS (no con el reloj de la máquina), para que la prueba dé lo mismo a
 * cualquier hora. Bogotá es UTC-5: la 1:44 a. m. de un martes es 06:44 UTC. Los que tocan la base van en marzo de 2026
 * (lunes 9 y martes 10): lejos de los cierres de ejemplo de la demo, que siempre son de la última semana.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

type Inicio = { fecha: string; jornada_adelantada: boolean; ventas_hoy: number; gastos_hoy: number; pedidos_hoy: number; ventas_ayer: number };
type Resumen = { resumen: { fecha: string; ventas: number; gastos: number; pedidos: number }; cierre: { id: string; fecha: string; ventas: number } | null; jornada: string };

let db: PGlite;
let A: { userId: string; restauranteId: string };

const texto = async (sql: string, params: unknown[] = []) => (await db.query<{ v: string }>(`select (${sql})::text as v`, params)).rows[0].v;
const fechaDeTrabajo = (instante: string, corte = 4) => texto(`public.fn_fecha_trabajo($1::timestamptz, $2)`, [instante, corte]);
const jornada = (rest: string, instante: string) => texto(`public.fn_jornada($1, $2::timestamptz)`, [rest, instante]);
const inicio = (actor = A.userId) => rpc<Inicio>(db, actor, "obtener_inicio");
const resumen = (args: Record<string, unknown> = {}, actor = A.userId) => rpc<Resumen>(db, actor, "obtener_resumen_dia", args);
const mas = (fecha: string, dias: number) => texto(`$1::date + $2::int`, [fecha, dias]);

async function venta(actor = A.userId): Promise<{ id: string; total: number }> {
  const menu = await rpc<{ productos: { id: string; nombre: string }[] }>(db, actor, "obtener_menu_para_pedido");
  const perro = menu.productos.find((p) => p.nombre === "Perro caliente")!;
  const p = await rpc<{ id: string; total: number }>(db, actor, "crear_pedido", { p_tipo: "llevar", p_mesa_id: null, p_items: [{ producto_id: perro.id }] });
  await rpc(db, actor, "cobrar_pedido", { p_pedido_id: p.id, p_propina: 0, p_pagos: [{ medio: "efectivo", monto: p.total, recibido: p.total }] });
  return p;
}

beforeAll(async () => {
  db = await crearBase();
  A = await crearRestauranteDemo(db, "Local Nocturno");
});
afterAll(() => db.close());

describe("a qué día pertenece un instante (hora de corte)", () => {
  it("la 1:44 a. m. del martes todavía es lunes; a las 4:00 a. m. ya es martes", async () => {
    expect(await fechaDeTrabajo("2026-10-13T06:44:00Z")).toBe("2026-10-12");
    expect(await fechaDeTrabajo("2026-10-13T08:59:59Z")).toBe("2026-10-12");
    expect(await fechaDeTrabajo("2026-10-13T09:00:00Z")).toBe("2026-10-13");
    expect(await fechaDeTrabajo("2026-10-13T04:59:00Z")).toBe("2026-10-12"); // 11:59 p. m. del lunes
  });

  it("la hora de corte es de cada restaurante (0 = medianoche)", async () => {
    expect(await fechaDeTrabajo("2026-10-13T06:44:00Z", 0)).toBe("2026-10-13");
    expect(await fechaDeTrabajo("2026-10-13T10:30:00Z", 6)).toBe("2026-10-12");
    expect(await texto(`select hora_corte from public.restaurantes where id = $1`, [A.restauranteId])).toBe("4");
    await expect(db.query(`update public.restaurantes set hora_corte = 13 where id = $1`, [A.restauranteId])).rejects.toThrow(/chk_restaurantes_hora_corte/);
  });
});

describe("cerrar el día a mano lo termina antes de la hora de corte", () => {
  // Un restaurante aparte, con un cierre puesto a una hora fija: lunes 9 de marzo a las 11:00 p. m. (04:00 UTC del 10).
  let R: string;
  beforeAll(async () => {
    R = (await db.query<{ id: string }>(`insert into public.restaurantes (nombre) values ('Cierres A Mano') returning id`)).rows[0].id;
    await db.query(
      `insert into public.cierres_dia (restaurante_id, fecha, ventas, gastos, ganancia, efectivo_esperado, efectivo_contado, diferencia, created_at)
       values ($1, '2026-03-09', 0, 0, 0, 0, 0, 0, '2026-03-10T04:00:00Z')`,
      [R]
    );
  });

  it("lo de antes del cierre es de ese día; lo de después, del siguiente", async () => {
    expect(await jornada(R, "2026-03-10T03:59:59Z")).toBe("2026-03-09"); // 10:59 p. m.: antes de cerrar
    expect(await jornada(R, "2026-03-10T04:00:01Z")).toBe("2026-03-10"); // 11:00 p. m.: ya se cerró
    expect(await jornada(R, "2026-03-10T06:44:00Z")).toBe("2026-03-10"); // 1:44 a. m., aún antes del corte
    expect(await jornada(R, "2026-03-10T09:00:00Z")).toBe("2026-03-10"); // 4:00 a. m.: el día que ya tocaba
    expect(await jornada(R, "2026-03-09T20:00:00Z")).toBe("2026-03-09"); // 3:00 p. m. del lunes
  });

  it("un cierre hecho al día siguiente (se le olvidó cerrar anoche) no corre nada", async () => {
    // Cierre del domingo 8 hecho el lunes 9 a las 10 a. m.: lo del domingo sigue siendo del domingo.
    await db.query(
      `insert into public.cierres_dia (restaurante_id, fecha, ventas, gastos, ganancia, efectivo_esperado, efectivo_contado, diferencia, created_at)
       values ($1, '2026-03-08', 0, 0, 0, 0, 0, 0, '2026-03-09T15:00:00Z')`,
      [R]
    );
    expect(await jornada(R, "2026-03-09T03:00:00Z")).toBe("2026-03-08"); // 10 p. m. del domingo
    expect(await jornada(R, "2026-03-09T16:00:00Z")).toBe("2026-03-09"); // 11 a. m. del lunes
  });

  it("un cierre anulado deja de contar, y el de otro restaurante nunca cuenta", async () => {
    expect(await jornada(A.restauranteId, "2026-03-10T06:44:00Z")).toBe("2026-03-09");
    await db.query(`update public.cierres_dia set anulado = true, anulado_motivo = 'prueba', anulado_at = now() where restaurante_id = $1 and fecha = '2026-03-09'`, [R]);
    expect(await jornada(R, "2026-03-10T06:44:00Z")).toBe("2026-03-09");
  });
});

describe("las fechas de cada registro salen de cuándo ocurrió", () => {
  it("pedido: creado a las 11:50 p. m. y cobrado a la 1:44 a. m. es del mismo día de trabajo", async () => {
    const p = await venta();
    await db.query(`update public.pedidos set created_at = '2026-03-10T04:50:00Z', cobrado_at = '2026-03-10T06:44:00Z' where id = $1`, [p.id]);
    const f = (await db.query<{ fecha: string; fecha_cobro: string }>(`select fecha::text, fecha_cobro::text from public.pedidos where id = $1`, [p.id])).rows[0];
    expect(f).toEqual({ fecha: "2026-03-09", fecha_cobro: "2026-03-09" });

    // Cobrado después del corte ya es venta del día siguiente (aunque se haya pedido antes).
    await db.query(`update public.pedidos set cobrado_at = '2026-03-10T09:05:00Z' where id = $1`, [p.id]);
    expect(await texto(`select fecha_cobro from public.pedidos where id = $1`, [p.id])).toBe("2026-03-10");

    // Sin cobro no hay fecha de cobro.
    await rpc(db, A.userId, "anular_cobro", { p_pedido_id: p.id, p_motivo: "prueba de fechas" });
    expect((await db.query(`select fecha_cobro from public.pedidos where id = $1`, [p.id])).rows[0]).toEqual({ fecha_cobro: null });
    await rpc(db, A.userId, "anular_pedido", { p_pedido_id: p.id, p_motivo: "prueba de fechas" });
  });

  it("pagos y movimientos de fiado: igual", async () => {
    const pago = (await db.query<{ id: string }>(`select id from public.pagos_pedido where restaurante_id = $1 and not anulado limit 1`, [A.restauranteId])).rows[0].id;
    const original = await texto(`select created_at from public.pagos_pedido where id = $1`, [pago]);
    await db.query(`update public.pagos_pedido set created_at = '2026-03-10T06:44:00Z' where id = $1`, [pago]);
    expect(await texto(`select fecha from public.pagos_pedido where id = $1`, [pago])).toBe("2026-03-09");
    await db.query(`update public.pagos_pedido set created_at = $2::timestamptz where id = $1`, [pago, original]);

    const mov = (await db.query<{ id: string }>(`select id from public.movimientos_fiado where restaurante_id = $1 and tipo = 'abono' limit 1`, [A.restauranteId])).rows[0].id;
    const original2 = await texto(`select created_at from public.movimientos_fiado where id = $1`, [mov]);
    await db.query(`update public.movimientos_fiado set created_at = '2026-03-10T09:30:00Z' where id = $1`, [mov]);
    expect(await texto(`select fecha from public.movimientos_fiado where id = $1`, [mov])).toBe("2026-03-10");
    await db.query(`update public.movimientos_fiado set created_at = $2::timestamptz where id = $1`, [mov, original2]);
  });

  it("la demo trae siete días de trabajo seguidos, con hoy incluido", async () => {
    const hoy = await texto(`public.fn_jornada($1, now())`, [A.restauranteId]);
    expect((await inicio()).fecha).toBe(hoy);
    const dias = (await db.query<{ f: string }>(`select distinct fecha::text as f from public.gastos where restaurante_id = $1 order by 1`, [A.restauranteId])).rows.map((r) => r.f);
    expect(dias).toHaveLength(7);
    expect(dias.at(-1)).toBe(hoy);
    expect(dias[0]).toBe(await mas(hoy, -6));
    // Ninguna venta de la demo quedó fechada en el futuro.
    expect(await texto(`select count(*) from public.pedidos where restaurante_id = $1 and (fecha > $2::date or fecha_cobro > $2::date)`, [A.restauranteId, hoy])).toBe("0");
  });
});

describe("el flujo completo: cerrar, seguir vendiendo, arrepentirse", () => {
  let dia: string;
  let ventasDelDia: number;
  let cierreId: string;

  it("antes de cerrar: Inicio y Cierre hablan del mismo día", async () => {
    const i = await inicio();
    const r = await resumen();
    dia = r.resumen.fecha;
    expect(i).toMatchObject({ fecha: dia, jornada_adelantada: false });
    expect(r).toMatchObject({ cierre: null, jornada: dia });
    await venta();
    ventasDelDia = (await resumen()).resumen.ventas;
    expect((await inicio()).ventas_hoy).toBe(ventasDelDia);
  });

  it("al cerrar, lo que se registre entra al día siguiente y las cifras del cierre no se mueven", async () => {
    const c = await rpc<{ id: string; fecha: string }>(db, A.userId, "registrar_cierre", { p_fecha: null, p_base_caja: 0, p_efectivo_contado: 0 });
    cierreId = c.id;
    expect(c.fecha).toBe(dia);
    const manana = await mas(dia, 1);

    // Inicio pasa a la jornada nueva (vacía); "ayer" es el día recién cerrado.
    let i = await inicio();
    expect(i).toMatchObject({ fecha: manana, jornada_adelantada: true, ventas_hoy: 0, gastos_hoy: 0, pedidos_hoy: 0, ventas_ayer: ventasDelDia });
    expect(await rpc<unknown[]>(db, A.userId, "listar_pedidos_cobrados_hoy")).toEqual([]);

    // Una venta y un gasto después de cerrar.
    const tarde = await venta();
    await rpc(db, A.userId, "registrar_gasto", { p_monto: 7000, p_categoria: "otros", p_nota: "después de cerrar" });
    i = await inicio();
    expect(i).toMatchObject({ fecha: manana, ventas_hoy: tarde.total, gastos_hoy: 7000, pedidos_hoy: 1 });
    expect((await rpc<{ id: string }[]>(db, A.userId, "listar_pedidos_cobrados_hoy")).map((x) => x.id)).toEqual([tarde.id]);
    expect((await rpc<{ fecha: string; total: number }>(db, A.userId, "listar_gastos"))).toMatchObject({ fecha: manana, total: 7000 });

    // La pantalla de Cierre sigue en el día cerrado, con las cifras guardadas, y avisa a dónde entra lo nuevo.
    const r = await resumen();
    expect(r.resumen).toMatchObject({ fecha: dia, ventas: ventasDelDia });
    expect(r.cierre).toMatchObject({ id: cierreId, fecha: dia, ventas: ventasDelDia });
    expect(r.jornada).toBe(manana);
  });

  it("el día siguiente todavía no se puede cerrar, y el de hoy no se cierra dos veces", async () => {
    await expect(rpc(db, A.userId, "registrar_cierre", { p_fecha: await mas(dia, 1), p_base_caja: 0, p_efectivo_contado: 0 })).rejects.toThrow(/todavía no llega/);
    await expect(rpc(db, A.userId, "registrar_cierre", { p_fecha: null, p_base_caja: 0, p_efectivo_contado: 0 })).rejects.toThrow(/ya está cerrado/);
    // Un gasto no se puede fechar en un día que no ha llegado (pasado mañana).
    await expect(rpc(db, A.userId, "registrar_gasto", { p_monto: 1000, p_categoria: "otros", p_fecha: await mas(dia, 2) })).rejects.toThrow(/fecha/);
  });

  it("anular el cierre reabre el día: lo registrado después vuelve a él", async () => {
    await rpc(db, A.userId, "anular_cierre", { p_cierre_id: cierreId, p_motivo: "Faltaba una venta" });
    const i = await inicio();
    expect(i).toMatchObject({ fecha: dia, jornada_adelantada: false, gastos_hoy: expect.any(Number) });
    expect(i.ventas_hoy).toBe(ventasDelDia + 9000);
    const r = await resumen();
    expect(r).toMatchObject({ cierre: null, jornada: dia });
    expect(r.resumen.ventas).toBe(ventasDelDia + 9000);
    // Nada quedó colgado en mañana.
    const manana = await mas(dia, 1);
    for (const tabla of ["pedidos", "pagos_pedido", "movimientos_fiado", "gastos"]) {
      expect(await texto(`select count(*) from public.${tabla} where restaurante_id = $1 and fecha = $2::date`, [A.restauranteId, manana]), tabla).toBe("0");
    }
    expect(await texto(`select count(*) from public.pedidos where restaurante_id = $1 and fecha_cobro = $2::date`, [A.restauranteId, manana])).toBe("0");
  });

  it("cada restaurante cierra su día sin tocar el de los demás", async () => {
    const B = await crearRestauranteDemo(db, "Otro Local Nocturno");
    await rpc(db, A.userId, "registrar_cierre", { p_fecha: null, p_base_caja: 0, p_efectivo_contado: 0 });
    expect((await inicio()).jornada_adelantada).toBe(true);
    expect(await inicio(B.userId)).toMatchObject({ fecha: dia, jornada_adelantada: false });
  });
});
