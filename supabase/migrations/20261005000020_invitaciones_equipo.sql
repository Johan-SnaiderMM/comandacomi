-- =====================================================================
-- 20 · El equipo entra con un código: cada celular, con su persona y sus roles
--
--   1. INVITACIÓN: el dueño escribe el nombre de la persona y le elige roles; la base le da un código de 8 letras y
--      números (sin 0/O ni 1/I, para que no se confundan) que sirve UNA vez y por 48 horas. En el celular de esa
--      persona se abre /unirme (con el enlace o el QR, que ya traen el código, o escribiéndolo): la app abre una sesión
--      anónima de Supabase en ese celular y canjea el código, que crea su perfil en el restaurante con esos roles.
--      Sin correo ni contraseña. El código se guarda tal cual (para volver a mostrarlo mientras esté vigente); nadie
--      lee la tabla directamente: solo el dueño, por listar_equipo.
--   2. QUITAR DEL EQUIPO: el dueño quita a alguien y ese celular pierde el acceso al instante (se borra su perfil, y con
--      él sus roles y sus avisos push).
--   3. AVISOS: un celular solo se suscribe a los avisos que su rol abre (pedidos nuevos y listos: tomar pedidos; la
--      plancha: plancha), y al enviar se revisa otra vez: a quien le quitaron el área le dejan de llegar.
--   4. REINICIAR LA DEMO deja el equipo como nuevo: salen las personas de la visita anterior, se anulan sus códigos y
--      los roles vuelven a ser Mesero, Cocina y Caja. El dueño se queda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Invitaciones
-- ---------------------------------------------------------------------
create table if not exists public.invitaciones_equipo (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  codigo         text not null check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  nombre         text not null check (length(btrim(nombre)) between 1 and 40),
  roles          uuid[] not null default '{}',          -- ids de roles_equipo de ese restaurante (se revisan al canjear)
  expira_at      timestamptz not null,
  usada_at       timestamptz,
  usada_por      uuid references auth.users(id) on delete set null,
  anulada_at     timestamptz,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id),
  constraint ux_invitaciones_codigo unique (codigo)
);
create index if not exists idx_invitaciones_restaurante on public.invitaciones_equipo (restaurante_id, created_at);
comment on table public.invitaciones_equipo is 'Códigos para que una persona entre al equipo desde su celular (un uso, 48 horas).';

alter table public.invitaciones_equipo enable row level security;
-- Sin políticas: el código es una llave. Solo las funciones de abajo la leen.

-- 8 caracteres de 32 posibles (2^40 combinaciones), con los bytes aleatorios de un uuid v4 (los que no llevan la
-- versión ni la variante).
create or replace function public.fn_codigo_invitacion()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_codigo text := '';
  i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    v_codigo := v_codigo || substr(v_letras, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_codigo;
end $$;

-- Roles de un arreglo jsonb de ids: los activos del restaurante. Si alguno no existe (o no es de él), error.
create or replace function public.fn_roles_validos(p_rest uuid, p_roles jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles uuid[];
begin
  if p_roles is null or jsonb_typeof(p_roles) <> 'array' then
    raise exception 'Elige los roles de esta persona.';
  end if;
  begin
    select coalesce(array_agg(distinct x.valor::uuid), '{}'::uuid[]) into v_roles
      from jsonb_array_elements_text(p_roles) as x(valor);
  exception when invalid_text_representation then
    raise exception 'El rol no existe.' using errcode = 'P0002';
  end;
  if (select count(*) from public.roles_equipo
       where restaurante_id = p_rest and activo and id = any (v_roles)) <> cardinality(v_roles) then
    raise exception 'El rol no existe.' using errcode = 'P0002';
  end if;
  return v_roles;
end $$;

-- El dueño invita a alguien: nombre y roles. Devuelve el código (y hasta cuándo sirve).
create or replace function public.crear_invitacion(p_nombre text, p_roles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 40);
  v_roles uuid[];
  v_codigo text;
  v_id uuid;
  v_expira timestamptz := now() + interval '48 hours';
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre de la persona.';
  end if;
  v_roles := public.fn_roles_validos(v_rest, p_roles);
  if cardinality(v_roles) = 0 then
    raise exception 'Elige al menos un rol: sin roles no podría hacer nada.';
  end if;
  if (select count(*) from public.perfiles where restaurante_id = v_rest) >= 30 then
    raise exception 'El equipo ya tiene 30 personas. Quita a alguien que ya no trabaje contigo.';
  end if;
  if (select count(*) from public.invitaciones_equipo
       where restaurante_id = v_rest and usada_at is null and anulada_at is null and expira_at > now()) >= 10 then
    raise exception 'Hay muchas invitaciones sin usar. Anula alguna antes de crear otra.';
  end if;

  -- Limpieza oportunista: lo que ya no sirve y tiene más de 30 días.
  delete from public.invitaciones_equipo
   where restaurante_id = v_rest and created_at < now() - interval '30 days'
     and (usada_at is not null or anulada_at is not null or expira_at < now());

  loop
    v_codigo := public.fn_codigo_invitacion();
    exit when not exists (select 1 from public.invitaciones_equipo where codigo = v_codigo);
  end loop;

  insert into public.invitaciones_equipo (restaurante_id, codigo, nombre, roles, expira_at)
  values (v_rest, v_codigo, v_nombre, v_roles, v_expira)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'nombre', v_nombre, 'expira_at', v_expira);
end $$;

create or replace function public.anular_invitacion(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
begin
  update public.invitaciones_equipo set anulada_at = now()
   where id = p_id and restaurante_id = v_rest and usada_at is null and anulada_at is null;
  if not found then
    raise exception 'La invitación no existe o ya se usó.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_id);
end $$;

-- En el celular de la persona invitada (ya con su sesión anónima): el código la vuelve parte del equipo.
create or replace function public.canjear_invitacion(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv public.invitaciones_equipo%rowtype;
  v_de text;
begin
  if v_uid is null then
    raise exception 'Abre la invitación en el celular que vas a usar.' using errcode = '42501';
  end if;
  select r.nombre into v_de
    from public.perfiles p join public.restaurantes r on r.id = p.restaurante_id
   where p.user_id = v_uid;
  if found then
    raise exception 'Este celular ya está en el equipo de %. Para unirte con otro código, sal de la app primero.', v_de;
  end if;

  select * into v_inv from public.invitaciones_equipo
   where codigo = v_codigo and usada_at is null and anulada_at is null and expira_at > now()
   for update;
  if not found then
    raise exception 'Ese código no sirve: revisa que esté bien escrito, o pide uno nuevo (cada código sirve una sola vez y por 2 días).'
      using errcode = 'P0002';
  end if;

  insert into public.perfiles (user_id, restaurante_id, rol, nombre)
  values (v_uid, v_inv.restaurante_id, 'ayudante', v_inv.nombre);
  insert into public.perfil_roles (restaurante_id, user_id, rol_id, registrado_por)
  select v_inv.restaurante_id, v_uid, r.id, v_inv.registrado_por
    from public.roles_equipo r
   where r.restaurante_id = v_inv.restaurante_id and r.activo and r.id = any (v_inv.roles);
  update public.invitaciones_equipo set usada_at = now(), usada_por = v_uid where id = v_inv.id;

  return jsonb_build_object(
    'restaurante', (select nombre from public.restaurantes where id = v_inv.restaurante_id),
    'nombre', v_inv.nombre,
    'areas', to_jsonb(public.fn_areas_de(v_uid))
  );
end $$;

-- El dueño quita a alguien del equipo: su celular pierde el acceso al instante, y sus avisos dejan de llegarle.
create or replace function public.quitar_del_equipo(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_p public.perfiles%rowtype;
begin
  select * into v_p from public.perfiles where user_id = p_user_id and restaurante_id = v_rest for update;
  if not found then
    raise exception 'Esa persona no es de tu equipo.' using errcode = 'P0002';
  end if;
  if v_p.rol = 'dueno' then
    raise exception 'Al dueño no se le puede quitar del equipo.';
  end if;

  delete from public.suscripciones_push
   where restaurante_id = v_rest and pedido_id is null and registrado_por = p_user_id;
  delete from public.perfiles where user_id = p_user_id and restaurante_id = v_rest;  -- sus roles se van con él
  return jsonb_build_object('user_id', p_user_id, 'nombre', v_p.nombre);
end $$;

-- Lo del equipo, ahora con las invitaciones que siguen esperando (con su código: solo lo ve el dueño).
create or replace function public.listar_equipo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
begin
  return jsonb_build_object(
    'areas', to_jsonb(public.fn_areas()),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'nombre', r.nombre, 'areas', to_jsonb(r.areas),
               'personas', (select count(*) from public.perfil_roles pr where pr.restaurante_id = v_rest and pr.rol_id = r.id)
             ) order by r.orden, r.nombre)
        from public.roles_equipo r
       where r.restaurante_id = v_rest and r.activo), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'nombre', p.nombre, 'rol', p.rol, 'yo', p.user_id = auth.uid(),
               'roles', coalesce((select jsonb_agg(pr.rol_id order by r.orden, r.nombre)
                                    from public.perfil_roles pr
                                    join public.roles_equipo r on r.restaurante_id = pr.restaurante_id and r.id = pr.rol_id and r.activo
                                   where pr.restaurante_id = v_rest and pr.user_id = p.user_id), '[]'::jsonb),
               'areas', to_jsonb(public.fn_areas_de(p.user_id))
             ) order by p.rol = 'dueno' desc, p.created_at, p.nombre)
        from public.perfiles p
       where p.restaurante_id = v_rest), '[]'::jsonb),
    'invitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'nombre', i.nombre, 'codigo', i.codigo, 'expira_at', i.expira_at,
               'roles', coalesce((select jsonb_agg(r.id order by r.orden, r.nombre)
                                    from public.roles_equipo r
                                   where r.restaurante_id = v_rest and r.activo and r.id = any (i.roles)), '[]'::jsonb)
             ) order by i.created_at desc)
        from public.invitaciones_equipo i
       where i.restaurante_id = v_rest and i.usada_at is null and i.anulada_at is null and i.expira_at > now()), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 2. Avisos push: solo los del área de cada quien
-- ---------------------------------------------------------------------
create or replace function public.fn_area_del_canal(p_canal text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_canal when 'pedidos' then 'pedidos' when 'listos' then 'pedidos' when 'cocina' then 'plancha' end
$$;

-- Igual que antes, pero los canales que el rol no abre no se guardan (y si no queda ninguno, se explica).
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
  v_areas text[] := coalesce(public.fn_areas_de(auth.uid()), '{}');
  v_canales text[];
begin
  if p_canales is null or jsonb_typeof(p_canales) <> 'array' then
    raise exception 'Elige qué avisos quieres recibir en este celular.';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_canales
    from jsonb_array_elements_text(p_canales) c;
  if cardinality(v_canales) = 0 or not (v_canales <@ array['pedidos', 'cocina', 'listos']::text[]) then
    raise exception 'Elige qué avisos quieres recibir en este celular.';
  end if;
  select coalesce(array_agg(c order by c), '{}') into v_canales
    from unnest(v_canales) c
   where public.fn_area_del_canal(c) = any (v_areas);
  if cardinality(v_canales) = 0 then
    raise exception 'Tu rol no recibe esos avisos. Si los necesitas, pídele al dueño el permiso.' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 800 then
    raise exception 'Este celular no pudo activar los avisos. Intenta de nuevo.';
  end if;

  -- Tope de 30 celulares por restaurante. Un celular nuevo siempre entra: si no hay puesto, salen los que llevan más
  -- tiempo sin activar o cambiar sus avisos (se conservan los 29 más recientes).
  if not exists (select 1 from public.suscripciones_push where endpoint = p_endpoint) then
    delete from public.suscripciones_push
     where id in (
       select s.id
         from public.suscripciones_push s
        where s.restaurante_id = v_rest and s.pedido_id is null
        order by s.actualizada_at desc, s.created_at desc, s.id
       offset 29
     );
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

-- Al enviar se revisa otra vez: el celular recibe el aviso solo si quien lo activó TODAVÍA abre esa área (al que le
-- quitaron el rol, o al que sacaron del equipo, ya no le llega).
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
       and public.fn_area_del_canal(p_canal) = any (coalesce(public.fn_areas_de(s.registrado_por), '{}'))
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 3. Reiniciar la demo: además, el equipo queda como nuevo
-- ---------------------------------------------------------------------
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

  -- Y deja de ser del equipo: salen las personas de la visita anterior (sus celulares pierden el acceso), se borran
  -- los códigos sin usar y los roles vuelven a ser los de siempre. El dueño se queda.
  delete from public.perfiles where restaurante_id = v_rest and rol <> 'dueno';
  delete from public.perfil_roles where restaurante_id = v_rest;
  delete from public.invitaciones_equipo where restaurante_id = v_rest;
  delete from public.roles_equipo where restaurante_id = v_rest;
  perform public.fn_roles_iniciales(v_rest);

  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

select public.fn_aplicar_permisos();
