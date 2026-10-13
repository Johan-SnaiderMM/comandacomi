-- =====================================================================
-- 15 · Mesas administrables desde la app, y PIN para reiniciar la demo
--
--   1. Las mesas solo se podían cambiar tocando la base. Ahora el dueño las crea, les cambia el nombre y las quita
--      desde la app (quitar = desactivar: los pedidos de antes conservan su mesa). Las adiciones ya tenían su función
--      (guardar_modificador); solo les faltaba la pantalla.
--   2. En la demo todo el mundo entra con el mismo usuario: cualquiera con el enlace podía tocar "Reiniciar demo" en
--      plena visita. Ahora se puede poner un PIN. Reglas:
--        · El PIN se define SOLO desde el SQL Editor de Supabase (quien administra la demo), nunca desde la app:
--            select public.fn_definir_pin_reinicio('4821');      -- ponerlo o cambiarlo (4 a 8 dígitos)
--            select public.fn_definir_pin_reinicio(null);        -- quitarlo
--          Así un visitante no puede ponerle uno a la demo ni cambiar el que hay.
--        · Se guarda cifrado (SHA-256 con el id del restaurante) en una tabla que nadie puede leer.
--        · Cinco intentos fallidos bloquean el reinicio 5 minutos.
--        · Un PIN equivocado NO lanza error: devuelve {ok:false}. Si lanzara, la base desharía la transacción y con ella
--          el conteo de intentos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mesas
-- ---------------------------------------------------------------------
create unique index if not exists ux_mesas_nombre on public.mesas (restaurante_id, lower(nombre)) where activa;

-- Mesas activas con su estado (para la pantalla "Mesas").
create or replace function public.listar_mesas_admin()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nombre', t.nombre, 'orden', t.orden,
           'ocupada', exists (select 1 from public.pedidos o
                               where o.mesa_id = t.id and not o.anulado and o.cobrado_at is null)
         ) order by t.orden, t.nombre), '[]'::jsonb)
    from public.mesas t
   where t.activa
$$;

-- Crea, renombra o quita (p_activa = false) una mesa. Solo el dueño.
create or replace function public.guardar_mesa(p_id uuid, p_nombre text, p_activa boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 30);
  v_id uuid;
  v_activa boolean := coalesce(p_activa, true);
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre de la mesa.';
  end if;

  if p_id is null then
    if (select count(*) from public.mesas where restaurante_id = v_rest and activa) >= 60 then
      raise exception 'Ya tienes muchas mesas. Quita alguna que no uses.';
    end if;
    if exists (select 1 from public.mesas where restaurante_id = v_rest and activa and lower(nombre) = lower(v_nombre)) then
      raise exception 'Ya hay una mesa con ese nombre.';
    end if;
    -- Una mesa que se había quitado con ese nombre vuelve (no se duplica: sus pedidos de antes siguen siendo suyos).
    select id into v_id from public.mesas
     where restaurante_id = v_rest and not activa and lower(nombre) = lower(v_nombre)
     order by created_at desc limit 1;
    if v_id is not null then
      update public.mesas
         set activa = true, nombre = v_nombre,
             orden = (select coalesce(max(orden), 0) + 1 from public.mesas where restaurante_id = v_rest and activa)
       where id = v_id and restaurante_id = v_rest;
      return jsonb_build_object('id', v_id, 'recuperada', true);
    end if;
    insert into public.mesas (restaurante_id, nombre, orden)
    values (v_rest, v_nombre, (select coalesce(max(orden), 0) + 1 from public.mesas where restaurante_id = v_rest))
    returning id into v_id;
    return jsonb_build_object('id', v_id);
  end if;

  perform 1 from public.mesas where id = p_id and restaurante_id = v_rest for update;
  if not found then
    raise exception 'La mesa no existe.' using errcode = 'P0002';
  end if;
  if not v_activa and exists (select 1 from public.pedidos o
                               where o.restaurante_id = v_rest and o.mesa_id = p_id and not o.anulado and o.cobrado_at is null) then
    raise exception 'Esa mesa tiene un pedido sin cobrar. Cóbralo o anúlalo antes de quitarla.';
  end if;

  begin
    update public.mesas set nombre = v_nombre, activa = v_activa where id = p_id and restaurante_id = v_rest;
  exception when unique_violation then
    raise exception 'Ya hay una mesa con ese nombre.';
  end;
  return jsonb_build_object('id', p_id);
end $$;

-- ---------------------------------------------------------------------
-- 2. PIN para reiniciar la demo
-- ---------------------------------------------------------------------
alter table public.restaurantes add column if not exists reinicio_con_pin boolean not null default false;
comment on column public.restaurantes.reinicio_con_pin is 'true = reiniciar la demo pide PIN (lo define quien administra la base; ver fn_definir_pin_reinicio).';

create table if not exists public.pines_reinicio (
  restaurante_id  uuid primary key references public.restaurantes(id) on delete cascade,
  hash            text not null,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_at  timestamptz not null default now()
);
alter table public.pines_reinicio enable row level security;
-- Sin políticas y sin permisos: nadie la lee (ni el dueño); solo las funciones de abajo.
revoke all on public.pines_reinicio from anon, authenticated;
comment on table public.pines_reinicio is 'PIN (cifrado) para reiniciar la demo y sus intentos fallidos. Nadie la lee directamente.';

create or replace function public.fn_hash_pin(p_rest uuid, p_pin text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select encode(sha256(convert_to(p_rest::text || ':' || coalesce(p_pin, ''), 'UTF8')), 'hex') $$;

-- Pone, cambia o quita (null) el PIN. Es fn_*: no la puede ejecutar ningún usuario de la app, solo quien administra
-- la base (SQL Editor). Sin p_restaurante aplica a TODOS los restaurantes de demostración. Devuelve a cuántos.
create or replace function public.fn_definir_pin_reinicio(p_pin text, p_restaurante uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pin text := nullif(btrim(coalesce(p_pin, '')), '');
  v_n integer := 0;
  r record;
begin
  if v_pin is not null and v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'El PIN debe tener entre 4 y 8 dígitos.';
  end if;
  for r in select id from public.restaurantes where es_demo and (p_restaurante is null or id = p_restaurante) loop
    if v_pin is null then
      delete from public.pines_reinicio where restaurante_id = r.id;
    else
      insert into public.pines_reinicio (restaurante_id, hash)
      values (r.id, public.fn_hash_pin(r.id, v_pin))
      on conflict (restaurante_id) do update
        set hash = excluded.hash, intentos = 0, bloqueado_hasta = null, actualizado_at = now();
    end if;
    update public.restaurantes set reinicio_con_pin = (v_pin is not null) where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- La app necesita saber si debe pedir el PIN (nunca cuál es).
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurante', (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'es_demo', r.es_demo,
                                              'slug', r.slug, 'pedidos_en_linea', r.pedidos_en_linea,
                                              'reinicio_con_pin', r.reinicio_con_pin)
                      from public.restaurantes r limit 1),
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'rol', p.rol)
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

-- Reiniciar la demo: igual que antes, y si hay PIN lo exige.
drop function if exists public.reiniciar_demo(text, text);

create or replace function public.reiniciar_demo(
  p_nombre text default null,
  p_conservar_endpoint text default null,
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_r public.restaurantes%rowtype;
  v_pin public.pines_reinicio%rowtype;
  v_fallos integer;
  v_slug text;
  v_viejos text[];
begin
  select * into v_r from public.restaurantes where id = v_rest for update;
  if not coalesce(v_r.es_demo, false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;

  select * into v_pin from public.pines_reinicio where restaurante_id = v_rest for update;
  if found then
    if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
      return jsonb_build_object('ok', false, 'motivo', 'bloqueado',
                                'minutos', greatest(1, ceil(extract(epoch from (v_pin.bloqueado_hasta - now())) / 60.0)::int));
    end if;
    if public.fn_hash_pin(v_rest, btrim(coalesce(p_pin, ''))) <> v_pin.hash then
      v_fallos := v_pin.intentos + 1;
      update public.pines_reinicio
         set intentos = case when v_fallos >= 5 then 0 else v_fallos end,
             bloqueado_hasta = case when v_fallos >= 5 then now() + interval '5 minutes' end
       where restaurante_id = v_rest;
      if v_fallos >= 5 then
        return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'minutos', 5);
      end if;
      return jsonb_build_object('ok', false, 'motivo', 'pin', 'intentos_restantes', 5 - v_fallos);
    end if;
    update public.pines_reinicio set intentos = 0, bloqueado_hasta = null where restaurante_id = v_rest;
  end if;

  if p_nombre is not null and v_nombre is null then
    raise exception 'Escribe el nombre del restaurante.' using errcode = '22023';
  end if;
  if length(coalesce(v_nombre, '')) > 60 then
    raise exception 'El nombre es muy largo (máximo 60 caracteres).' using errcode = '22023';
  end if;

  if v_nombre is not null then
    v_slug := public.fn_slug_unico(v_nombre, v_rest);
    -- El enlace que tenía se guarda (sin repetir, y sin el que vuelve a ser el actual). Se conservan los 20 últimos.
    v_viejos := array_remove(array_remove(v_r.slugs_anteriores, v_r.slug), v_slug);
    if v_r.slug <> v_slug then
      v_viejos := v_viejos || v_r.slug;
    end if;
    if cardinality(v_viejos) > 20 then
      v_viejos := v_viejos[cardinality(v_viejos) - 19 : cardinality(v_viejos)];
    end if;
    update public.restaurantes
       set nombre = v_nombre, slug = v_slug, slugs_anteriores = v_viejos
     where id = v_rest;
  end if;
  update public.restaurantes set pedidos_en_linea = true where id = v_rest;

  -- Cada visita empieza limpia: quien probó la demo antes deja de recibir los pedidos de la siguiente.
  delete from public.suscripciones_push
   where restaurante_id = v_rest and pedido_id is null
     and endpoint is distinct from p_conservar_endpoint;

  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

select public.fn_aplicar_permisos();
