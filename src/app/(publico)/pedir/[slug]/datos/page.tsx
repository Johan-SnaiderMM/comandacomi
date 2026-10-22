import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { obtenerMenuPublico } from "@/lib/datos/publico";
import { VIGENCIA_POLITICA_DATOS } from "@/lib/publico/datos";

export async function generateMetadata({ params }: PageProps<"/pedir/[slug]/datos">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug).catch(() => null);
  return { title: menu ? `Tus datos · ${menu.restaurante.nombre}` : "Tus datos" };
}

/**
 * Política de tratamiento de datos del cliente que pide en línea (Ley 1581 de 2012). El responsable es el
 * restaurante; la app solo guarda los datos por encargo suyo. El cliente la acepta antes de enviar su pedido y la base
 * guarda cuándo lo hizo (migración 25).
 */
export default async function PoliticaDeDatos({ params }: PageProps<"/pedir/[slug]/datos">) {
  const { slug } = await params;
  const menu = await obtenerMenuPublico(slug);
  if (!menu) notFound();
  if (menu.restaurante.slug !== slug) redirect(`/pedir/${menu.restaurante.slug}/datos`);
  const { nombre, es_demo } = menu.restaurante;

  return (
    <>
      <header className="border-b-2 border-tinta bg-sol px-2 pb-4 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
        <Link href={`/pedir/${slug}`} className="tap inline-flex items-center gap-1 rounded-full pr-3 text-base font-bold active:bg-tinta/10">
          <ChevronLeft className="size-7" strokeWidth={3} aria-hidden /> Volver al menú
        </Link>
        <h1 className="font-display mt-1 px-2 text-4xl font-extrabold uppercase leading-[0.95] tracking-tight">Tus datos</h1>
        <p className="mt-1 px-2 text-lg font-bold">Cómo {nombre} usa los datos de tu pedido</p>
      </header>

      <main className="space-y-5 px-4 pb-10 pt-4 text-lg leading-snug">
        {es_demo && (
          <p className="rounded-xl border-2 border-dashed border-tinta/50 bg-papel px-3 py-2 text-base text-tinta-2">
            <strong className="text-tinta">Demostración:</strong> este restaurante es de prueba. No escribas datos reales.
          </p>
        )}

        <Seccion titulo="Quién responde por tus datos">
          <p>
            <strong>{nombre}</strong>, el restaurante al que le haces el pedido. La aplicación con la que recibe los pedidos guarda tus datos por
            encargo suyo y no los usa para nada más.
          </p>
        </Seccion>

        <Seccion titulo="Qué datos se guardan">
          <ul className="list-disc space-y-1 pl-6">
            <li>Tu nombre y tu celular.</li>
            <li>La dirección, si pides a domicilio.</li>
            <li>Lo que pediste y las notas que escribas.</li>
            <li>Si tocas «Avísame cuando esté listo», la dirección que da tu navegador para mandarte ese aviso.</li>
          </ul>
          <p className="mt-2 text-base text-tinta-2">
            Además, en este celular (no en internet) quedan tu nombre, tu celular y tu dirección para no tener que escribirlos la próxima vez.
          </p>
        </Seccion>

        <Seccion titulo="Para qué se usan">
          <ul className="list-disc space-y-1 pl-6">
            <li>Preparar y entregar tu pedido.</li>
            <li>Comunicarse contigo por ese pedido: confirmar el domicilio o avisarte si falta algo.</li>
            <li>Avisarte cuando esté listo, si lo pediste.</li>
          </ul>
          <p className="mt-2">No se venden ni se le entregan a nadie más, y no se usan para mandarte publicidad.</p>
        </Seccion>

        <Seccion titulo="Tus derechos">
          <p>Por la Ley 1581 de 2012 puedes:</p>
          <ul className="mt-1 list-disc space-y-1 pl-6">
            <li>Conocer, actualizar y corregir tus datos.</li>
            <li>Pedir la prueba de que autorizaste usarlos.</li>
            <li>Preguntar cómo se han usado.</li>
            <li>Retirar tu autorización o pedir que se borren, cuando no haya una obligación legal de guardarlos.</li>
            <li>Presentar una queja ante la Superintendencia de Industria y Comercio (SIC).</li>
          </ul>
        </Seccion>

        <Seccion titulo="Cómo pedirlo">
          <p>
            Díselo a {nombre}: en el local, o al número desde el que te contactaron por tu pedido. Debe responderte una consulta en máximo 10 días
            hábiles y un reclamo en máximo 15.
          </p>
        </Seccion>

        <p className="text-base text-tinta-2">Vigente desde el {VIGENCIA_POLITICA_DATOS}.</p>
      </main>
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo}>
      <h2 className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight">{titulo}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
