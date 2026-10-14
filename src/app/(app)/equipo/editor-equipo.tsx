"use client";

import { useState, useTransition } from "react";
import { Crown, Hourglass, MessageCircle, Pencil, Plus, QrCode, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { anularInvitacion, asignarRoles, crearInvitacion, guardarRol, quitarDelEquipo } from "@/app/acciones/equipo";
import { CodigoQr } from "@/components/clientes/codigo-qr";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Aviso } from "@/components/ui/aviso";
import { botonVariantes, Button } from "@/components/ui/button";
import { HojaInferior } from "@/components/ui/hoja-inferior";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AREAS, TEXTO_AREA, type Area } from "@/lib/areas";
import type { Equipo, InvitacionEquipo, PersonaEquipo, RolEquipo } from "@/lib/datos/tipos";
import { enlaceInvitacion, formatearCodigo, mensajeInvitacion } from "@/lib/invitaciones";
import { cn } from "@/lib/utils";
import { enlaceWhatsapp } from "@/lib/whatsapp";

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
 * Para sumar a alguien: "Agregar a alguien" da un código (con enlace y QR) que esa persona usa en SU celular.
 * Lo que se decide aquí lo hace cumplir la base de datos, no solo la pantalla.
 */
export function EditorEquipo({ equipo, restaurante }: { equipo: Equipo; restaurante: string }) {
  const [hojaRol, setHojaRol] = useState<{ rol: RolEquipo | null } | null>(null);
  const [persona, setPersona] = useState<PersonaEquipo | null>(null);
  const [invitando, setInvitando] = useState(false);
  const [invitacion, setInvitacion] = useState<InvitacionEquipo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const nombreDe = new Map(equipo.roles.map((r) => [r.id, r.nombre]));
  const nombresDe = (ids: string[]) => ids.map((id) => nombreDe.get(id)).filter((n): n is string => Boolean(n));
  const invitaciones = equipo.invitaciones ?? [];

  function hecho(texto: string) {
    setAviso(texto);
    setHojaRol(null);
    setPersona(null);
    setInvitando(false);
    setInvitacion(null);
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
          <Button variante="secundario" tamano="lg" bloque onClick={() => setHojaRol({ rol: null })}>
            <Plus className="size-6" strokeWidth={3} aria-hidden /> Rol nuevo
          </Button>
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
          {equipo.personas.length === 1 && invitaciones.length === 0 && (
            <p className="text-base text-tinta-2">Para sumar a alguien, toca «Agregar a alguien»: le das un código y entra desde su celular.</p>
          )}
        </section>

        {invitaciones.length > 0 && (
          <section aria-labelledby="titulo-invitaciones" className="space-y-2">
            <h2 id="titulo-invitaciones" className="font-display text-3xl font-extrabold uppercase leading-none tracking-tight">
              Esperando que entren
            </h2>
            <ul className="space-y-2">
              {invitaciones.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => setInvitacion(i)} aria-label={`Invitación de ${i.nombre}: ver el código`} className={cn(filaBoton, "border-dashed")}>
                    <Hourglass className="size-6 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-lg font-bold">{i.nombre}</span>
                      <span className="block text-base">{nombresDe(i.roles).join(" y ") || "Sin rol"}</span>
                      <span className="block font-mono text-base font-bold tracking-wider text-tinta-2">{formatearCodigo(i.codigo)}</span>
                    </span>
                    <QrCode className="size-5 shrink-0 text-tinta-2" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <BarraAccion sobreNav>
        <Button tamano="lg" bloque onClick={() => setInvitando(true)}>
          <UserPlus className="size-6" strokeWidth={2.75} aria-hidden /> Agregar a alguien
        </Button>
      </BarraAccion>

      {hojaRol && <HojaRol key={hojaRol.rol?.id ?? "nuevo"} rol={hojaRol.rol} onHecho={hecho} onCerrar={() => setHojaRol(null)} />}
      {persona && <HojaPersona key={persona.user_id} persona={persona} roles={equipo.roles} onHecho={hecho} onCerrar={() => setPersona(null)} />}
      {invitando && (
        <HojaInvitar
          roles={equipo.roles}
          onCreada={(i) => {
            setInvitando(false);
            setInvitacion(i);
          }}
          onCerrar={() => setInvitando(false)}
        />
      )}
      {invitacion && (
        <HojaInvitacion
          key={invitacion.id}
          invitacion={invitacion}
          roles={nombresDe(invitacion.roles)}
          restaurante={restaurante}
          onHecho={hecho}
          onCerrar={() => setInvitacion(null)}
        />
      )}
    </>
  );
}

/** "Agregar a alguien": su nombre y sus roles. La base da el código. */
function HojaInvitar({ roles, onCreada, onCerrar }: { roles: RolEquipo[]; onCreada: (i: InvitacionEquipo) => void; onCerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const abre = areasDeRoles(roles, elegidos);

  function crear() {
    setError(null);
    empezar(async () => {
      const r = await crearInvitacion({ nombre, roles: elegidos });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCreada({ ...r.datos, roles: elegidos });
    });
  }

  return (
    <HojaInferior titulo="Agregar a alguien" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="invitado-nombre">Nombre</Label>
          <Input
            id="invitado-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={40}
            autoCapitalize="words"
            enterKeyHint="done"
            placeholder="Ej. Carlos"
          />
        </div>

        <fieldset className="space-y-2" disabled={pendiente}>
          <legend className="mb-1.5 text-base font-bold">¿Qué roles tiene? Puede tener varios.</legend>
          {roles.map((r) => {
            const marcado = elegidos.includes(r.id);
            return (
              <label key={r.id} className={cn(filaMarcable, marcado ? "bg-sol-suave" : "bg-papel")}>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => setElegidos((v) => (v.includes(r.id) ? v.filter((x) => x !== r.id) : [...v, r.id]))}
                  className="size-6 shrink-0 accent-[var(--color-tinta)]"
                />
                <span className="min-w-0 leading-tight">
                  <span className="block text-base font-bold">{r.nombre}</span>
                  <span className="block text-base text-tinta-2">{textoDeAreas(r.areas)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {abre.length > 0 && <p className="text-base">Con esto podrá: {textoDeAreas(abre)}.</p>}

        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}

        <Button tamano="lg" bloque disabled={pendiente || nombre.trim().length === 0 || elegidos.length === 0} onClick={crear}>
          {pendiente ? "Creando…" : "Crear código"}
        </Button>
      </div>
    </HojaInferior>
  );
}

/** "Sirve hasta el jueves 15, 10:30 p. m." (hora de Colombia). Solo se arma en el celular, al abrir la hoja. */
function hastaCuando(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** El código de una invitación: grande, con su QR (abre /unirme con el código puesto) y para mandar por WhatsApp. */
function HojaInvitacion({
  invitacion,
  roles,
  restaurante,
  onHecho,
  onCerrar,
}: {
  invitacion: InvitacionEquipo;
  roles: string[];
  restaurante: string;
  onHecho: (aviso: string) => void;
  onCerrar: () => void;
}) {
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const enlace = enlaceInvitacion(window.location.origin, invitacion.codigo);

  function anular() {
    setError(null);
    empezar(async () => {
      const r = await anularInvitacion(invitacion.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onHecho(`Anulaste el código de ${invitacion.nombre}: ya no sirve.`);
    });
  }

  return (
    <HojaInferior titulo={`Código de ${invitacion.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-3 text-center">
        <p className="text-base text-tinta-2">{roles.length > 0 ? `Entra como ${roles.join(" y ")}.` : "Entra sin rol."}</p>
        <p className="font-mono text-4xl font-extrabold tracking-[0.15em]">{formatearCodigo(invitacion.codigo)}</p>
        <div className="flex justify-center">
          <CodigoQr texto={enlace} />
        </div>
        <p className="text-base">
          En el celular de {invitacion.nombre}: que escanee este código con la cámara, o que abra <strong>{window.location.host}/unirme</strong> y
          escriba el código.
        </p>
        <p className="text-base text-tinta-2">Sirve una sola vez, hasta el {hastaCuando(invitacion.expira_at)}.</p>
        <a
          href={enlaceWhatsapp({ texto: mensajeInvitacion({ nombre: invitacion.nombre, restaurante, enlace, codigo: invitacion.codigo }) })}
          target="_blank"
          rel="noopener noreferrer"
          className={botonVariantes({ variante: "exito", tamano: "lg", bloque: true })}
        >
          <MessageCircle className="size-5" aria-hidden /> Enviar por WhatsApp
        </a>
        <Button variante="secundario" tamano="lg" bloque onClick={onCerrar}>
          Listo
        </Button>

        {!anulando ? (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setAnulando(true)}>
            Anular este código
          </Button>
        ) : (
          <div role="group" aria-label="Confirmar anular el código" className="rounded-xl border-2 border-tinta bg-aji-suave p-3 text-left">
            <p className="text-lg font-bold leading-tight">¿Anular el código de {invitacion.nombre}?</p>
            <p className="mt-1 text-base text-tinta-2">Deja de servir. Si después lo necesitas, crea otro.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variante="peligro" tamano="lg" disabled={pendiente} onClick={anular}>
                {pendiente ? "Anulando…" : "Sí, anular"}
              </Button>
              <Button variante="secundario" tamano="lg" disabled={pendiente} onClick={() => setAnulando(false)}>
                No
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-base font-bold text-aji">
            {error}
          </p>
        )}
      </div>
    </HojaInferior>
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
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const abre = areasDeRoles(roles, elegidos);

  function alternar(id: string) {
    setElegidos((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  function quitar() {
    setError(null);
    empezar(async () => {
      const r = await quitarDelEquipo(persona.user_id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onHecho(`${persona.nombre} ya no está en el equipo: su celular perdió el acceso.`);
    });
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

        {!quitando ? (
          <Button variante="fantasma" bloque disabled={pendiente} onClick={() => setQuitando(true)}>
            Quitar del equipo
          </Button>
        ) : (
          <div role="group" aria-label="Confirmar quitar del equipo" className="rounded-xl border-2 border-tinta bg-aji-suave p-3">
            <p className="text-lg font-bold leading-tight">¿Quitar a {persona.nombre} del equipo?</p>
            <p className="mt-1 text-base text-tinta-2">Su celular pierde el acceso ya mismo. Si vuelve, le das un código nuevo.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variante="peligro" tamano="lg" disabled={pendiente} onClick={quitar}>
                {pendiente ? "Quitando…" : "Sí, quitar"}
              </Button>
              <Button variante="secundario" tamano="lg" disabled={pendiente} onClick={() => setQuitando(false)}>
                No
              </Button>
            </div>
          </div>
        )}
      </div>
    </HojaInferior>
  );
}
