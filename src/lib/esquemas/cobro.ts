import { z } from "zod";

export const esquemaPagoEnvio = z.object({
  medio: z.enum(["efectivo", "transferencia", "fiado"], "El medio de pago no es válido."),
  monto: z.number().int("El valor debe ser un número entero.").min(1, "El valor de cada pago debe ser mayor que cero.").max(99_999_999, "El valor es demasiado grande."),
  /** Solo efectivo: lo que entregó el cliente. */
  recibido: z.number().int().min(1).max(99_999_999).optional(),
  /** Solo transferencia: referencia opcional. */
  referencia: z.string().trim().max(60, "La referencia es muy larga.").optional(),
  /** Solo fiado: a quién se le fía. */
  clienteId: z.uuid("El cliente no es válido.").optional(),
});

export const esquemaCobro = z.object({
  pedidoId: z.uuid("El pedido no es válido."),
  propina: z.number().int("La propina debe ser un número entero.").min(0, "La propina no es válida.").max(99_999_999, "La propina es demasiado grande."),
  pagos: z.array(esquemaPagoEnvio).min(1, "Elige cómo se paga.").max(3, "Demasiados pagos."),
});

export type EntradaCobro = z.input<typeof esquemaCobro>;

export const esquemaAbono = z.object({
  clienteId: z.uuid("El cliente no es válido."),
  monto: z.number().int("El abono debe ser un número entero.").min(1, "El abono debe ser mayor que cero.").max(99_999_999, "El abono es demasiado grande."),
  medio: z.enum(["efectivo", "transferencia"], "Elige si pagó en efectivo o por transferencia."),
  referencia: z.string().trim().max(60, "La referencia es muy larga.").optional(),
});

export const esquemaCliente = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del cliente.").max(60, "El nombre es muy largo."),
  telefono: z.string().trim().max(20, "El teléfono es muy largo.").default(""),
});
