import type { CategoriaGasto } from "@/lib/datos/tipos";

/**
 * Categorías de gasto de un restaurante pequeño, en el orden en que se usan más. Deben coincidir con el
 * constraint de la tabla gastos (una prueba verifica que la base acepta cada una).
 * `icono` es el nombre de un ícono de lucide-react (se resuelve en el componente).
 */
export const CATEGORIAS_GASTO: { valor: CategoriaGasto; etiqueta: string; icono: string }[] = [
  { valor: "carnes", etiqueta: "Carnes", icono: "Beef" },
  { valor: "pan", etiqueta: "Pan", icono: "Wheat" },
  { valor: "verduras", etiqueta: "Verduras", icono: "Carrot" },
  { valor: "bebidas", etiqueta: "Bebidas", icono: "CupSoda" },
  { valor: "gas", etiqueta: "Gas", icono: "Flame" },
  { valor: "domiciliario", etiqueta: "Domicilio", icono: "Bike" },
  { valor: "empaques", etiqueta: "Empaques", icono: "Package" },
  { valor: "ayudante", etiqueta: "Ayudante", icono: "UserRound" },
  { valor: "servicios", etiqueta: "Servicios", icono: "Lightbulb" },
  { valor: "otros", etiqueta: "Otros", icono: "Ellipsis" },
];

export const ETIQUETA_CATEGORIA: Record<CategoriaGasto, string> = Object.fromEntries(CATEGORIAS_GASTO.map((c) => [c.valor, c.etiqueta])) as Record<
  CategoriaGasto,
  string
>;
