"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Pencil, X } from "lucide-react";
import { subirFotoGasto } from "@/app/acciones/gastos";
import { IconoCategoria } from "@/components/gastos/icono-categoria";
import { BarraAccion } from "@/components/layout/barra-accion";
import { EncabezadoPantalla } from "@/components/layout/encabezado-pantalla";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TecladoNumerico } from "@/components/ui/teclado-numerico";
import type { CategoriaGasto } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { CATEGORIAS_GASTO } from "@/lib/gastos";
import { comprimirImagen } from "@/lib/imagen";
import { useIr } from "@/lib/navegacion";
import { registrarGasto } from "@/lib/sync/acciones";
import { useEnLinea } from "@/lib/sync/cliente";
import { aplicarTecla } from "@/lib/teclado";
import { cn } from "@/lib/utils";

type Foto = { blob: Blob; vista: string };

/**
 * Registrar un gasto en pocos pasos: 1) monto con el teclado, 2) categoría (un toque), nota y foto opcionales,
 * 3) guardar. La foto se comprime en el celular antes de subirla.
 */
export function NuevoGasto() {
  const router = useIr();
  const enLinea = useEnLinea();
  const [paso, setPaso] = useState<"monto" | "detalle">("monto");
  const [monto, setMonto] = useState(0);
  const [categoria, setCategoria] = useState<CategoriaGasto | null>(null);
  const [nota, setNota] = useState("");
  const [deCaja, setDeCaja] = useState(true);
  const [foto, setFoto] = useState<Foto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const entradaFoto = useRef<HTMLInputElement>(null);

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    try {
      const blob = await comprimirImagen(archivo);
      if (foto) URL.revokeObjectURL(foto.vista);
      setFoto({ blob, vista: URL.createObjectURL(blob) });
    } catch {
      setError("No se pudo preparar la foto. Intenta con otra.");
    }
  }

  function quitarFoto() {
    if (foto) URL.revokeObjectURL(foto.vista);
    setFoto(null);
    if (entradaFoto.current) entradaFoto.current.value = "";
  }

  function guardar() {
    if (!categoria) return;
    setError(null);
    empezar(async () => {
      let fotoPath: string | null = null;
      if (foto) {
        const datos = new FormData();
        datos.set("foto", new File([foto.blob], "gasto.jpg", { type: "image/jpeg" }));
        let subida: Awaited<ReturnType<typeof subirFotoGasto>>;
        try {
          subida = await subirFotoGasto(datos);
        } catch {
          setError("No se pudo subir la foto (¿sin señal?). Puedes guardar el gasto sin foto.");
          return;
        }
        if (!subida.ok) {
          setError(`${subida.error} Puedes guardar el gasto sin foto.`);
          return;
        }
        fotoPath = subida.datos.ruta;
      }
      const r = await registrarGasto({ monto, categoria, nota, fotoPath, deCaja });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/gastos?guardado=${monto}${r.datos.pendiente ? "&pendiente=1" : ""}`);
    });
  }

  if (paso === "monto") {
    return (
      <div className="flex min-h-dvh flex-col">
        <EncabezadoPantalla titulo="Nuevo gasto" atras="/gastos" />
        <main className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-[calc(var(--accion-h)+var(--seguro-abajo))]">
          <div className="rounded-xl border-2 border-tinta bg-papel px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-tinta-2">¿Cuánto fue?</p>
            <p className="cifra text-[3.5rem]">{formatearPesos(monto)}</p>
          </div>
          <TecladoNumerico className="mt-auto" onTecla={(t) => setMonto((v) => aplicarTecla(v, t))} />
        </main>
        <BarraAccion>
          <Button tamano="lg" bloque disabled={monto === 0} onClick={() => setPaso("detalle")}>
            {monto === 0 ? "Escribe el monto" : "Siguiente"}
          </Button>
        </BarraAccion>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <EncabezadoPantalla titulo="Nuevo gasto" atras="/gastos" />
      <main className="flex flex-1 flex-col gap-2 px-4 pt-2 pb-[calc(var(--accion-h)+var(--seguro-abajo)+0.25rem)]">
        <button
          type="button"
          onClick={() => setPaso("monto")}
          className="flex min-h-14 items-center justify-between rounded-xl border-2 border-tinta bg-papel px-3 text-left active:bg-tinta/10"
        >
          <span className="cifra text-4xl">{formatearPesos(monto)}</span>
          <span className="flex items-center gap-1 text-sm font-bold text-tinta-2">
            <Pencil className="size-4" aria-hidden /> Cambiar
          </span>
        </button>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold uppercase tracking-wide text-tinta-2">Categoría</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORIAS_GASTO.map((c) => {
              const activa = categoria === c.valor;
              return (
                <button
                  key={c.valor}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setCategoria(c.valor)}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-tinta px-1 text-sm font-bold leading-tight transition-[transform,box-shadow] duration-75 active:translate-y-[2px]",
                    activa ? "bg-sol shadow-sello-chico" : "bg-papel"
                  )}
                >
                  <IconoCategoria nombre={c.icono} className="size-5" />
                  {c.etiqueta}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={120} placeholder="Nota (opcional): ej. carne molida" aria-label="Nota del gasto" />

        <button
          type="button"
          role="switch"
          aria-checked={deCaja}
          onClick={() => setDeCaja((v) => !v)}
          className="flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 border-tinta bg-papel px-3 text-left text-base font-bold active:bg-tinta/10"
        >
          <span className="leading-tight">
            Salió del efectivo de la caja
            <span className="block text-sm font-normal text-tinta-2">{deCaja ? "Sí: baja el efectivo esperado" : "No: se pagó por transferencia"}</span>
          </span>
          <span aria-hidden className={cn("flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-tinta px-0.5", deCaja ? "justify-end bg-listo" : "justify-start bg-papel")}>
            <span className="size-5 rounded-full border-2 border-tinta bg-papel" />
          </span>
        </button>

        <input ref={entradaFoto} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => void elegirFoto(e.target.files?.[0])} />
        {foto ? (
          <div className="flex items-center gap-3 rounded-xl border-2 border-tinta bg-papel p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob) */}
            <img src={foto.vista} alt="Foto del comprobante" width={64} height={64} className="size-16 rounded-lg border-2 border-tinta object-cover" />
            <span className="flex-1 text-base font-bold">Foto lista ({Math.round(foto.blob.size / 1024)} KB)</span>
            <Button variante="secundario" tamano="icono" aria-label="Quitar la foto" onClick={quitarFoto}>
              <X className="size-5" aria-hidden />
            </Button>
          </div>
        ) : (
          <Button variante="secundario" disabled={!enLinea} onClick={() => entradaFoto.current?.click()}>
            <Camera className="size-5" aria-hidden /> {enLinea ? "Foto del recibo (opcional)" : "Sin señal: la foto no se puede subir ahora"}
          </Button>
        )}

        {error && <Aviso tipo="error">{error}</Aviso>}
      </main>
      <BarraAccion>
        <Button tamano="lg" bloque disabled={!categoria || guardando} onClick={guardar}>
          {guardando ? "Guardando…" : categoria ? `Guardar gasto · ${formatearPesos(monto)}` : "Elige la categoría"}
        </Button>
      </BarraAccion>
    </div>
  );
}
