"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, ChefHat, ChevronLeft, CloudOff, Undo2 } from "lucide-react";
import { deshacerPedidoListo, marcarItemListo, marcarPedidoListo } from "@/app/acciones/plancha";
import { Aviso } from "@/components/ui/aviso";
import type { PedidoPlancha, Plancha } from "@/lib/datos/tipos";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { destinoDePedido, idsNuevos, minutosDeEspera, progresoDePedido, separarPlancha, textoDeEspera, urgenciaDeEspera } from "@/lib/plancha";
import { activarSonido, desbloquearConElPrimerToque, sonidoActivo, suscribirSonido, tocar, vibrar } from "@/lib/sonido";
import { cn } from "@/lib/utils";

/** Cada cuánto se pregunta por pedidos nuevos y platos marcados (con el panel a la vista). */
const CADA_MS = 4_000;
const CLAVE_SILENCIO = "plancha:silencio";

/** Lo marcado en pantalla que el servidor todavía no confirmó (se ve al instante y se corrige si falla). */
type Marcas = Record<string, boolean>;

function aplicarMarcas(pedidos: PedidoPlancha[], marcas: Marcas): PedidoPlancha[] {
  if (Object.keys(marcas).length === 0) return pedidos;
  return pedidos.map((p) => {
    const items = p.items.map((i) => (i.id in marcas ? { ...i, listo: marcas[i.id] } : i));
    const todos = items.length > 0 && items.every((i) => i.listo);
    // Si con lo marcado ya no queda nada por preparar, el pedido pasa a "listo" en pantalla (el servidor hace lo mismo).
    const estado = todos && p.estado === "pendiente" ? "listo" : !todos && p.estado === "listo" ? "pendiente" : p.estado;
    return { ...p, items, estado };
  });
}

// El silencio se recuerda en este celular (localStorage); si no hay, vale mientras el panel esté abierto.
let silencioEnMemoria: boolean | null = null;
const oyentesSilencio = new Set<() => void>();

function leerSilencio(): boolean {
  if (silencioEnMemoria !== null) return silencioEnMemoria;
  try {
    return window.localStorage.getItem(CLAVE_SILENCIO) === "1";
  } catch {
    return false;
  }
}

function guardarSilencio(valor: boolean) {
  silencioEnMemoria = valor;
  try {
    window.localStorage.setItem(CLAVE_SILENCIO, valor ? "1" : "0");
  } catch {
    // sin localStorage: vale solo mientras el panel esté abierto
  }
  oyentesSilencio.forEach((f) => f());
}

function suscribirSilencio(oyente: () => void): () => void {
  oyentesSilencio.add(oyente);
  return () => {
    oyentesSilencio.delete(oyente);
  };
}

/**
 * Panel de la plancha: lo que hay que cocinar, pedido por pedido y plato por plato. Un toque marca un plato listo (y el
 * cliente lo ve en su celular); cuando todos los platos de un pedido están listos, el pedido pasa solo a "listo".
 * Se actualiza solo cada pocos segundos; los pedidos nuevos llegan con sonido y vibración.
 */
export function PanelPlancha({ inicial }: { inicial: Plancha }) {
  const [datos, setDatos] = useState<Plancha>(inicial);
  const [marcas, setMarcas] = useState<Marcas>({});
  const [error, setError] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const router = useRouter();
  const silencio = useSyncExternalStore(suscribirSilencio, leerSilencio, () => false);
  // En el servidor se asume que puede sonar (así el HTML inicial no trae el aviso de "activar sonido").
  const sonidoListo = useSyncExternalStore(suscribirSonido, sonidoActivo, () => true);
  const [llegados, setLlegados] = useState<Set<string>>(new Set());
  const vistos = useRef<Set<string>>(new Set(inicial.pedidos.map((p) => p.id)));
  const sinSesion = useRef(false);

  const consultar = useCallback(async () => {
    if (sinSesion.current || document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/plancha", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 401) {
        sinSesion.current = true; // la sesión venció: se vuelve a la portada para entrar de nuevo
        router.replace("/");
        return;
      }
      if (!r.ok) throw new Error("estado " + r.status);
      const nuevo = (await r.json()) as Plancha;
      const ids = idsNuevos(vistos.current, nuevo.pedidos);
      nuevo.pedidos.forEach((p) => vistos.current.add(p.id));
      setDatos(nuevo);
      setSinConexion(false);
      // Lo que el servidor ya confirmó deja de ser una marca pendiente.
      setMarcas((m) => {
        const resto: Marcas = {};
        for (const [id, valor] of Object.entries(m)) {
          const item = nuevo.pedidos.flatMap((p) => p.items).find((i) => i.id === id);
          if (item && item.listo !== valor) resto[id] = valor;
        }
        return Object.keys(resto).length === Object.keys(m).length ? m : resto;
      });
      if (ids.length > 0) {
        setLlegados((prev) => new Set([...prev, ...ids]));
        window.setTimeout(() => setLlegados((prev) => new Set([...prev].filter((x) => !ids.includes(x)))), 20_000);
        if (!leerSilencio()) {
          tocar("pedido-nuevo");
          vibrar("pedido-nuevo");
        }
      }
    } catch {
      setSinConexion(true);
    }
  }, [router]);

  useEffect(() => {
    const dejarDeEscucharToque = desbloquearConElPrimerToque();

    // Consulta periódica: la siguiente se programa al terminar la anterior (nunca dos a la vez).
    let parado = false;
    let reloj = 0;
    const programar = () => {
      window.clearTimeout(reloj);
      if (parado || sinSesion.current) return;
      reloj = window.setTimeout(() => void ciclo(), CADA_MS);
    };
    const ciclo = async () => {
      await consultar();
      programar();
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") void ciclo();
    };
    void ciclo();
    document.addEventListener("visibilitychange", alVolver);

    // Pantalla encendida mientras se cocina (si el navegador lo permite).
    let candado: WakeLockSentinel | null = null;
    const pedirCandado = async () => {
      try {
        candado = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        candado = null;
      }
    };
    void pedirCandado();
    const reanudar = () => {
      if (document.visibilityState === "visible") void pedirCandado();
    };
    document.addEventListener("visibilitychange", reanudar);

    return () => {
      parado = true;
      window.clearTimeout(reloj);
      dejarDeEscucharToque();
      document.removeEventListener("visibilitychange", alVolver);
      document.removeEventListener("visibilitychange", reanudar);
      void candado?.release().catch(() => {});
    };
  }, [consultar]);

  function alternarSilencio() {
    guardarSilencio(!silencio);
  }

  const pedidos = useMemo(() => aplicarMarcas(datos.pedidos, marcas), [datos.pedidos, marcas]);
  const { porPreparar, listos } = useMemo(() => separarPlancha(pedidos), [pedidos]);

  async function marcarPlato(itemId: string, listo: boolean) {
    setError(null);
    setMarcas((m) => ({ ...m, [itemId]: listo }));
    let r;
    try {
      r = await marcarItemListo(itemId, listo);
    } catch {
      r = { ok: false as const, error: MENSAJE_GENERICO };
    }
    if (!r.ok) {
      setMarcas((m) => {
        const { [itemId]: _quitada, ...resto } = m;
        return resto;
      });
      setError(r.error);
    }
    void consultar();
  }

  async function todoListo(p: PedidoPlancha) {
    setError(null);
    setMarcas((m) => ({ ...m, ...Object.fromEntries(p.items.map((i) => [i.id, true])) }));
    let r;
    try {
      r = await marcarPedidoListo(p.id);
    } catch {
      r = { ok: false as const, error: MENSAJE_GENERICO };
    }
    if (!r.ok) {
      setMarcas((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !p.items.some((i) => i.id === id))));
      setError(r.error);
    }
    void consultar();
  }

  async function deshacer(p: PedidoPlancha) {
    setError(null);
    setMarcas((m) => ({ ...m, ...Object.fromEntries(p.items.map((i) => [i.id, false])) }));
    let r;
    try {
      r = await deshacerPedidoListo(p.id);
    } catch {
      r = { ok: false as const, error: MENSAJE_GENERICO };
    }
    if (!r.ok) {
      setMarcas((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !p.items.some((i) => i.id === id))));
      setError(r.error);
    }
    void consultar();
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-5xl bg-fondo">
      <header className="sticky top-0 z-20 flex min-h-14 items-center gap-1 border-b-2 border-tinta bg-fondo px-2 pt-[env(safe-area-inset-top,0px)]">
        <Link href="/inicio" aria-label="Volver" className="tap flex items-center justify-center rounded-full active:bg-tinta/10">
          <ChevronLeft className="size-7" strokeWidth={3} aria-hidden />
        </Link>
        <h1 className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">Plancha</h1>
        <span className="ml-0.5 shrink-0 whitespace-nowrap rounded-full border-2 border-tinta bg-sol px-2.5 py-0.5 text-base font-extrabold leading-tight">
          {porPreparar.length} por preparar
        </span>
        <button
          type="button"
          onClick={alternarSilencio}
          aria-pressed={silencio}
          aria-label={silencio ? "Activar el sonido de pedidos nuevos" : "Silenciar el sonido de pedidos nuevos"}
          className="tap ml-auto flex items-center justify-center rounded-full active:bg-tinta/10"
        >
          {silencio ? <BellOff className="size-6" aria-hidden /> : <Bell className="size-6" aria-hidden />}
        </button>
      </header>

      <main className="space-y-4 px-3 pb-10 pt-3">
        {sinConexion && (
          <div role="status" className="flex items-center gap-2 rounded-xl border-2 border-tinta bg-sol px-3 py-2 text-base font-bold">
            <CloudOff className="size-5 shrink-0" aria-hidden /> Sin conexión: no se ven pedidos nuevos hasta que vuelva la señal.
          </div>
        )}
        {!sonidoListo && !silencio && (
          <button
            type="button"
            onClick={() => activarSonido()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-tinta bg-papel px-3 text-base font-bold"
          >
            <Bell className="size-5" aria-hidden /> Toca para activar el sonido de pedidos nuevos
          </button>
        )}
        {error && (
          <Aviso tipo="error" onCerrar={() => setError(null)}>
            {error}
          </Aviso>
        )}

        {porPreparar.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-1 pt-8">
            <ChefHat className="size-12" aria-hidden />
            <h2 className="font-display text-4xl font-extrabold uppercase leading-none">Todo al día</h2>
            <p className="text-lg text-tinta-2">No hay nada por preparar. Cuando llegue un pedido aparece aquí solo, con sonido.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Pedidos por preparar">
            {porPreparar.map((p) => (
              <TarjetaPedido key={p.id} pedido={p} ahora={datos.ahora} nuevo={llegados.has(p.id)} onPlato={marcarPlato} onTodo={() => void todoListo(p)} />
            ))}
          </ul>
        )}

        {listos.length > 0 && (
          <section aria-label="Listos hace poco" className="space-y-2">
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight text-listo">Listos hace poco</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {listos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-listo bg-listo-suave px-3 py-2">
                  <span className="min-w-0">
                    <span className="cifra mr-2 text-2xl">#{p.numero}</span>
                    <span className="text-base font-bold">{destinoDePedido(p)}</span>
                    <span className="block text-sm text-tinta-2">{p.items.length === 1 ? "1 plato" : `${p.items.length} platos`} listos</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void deshacer(p)}
                    className="flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border-2 border-tinta bg-papel px-3 text-base font-bold active:translate-y-[2px]"
                  >
                    <Undo2 className="size-5" aria-hidden /> Deshacer
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

const COLOR_TIPO: Record<string, string> = {
  mesa: "bg-tinta text-papel",
  domicilio: "bg-aji text-papel",
  llevar: "bg-sol text-tinta",
};

function TarjetaPedido({
  pedido: p,
  ahora,
  nuevo,
  onPlato,
  onTodo,
}: {
  pedido: PedidoPlancha;
  ahora: string;
  nuevo: boolean;
  onPlato: (itemId: string, listo: boolean) => void;
  onTodo: () => void;
}) {
  const espera = minutosDeEspera(p.confirmado_at ?? p.created_at, ahora);
  const urgencia = urgenciaDeEspera(espera, p.tiempo_estimado_min);
  const { listos, total } = progresoDePedido(p);

  return (
    <li className={cn("overflow-hidden rounded-2xl border-2 border-tinta bg-papel shadow-sello", nuevo && "plancha-llega")}>
      <div className={cn("flex items-center justify-between gap-2 px-3 py-2", COLOR_TIPO[p.tipo] ?? COLOR_TIPO.llevar)}>
        <p className="min-w-0">
          <span className="cifra mr-2 text-3xl">#{p.numero}</span>
          <span className="text-xl font-extrabold leading-tight">{destinoDePedido(p)}</span>
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full border-2 border-tinta px-2.5 py-0.5 text-base font-extrabold leading-tight",
            urgencia === "urgente" ? "bg-aji text-papel" : urgencia === "atencion" ? "bg-sol text-tinta" : "bg-papel text-tinta"
          )}
        >
          {textoDeEspera(espera)}
        </span>
      </div>

      {p.notas && <p className="border-b-2 border-dashed border-tinta/30 px-3 py-2 text-lg font-bold">“{p.notas}”</p>}

      <ul className="divide-y-2 divide-dashed divide-tinta/25">
        {p.items.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              aria-pressed={i.listo}
              onClick={() => onPlato(i.id, !i.listo)}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left transition-colors active:bg-sol/40",
                i.listo ? "bg-listo-suave" : "bg-papel"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-tinta",
                  i.listo ? "bg-listo text-papel" : "bg-papel"
                )}
              >
                {i.listo && <Check className="size-6" strokeWidth={4} />}
              </span>
              <span className={cn("min-w-0 flex-1 leading-tight", i.listo && "text-tinta-2 line-through decoration-2")}>
                <span className="cifra mr-2 text-3xl">{i.cantidad}×</span>
                <span className="text-xl font-extrabold">{i.nombre}</span>
                {i.adiciones.length > 0 && <span className="block text-lg font-bold">+ {i.adiciones.map((a) => a.nombre).join(", ")}</span>}
                {i.notas && <span className="block text-lg font-extrabold text-aji">“{i.notas}”</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t-2 border-tinta bg-papel p-2">
        <button
          type="button"
          onClick={onTodo}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-tinta bg-listo px-3 text-lg font-extrabold text-papel shadow-sello transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none"
        >
          <Check className="size-6" strokeWidth={4} aria-hidden /> Todo listo
          <span className="text-base font-bold opacity-90">
            ({listos}/{total})
          </span>
        </button>
      </div>
    </li>
  );
}
