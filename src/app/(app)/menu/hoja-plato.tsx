"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Pencil, X } from "lucide-react";
import { guardarProducto, subirFotoPlato } from "@/app/acciones/menu";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { HojaMonto } from "@/components/ui/hoja-monto";
import { Input, Textarea } from "@/components/ui/input";
import { Interruptor } from "@/components/ui/interruptor";
import { Label } from "@/components/ui/label";
import type { MenuAdmin } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { comprimirImagen } from "@/lib/imagen";
import { cn } from "@/lib/utils";

type Plato = MenuAdmin["categorias"][number]["productos"][number];

/** Foto nueva elegida en esta hoja (todavía sin subir): el archivo comprimido y su vista previa local. */
type FotoNueva = { blob: Blob; vista: string };

/**
 * Crear o editar un plato: nombre, precio (con el teclado numérico), categoría y si hay hoy. Para el menú que ven los
 * clientes, una descripción corta y una foto (las dos opcionales). La foto se comprime en el celular antes de subirla.
 */
export function HojaPlato({
  plato,
  categoriaInicial,
  categorias,
  onCerrar,
}: {
  /** null = plato nuevo. */
  plato: Plato | null;
  categoriaInicial: string;
  categorias: { id: string; nombre: string; icono: string | null }[];
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(plato?.nombre ?? "");
  const [precio, setPrecio] = useState(plato?.precio ?? 0);
  const [categoriaId, setCategoriaId] = useState(categoriaInicial);
  const [disponible, setDisponible] = useState(plato?.disponible ?? true);
  const [descripcion, setDescripcion] = useState(plato?.descripcion ?? "");
  const [fotoNueva, setFotoNueva] = useState<FotoNueva | null>(null);
  const [sinFoto, setSinFoto] = useState(false); // se pidió quitar la foto que el plato ya tenía
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const entradaFoto = useRef<HTMLInputElement>(null);
  const vistaActual = useRef<string | null>(null);

  // La vista previa local se libera al cambiarla y al cerrar la hoja.
  useEffect(() => () => {
    if (vistaActual.current) URL.revokeObjectURL(vistaActual.current);
  }, []);

  const fotoQueSeVe = fotoNueva?.vista ?? (sinFoto ? null : (plato?.foto_url ?? null));

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    try {
      // 640 px bastan para el menú del celular y pesan ~60 KB: el cliente no gasta datos viendo la carta.
      const blob = await comprimirImagen(archivo, 640, 0.7);
      if (vistaActual.current) URL.revokeObjectURL(vistaActual.current);
      vistaActual.current = URL.createObjectURL(blob);
      setFotoNueva({ blob, vista: vistaActual.current });
      setSinFoto(false);
    } catch {
      setError("No se pudo preparar la foto. Intenta con otra.");
    }
  }

  function quitarFoto() {
    if (vistaActual.current) URL.revokeObjectURL(vistaActual.current);
    vistaActual.current = null;
    setFotoNueva(null);
    setSinFoto(true);
    if (entradaFoto.current) entradaFoto.current.value = "";
  }

  function guardar(activo: boolean) {
    setError(null);
    empezar(async () => {
      // La foto se sube primero; si falla, el plato no se guarda a medias (se puede guardar sin foto).
      let fotoPath: string | undefined;
      if (activo && fotoNueva) {
        const datos = new FormData();
        datos.set("foto", new File([fotoNueva.blob], "plato.jpg", { type: "image/jpeg" }));
        let subida: Awaited<ReturnType<typeof subirFotoPlato>>;
        try {
          subida = await subirFotoPlato(datos);
        } catch {
          setError("No se pudo subir la foto (¿sin señal?). Quítala para guardar el plato sin foto.");
          return;
        }
        if (!subida.ok) {
          setError(`${subida.error} Quítala para guardar el plato sin foto.`);
          return;
        }
        fotoPath = subida.datos.ruta;
      } else if (activo && sinFoto && plato?.foto_path) {
        fotoPath = ""; // quitar la que tenía
      }

      // La descripción solo viaja si cambió (así guardar nombre o precio no depende de ella).
      const descripcionLimpia = descripcion.trim();
      const cambioDescripcion = activo && descripcionLimpia !== (plato?.descripcion ?? "");
      const r = await guardarProducto({
        id: plato?.id ?? null,
        categoriaId,
        nombre,
        precio,
        disponible,
        activo,
        ...(cambioDescripcion ? { descripcion: descripcionLimpia } : {}),
        ...(fotoPath !== undefined ? { fotoPath } : {}),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCerrar();
    });
  }

  return (
    <HojaInferior titulo={plato ? "Editar plato" : "Plato nuevo"} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="plato-nombre">Nombre</Label>
          <Input id="plato-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoCapitalize="sentences" placeholder="Ej. Hamburguesa doble" />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">Precio</p>
          <button
            type="button"
            onClick={() => setEditandoPrecio(true)}
            className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-tinta bg-papel px-3 shadow-sello-chico active:translate-y-[2px] active:shadow-none"
          >
            <span className="cifra text-4xl">{formatearPesos(precio)}</span>
            <span className="flex items-center gap-1 text-sm font-bold text-tinta-2">
              <Pencil className="size-4" aria-hidden /> Cambiar
            </span>
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">Categoría</p>
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoriaId === c.id}
                onClick={() => setCategoriaId(c.id)}
                className={cn("min-h-12 rounded-xl border-2 border-tinta px-3 text-base font-bold active:translate-y-[2px]", categoriaId === c.id ? "bg-sol" : "bg-papel")}
              >
                {c.icono} {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-tinta px-3 py-1">
          <span className="text-base font-bold">¿Hay hoy?</span>
          <Interruptor activo={disponible} onCambio={setDisponible} etiqueta="Disponible hoy" textoActivo="Hay" textoInactivo="Agotado" />
        </div>

        {/* Lo que ven los clientes en el enlace para pedir: las dos cosas son opcionales. */}
        <fieldset className="space-y-3 rounded-xl border-2 border-dashed border-tinta/50 p-3">
          <legend className="px-1 text-base font-bold text-tinta-2">Para el menú de tus clientes</legend>
          <div>
            <Label htmlFor="plato-descripcion">Qué trae (opcional)</Label>
            <Textarea
              id="plato-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={160}
              rows={2}
              autoCapitalize="sentences"
              placeholder="Ej. Carne de res, queso, lechuga, tomate y salsa de la casa."
              className="min-h-20"
            />
            <p className="mt-0.5 text-right text-base text-tinta-2">{descripcion.length}/160</p>
          </div>

          <input ref={entradaFoto} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => void elegirFoto(e.target.files?.[0])} />
          {fotoQueSeVe ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto del plato: vista previa local (blob) o la de Storage */}
              <img src={fotoQueSeVe} alt={`Foto de ${nombre.trim() || "el plato"}`} width={96} height={96} className="size-24 shrink-0 rounded-xl border-2 border-tinta bg-fondo object-cover" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Button variante="secundario" disabled={pendiente} onClick={() => entradaFoto.current?.click()}>
                  <Camera className="size-5" aria-hidden /> Cambiar foto
                </Button>
                <Button variante="fantasma" disabled={pendiente} onClick={quitarFoto}>
                  <X className="size-5" aria-hidden /> Quitar foto
                </Button>
              </div>
            </div>
          ) : (
            <Button variante="secundario" bloque disabled={pendiente} onClick={() => entradaFoto.current?.click()}>
              <Camera className="size-5" aria-hidden /> Foto del plato (opcional)
            </Button>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0} onClick={() => guardar(true)}>
          {pendiente ? "Guardando…" : "Guardar plato"}
        </Button>
        {plato && !quitando && (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setQuitando(true)}>
            Quitar del menú
          </Button>
        )}
        {/* Quitar pide confirmación: antes bastaba un toque (y el botón queda justo debajo de "Guardar"). */}
        {plato && quitando && (
          <div role="group" aria-label="Confirmar quitar del menú" className="rounded-xl border-2 border-tinta bg-aji-suave p-3">
            <p className="text-lg font-bold leading-tight">¿Quitar «{plato.nombre}» del menú?</p>
            <p className="mt-1 text-base text-tinta-2">
              Deja de salir al tomar pedidos y en el enlace de tus clientes. No se borra: lo puedes volver a poner desde «Platos
              quitados», al final del menú.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variante="peligro" tamano="lg" disabled={pendiente} onClick={() => guardar(false)}>
                {pendiente ? "Quitando…" : "Sí, quitar"}
              </Button>
              <Button variante="secundario" tamano="lg" disabled={pendiente} onClick={() => setQuitando(false)}>
                No, dejarlo
              </Button>
            </div>
          </div>
        )}
      </div>

      {editandoPrecio && (
        <HojaMonto
          titulo="Precio"
          ayuda={nombre.trim() ? nombre.trim() : undefined}
          inicial={precio}
          onElegir={(v) => {
            setPrecio(v);
            setEditandoPrecio(false);
          }}
          onCerrar={() => setEditandoPrecio(false)}
        />
      )}
    </HojaInferior>
  );
}
