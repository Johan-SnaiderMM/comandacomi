import { z } from "zod";
import { esquemaItemEnvio } from "./pedido";

/**
 * Pedido que hace un cliente sin cuenta (solo servidor). Mensajes en español: llegan tal cual a su pantalla.
 * La base repite estas reglas (publico_crear_pedido): aquí se validan primero para dar un error claro y barato.
 */
const itemPublico = esquemaItemEnvio.extend({
  cantidad: z.number().int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.").max(20, "La cantidad máxima por plato es 20."),
  adiciones: z.array(z.uuid("Una adición no es válida.")).max(8, "Demasiadas adiciones en un plato.").default([]),
});

export const esquemaPedidoCliente = z
  .object({
    slug: z.string().trim().min(3, "El enlace del restaurante no es válido.").max(40, "El enlace del restaurante no es válido."),
    tipo: z.enum(["llevar", "domicilio"], "Elige si pasas a recogerlo o si te lo llevamos."),
    nombre: z.string().trim().min(2, "Escribe tu nombre.").max(60, "El nombre es muy largo (máximo 60 caracteres)."),
    telefono: z.string().trim().min(7, "Escribe tu número de celular.").max(20, "El celular es muy largo."),
    direccion: z.string().trim().max(120, "La dirección es muy larga (máximo 120 caracteres).").default(""),
    notas: z.string().trim().max(200, "La nota es muy larga (máximo 200 caracteres).").default(""),
    /** Campo trampa: está oculto en la pantalla; solo un programa lo llena. */
    sitio: z.string().max(0, "No se pudo enviar el pedido. Intenta de nuevo.").optional(),
    items: z.array(itemPublico).min(1, "Agrega al menos un plato.").max(30, "El pedido tiene demasiados platos (máximo 30)."),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "domicilio" && v.direccion.length < 5) {
      ctx.addIssue({ code: "custom", path: ["direccion"], message: "Escribe la dirección del domicilio (barrio, calle y número)." });
    }
  });

export type EntradaPedidoCliente = z.input<typeof esquemaPedidoCliente>;

export const esquemaTokenSeguimiento = z.uuid("El código del pedido no es válido.");
