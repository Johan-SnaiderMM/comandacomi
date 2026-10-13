"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { configurarHorario } from "@/app/acciones/clientes";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Interruptor } from "@/components/ui/interruptor";
import { MENSAJE_GENERICO } from "@/lib/errores";
import { DIAS_SEMANA, HORARIO_INICIAL, textoFranja, type Franja, type Horario } from "@/lib/horario";

/** De lunes a domingo, como se lee un horario en la puerta del local (en los datos el domingo es el 0). */
const ORDEN = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * Horario de atención de los pedidos en línea: a qué hora abre y cierra cada día. Con horario, los pedidos se abren y
 * se cierran solos; el interruptor de arriba sigue mandando (apagado = no se recibe aunque sea hora de atención).
 */
export function HorarioAtencion({ horario, esDueno }: { horario: Horario | null; esDueno: boolean }) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitando, empezarQuitar] = useTransition();

  function quitar() {
    setError(null);
    empezarQuitar(async () => {
      let r;
      try {
        r = await configurarHorario(null);
      } catch {
        r = { ok: false as const, error: MENSAJE_GENERICO };
      }
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section aria-label="Horario de atención" className="rounded-2xl border-2 border-tinta bg-papel p-4 shadow-sello">
      <h2 className="font-display flex items-center gap-2 text-3xl font-extrabold uppercase leading-none tracking-tight">
        <Clock className="size-7 shrink-0" aria-hidden /> Horario
      </h2>
      {horario ? (
        <>
          <p className="mt-1 text-base text-tinta-2">Los pedidos en línea se abren y se cierran solos a estas horas.</p>
          <dl className="mt-3 divide-y-2 divide-dashed divide-tinta/25 text-base">
            {ORDEN.map((d) => (
              <div key={d} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="font-bold">{DIAS_SEMANA[d]}</dt>
                <dd className={horario[d] ? "" : "text-tinta-2"}>{textoFranja(horario[d])}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="mt-1 text-base text-tinta-2">
          Sin horario: recibes pedidos mientras el interruptor de arriba esté encendido. Con un horario se abren y se cierran solos.
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}

      {esDueno ? (
        <div className="mt-3 grid gap-2">
          <Button variante="secundario" tamano="lg" bloque disabled={quitando} onClick={() => setEditando(true)}>
            {horario ? "Cambiar el horario" : "Poner un horario"}
          </Button>
          {horario && (
            <Button variante="fantasma" bloque disabled={quitando} onClick={quitar}>
              {quitando ? "Quitando…" : "Quitar el horario"}
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-base font-bold">Solo el dueño puede cambiar el horario.</p>
      )}

      {editando && <HojaHorario inicial={horario ?? HORARIO_INICIAL} onCerrar={() => setEditando(false)} />}
    </section>
  );
}

function HojaHorario({ inicial, onCerrar }: { inicial: Horario; onCerrar: () => void }) {
  const [dias, setDias] = useState<Horario>(inicial);
  // Lo último que tuvo cada día, para que apagar y volver a encender uno no le borre las horas.
  const [recordado, setRecordado] = useState<Horario>(inicial.map((d) => d ?? { abre: "11:00", cierra: "22:00" }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  function cambiar(dia: number, franja: Franja | null) {
    setDias((h) => h.map((d, i) => (i === dia ? franja : d)));
    if (franja) setRecordado((h) => h.map((d, i) => (i === dia ? franja : d)));
  }

  /** Copia el primer día que atiende a todos los demás (lo más común: mismo horario toda la semana). */
  function copiarATodos() {
    const modelo = ORDEN.map((d) => dias[d]).find((d) => d !== null);
    if (!modelo) return;
    setDias(dias.map(() => ({ ...modelo })));
    setRecordado(dias.map(() => ({ ...modelo })));
  }

  const repetida = dias.some((d) => d !== null && d.abre === d.cierra);
  const ninguno = dias.every((d) => d === null);

  function guardar() {
    setError(null);
    empezar(async () => {
      let r;
      try {
        r = await configurarHorario(dias);
      } catch {
        r = { ok: false as const, error: MENSAJE_GENERICO };
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.dispatchEvent(new Event("clientes:cambio")); // el aviso de pedidos cambia de ritmo al instante
      onCerrar();
    });
  }

  return (
    <HojaInferior titulo="Horario de atención" onCerrar={onCerrar}>
      <p className="text-base text-tinta-2">
        Si cierras después de medianoche (por ejemplo de 6:00 p. m. a 2:00 a. m.), ponlo tal cual: se entiende que cierra al día siguiente.
      </p>
      <ul className="mt-3 space-y-2">
        {ORDEN.map((d) => {
          const franja = dias[d];
          const nombre = DIAS_SEMANA[d];
          return (
            <li key={d} className="rounded-xl border-2 border-tinta px-3 py-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold">{nombre}</span>
                <Interruptor
                  activo={franja !== null}
                  onCambio={(v) => cambiar(d, v ? recordado[d] : null)}
                  etiqueta={`${nombre}: se atiende`}
                  textoActivo="Abre"
                  textoInactivo="Cerrado"
                />
              </div>
              {franja && (
                <div className="mb-1.5 grid grid-cols-2 gap-2">
                  <label className="block text-base font-bold">
                    Abre
                    <input
                      type="time"
                      value={franja.abre}
                      onChange={(e) => e.target.value && cambiar(d, { ...franja, abre: e.target.value.slice(0, 5) })}
                      aria-label={`${nombre}: hora en que abre`}
                      className="mt-0.5 block min-h-12 w-full rounded-xl border-2 border-tinta bg-papel px-2 text-base font-normal"
                    />
                  </label>
                  <label className="block text-base font-bold">
                    Cierra
                    <input
                      type="time"
                      value={franja.cierra}
                      onChange={(e) => e.target.value && cambiar(d, { ...franja, cierra: e.target.value.slice(0, 5) })}
                      aria-label={`${nombre}: hora en que cierra`}
                      className="mt-0.5 block min-h-12 w-full rounded-xl border-2 border-tinta bg-papel px-2 text-base font-normal"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Button variante="secundario" bloque className="mt-3" disabled={guardando || ninguno} onClick={copiarATodos}>
        Poner el mismo horario todos los días
      </Button>

      {(error || repetida || ninguno) && (
        <p role="alert" className="mt-3 text-base font-bold text-aji">
          {error ?? (ninguno ? "Marca al menos un día de atención." : "La hora de abrir y la de cerrar no pueden ser la misma.")}
        </p>
      )}

      <Button tamano="lg" bloque className="mt-3" disabled={guardando || repetida || ninguno} onClick={guardar}>
        {guardando ? "Guardando…" : "Guardar horario"}
      </Button>
    </HojaInferior>
  );
}
