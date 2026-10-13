-- =====================================================================
-- 11 · Avisos push (notificaciones con la app cerrada)
--
-- Qué guarda: las suscripciones push de los celulares (la dirección que da el navegador para avisarles). El envío lo
-- hace el servidor de la app con su llave privada VAPID (variable de entorno, NUNCA en la base).
--
--   · Personal: se suscribe a uno o varios canales:
--       'pedidos' → llegó un pedido de un cliente por confirmar (dueño)
--       'cocina'  → hay un pedido nuevo en la plancha (parrilla)
--       'listos'  → un pedido quedó listo para entregar (mesero)
--   · Cliente (sin cuenta): se suscribe a SU pedido ('cliente') con el código de seguimiento.
--
-- Nadie lee la tabla directamente (RLS sin políticas): todo va por funciones.
-- =====================================================================

alter table public.pedidos add column if not exists aviso_push_at timestamptz;

create table if not exists public.suscripciones_push (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  pedido_id      uuid,                                   -- solo las del cliente: su pedido
  canales        text[] not null,
  endpoint       text not null,
  clave_p256dh   text not null,
  clave_auth     text not null,
  agente         text,
  created_at     timestamptz not null default now(),
  actualizada_at timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  constraint ux_suscripcion_endpoint unique (endpoint),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id) on delete cascade,
  constraint chk_suscripcion_canales check (
    canales <@ array['pedidos', 'cocina', 'listos', 'cliente']::text[] and cardinality(canales) between 1 and 4
  ),
  constraint chk_suscripcion_endpoint check (endpoint ~ '^https://' and length(endpoint) <= 800),
  constraint chk_suscripcion_claves check (length(clave_p256dh) between 20 and 200 and length(clave_auth) between 8 and 100),
  constraint chk_suscripcion_cliente check (
    (pedido_id is not null and canales = array['cliente']::text[])
    or (pedido_id is null and not ('cliente' = any (canales)))
  )
);
create index if not exists idx_suscripciones_restaurante on public.suscripciones_push (restaurante_id);
create index if not exists idx_suscripciones_pedido on public.suscripciones_push (restaurante_id, pedido_id) where pedido_id is not null;

alter table public.suscripciones_push enable row level security;
-- Sin políticas y sin permisos: ni el personal lee las llaves de los celulares; solo las funciones de abajo.

-- ---------------------------------------------------------------------
-- Personal
-- ---------------------------------------------------------------------
create or replace function public.guardar_suscripcion_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_canales jsonb,
  p_agente text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_canales text[];
  v_n integer;
begin
  if p_canales is null or jsonb_typeof(p_canales) <> 'array' then
    raise exception 'Elige qué avisos quieres recibir en este celular.';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_canales
    from jsonb_array_elements_text(p_canales) c;
  if cardinality(v_canales) = 0 or not (v_canales <@ array['pedidos', 'cocina', 'listos']::text[]) then
    raise exception 'Elige qué avisos quieres recibir en este celular.';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 800 then
    raise exception 'Este celular no pudo activar los avisos. Intenta de nuevo.';
  end if;

  if not exists (select 1 from public.suscripciones_push where endpoint = p_endpoint) then
    select count(*) into v_n from public.suscripciones_push where restaurante_id = v_rest and pedido_id is null;
    if v_n >= 30 then
      raise exception 'Ya hay demasiados celulares con avisos activos. Desactiva alguno que no uses.';
    end if;
  end if;

  insert into public.suscripciones_push (restaurante_id, canales, endpoint, clave_p256dh, clave_auth, agente)
  values (v_rest, v_canales, p_endpoint, p_p256dh, p_auth, left(p_agente, 200))
  on conflict (endpoint) do update
     set canales = excluded.canales, clave_p256dh = excluded.clave_p256dh, clave_auth = excluded.clave_auth,
         agente = excluded.agente, actualizada_at = now(), registrado_por = auth.uid()
   where public.suscripciones_push.restaurante_id = v_rest and public.suscripciones_push.pedido_id is null;
  if not found then
    raise exception 'Este celular ya tiene avisos de otro restaurante. Desactívalos allá primero.';
  end if;

  return jsonb_build_object('canales', to_jsonb(v_canales));
end $$;

create or replace function public.quitar_suscripcion_push(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
begin
  delete from public.suscripciones_push where endpoint = p_endpoint and restaurante_id = v_rest and pedido_id is null;
  return jsonb_build_object('ok', true);
end $$;

-- ¿Este celular ya tiene avisos y de qué? (para pintar la pantalla de "Avisos en este celular")
create or replace function public.estado_suscripcion_push(p_endpoint text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_c text[];
begin
  select canales into v_c from public.suscripciones_push
   where endpoint = p_endpoint and restaurante_id = v_rest and pedido_id is null;
  if v_c is null then
    return jsonb_build_object('activa', false, 'canales', '[]'::jsonb);
  end if;
  return jsonb_build_object('activa', true, 'canales', to_jsonb(v_c));
end $$;

-- Celulares del personal que quieren un canal (para que el servidor les mande el aviso).
create or replace function public.listar_destinos_push(p_canal text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
begin
  if p_canal is null or p_canal not in ('pedidos', 'cocina', 'listos') then
    raise exception 'Canal de avisos no válido.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.clave_p256dh, 'auth', s.clave_auth))
      from public.suscripciones_push s
     where s.restaurante_id = v_rest and s.pedido_id is null and p_canal = any (s.canales)
  ), '[]'::jsonb);
end $$;

-- Datos de UN pedido para armar un aviso (número, destino, estado) + los celulares de su cliente suscritos.
-- El código de seguimiento va para que el aviso abra su pantalla.
create or replace function public.listar_destinos_push_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_p public.pedidos%rowtype;
begin
  select * into v_p from public.pedidos where id = p_pedido_id and restaurante_id = v_rest;
  if not found then
    return jsonb_build_object('token', null, 'numero', null, 'restaurante', null, 'destinos', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'token', v_p.token_seguimiento,
    'numero', v_p.numero,
    'tipo', v_p.tipo,
    'estado', v_p.estado,
    'origen', v_p.origen,
    'mesa', (select m.nombre from public.mesas m where m.id = v_p.mesa_id and m.restaurante_id = v_rest),
    'contacto_nombre', v_p.contacto_nombre,
    'restaurante', (select nombre from public.restaurantes where id = v_rest),
    'destinos', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.clave_p256dh, 'auth', s.clave_auth))
        from public.suscripciones_push s
       where s.restaurante_id = v_rest and s.pedido_id = v_p.id
    ), '[]'::jsonb));
end $$;

-- Un push que el servicio de avisos rechazó por caducado (404/410): se limpia.
create or replace function public.descartar_suscripciones_push(p_endpoints jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_n integer;
begin
  if p_endpoints is null or jsonb_typeof(p_endpoints) <> 'array' then
    return jsonb_build_object('descartadas', 0);
  end if;
  delete from public.suscripciones_push
   where restaurante_id = v_rest and endpoint in (select jsonb_array_elements_text(p_endpoints));
  get diagnostics v_n = row_count;
  return jsonb_build_object('descartadas', v_n);
end $$;

-- ---------------------------------------------------------------------
-- Cliente sin cuenta (API pública: publico_*)
-- ---------------------------------------------------------------------

-- El cliente pide que le avisen de SU pedido. El código de seguimiento es la prueba de que es suyo.
create or replace function public.publico_guardar_push_cliente(
  p_token uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.pedidos%rowtype;
  v_n integer;
begin
  if p_token is null then
    raise exception 'No encontramos ese pedido.' using errcode = 'P0002';
  end if;
  select * into v_p from public.pedidos where token_seguimiento = p_token;
  if not found then
    raise exception 'No encontramos ese pedido.' using errcode = 'P0002';
  end if;
  if v_p.anulado or v_p.estado = 'entregado' then
    raise exception 'Este pedido ya terminó.';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 800 then
    raise exception 'Este celular no pudo activar los avisos. Intenta de nuevo.';
  end if;

  -- Limpieza barata: los avisos de pedidos viejos ya no sirven.
  delete from public.suscripciones_push
   where restaurante_id = v_p.restaurante_id and pedido_id is not null and created_at < now() - interval '2 days';

  select count(*) into v_n from public.suscripciones_push
   where restaurante_id = v_p.restaurante_id and pedido_id = v_p.id and endpoint <> p_endpoint;
  if v_n >= 3 then
    raise exception 'Este pedido ya tiene avisos en varios celulares.';
  end if;

  insert into public.suscripciones_push (restaurante_id, pedido_id, canales, endpoint, clave_p256dh, clave_auth)
  values (v_p.restaurante_id, v_p.id, array['cliente'], p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
     set pedido_id = excluded.pedido_id, restaurante_id = excluded.restaurante_id, canales = excluded.canales,
         clave_p256dh = excluded.clave_p256dh, clave_auth = excluded.clave_auth, actualizada_at = now()
   where public.suscripciones_push.pedido_id is not null;
  if not found then
    raise exception 'Este celular ya recibe avisos del restaurante.';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Destinos para avisar al personal de un pedido NUEVO de un cliente. Una sola vez por pedido y solo en sus primeros
-- minutos: el código de un pedido no sirve para sacar la lista una y otra vez.
create or replace function public.publico_destinos_push(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.pedidos%rowtype;
begin
  if p_token is null then
    return jsonb_build_object('destinos', '[]'::jsonb);
  end if;
  update public.pedidos
     set aviso_push_at = now()
   where token_seguimiento = p_token and origen = 'cliente' and aviso_push_at is null and not anulado
     and confirmado_at is null and created_at > now() - interval '10 minutes'
  returning * into v_p;
  if not found then
    return jsonb_build_object('destinos', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'numero', v_p.numero, 'tipo', v_p.tipo, 'total', v_p.total,
    'destinos', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.clave_p256dh, 'auth', s.clave_auth))
        from public.suscripciones_push s
       where s.restaurante_id = v_p.restaurante_id and s.pedido_id is null and 'pedidos' = any (s.canales)
    ), '[]'::jsonb));
end $$;

select public.fn_aplicar_permisos();
