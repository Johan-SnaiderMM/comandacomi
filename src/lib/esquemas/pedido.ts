import { z } from "zod";

/** Mensajes en español: llegan tal cual a la pantalla. */
const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).default("");

export const esquemaItemEnvio = z.object({
  productoId: z.uuid("Un plato del pedido no es válido."),
  cantidad: z.number().int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.").max(99, "La cantidad máxima es 99."),
  adiciones: z.array(z.uuid("Una adición no es válida.")).max(12, "Demasiadas adiciones en un plato.").default([]),
  notas: texto(120),
});

export const esquemaEnvio = z
  .object({
    tipo: z.enum(["mesa", "llevar", "domicilio"], "Elige mesa, llevar o domicilio."),
    mesaId: z.uuid().nullable().default(null),
    /** Pedido abierto de la mesa al que se le agregan platos (en vez de crear uno nuevo). */
    agregarA: z.uuid().nullable().default(null),
    contactoNombre: texto(60),
    contactoTelefono: texto(20),
    direccion: texto(120),
    notas: texto(200),
    items: z.array(esquemaItemEnvio).min(1, "Agrega al menos un plato.").max(60, "El pedido tiene demasiados platos."),
  })
  .superRefine((v, ctx) => {
    // Al agregar platos a un pedido que ya existe, la mesa y la dirección ya están guardadas en él.
    if (v.agregarA) return;
    if (v.tipo === "mesa" && !v.mesaId) ctx.addIssue({ code: "custom", path: ["mesaId"], message: "Elige la mesa." });
    if (v.tipo === "domicilio" && v.direccion.length === 0)
      ctx.addIssue({ code: "custom", path: ["direccion"], message: "Escribe la dirección del domicilio." });
  });

export type EntradaEnvio = z.input<typeof esquemaEnvio>;
export type DatosEnvio = z.output<typeof esquemaEnvio>;

export const esquemaCambioEstado = z.object({
  pedidoId: z.uuid("El pedido no es válido."),
  estado: z.enum(["pendiente", "listo", "entregado"], "El estado no es válido."),
});

/** Motivo de anulación: obligatorio, entre 3 y 200 caracteres. */
export const esquemaMotivo = z.string().trim().min(3, "Escribe el motivo de la anulación.").max(200, "Máximo 200 caracteres.");

export const esquemaAnulacion = z.object({
  id: z.uuid("El registro no es válido."),
  motivo: esquemaMotivo,
});
