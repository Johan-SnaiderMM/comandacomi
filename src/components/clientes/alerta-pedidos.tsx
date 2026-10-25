"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import type { ResumenPorConfirmar } from "@/lib/datos/tipos";
import { formatearPesos } from "@/lib/dinero";
import { idsNuevos, textoDeAviso } from "@/lib/plancha";
import { obtenerPulso, type Pulso } from "@/lib/pulso";
import { RITMO_AVISO, RITMO_AVISO_EN_CALMA } from "@/lib/ritmo";
import { activarSonido, desbloquearConElPrimerToque, sonidoActivo, suscribirSonido, tocar, vibrar } from "@/lib/sonido";

/** Mientras haya pedidos sin atender, el sonido se repite. */
const REPETIR_MS = 9_000;
const VACIO: ResumenPorConfirmar = { activo: true, atiende: true, cantidad: 0, recientes: [] };

/**
 * Cada cuánto pregunta el aviso: si ahora no puede llegar ningún pedido (en línea apagado o fuera del horario) y no hay
 * ninguno esperando, con calma; si no, rápido y más espaciado mientras no llegue nada (lib/ritmo.ts).
 */
function ritmoDelAviso(ultimo: Pulso | null) {
  if (!ultimo) return RITMO_AVISO;
  const r = ultimo.porConfirmar;
  if (!r) return null; // la base dice que esta persona no toma pedidos: no hace falta preguntar por esto
  return r.atiende || r.cantidad > 0 ? RITMO_AVISO : RITMO_AVISO_EN_CALMA;
}

/*
 * Estado que debe sobrevivir a que el componente se vuelva a montar (al pasar de una pantalla con barra de navegación a
 * una de tarea, p. ej. Pendientes → Cobrar, el layout cambia): si no, un aviso silenciado volvería a sonar y los pedidos
 * ya avisados volverían a sonar como "nuevos". Se pierde al recargar la página, que es lo correcto.
 */
const vistosEnLaPestana = new Set<string>();
let silenciadoEnLaPestana = false;

/**
 * Aviso de pedidos en línea por confirmar (con la app abierta): parpadea, suena y el título titila hasta que se atienden;
 * «Silenciar» deja solo una franja chica. No pregunta por su cuenta: escucha el pulso (`lib/pulso.ts`).
 */
export function AlertaPedidosClientes() {
  const ruta = usePathname();
  const [resumen, setResumen] = useState<ResumenPorConfirmar>(() => obtenerPulso()?.ultimo()?.porConfirmar ?? VACIO);
  const [silenciado, setSilenciadoEstado] = useState(() => silenciadoEnLaPestana);
  // En el servidor se asume que puede sonar (así el HTML inicial no trae el aviso de "activar sonido").
  const sonidoListo = useSyncExternalStore(suscribirSonido, sonidoActivo, () => true);

  const silenciar = useCallback((valor: boolean) => {
    silenciadoEnLaPestana = valor;
    setSilenciadoEstado(valor);
  }, []);

  const recibir = useCallback(
    (datos: ResumenPorConfirmar) => {
      const nuevos = idsNuevos(vistosEnLaPestana, datos.recientes);
      datos.recientes.forEach((x) => vistosEnLaPestana.add(x.id));
      setResumen(datos);
      if (nuevos.length > 0) {
        silenciar(false);
        tocar("pedido-nuevo");
        vibrar("pedido-nuevo");
      }
    },
    [silenciar]
  );

  // El pulso pregunta al ritmo del aviso, al volver a la pestaña y cuando otra pantalla avisa que algo cambió
  // (aceptar/rechazar/abrir, con el evento "clientes:cambio").
  useEffect(() => {
    const pulso = obtenerPulso();
    if (!pulso) return;
    return pulso.escuchar({
      ritmo: ritmoDelAviso,
      alPulso: (p) => {
        if (p.porConfirmar) recibir(p.porConfirmar);
      },
      alFallar: (f) => {
        if (f === "sin-sesion") setResumen(VACIO); // la sesión venció: no hay a quién avisarle
      },
    });
  }, [recibir]);

  // El navegador solo deja sonar tras un toque: el primero en cualquier parte de la app desbloquea el sonido.
  useEffect(() => desbloquearConElPrimerToque(), []);

  const hay = resumen.cantidad > 0;

  // Sonido repetido mientras haya pedidos sin atender y no se haya silenciado.
  useEffect(() => {
    if (!hay || silenciado) return;
    const reloj = window.setInterval(() => {
      tocar("pedido-nuevo");
      vibrar("pedido-nuevo");
    }, REPETIR_MS);
    return () => window.clearInterval(reloj);
  }, [hay, silenciado]);

  // El título de la pestaña titila para llamar la atención aunque la app no esté a la vista.
  useEffect(() => {
    if (!hay) return;
    const original = document.title;
    let alterno = false;
    const reloj = window.setInterval(() => {
      alterno = !alterno;
      document.title = alterno ? `🔔 (${resumen.cantidad}) ¡Pedido nuevo!` : original;
    }, 1_200);
    return () => {
      window.clearInterval(reloj);
      document.title = original;
    };
  }, [hay, resumen.cantidad]);

  if (!hay) return null;

  const enPedidos = ruta === "/pedidos";
  const texto = textoDeAviso(resumen, formatearPesos);

  // Ya silenciado: una franja pequeña, dentro de la página (no tapa el encabezado), que no desaparece hasta atenderlo.
  // En la propia lista de Pendientes no hace falta: las tarjetas por confirmar ya están arriba.
  if (silenciado) {
    if (enPedidos) return null;
    return (
      <Link
        href="/pedidos"
        className="flex min-h-12 items-center justify-between gap-2 border-b-2 border-tinta bg-aji px-3 pt-[env(safe-area-inset-top,0px)] text-base font-bold text-papel"
      >
        <span className="flex items-center gap-2">
          <BellRing className="size-5 shrink-0" aria-hidden />
          {resumen.cantidad === 1 ? "1 pedido por confirmar" : `${resumen.cantidad} pedidos por confirmar`}
        </span>
        <span className="underline">Ver</span>
      </Link>
    );
  }

  // En la propia lista de Pendientes las tarjetas por confirmar ya están arriba y son lo importante: aquí el aviso es
  // una franja baja (solo tapa el encabezado, que no trae nada que tocar) con sonido hasta que se atienda o se silencie.
  if (enPedidos) {
    return (
      <div
        role="alert"
        className="alerta-parpadeo fixed inset-x-0 top-0 z-50 mx-auto flex min-h-14 w-full max-w-[var(--ancho-app)] items-center gap-2 border-b-2 border-tinta px-3 pt-[env(safe-area-inset-top,0px)] shadow-sello"
      >
        <BellRing className="alerta-campana size-6 shrink-0" strokeWidth={2.5} aria-hidden />
        <p className="min-w-0 flex-1 text-base font-extrabold leading-tight">
          ¡Pedido nuevo! <span className="font-bold">{texto}</span>
        </p>
        <button
          type="button"
          onClick={() => silenciar(true)}
          aria-label="Silenciar el aviso"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-tinta bg-papel text-tinta shadow-sello-chico"
        >
          <VolumeX className="size-5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="alerta-parpadeo fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-[var(--ancho-app)] border-b-4 border-tinta px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] shadow-sello"
    >
      <div className="flex items-center gap-3">
        <BellRing className="alerta-campana size-10 shrink-0" strokeWidth={2.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display text-4xl font-extrabold uppercase leading-none tracking-tight">¡Pedido nuevo!</p>
          <p className="mt-1 text-lg font-bold leading-tight">{texto}</p>
        </div>
      </div>
      {!sonidoListo && (
        <button
          type="button"
          onClick={() => activarSonido()}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-tinta bg-papel px-3 text-base font-bold text-tinta"
        >
          <Volume2 className="size-5" aria-hidden /> Toca para activar el sonido
        </button>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link
          href="/pedidos"
          className="flex min-h-14 items-center justify-center rounded-xl border-2 border-tinta bg-tinta px-3 text-lg font-extrabold text-papel shadow-sello"
        >
          Ver y aceptar
        </Link>
        <button
          type="button"
          onClick={() => silenciar(true)}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-tinta bg-papel px-3 text-lg font-bold text-tinta shadow-sello"
        >
          <VolumeX className="size-5" aria-hidden /> Silenciar
        </button>
      </div>
    </div>
  );
}
