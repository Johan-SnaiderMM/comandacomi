import { Beef, Bike, Carrot, CupSoda, Ellipsis, Flame, Lightbulb, Package, UserRound, Wheat, type LucideIcon } from "lucide-react";

const ICONOS: Record<string, LucideIcon> = { Beef, Wheat, Carrot, CupSoda, Flame, Bike, Package, UserRound, Lightbulb, Ellipsis };

/** Ícono de una categoría de gasto (el nombre viene de src/lib/gastos.ts). */
export function IconoCategoria({ nombre, className }: { nombre: string; className?: string }) {
  const Icono = ICONOS[nombre] ?? Ellipsis;
  return <Icono className={className} aria-hidden />;
}
