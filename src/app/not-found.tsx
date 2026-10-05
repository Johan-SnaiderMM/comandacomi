import Link from "next/link";
import { botonVariantes } from "@/components/ui/button";

export default function NoEncontrada() {
  return (
    <main className="columna-app flex flex-col items-start justify-center gap-4 px-4">
      <p className="cifra text-7xl">404</p>
      <h1 className="font-display text-4xl font-extrabold uppercase leading-none">Esa pantalla no existe</h1>
      <p className="text-lg text-tinta-2">Puede que el enlace esté mal escrito o ya no exista.</p>
      <Link href="/" className={botonVariantes({ tamano: "lg" })}>
        Volver al inicio
      </Link>
    </main>
  );
}
