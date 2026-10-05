/**
 * El módulo de dinero de la interfaz (src/lib/dinero.ts) y los cálculos SQL de la base DEBEN dar lo mismo:
 * se arma el cierre de cada día del seed con filas crudas y se compara con fn_resumen_dia / obtener_resumen_dia.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { calcularCierre, saldoFiado, totalPedido, type MedioAbono, type MedioPago } from "@/lib/dinero";
import { crearBase, crearRestauranteDemo, rpc } from "./base-datos";

let db: PGlite;
let U: string;
let R: string;

beforeAll(async () => {
  db = await crearBase();
  ({ userId: U, restauranteId: R } = await crearRestauranteDemo(db, "Consistencia"));
});
afterAll(() => db.close());

describe("TypeScript y SQL calculan igual", () => {
  it("cierre de cada uno de los 7 días del seed", async () => {
    const hoy = (await db.query<{ f: string }>(`select public.hoy_bogota()::text as f`)).rows[0].f;
    const dias = (await db.query<{ f: string }>(`select (public.hoy_bogota() - g)::text as f from generate_series(0, 6) g`)).rows.map((r) => r.f);
    expect(dias).toContain(hoy);

    for (const dia of dias) {
      const pedidos = (await db.query<{ total: number; propina: number; anulado: boolean }>(
        `select total, propina, anulado from public.pedidos where restaurante_id = $1 and fecha_cobro = $2`, [R, dia])).rows;
      const pagos = (await db.query<{ medio: MedioPago; monto: number; anulado: boolean }>(
        `select medio, monto, anulado from public.pagos_pedido where restaurante_id = $1 and fecha = $2`, [R, dia])).rows;
      const abonos = (await db.query<{ medio: MedioAbono; monto: number; anulado: boolean }>(
        `select medio, monto, anulado from public.movimientos_fiado where restaurante_id = $1 and fecha = $2 and tipo = 'abono'`, [R, dia])).rows;
      const gastos = (await db.query<{ monto: number; de_caja: boolean; anulado: boolean }>(
        `select monto, de_caja, anulado from public.gastos where restaurante_id = $1 and fecha = $2`, [R, dia])).rows;

      const ts = calcularCierre({
        base: 75000,
        pedidos,
        pagos,
        abonos,
        gastos: gastos.map((g) => ({ monto: g.monto, deCaja: g.de_caja, anulado: g.anulado })),
      });
      const { resumen } = await rpc<{ resumen: Record<string, number> }>(db, U, "obtener_resumen_dia", { p_fecha: dia, p_base: 75000 });

      expect(ts, dia).toMatchObject({
        pedidos: resumen.pedidos, ventas: resumen.ventas, propinas: resumen.propinas, gastos: resumen.gastos,
        ganancia: resumen.ganancia, cobradoEfectivo: resumen.cobrado_efectivo, cobradoTransferencia: resumen.cobrado_transferencia,
        fiadoNuevo: resumen.fiado_nuevo, abonosEfectivo: resumen.abonos_efectivo, abonosTransferencia: resumen.abonos_transferencia,
        gastosCaja: resumen.gastos_caja, efectivoEsperado: resumen.efectivo_esperado,
      });
    }
  });

  it("el saldo de fiado de cada cliente coincide", async () => {
    const clientes = await rpc<{ id: string; saldo: number }[]>(db, U, "listar_clientes");
    for (const c of clientes) {
      const movs = (await db.query<{ tipo: "cargo" | "abono"; monto: number; anulado: boolean }>(
        `select tipo, monto, anulado from public.movimientos_fiado where cliente_id = $1`, [c.id])).rows;
      expect(saldoFiado(movs), c.id).toBe(c.saldo);
    }
  });

  it("el total de cada pedido coincide con la suma de sus líneas", async () => {
    const filas = (await db.query<{ total: number; lineas: { precio: number; cantidad: number; adiciones: number[] }[] }>(
      `select p.total,
              coalesce(jsonb_agg(jsonb_build_object(
                'precio', i.precio_unitario, 'cantidad', i.cantidad,
                'adiciones', coalesce((select jsonb_agg((a ->> 'precio')::int) from jsonb_array_elements(i.adiciones) a), '[]'::jsonb)))
                filter (where i.id is not null), '[]'::jsonb) as lineas
         from public.pedidos p left join public.pedido_items i on i.pedido_id = p.id and not i.anulado
        where p.restaurante_id = $1 group by p.id`, [R])).rows;
    expect(filas.length).toBeGreaterThan(100);
    for (const f of filas) expect(totalPedido(f.lineas)).toBe(f.total);
  });
});
