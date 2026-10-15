/**
 * Primeros pasos de un local nuevo (Inicio del dueño de un restaurante de verdad). Cada paso se marca solo con lo que
 * ya hay en la base (`primeros_pasos()`, migración 23). Los de "si…" son opcionales: un local que solo vende para
 * llevar no necesita mesas; el dueño los puede dar por vistos con "Ya no mostrar".
 */
/** Cookie de "Ya no mostrar" (de este celular). */
export const COOKIE_PRIMEROS_PASOS = "primeros_pasos";

export type DatosPrimerosPasos = { platos: number; mesas: number; personas: number; invitaciones: number; pedidos: number; en_linea: boolean };

export type Paso = { clave: string; titulo: string; detalle: string; hecho: boolean; href: string };

export function pasosDe(d: DatosPrimerosPasos): Paso[] {
  return [
    {
      clave: "menu",
      titulo: "Arma tu menú",
      detalle: d.platos > 0 ? `${d.platos} ${d.platos === 1 ? "plato" : "platos"}` : "Categorías y platos, con su precio",
      hecho: d.platos > 0,
      href: "/menu",
    },
    {
      clave: "mesas",
      titulo: "Agrega tus mesas",
      detalle: d.mesas > 0 ? `${d.mesas} ${d.mesas === 1 ? "mesa" : "mesas"}` : "Si atiendes en mesa. Si solo vendes para llevar, sáltalo",
      hecho: d.mesas > 0,
      href: "/mesas",
    },
    {
      clave: "equipo",
      titulo: "Invita a tu equipo",
      detalle:
        d.personas > 0
          ? `${d.personas} ${d.personas === 1 ? "persona" : "personas"} en el equipo`
          : d.invitaciones > 0
            ? "Invitación lista: falta que entren"
            : "Si trabajas con alguien: entra desde su celular con un código",
      hecho: d.personas > 0,
      href: "/equipo",
    },
    {
      clave: "pedido",
      titulo: "Toma tu primer pedido",
      detalle: d.pedidos > 0 ? "Listo" : "Con el botón + de abajo",
      hecho: d.pedidos > 0,
      href: "/pedido/nuevo",
    },
    {
      clave: "en-linea",
      titulo: "Recibe pedidos por internet",
      detalle: d.en_linea ? "Encendido: comparte tu enlace o el QR" : "Tus clientes piden desde su celular, sin llamar",
      hecho: d.en_linea,
      href: "/pedidos-en-linea",
    },
  ];
}
