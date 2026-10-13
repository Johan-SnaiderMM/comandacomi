"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { BellRing, BellOff, Send } from "lucide-react";
import { estadoAvisos, guardarAvisos, probarAviso, quitarAvisos } from "@/app/acciones/avisos";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { MENSAJE_GENERICO } from "@/lib/errores";
import {
  activarAvisos,
  avisosDisponibles,
  avisosSoportados,
  desactivarAvisos,
  esIosSinInstalar,
  permisoDeAvisos,
  suscripcionActual,
} from "@/lib/push/cliente";
import { CANALES_PERSONAL, TEXTOS_CANAL, type CanalPersonal, type SuscripcionJson } from "@/lib/push/tipos";
import { cn } from "@/lib/utils";

const sinSuscripcion = () => () => {};

type Estado = { cargando: boolean; activa: boolean; canales: CanalPersonal[]; suscripcion: SuscripcionJson | null };

/**
 * "Avisos en este celular": el dueño, la parrilla y el mesero activan en SU celular los avisos que les tocan, y les
 * llegan aunque la app esté cerrada (pedido nuevo, pedido a la plancha, pedido listo para entregar).
 */
export function AvisosDelCelular() {
  const disponible = useSyncExternalStore(sinSuscripcion, avisosDisponibles, () => false);
  const soportado = useSyncExternalStore(sinSuscripcion, avisosSoportados, () => false);
  const ios = useSyncExternalStore(sinSuscripcion, esIosSinInstalar, () => false);
  const permiso = useSyncExternalStore(sinSuscripcion, permisoDeAvisos, () => "default" as const);

  const [estado, setEstado] = useState<Estado>({ cargando: true, activa: false, canales: [], suscripcion: null });
  const [elegidos, setElegidos] = useState<CanalPersonal[]>(["pedidos", "listos"]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  // Si este celular ya tenía avisos, se muestran tal cual quedaron.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const sub = await suscripcionActual("personal");
        if (!sub) {
          if (!cancelado) setEstado({ cargando: false, activa: false, canales: [], suscripcion: null });
          return;
        }
        const r = await estadoAvisos(sub.endpoint);
        if (cancelado) return;
        if (r.ok && r.datos.activa) {
          setEstado({ cargando: false, activa: true, canales: r.datos.canales, suscripcion: sub });
          setElegidos(r.datos.canales);
        } else {
          setEstado({ cargando: false, activa: false, canales: [], suscripcion: sub });
        }
      } catch {
        if (!cancelado) setEstado({ cargando: false, activa: false, canales: [], suscripcion: null });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  function alternar(canal: CanalPersonal) {
    setOk(null);
    setElegidos((v) => (v.includes(canal) ? v.filter((c) => c !== canal) : [...v, canal]));
  }

  function activar() {
    setError(null);
    setOk(null);
    empezar(async () => {
      try {
        const sub = await activarAvisos("personal");
        const r = await guardarAvisos(sub, elegidos);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setEstado({ cargando: false, activa: true, canales: r.datos.canales, suscripcion: sub });
        setOk("Avisos activados en este celular.");
      } catch (e) {
        setError(e instanceof Error ? e.message : MENSAJE_GENERICO);
      }
    });
  }

  function guardarCambios() {
    if (!estado.suscripcion) return;
    const sub = estado.suscripcion;
    setError(null);
    setOk(null);
    empezar(async () => {
      const r = await guardarAvisos(sub, elegidos).catch(() => ({ ok: false as const, error: MENSAJE_GENERICO }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEstado((e) => ({ ...e, canales: r.datos.canales }));
      setOk("Listo: avisos actualizados.");
    });
  }

  function desactivar() {
    setError(null);
    setOk(null);
    empezar(async () => {
      try {
        const endpoint = await desactivarAvisos("personal");
        if (endpoint) await quitarAvisos(endpoint);
        setEstado({ cargando: false, activa: false, canales: [], suscripcion: null });
        setOk("Avisos desactivados en este celular.");
      } catch (e) {
        setError(e instanceof Error ? e.message : MENSAJE_GENERICO);
      }
    });
  }

  function probar() {
    if (!estado.suscripcion) return;
    const sub = estado.suscripcion;
    setError(null);
    setOk(null);
    empezar(async () => {
      const r = await probarAviso(sub).catch(() => ({ ok: false as const, error: MENSAJE_GENERICO }));
      if (!r.ok) setError(r.error);
      else setOk("Aviso enviado: debería llegarte en unos segundos.");
    });
  }

  const cambiaron = estado.activa && (elegidos.length !== estado.canales.length || elegidos.some((c) => !estado.canales.includes(c)));

  return (
    <section aria-label="Avisos en este celular" className="rounded-2xl border-2 border-tinta bg-papel p-4 shadow-sello">
      <h2 className="flex items-center gap-2 font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
        {estado.activa ? <BellRing className="size-6 shrink-0" aria-hidden /> : <BellOff className="size-6 shrink-0" aria-hidden />}
        Avisos en este celular
      </h2>
      <p className="mt-1 text-base text-tinta-2">Te llegan aunque la app esté cerrada, como un mensaje.</p>

      {!soportado ? (
        <p className="mt-3 text-base font-bold">
          {ios
            ? "En iPhone, primero agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí."
            : "Este navegador no permite avisos. En Android usa Chrome."}
        </p>
      ) : !disponible ? (
        <p className="mt-3 text-base font-bold">Los avisos todavía no están configurados en este servidor.</p>
      ) : permiso === "denied" && !estado.activa ? (
        <p className="mt-3 text-base font-bold">
          Bloqueaste los avisos para esta página. Actívalos en la configuración del navegador (el candado junto a la dirección) y vuelve aquí.
        </p>
      ) : (
        <>
          <fieldset className="mt-3 space-y-2" disabled={ocupado}>
            <legend className="sr-only">¿Qué avisos quieres en este celular?</legend>
            {CANALES_PERSONAL.map((canal) => {
              const marcado = elegidos.includes(canal);
              return (
                <label
                  key={canal}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-tinta px-3 py-2",
                    marcado ? "bg-sol-suave" : "bg-papel"
                  )}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(canal)} className="size-6 shrink-0 accent-[var(--color-tinta)]" />
                  <span className="min-w-0 leading-tight">
                    <span className="block text-base font-bold">{TEXTOS_CANAL[canal].titulo}</span>
                    <span className="block text-base text-tinta-2">{TEXTOS_CANAL[canal].detalle}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {error && (
            <Aviso tipo="error" className="mt-3" onCerrar={() => setError(null)}>
              {error}
            </Aviso>
          )}
          {ok && (
            <Aviso tipo="ok" className="mt-3" onCerrar={() => setOk(null)}>
              {ok}
            </Aviso>
          )}

          <div className="mt-3 space-y-2">
            {!estado.activa ? (
              <Button tamano="lg" bloque disabled={ocupado || estado.cargando || elegidos.length === 0} onClick={activar}>
                {ocupado ? "Activando…" : "Activar avisos"}
              </Button>
            ) : (
              <>
                {cambiaron && (
                  <Button tamano="lg" bloque disabled={ocupado || elegidos.length === 0} onClick={guardarCambios}>
                    Guardar cambios
                  </Button>
                )}
                <Button variante="secundario" tamano="lg" bloque disabled={ocupado} onClick={probar}>
                  <Send className="size-5" aria-hidden /> Probar aviso
                </Button>
                <Button variante="fantasma" bloque disabled={ocupado} onClick={desactivar}>
                  Desactivar en este celular
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
