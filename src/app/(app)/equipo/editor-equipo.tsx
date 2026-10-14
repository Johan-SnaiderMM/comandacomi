"use client";

import { useState, useTransition } from "react";
import { Crown, Pencil, Plus, ShieldCheck, UserRound } from "lucide-react";
import { asignarRoles, guardarRol } from "@/app/acciones/equipo";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AREAS, TEXTO_AREA, type Area } from "@/lib/areas";
import type { Equipo, PersonaEquipo, RolEquipo } from "@/lib/datos/tipos";
import { cn } from "@/lib/utils";

const filaBoton =
  "flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-tinta bg-papel px-3 py-2 text-left shadow-sello-chico active:translate-y-[2px] active:shadow-none";
const filaMarcable = "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-tinta px-3 py-2";

/** "Tomar pedidos · Cobrar" */
const textoDeAreas = (areas: readonly Area[]) => areas.map((a) => TEXTO_AREA[a].titulo).join(" · ");

/** Lo que abre alguien con estos roles: la suma, en el orden de siempre. */
function areasDeRoles(roles: RolEquipo[], ids: string[]): Area[] {
  const elegidos = roles.filter((r) => ids.includes(r.id));
  return AREAS.filter((a) => elegidos.some((r) => r.areas.includes(a)));
}

/**
 * Más → Equipo (solo el dueño). Arriba los roles del local: cada uno abre algunas partes de la app (Tomar pedidos,
 * Plancha, Cobrar…). Abajo las personas, cada una con uno o varios roles: ve la suma. El dueño lo ve todo siempre.
 * Lo que se decide aquí lo hace cumplir la base de datos, no solo la pantalla.
 */
export function EditorEquipo({ equipo }: { equipo: Equipo }) {
  const [hojaRol, setHojaRol] = useState<{ rol: RolEquipo | null } | null>(null);
  const [persona, setPersona] = useState<PersonaEquipo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const nombreDe = new Map(equipo.roles.map((r) => [r.id, r.nombre]));

  function hecho(texto: string) {
    setAviso(texto);
    setHojaRol(null);
    setPersona(null);
  }

  return (
    <>
      <div className="space-y-5 px-4 pt-3">
        <p className="text-base text-tinta-2">Cada rol abre partes de la app. Una persona puede tener varios roles y ve la suma. El dueño lo ve todo.</p>
        {aviso && (
          <Aviso tipo="ok" onCerrar={() => setAviso(null)}>
            {aviso}
          </Aviso>
        )}

        <section aria-labelledby="titulo-roles" className="space-y-2">
          <h2 id="titulo-roles" className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
            Roles
          </h2>
          <ul className="space-y-2">
            {equipo.roles.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setHojaRol({ rol: r })} aria-label={`Rol ${r.nombre}: editar`} className={filaBoton}>
                  <ShieldCheck className="size-6 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-lg font-bold">{r.nombre}</span>
                    <span className="block text-base">{textoDeAreas(r.areas)}</span>
                    <span className="block text-base text-tinta-2">{r.personas === 0 ? "Nadie lo tiene" : r.personas === 1 ? "1 persona" : `${r.personas} personas`}</span>
                  </span>
                  <Pencil className="size-5 shrink-0 text-tinta-2" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-personas" className="space-y-2">
          <h2 id="titulo-personas" className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
            Personas
          </h2>
          <ul className="space-y-2">
            {equipo.personas.map((p) => {
              const roles = p.roles.map((id) => nombreDe.get(id)).filter((n): n is string => Boolean(n));
              if (p.rol === "dueno") {
                return (
                  <li key={p.user_id} className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-tinta bg-sol-suave px-3 py-2">
                    <Crown className="size-6 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-lg font-bold">
                        {p.nombre}
                        {p.yo && <span className="font-normal"> (tú)</span>}
                      </span>
                      <span className="block text-base">Dueño · lo ve todo</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={p.user_id}>
                  <button type="button" onClick={() => setPersona(p)} aria-label={`${p.nombre}: cambiar sus roles`} className={filaBoton}>
                    <UserRound className="size-6 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-lg font-bold">{p.nombre}</span>
                      {roles.length > 0 ? (
                        <span className="block text-base">{roles.join(" y ")}</span>
                      ) : (
                        <span className="block text-base font-bold text-aji">Sin rol: todavía no puede hacer nada</span>
                      )}
                    </span>
                    <Pencil className="size-5 shrink-0 text-tinta-2" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {equipo.personas.length === 1 && <p className="text-base text-tinta-2">Aquí aparece cada persona de tu equipo, con sus roles.</p>}
        </section>
      </div>

      <BarraAccion sobreNav>
        <Button tamano="lg" bloque onClick={() => setHojaRol({ rol: null })}>
          <Plus className="size-6" strokeWidth={3} aria-hidden /> Rol nuevo
        </Button>
      </BarraAccion>

      {hojaRol && <HojaRol key={hojaRol.rol?.id ?? "nuevo"} rol={hojaRol.rol} onHecho={hecho} onCerrar={() => setHojaRol(null)} />}
      {persona && <HojaPersona key={persona.user_id} persona={persona} roles={equipo.roles} onHecho={hecho} onCerrar={() => setPersona(null)} />}
    </>
  );
}

function HojaRol({ rol, onHecho, onCerrar }: { rol: RolEquipo | null; onHecho: (aviso: string) => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(rol?.nombre ?? "");
  const [areas, setAreas] = useState<Area[]>(rol?.areas ?? []);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function alternar(area: Area) {
    setAreas((v) => (v.includes(area) ? v.filter((a) => a !== area) : AREAS.filter((a) => a === area || v.includes(a))));
  }

  function guardar(activo: boolean) {
    setError(null);
    empezar(async () => {
      const r = await guardarRol({ id: rol?.id ?? null, nombre, areas, activo });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const limpio = nombre.trim().replace(/\s+/g, " ");
      onHecho(
        !activo
          ? `Quitaste el rol «${rol?.nombre}».`
          : rol
            ? `Rol «${limpio}» guardado.`
            : r.datos.recuperado
              ? `El rol «${limpio}» volvió. Asígnaselo a quien lo necesite.`
              : `Rol «${limpio}» creado. Asígnaselo a quien lo necesite.`
      );
    });
  }

  return (
    <HojaInferior titulo={rol ? "Editar rol" : "Rol nuevo"} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="rol-nombre">Nombre</Label>
          <Input
            id="rol-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={30}
            autoCapitalize="sentences"
            enterKeyHint="done"
            placeholder="Ej. Mesero, Cajero, Domiciliario"
          />
        </div>

        <fieldset className="space-y-2" disabled={pendiente}>
          <legend className="mb-1.5 text-base font-bold">¿Qué puede hacer?</legend>
          {AREAS.map((a) => {
            const marcada = areas.includes(a);
            return (
              <label key={a} className={cn(filaMarcable, marcada ? "bg-sol-suave" : "bg-papel")}>
                <input type="checkbox" checked={marcada} onChange={() => alternar(a)} className="size-6 shrink-0 accent-[var(--color-tinta)]" />
                <span className="min-w-0 leading-tight">
                  <span className="block text-base font-bold">{TEXTO_AREA[a].titulo}</span>
                  <span className="block text-base text-tinta-2">{TEXTO_AREA[a].detalle}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0 || areas.length === 0} onClick={() => guardar(true)}>
          {pendiente ? "Guardando…" : rol ? "Guardar" : "Crear rol"}
        </Button>

        {rol && !quitando && (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setQuitando(true)}>
            Quitar este rol
          </Button>
        )}
        {rol && quitando && (
          <div role="group" aria-label="Confirmar quitar el rol" className="rounded-xl border-2 border-tinta bg-aji-suave p-3">
            <p className="text-lg font-bold leading-tight">¿Quitar el rol «{rol.nombre}»?</p>
            <p className="mt-1 text-base text-tinta-2">
              {rol.personas === 0
                ? "Nadie lo tiene, así que nadie pierde nada."
                : `${rol.personas === 1 ? "La persona que lo tiene lo pierde" : `Las ${rol.personas} personas que lo tienen lo pierden`}, y con él lo que les abría.`}
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
    </HojaInferior>
  );
}

function HojaPersona({
  persona,
  roles,
  onHecho,
  onCerrar,
}: {
  persona: PersonaEquipo;
  roles: RolEquipo[];
  onHecho: (aviso: string) => void;
  onCerrar: () => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>(persona.roles);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const abre = areasDeRoles(roles, elegidos);

  function alternar(id: string) {
    setElegidos((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await asignarRoles({ userId: persona.user_id, roles: elegidos });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onHecho(r.datos.areas.length === 0 ? `${persona.nombre} quedó sin roles: no puede hacer nada.` : `${persona.nombre} ahora puede: ${textoDeAreas(r.datos.areas)}.`);
    });
  }

  return (
    <HojaInferior titulo={persona.nombre} onCerrar={onCerrar}>
      <div className="space-y-4">
        <fieldset className="space-y-2" disabled={pendiente}>
          <legend className="mb-1.5 text-base font-bold">¿Qué roles tiene? Puede tener varios.</legend>
          {roles.map((r) => {
            const marcado = elegidos.includes(r.id);
            return (
              <label key={r.id} className={cn(filaMarcable, marcado ? "bg-sol-suave" : "bg-papel")}>
                <input type="checkbox" checked={marcado} onChange={() => alternar(r.id)} className="size-6 shrink-0 accent-[var(--color-tinta)]" />
                <span className="min-w-0 leading-tight">
                  <span className="block text-base font-bold">{r.nombre}</span>
                  <span className="block text-base text-tinta-2">{textoDeAreas(r.areas)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <p className={cn("text-base", abre.length === 0 && "font-bold text-aji")} aria-live="polite">
          {abre.length === 0 ? "Sin roles no podrá hacer nada en la app." : `Con esto puede: ${textoDeAreas(abre)}.`}
        </p>

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente} onClick={guardar}>
          {pendiente ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </HojaInferior>
  );
}
