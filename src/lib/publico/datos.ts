/**
 * Política de tratamiento de datos del cliente que pide en línea (página /pedir/<local>/datos). Si cambia lo que
 * dice, cambia también esta fecha: cada pedido guarda cuándo se aceptó (pedidos.datos_autorizados_at), y con las dos
 * se sabe qué versión aceptó cada quien.
 */
export const VIGENCIA_POLITICA_DATOS = "21 de octubre de 2026";
