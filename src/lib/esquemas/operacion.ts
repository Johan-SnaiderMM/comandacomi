import { z } from "zod";
import { esquemaAbono, esquemaCliente, esquemaCobro } from "./cobro";
import { esquemaGasto } from "./gasto";
import { esquemaCambioEstado, esquemaEnvio, esquemaItemEnvio } from "./pedido";

/**
 * Operaciones del trabajo sin conexión (solo servidor). El celular las manda tal como las guardó; aquí se validan
 * con los mismos esquemas de siempre y se convierten en los parámetros de la función SQL correspondiente
 * (aplicar_operacion las pasa tal cual a crear_pedido, cobrar_pedido, etc.).
 */
export const esquemaSobreOperacion = z.object({
  clave: z.uuid("La operación no es válida."),
  tipo: z.enum(["crear_pedido", "agregar_items", "cambiar_estado", "cobrar", "crear_cliente", "abonar", "gasto"], "La operación no es válida."),
  ocurridoEn: z.iso.datetime({ message: "La fecha de la operación no es válida." }),
  datos: z.unknown(),
});

const esquemaAgregarItems = z.object({
  pedidoId: z.uuid("El pedido no es válido."),
  items: z.array(esquemaItemEnvio).min(1, "Agrega al menos un plato.").max(60, "El pedido tiene demasiados platos."),
});

type Entrada = z.infer<typeof esquemaSobreOperacion>;
export type ArgsOperacion = { ok: true; args: Record<string, unknown> } | { ok: false; error: string };

const mensaje = (e: z.ZodError, vacio: string) => e.issues[0]?.message ?? vacio;

const itemsSql = (items: z.output<typeof esquemaItemEnvio>[]) =>
  items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad, adiciones: i.adiciones, notas: i.notas || null }));

/** Valida los datos de la operación y devuelve los parámetros de la función SQL (los mismos nombres p_*). */
export function argumentosDeOperacion(tipo: Entrada["tipo"], datos: unknown): ArgsOperacion {
  switch (tipo) {
    case "crear_pedido": {
      const id = z.uuid("El pedido no es válido.").safeParse((datos as { id?: unknown } | null)?.id);
      if (!id.success) return { ok: false, error: mensaje(id.error, "El pedido no es válido.") };
      const p = esquemaEnvio.safeParse({ ...(datos as object), agregarA: null });
      if (!p.success) return { ok: false, error: mensaje(p.error, "Revisa el pedido.") };
      const v = p.data;
      return {
        ok: true,
        args: {
          p_id: id.data,
          p_tipo: v.tipo,
          p_mesa_id: v.tipo === "mesa" ? v.mesaId : null,
          p_items: itemsSql(v.items),
          p_contacto_nombre: v.contactoNombre || null,
          p_contacto_telefono: v.contactoTelefono || null,
          p_direccion: v.tipo === "domicilio" ? v.direccion : null,
          p_notas: v.notas || null,
        },
      };
    }
    case "agregar_items": {
      const p = esquemaAgregarItems.safeParse(datos);
      if (!p.success) return { ok: false, error: mensaje(p.error, "Revisa el pedido.") };
      return { ok: true, args: { p_pedido_id: p.data.pedidoId, p_items: itemsSql(p.data.items) } };
    }
    case "cambiar_estado": {
      const p = esquemaCambioEstado.safeParse(datos);
      if (!p.success) return { ok: false, error: mensaje(p.error, "Datos inválidos.") };
      return { ok: true, args: { p_pedido_id: p.data.pedidoId, p_estado: p.data.estado } };
    }
    case "cobrar": {
      const p = esquemaCobro.safeParse(datos);
      if (!p.success) return { ok: false, error: mensaje(p.error, "Revisa el cobro.") };
      return {
        ok: true,
        args: {
          p_pedido_id: p.data.pedidoId,
          p_propina: p.data.propina,
          p_pagos: p.data.pagos.map((x) => ({
            medio: x.medio,
            monto: x.monto,
            recibido: x.medio === "efectivo" ? (x.recibido ?? x.monto) : undefined,
            referencia: x.medio === "transferencia" ? x.referencia || undefined : undefined,
            cliente_id: x.medio === "fiado" ? x.clienteId : undefined,
          })),
        },
      };
    }
    case "crear_cliente": {
      const id = z.uuid("El cliente no es válido.").safeParse((datos as { id?: unknown } | null)?.id);
      if (!id.success) return { ok: false, error: mensaje(id.error, "El cliente no es válido.") };
      const p = esquemaCliente.safeParse(datos);
      if (!p.success) return { ok: false, error: mensaje(p.error, "Datos inválidos.") };
      return { ok: true, args: { p_id: id.data, p_nombre: p.data.nombre, p_telefono: p.data.telefono || null } };
    }
    case "abonar": {
      const p = esquemaAbono.safeParse(datos);
      if (!p.success) return { ok: false, error: mensaje(p.error, "Revisa el abono.") };
      return {
        ok: true,
        args: {
          p_cliente_id: p.data.clienteId,
          p_monto: p.data.monto,
          p_medio: p.data.medio,
          p_referencia: p.data.medio === "transferencia" ? p.data.referencia || null : null,
        },
      };
    }
    case "gasto": {
      // La foto, si hay, ya está subida (necesita señal en el momento): aquí solo viaja su ruta, que la base verifica.
      const p = esquemaGasto.safeParse(datos);
      if (!p.success) return { ok: false, error: mensaje(p.error, "Revisa el gasto.") };
      return {
        ok: true,
        args: { p_monto: p.data.monto, p_categoria: p.data.categoria, p_nota: p.data.nota || null, p_foto_path: p.data.fotoPath || null, p_de_caja: p.data.deCaja },
      };
    }
  }
}
