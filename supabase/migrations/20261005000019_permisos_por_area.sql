-- =====================================================================
-- 19 · Equipo con permisos por área: cada local decide quién ve y hace qué
--
--   ÁREAS (lista cerrada, fn_areas):
--     pedidos  tomar y entregar pedidos, quitar platos, anular pedidos, aceptar los pedidos en línea, marcar agotado
--     plancha  marcar platos listos en la plancha
--     caja     cobrar y deshacer cobros (incluye fiar al cobrar)
--     fiado    abonos y deudas de los clientes
--     gastos   registrar y anular gastos
--     cierre   el cierre del día y las cifras de plata (ventas, gastos, ganancia)
--
--   ROLES: cada restaurante tiene los suyos y decide qué áreas abre cada uno (al crearse trae Mesero, Cocina y Caja).
--   Una persona del equipo puede tener VARIOS roles y ve la suma de sus áreas (Mesero + Caja). Sin roles, no entra a
--   ninguna. El dueño lo ve todo siempre (no se le puede quitar nada) y sigue siendo el único que maneja el menú, las
--   mesas, el horario, los pedidos en línea y el equipo.
--
--   El candado está en la base, no en los botones:
--     · Escrituras: cada función pide su área con requerir_area(...), en lugar de requerir_restaurante().
--     · Lecturas: las tablas de plata (pagos, fiado, clientes, gastos, cierres) solo se leen con el área que las usa
--       (RLS). Las funciones de lectura no fallan: le devuelven a cada quien solo lo que puede ver.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Áreas
-- ---------------------------------------------------------------------
create or replace function public.fn_areas()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$ select array['pedidos', 'plancha', 'caja', 'fiado', 'gastos', 'cierre']::text[] $$;

-- Para los mensajes: "No tienes permiso para <esto>."
create or replace function public.fn_texto_area(p_area text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_area
           when 'pedidos' then 'tomar pedidos'
           when 'plancha' then 'manejar la plancha'
           when 'caja' then 'cobrar'
           when 'fiado' then 'manejar el fiado'
           when 'gastos' then 'registrar gastos'
           when 'cierre' then 'ver las cuentas del día'
           else 'hacer esto'
         end
$$;

-- ---------------------------------------------------------------------
-- 2. Roles del local y roles de cada persona
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ux_perfiles_restaurante_usuario') then
    alter table public.perfiles add constraint ux_perfiles_restaurante_usuario unique (restaurante_id, user_id);
  end if;
end $$;

create table if not exists public.roles_equipo (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id),
  nombre         text not null check (length(btrim(nombre)) between 1 and 30),
  areas          text[] not null default '{}' check (areas <@ public.fn_areas()),
  orden          integer not null default 0,
  activo         boolean not null default true,      -- quitar un rol = activo false (no se borra)
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (restaurante_id, id)
);
create unique index if not exists ux_roles_equipo_nombre on public.roles_equipo (restaurante_id, lower(nombre)) where activo;
comment on table public.roles_equipo is 'Roles del equipo de cada restaurante (Mesero, Cocina, Caja…) y qué áreas abre cada uno.';

create table if not exists public.perfil_roles (
  restaurante_id uuid not null references public.restaurantes(id),
  user_id        uuid not null,
  rol_id         uuid not null,
  created_at     timestamptz not null default now(),
  registrado_por uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (user_id, rol_id),
  foreign key (restaurante_id, user_id) references public.perfiles (restaurante_id, user_id) on delete cascade,
  foreign key (restaurante_id, rol_id) references public.roles_equipo (restaurante_id, id)
);
create index if not exists idx_perfil_roles_restaurante on public.perfil_roles (restaurante_id, rol_id);
comment on table public.perfil_roles is 'Qué roles tiene cada persona del equipo (puede tener varios).';

alter table public.roles_equipo enable row level security;
alter table public.perfil_roles enable row level security;

drop policy if exists roles_equipo_select on public.roles_equipo;
create policy roles_equipo_select on public.roles_equipo
  for select to authenticated using (restaurante_id = (select public.mi_restaurante()));

drop policy if exists perfil_roles_select on public.perfil_roles;
create policy perfil_roles_select on public.perfil_roles
  for select to authenticated using (restaurante_id = (select public.mi_restaurante()));

grant select on public.roles_equipo, public.perfil_roles to authenticated;

-- Los roles con los que arranca un restaurante (solo si todavía no tiene ninguno).
create or replace function public.fn_roles_iniciales(p_rest uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.roles_equipo (restaurante_id, nombre, areas, orden)
  select p_rest, r.nombre, r.areas, r.orden
    from (values ('Mesero', array['pedidos']::text[], 1),
                 ('Cocina', array['plancha']::text[], 2),
                 ('Caja', array['caja', 'fiado']::text[], 3)) as r(nombre, areas, orden)
   where not exists (select 1 from public.roles_equipo where restaurante_id = p_rest)
$$;

create or replace function public.fn_roles_de_restaurante_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_roles_iniciales(new.id);
  return new;
end $$;

drop trigger if exists trg_roles_iniciales on public.restaurantes;
create trigger trg_roles_iniciales
  after insert on public.restaurantes
  for each row execute function public.fn_roles_de_restaurante_nuevo();

select public.fn_roles_iniciales(id) from public.restaurantes;

-- ---------------------------------------------------------------------
-- 3. ¿Qué áreas abre cada quien?
-- ---------------------------------------------------------------------
-- El dueño todas; el resto, la suma de las de sus roles activos (en el orden de fn_areas). null = no es de ningún local.
create or replace function public.fn_areas_de(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when p.rol = 'dueno' then public.fn_areas()
           else (select coalesce(array_agg(s.area order by array_position(public.fn_areas(), s.area)), '{}'::text[])
                   from (select distinct unnest(r.areas) as area
                           from public.perfil_roles pr
                           join public.roles_equipo r on r.restaurante_id = pr.restaurante_id and r.id = pr.rol_id and r.activo
                          where pr.restaurante_id = p.restaurante_id and pr.user_id = p.user_id) s)
         end
    from public.perfiles p
   where p.user_id = p_user
$$;

create or replace function public.mis_areas()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.fn_areas_de(auth.uid()) $$;

-- ¿La sesión abre ALGUNA de estas áreas? La usan las políticas de lectura y las lecturas que esconden cifras.
create or replace function public.tiene_area(variadic p_areas text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce(public.fn_areas_de(auth.uid()) && p_areas, false) $$;

-- Para las funciones de escritura: el restaurante del usuario, si abre ALGUNA de las áreas; si no, un error claro.
create or replace function public.requerir_area(variadic p_areas text[])
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid := public.requerir_restaurante();
begin
  if not coalesce(public.fn_areas_de(auth.uid()) && p_areas, false) then
    raise exception 'No tienes permiso para %. Pídeselo al dueño.', public.fn_texto_area(p_areas[1]) using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4. Lecturas: las tablas de plata, solo con el área que las usa
-- ---------------------------------------------------------------------
drop policy if exists pagos_pedido_select on public.pagos_pedido;
create policy pagos_pedido_select on public.pagos_pedido
  for select to authenticated
  using (restaurante_id = (select public.mi_restaurante()) and (select public.tiene_area('caja', 'cierre')));

drop policy if exists movimientos_fiado_select on public.movimientos_fiado;
create policy movimientos_fiado_select on public.movimientos_fiado
  for select to authenticated
  using (restaurante_id = (select public.mi_restaurante()) and (select public.tiene_area('fiado', 'caja', 'cierre')));

drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes
  for select to authenticated
  using (restaurante_id = (select public.mi_restaurante()) and (select public.tiene_area('fiado', 'caja')));

drop policy if exists gastos_select on public.gastos;
create policy gastos_select on public.gastos
  for select to authenticated
  using (restaurante_id = (select public.mi_restaurante()) and (select public.tiene_area('gastos', 'cierre')));

drop policy if exists cierres_dia_select on public.cierres_dia;
create policy cierres_dia_select on public.cierres_dia
  for select to authenticated
  using (restaurante_id = (select public.mi_restaurante()) and (select public.tiene_area('cierre')));

-- Las fotos de los gastos, igual.
drop policy if exists gastos_fotos_select on storage.objects;
create policy gastos_fotos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gastos-fotos' and (storage.foldername(name))[1] = ((select public.mi_restaurante())::text)
         and (select public.tiene_area('gastos', 'cierre')));

drop policy if exists gastos_fotos_insert on storage.objects;
create policy gastos_fotos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gastos-fotos' and (storage.foldername(name))[1] = ((select public.mi_restaurante())::text)
              and (select public.tiene_area('gastos')));

-- Contexto: las áreas y los roles de quien entra (la app arma la barra y las pantallas con esto).
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurante', (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'es_demo', r.es_demo,
                                              'slug', r.slug, 'pedidos_en_linea', r.pedidos_en_linea,
                                              'reinicio_con_pin', r.reinicio_con_pin, 'hora_corte', r.hora_corte,
                                              'horario', r.horario)
                      from public.restaurantes r limit 1),
    'perfil', (select jsonb_build_object(
                        'nombre', p.nombre, 'rol', p.rol,
                        'areas', to_jsonb(public.mis_areas()),
                        'roles', coalesce((select jsonb_agg(r.nombre order by r.orden, r.nombre)
                                             from public.perfil_roles pr
                                             join public.roles_equipo r on r.id = pr.rol_id and r.activo
                                            where pr.user_id = p.user_id), '[]'::jsonb))
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

-- Inicio: los pendientes los ve todo el equipo; las cifras de plata solo quien ve el cierre, y lo que deben los
-- clientes solo quien maneja el fiado (o el cierre). A los demás esas cifras les llegan en null.
create or replace function public.obtener_inicio()
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.jornada_actual();
  v_ayer date := public.jornada_actual() - 1;
  v_ver_plata boolean := public.tiene_area('cierre');
  v_ver_fiado boolean := public.tiene_area('fiado', 'cierre');
  v_ventas_hoy int; v_ventas_ayer int; v_gastos_hoy int; v_gastos_ayer int; v_pedidos_hoy int;
  v_por_cobrar int; v_deudores int; v_pendientes int; v_sin_cobrar int; v_por_confirmar int;
begin
  select coalesce(sum(total) filter (where fecha_cobro = v_hoy), 0),
         coalesce(sum(total) filter (where fecha_cobro = v_ayer), 0),
         count(*) filter (where fecha_cobro = v_hoy)
    into v_ventas_hoy, v_ventas_ayer, v_pedidos_hoy
    from public.pedidos
   where not anulado and fecha_cobro in (v_hoy, v_ayer);

  select coalesce(sum(monto) filter (where fecha = v_hoy), 0),
         coalesce(sum(monto) filter (where fecha = v_ayer), 0)
    into v_gastos_hoy, v_gastos_ayer
    from public.gastos
   where not anulado and fecha in (v_hoy, v_ayer);

  select coalesce(sum(saldo), 0), count(*)
    into v_por_cobrar, v_deudores
    from (
      select sum(case tipo when 'cargo' then monto else -monto end) as saldo
        from public.movimientos_fiado
       where not anulado
       group by cliente_id
      having sum(case tipo when 'cargo' then monto else -monto end) > 0
    ) s;

  select count(*),
         count(*) filter (where cobrado_at is null)
    into v_pendientes, v_sin_cobrar
    from public.pedidos
   where not anulado and en_cocina and (cobrado_at is null or estado <> 'entregado');

  select count(*) into v_por_confirmar
    from public.pedidos
   where not anulado and origen = 'cliente' and confirmado_at is null;

  return jsonb_build_object(
    'fecha', v_hoy,
    -- true = el día de trabajo ya se cerró a mano y lo que se registre cuenta para el siguiente (hasta la hora de corte).
    'jornada_adelantada', v_hoy > public.dia_de_trabajo(),
    'ventas_hoy', case when v_ver_plata then v_ventas_hoy end,
    'gastos_hoy', case when v_ver_plata then v_gastos_hoy end,
    'ganancia_hoy', case when v_ver_plata then v_ventas_hoy - v_gastos_hoy end,
    'pedidos_hoy', v_pedidos_hoy,
    'ventas_ayer', case when v_ver_plata then v_ventas_ayer end,
    'gastos_ayer', case when v_ver_plata then v_gastos_ayer end,
    'ganancia_ayer', case when v_ver_plata then v_ventas_ayer - v_gastos_ayer end,
    'por_cobrar', case when v_ver_fiado then v_por_cobrar end,
    'clientes_con_deuda', case when v_ver_fiado then v_deudores end,
    'pedidos_pendientes', v_pendientes,
    'pedidos_sin_cobrar', v_sin_cobrar,
    'pedidos_por_confirmar', v_por_confirmar
  );
end $$;

-- Cobrados hoy: solo para quien cobra o ve el cierre.
create or replace function public.listar_pedidos_cobrados_hoy()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.cobrado_at desc), '[]'::jsonb)
    from (
      select p.cobrado_at,
             jsonb_build_object(
               'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'mesa', m.nombre,
               'contacto_nombre', p.contacto_nombre, 'total', p.total, 'propina', p.propina,
               'cobrado_at', p.cobrado_at,
               'medios', coalesce((select jsonb_agg(distinct g.medio) from public.pagos_pedido g
                                    where g.pedido_id = p.id and not g.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
        left join public.mesas m on m.id = p.mesa_id
       where not p.anulado and p.fecha_cobro = public.jornada_actual()
         and (select public.tiene_area('caja', 'cierre'))
       order by p.cobrado_at desc
       limit 40
    ) x
$$;

-- La pantalla de Cierre: solo con el área "cierre" (es security definer: no la frena el RLS).
create or replace function public.obtener_resumen_dia(p_fecha date default null, p_base integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('cierre');
  v_fecha date := coalesce(p_fecha, public.dia_de_trabajo());
  v_cierre jsonb;
  v_base int;
begin
  select to_jsonb(c) into v_cierre
    from public.cierres_dia c
   where c.restaurante_id = v_rest and c.fecha = v_fecha and not c.anulado;

  v_base := coalesce(p_base, (v_cierre ->> 'base_caja')::int, 0);

  return jsonb_build_object(
    'resumen', public.fn_resumen_dia(v_rest, v_fecha, v_base),
    'cierre', v_cierre,
    'jornada', public.fn_jornada(v_rest, now()),
    'cierres_recientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'fecha', c.fecha, 'ventas', c.ventas, 'gastos', c.gastos, 'ganancia', c.ganancia,
               'base_caja', c.base_caja, 'efectivo_esperado', c.efectivo_esperado,
               'efectivo_contado', c.efectivo_contado, 'diferencia', c.diferencia) order by c.fecha desc)
        from (select * from public.cierres_dia
               where restaurante_id = v_rest and not anulado order by fecha desc limit 7) c), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 5. Escrituras: cada una pide su área (el cuerpo es el mismo de antes; cambia solo la primera línea)
-- ---------------------------------------------------------------------

-- pedidos ------------------------------------------------------------
create or replace function public.crear_pedido(
  p_tipo text,
  p_mesa_id uuid,
  p_items jsonb,
  p_contacto_nombre text default null,
  p_contacto_telefono text default null,
  p_direccion text default null,
  p_notas text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos');
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_num int;
  v_tel text;
  v_total int;
  v_para_cocina int;
begin
  if p_tipo is null or p_tipo not in ('mesa', 'llevar', 'domicilio') then
    raise exception 'El tipo de pedido no es válido.';
  end if;

  if p_tipo = 'mesa' then
    if p_mesa_id is null then
      raise exception 'Elige una mesa.';
    end if;
    perform 1 from public.mesas where id = p_mesa_id and restaurante_id = v_rest and activa;
    if not found then
      raise exception 'La mesa no existe.' using errcode = 'P0002';
    end if;
  else
    p_mesa_id := null;
  end if;

  if p_tipo = 'domicilio' and length(btrim(coalesce(p_direccion, ''))) = 0 then
    raise exception 'Escribe la dirección del domicilio.';
  end if;

  v_tel := null;
  if length(btrim(coalesce(p_contacto_telefono, ''))) > 0 then
    v_tel := public.fn_normalizar_telefono(p_contacto_telefono);
    if v_tel is null then
      raise exception 'El teléfono no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.';
    end if;
  end if;

  update public.restaurantes
     set consecutivo_pedido = consecutivo_pedido + 1
   where id = v_rest
  returning consecutivo_pedido into v_num;

  insert into public.pedidos
    (id, restaurante_id, numero, tipo, mesa_id, contacto_nombre, contacto_telefono, direccion, notas)
  values
    (v_id, v_rest, v_num, p_tipo, p_mesa_id,
     nullif(left(btrim(coalesce(p_contacto_nombre, '')), 60), ''), v_tel,
     nullif(left(btrim(coalesce(p_direccion, '')), 120), ''),
     nullif(left(btrim(coalesce(p_notas, '')), 200), ''));

  v_para_cocina := public.fn_agregar_items(v_rest, v_id, p_items);
  if v_para_cocina = 0 then
    update public.pedidos set estado = 'listo', listo_at = now() where id = v_id and restaurante_id = v_rest;
  end if;

  select total into v_total from public.pedidos where id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'total', v_total, 'para_cocina', v_para_cocina);
end $$;

create or replace function public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos');
  v_ped public.pedidos%rowtype;
  v_total int;
  v_para_cocina int;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is not null then
    raise exception 'Este pedido ya está cobrado: crea uno nuevo.';
  end if;

  v_para_cocina := public.fn_agregar_items(v_rest, p_pedido_id, p_items);

  if v_para_cocina > 0 then
    update public.pedidos
       set estado = 'pendiente', listo_at = null, entregado_at = null
     where id = p_pedido_id and restaurante_id = v_rest;
  elsif v_ped.estado = 'entregado' then
    update public.pedidos
       set estado = 'listo', listo_at = coalesce(listo_at, now()), entregado_at = null
     where id = p_pedido_id and restaurante_id = v_rest;
  end if;

  select total into v_total from public.pedidos where id = p_pedido_id;
  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero, 'total', v_total, 'para_cocina', v_para_cocina);
end $$;

create or replace function public.anular_item_pedido(p_item_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos');
  v_motivo text := public.fn_motivo(p_motivo);
  v_item public.pedido_items%rowtype;
  v_ped public.pedidos%rowtype;
  v_total int;
begin
  select * into v_item from public.pedido_items where id = p_item_id and restaurante_id = v_rest for update;
  if not found or v_item.anulado then
    raise exception 'El plato no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  select * into v_ped from public.pedidos where id = v_item.pedido_id and restaurante_id = v_rest for update;
  if v_ped.anulado or v_ped.cobrado_at is not null then
    raise exception 'El pedido ya está cobrado o anulado: anula el cobro primero.';
  end if;
  if not exists (select 1 from public.pedido_items
                  where pedido_id = v_ped.id and restaurante_id = v_rest and not anulado and id <> p_item_id) then
    raise exception 'Es el único plato del pedido: anula el pedido completo.';
  end if;

  update public.pedido_items
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_item_id and restaurante_id = v_rest;

  update public.pedidos
     set total = (select coalesce(sum(subtotal), 0) from public.pedido_items where pedido_id = v_ped.id and not anulado)
   where id = v_ped.id and restaurante_id = v_rest
  returning total into v_total;

  -- Si con eso ya no queda nada por cocinar, el pedido pasa a listo.
  if v_ped.en_cocina and v_ped.estado = 'pendiente'
     and not exists (select 1 from public.pedido_items
                      where pedido_id = v_ped.id and restaurante_id = v_rest and not anulado
                        and se_prepara and listo_at is null) then
    update public.pedidos set estado = 'listo', listo_at = coalesce(listo_at, now())
     where id = v_ped.id and restaurante_id = v_rest;
  end if;

  return jsonb_build_object('id', p_item_id, 'pedido_id', v_ped.id, 'numero', v_ped.numero, 'total', v_total);
end $$;

-- Anular un pedido ya cobrado también anula su cobro: eso pide además el área "caja".
create or replace function public.anular_pedido(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos');
  v_motivo text := public.fn_motivo(p_motivo);
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o ya está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is not null and not public.tiene_area('caja') then
    raise exception 'Este pedido ya está cobrado: para anularlo hace falta permiso de caja.' using errcode = '42501';
  end if;

  update public.pedidos
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_pedido_id and restaurante_id = v_rest;

  -- Lo cobrado y lo fiado de ese pedido se anula con él.
  update public.movimientos_fiado
     set anulado = true, anulado_motivo = 'Pedido anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;
  update public.pagos_pedido
     set anulado = true, anulado_motivo = 'Pedido anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;

  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero);
end $$;

create or replace function public.confirmar_pedido_cliente(p_pedido_id uuid, p_minutos integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos');
  v_p public.pedidos%rowtype;
  v_para_cocina int;
begin
  if p_minutos is not null and (p_minutos < 1 or p_minutos > 240) then
    raise exception 'El tiempo estimado debe estar entre 1 y 240 minutos.';
  end if;

  select * into v_p from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_p.anulado then
    raise exception 'El pedido no existe o el cliente ya lo canceló.' using errcode = 'P0002';
  end if;
  if v_p.origen <> 'cliente' then
    raise exception 'Este pedido no es de un cliente en línea.';
  end if;
  if v_p.confirmado_at is not null then
    return jsonb_build_object('id', v_p.id, 'numero', v_p.numero, 'ya_aceptado', true);
  end if;

  update public.pedidos
     set confirmado_at = now(), confirmado_por = auth.uid(), tiempo_estimado_min = p_minutos
   where id = v_p.id and restaurante_id = v_rest;

  select count(*) into v_para_cocina
    from public.pedido_items
   where pedido_id = v_p.id and restaurante_id = v_rest and not anulado and se_prepara;
  if v_para_cocina = 0 then
    update public.pedidos set estado = 'listo', listo_at = now() where id = v_p.id and restaurante_id = v_rest;
  end if;

  return jsonb_build_object('id', v_p.id, 'numero', v_p.numero, 'para_cocina', v_para_cocina);
end $$;

-- pedidos o plancha --------------------------------------------------
-- Listo / entregado / de vuelta a pendiente: lo hacen el mesero y la cocina.
create or replace function public.cambiar_estado_pedido(p_pedido_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos', 'plancha');
  v_ped public.pedidos%rowtype;
begin
  if p_estado is null or p_estado not in ('pendiente', 'listo', 'entregado') then
    raise exception 'El estado no es válido.';
  end if;

  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;

  update public.pedidos
     set estado = p_estado,
         listo_at = case p_estado when 'pendiente' then null else coalesce(listo_at, now()) end,
         entregado_at = case p_estado when 'entregado' then now() else null end
   where id = p_pedido_id and restaurante_id = v_rest;

  if p_estado = 'pendiente' then
    update public.pedido_items set listo_at = null, listo_por = null
     where pedido_id = p_pedido_id and restaurante_id = v_rest and not anulado;
  else
    update public.pedido_items
       set listo_at = coalesce(listo_at, now()), listo_por = coalesce(listo_por, auth.uid())
     where pedido_id = p_pedido_id and restaurante_id = v_rest and not anulado;
  end if;

  return jsonb_build_object('id', p_pedido_id, 'estado', p_estado);
end $$;

-- "Se acabó hoy": lo sabe el que toma los pedidos y lo sabe la cocina.
create or replace function public.cambiar_disponibilidad(p_producto_id uuid, p_disponible boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('pedidos', 'plancha');
begin
  update public.productos
     set disponible = coalesce(p_disponible, true)
   where id = p_producto_id and restaurante_id = v_rest and activo;
  if not found then
    raise exception 'El plato no existe.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_producto_id, 'disponible', coalesce(p_disponible, true));
end $$;

-- plancha ------------------------------------------------------------
create or replace function public.marcar_item_listo(p_item_id uuid, p_listo boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('plancha');
  v_item public.pedido_items%rowtype;
  v_ped public.pedidos%rowtype;
  v_total int;
  v_pend int;
  v_estado text;
begin
  select * into v_item from public.pedido_items
   where id = p_item_id and restaurante_id = v_rest and not anulado for update;
  if not found then
    raise exception 'El plato no existe o fue anulado.' using errcode = 'P0002';
  end if;

  select * into v_ped from public.pedidos where id = v_item.pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if not v_ped.en_cocina then
    raise exception 'Primero acepta el pedido del cliente.';
  end if;
  if v_ped.estado = 'entregado' then
    raise exception 'Este pedido ya se entregó.';
  end if;

  update public.pedido_items
     set listo_at = case when coalesce(p_listo, true) then coalesce(listo_at, now()) end,
         listo_por = case when coalesce(p_listo, true) then coalesce(listo_por, auth.uid()) end
   where id = p_item_id and restaurante_id = v_rest;

  select count(*) filter (where se_prepara), count(*) filter (where se_prepara and listo_at is null)
    into v_total, v_pend
    from public.pedido_items
   where pedido_id = v_ped.id and restaurante_id = v_rest and not anulado;

  v_estado := v_ped.estado;
  if v_pend = 0 and v_ped.estado = 'pendiente' then
    v_estado := 'listo';
    update public.pedidos set estado = 'listo', listo_at = coalesce(listo_at, now())
     where id = v_ped.id and restaurante_id = v_rest;
  elsif v_pend > 0 and v_ped.estado = 'listo' then
    v_estado := 'pendiente';
    update public.pedidos set estado = 'pendiente', listo_at = null, entregado_at = null
     where id = v_ped.id and restaurante_id = v_rest;
  end if;

  return jsonb_build_object('pedido_id', v_ped.id, 'estado', v_estado,
                            'items_listos', v_total - v_pend, 'items_total', v_total);
end $$;

-- caja ---------------------------------------------------------------
create or replace function public.cobrar_pedido(p_pedido_id uuid, p_propina integer, p_pagos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('caja');
  v_ped public.pedidos%rowtype;
  v_pago jsonb;
  v_medio text;
  v_monto int;
  v_recibido int;
  v_cliente uuid;
  v_ref text;
  v_pago_id uuid;
  v_suma int := 0;
  v_vuelto int := 0;
  v_fiado int := 0;
  v_debido int;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is not null then
    raise exception 'Este pedido ya está cobrado.';
  end if;
  if v_ped.total <= 0 then
    raise exception 'El pedido no tiene platos para cobrar.';
  end if;

  p_propina := coalesce(p_propina, 0);
  if p_propina < 0 or p_propina > v_ped.total then
    raise exception 'La propina no es válida.';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Elige cómo se paga.';
  end if;

  v_debido := v_ped.total + p_propina;

  -- Primera pasada: validar todo y sumar.
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    v_medio := v_pago ->> 'medio';
    v_monto := (v_pago ->> 'monto')::int;
    if v_medio is null or v_medio not in ('efectivo', 'transferencia', 'fiado') then
      raise exception 'El medio de pago no es válido.';
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'El valor de cada pago debe ser mayor que cero.';
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  if v_suma <> v_debido then
    raise exception 'Los pagos suman % y el total a cobrar es %.', public.fn_pesos(v_suma), public.fn_pesos(v_debido);
  end if;

  -- Segunda pasada: registrar.
  for v_pago in select value from jsonb_array_elements(p_pagos) loop
    v_medio := v_pago ->> 'medio';
    v_monto := (v_pago ->> 'monto')::int;
    v_pago_id := gen_random_uuid();

    if v_medio = 'efectivo' then
      v_recibido := coalesce((v_pago ->> 'recibido')::int, v_monto);
      if v_recibido < v_monto then
        raise exception 'El efectivo recibido (%) es menor que lo que se cobra en efectivo (%).',
          public.fn_pesos(v_recibido), public.fn_pesos(v_monto);
      end if;
      insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, recibido, vuelto)
      values (v_pago_id, v_rest, p_pedido_id, 'efectivo', v_monto, v_recibido, v_recibido - v_monto);
      v_vuelto := v_vuelto + (v_recibido - v_monto);

    elsif v_medio = 'transferencia' then
      v_ref := nullif(left(btrim(coalesce(v_pago ->> 'referencia', '')), 60), '');
      insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, referencia)
      values (v_pago_id, v_rest, p_pedido_id, 'transferencia', v_monto, v_ref);

    else -- fiado
      v_cliente := (v_pago ->> 'cliente_id')::uuid;
      if v_cliente is null then
        raise exception 'Elige a quién se le fía.';
      end if;
      perform 1 from public.clientes where id = v_cliente and restaurante_id = v_rest and activo;
      if not found then
        raise exception 'El cliente no existe.' using errcode = 'P0002';
      end if;
      insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, cliente_id)
      values (v_pago_id, v_rest, p_pedido_id, 'fiado', v_monto, v_cliente);
      insert into public.movimientos_fiado (restaurante_id, cliente_id, tipo, monto, pedido_id, pago_id)
      values (v_rest, v_cliente, 'cargo', v_monto, p_pedido_id, v_pago_id);
      v_fiado := v_fiado + v_monto;
    end if;
  end loop;

  update public.pedidos
     set propina = p_propina, cobrado_at = now()
   where id = p_pedido_id and restaurante_id = v_rest;

  return jsonb_build_object(
    'pedido_id', p_pedido_id, 'numero', v_ped.numero, 'total', v_ped.total, 'propina', p_propina,
    'cobrado', v_debido, 'vuelto', v_vuelto, 'fiado', v_fiado
  );
end $$;

create or replace function public.anular_cobro(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('caja');
  v_motivo text := public.fn_motivo(p_motivo);
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is null then
    raise exception 'Este pedido no está cobrado.';
  end if;

  update public.movimientos_fiado
     set anulado = true, anulado_motivo = 'Cobro anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;
  update public.pagos_pedido
     set anulado = true, anulado_motivo = 'Cobro anulado: ' || v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where restaurante_id = v_rest and pedido_id = p_pedido_id and not anulado;
  update public.pedidos
     set cobrado_at = null, propina = 0
   where id = p_pedido_id and restaurante_id = v_rest;

  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero);
end $$;

-- caja o fiado -------------------------------------------------------
-- Un cliente nuevo nace al fiarle en el cobro o desde la pantalla de Fiado.
create or replace function public.crear_cliente(p_nombre text, p_telefono text default null, p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('caja', 'fiado');
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_tel text := null;
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre del cliente.';
  end if;
  if length(btrim(coalesce(p_telefono, ''))) > 0 then
    v_tel := public.fn_normalizar_telefono(p_telefono);
    if v_tel is null then
      raise exception 'El teléfono no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.';
    end if;
  end if;

  insert into public.clientes (id, restaurante_id, nombre, telefono) values (v_id, v_rest, v_nombre, v_tel);
  return jsonb_build_object('id', v_id, 'nombre', v_nombre, 'telefono', v_tel);
end $$;

-- fiado --------------------------------------------------------------
create or replace function public.registrar_abono(
  p_cliente_id uuid,
  p_monto integer,
  p_medio text,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('fiado');
  v_saldo int;
  v_id uuid := gen_random_uuid();
begin
  if p_medio is null or p_medio not in ('efectivo', 'transferencia') then
    raise exception 'Elige si pagó en efectivo o por transferencia.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono debe ser mayor que cero.';
  end if;

  -- Bloquea al cliente mientras se valida el saldo (dos abonos a la vez no pueden pasarse de la deuda).
  perform 1 from public.clientes where id = p_cliente_id and restaurante_id = v_rest for update;
  if not found then
    raise exception 'El cliente no existe.' using errcode = 'P0002';
  end if;

  v_saldo := public.fn_saldo_cliente(v_rest, p_cliente_id);
  if p_monto > v_saldo then
    raise exception 'El abono (%) es mayor que lo que debe (%).', public.fn_pesos(p_monto), public.fn_pesos(v_saldo);
  end if;

  insert into public.movimientos_fiado (id, restaurante_id, cliente_id, tipo, monto, medio, referencia)
  values (v_id, v_rest, p_cliente_id, 'abono', p_monto, p_medio,
          case when p_medio = 'transferencia' then nullif(left(btrim(coalesce(p_referencia, '')), 60), '') end);

  return jsonb_build_object('id', v_id, 'saldo', v_saldo - p_monto);
end $$;

create or replace function public.anular_abono(p_movimiento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('fiado');
  v_motivo text := public.fn_motivo(p_motivo);
  v_mov public.movimientos_fiado%rowtype;
begin
  select * into v_mov from public.movimientos_fiado
   where id = p_movimiento_id and restaurante_id = v_rest and tipo = 'abono' and not anulado for update;
  if not found then
    raise exception 'El abono no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  update public.movimientos_fiado
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_movimiento_id and restaurante_id = v_rest;

  return jsonb_build_object('id', p_movimiento_id, 'saldo', public.fn_saldo_cliente(v_rest, v_mov.cliente_id));
end $$;

-- gastos -------------------------------------------------------------
create or replace function public.registrar_gasto(
  p_monto integer,
  p_categoria text,
  p_nota text default null,
  p_foto_path text default null,
  p_de_caja boolean default true,
  p_fecha date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('gastos');
  v_hoy date := public.fn_jornada(v_rest, now());
  v_fecha date := coalesce(p_fecha, v_hoy);
  v_id uuid := gen_random_uuid();
  v_foto text := nullif(btrim(coalesce(p_foto_path, '')), '');
begin
  if p_monto is null or p_monto <= 0 or p_monto > 100000000 then
    raise exception 'Escribe cuánto fue el gasto.';
  end if;
  if p_categoria is null or p_categoria not in
       ('carnes', 'verduras', 'pan', 'bebidas', 'gas', 'domiciliario', 'empaques', 'servicios', 'ayudante', 'otros') then
    raise exception 'Elige la categoría del gasto.';
  end if;
  if v_fecha > v_hoy or v_fecha < v_hoy - 31 then
    raise exception 'La fecha del gasto no es válida.';
  end if;
  -- La foto vive en la carpeta del restaurante (Storage): no se acepta una ruta de otro.
  if v_foto is not null and (length(v_foto) > 200 or left(v_foto, 37) <> (v_rest::text || '/')) then
    raise exception 'La foto no es válida.';
  end if;

  insert into public.gastos (id, restaurante_id, fecha, monto, categoria, nota, foto_path, de_caja)
  values (v_id, v_rest, v_fecha, p_monto, p_categoria, nullif(left(btrim(coalesce(p_nota, '')), 120), ''),
          v_foto, coalesce(p_de_caja, true));

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.anular_gasto(p_gasto_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('gastos');
  v_motivo text := public.fn_motivo(p_motivo);
begin
  update public.gastos
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_gasto_id and restaurante_id = v_rest and not anulado;
  if not found then
    raise exception 'El gasto no existe o ya está anulado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_gasto_id);
end $$;

-- cierre -------------------------------------------------------------
create or replace function public.registrar_cierre(
  p_fecha date,
  p_base_caja integer,
  p_efectivo_contado integer,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('cierre');
  v_dia date := public.fn_fecha_trabajo(now(), (select hora_corte from public.restaurantes where id = v_rest));
  v_fecha date := coalesce(p_fecha, v_dia);
  v_base int := coalesce(p_base_caja, 0);
  v_r jsonb;
  v_id uuid := gen_random_uuid();
  v_esperado int;
begin
  if v_fecha > v_dia then
    raise exception 'No se puede cerrar un día que todavía no llega.';
  end if;
  if v_base < 0 then
    raise exception 'La base de la caja no es válida.';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 then
    raise exception 'Escribe cuánto efectivo contaste.';
  end if;

  v_r := public.fn_resumen_dia(v_rest, v_fecha, v_base);
  v_esperado := (v_r ->> 'efectivo_esperado')::int;

  begin
    insert into public.cierres_dia
      (id, restaurante_id, fecha, ventas, propinas, gastos, ganancia, cobrado_efectivo, cobrado_transferencia,
       fiado_nuevo, abonos_efectivo, abonos_transferencia, gastos_caja, base_caja, efectivo_esperado,
       efectivo_contado, diferencia, notas)
    values
      (v_id, v_rest, v_fecha, (v_r ->> 'ventas')::int, (v_r ->> 'propinas')::int, (v_r ->> 'gastos')::int,
       (v_r ->> 'ganancia')::int, (v_r ->> 'cobrado_efectivo')::int, (v_r ->> 'cobrado_transferencia')::int,
       (v_r ->> 'fiado_nuevo')::int, (v_r ->> 'abonos_efectivo')::int, (v_r ->> 'abonos_transferencia')::int,
       (v_r ->> 'gastos_caja')::int, v_base, v_esperado, p_efectivo_contado, p_efectivo_contado - v_esperado,
       nullif(left(btrim(coalesce(p_notas, '')), 200), ''));
  exception when unique_violation then
    raise exception 'Ese día ya está cerrado. Anula el cierre para hacerlo de nuevo.';
  end;

  return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'diferencia', p_efectivo_contado - v_esperado);
end $$;

create or replace function public.anular_cierre(p_cierre_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('cierre');
  v_motivo text := public.fn_motivo(p_motivo);
  v_fecha date;
  v_corte integer;
begin
  update public.cierres_dia
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_cierre_id and restaurante_id = v_rest and not anulado
  returning fecha into v_fecha;
  if not found then
    raise exception 'El cierre no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  select hora_corte into v_corte from public.restaurantes where id = v_rest;
  update public.pedidos
     set fecha = v_fecha
   where restaurante_id = v_rest and fecha = v_fecha + 1 and public.fn_fecha_trabajo(created_at, v_corte) = v_fecha;
  update public.pedidos
     set fecha_cobro = v_fecha
   where restaurante_id = v_rest and fecha_cobro = v_fecha + 1 and public.fn_fecha_trabajo(cobrado_at, v_corte) = v_fecha;
  update public.pagos_pedido
     set fecha = v_fecha
   where restaurante_id = v_rest and fecha = v_fecha + 1 and public.fn_fecha_trabajo(created_at, v_corte) = v_fecha;
  update public.movimientos_fiado
     set fecha = v_fecha
   where restaurante_id = v_rest and fecha = v_fecha + 1 and public.fn_fecha_trabajo(created_at, v_corte) = v_fecha;
  update public.gastos
     set fecha = v_fecha
   where restaurante_id = v_rest and fecha = v_fecha + 1 and public.fn_fecha_trabajo(created_at, v_corte) = v_fecha;

  return jsonb_build_object('id', p_cierre_id);
end $$;

-- ---------------------------------------------------------------------
-- 6. El dueño arma su equipo: roles y quién tiene cuál
-- ---------------------------------------------------------------------
-- Todo lo del equipo en una llamada: las áreas que existen, los roles del local y cada persona con sus roles.
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
       where p.restaurante_id = v_rest), '[]'::jsonb)
  );
end $$;

-- Crea, cambia o quita (p_activo = false) un rol. p_areas: arreglo jsonb de áreas, p. ej. ["pedidos", "caja"].
create or replace function public.guardar_rol_equipo(p_id uuid, p_nombre text, p_areas jsonb, p_activo boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), 30);
  v_activo boolean := coalesce(p_activo, true);
  v_areas text[];
  v_id uuid;
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre del rol.';
  end if;
  if p_areas is null or jsonb_typeof(p_areas) <> 'array' then
    raise exception 'Elige qué puede hacer este rol.';
  end if;

  select array_agg(distinct x.valor) into v_areas from jsonb_array_elements_text(p_areas) as x(valor);
  if not coalesce(v_areas, '{}'::text[]) <@ public.fn_areas() then
    raise exception 'Ese permiso no existe.';
  end if;
  -- En el orden de siempre, para que dos roles con lo mismo se vean igual.
  select coalesce(array_agg(a order by array_position(public.fn_areas(), a)), '{}'::text[])
    into v_areas
    from unnest(coalesce(v_areas, '{}'::text[])) as a;
  if v_activo and cardinality(v_areas) = 0 then
    raise exception 'Elige al menos una cosa que pueda hacer este rol.';
  end if;

  if p_id is null then
    if (select count(*) from public.roles_equipo where restaurante_id = v_rest and activo) >= 12 then
      raise exception 'Ya tienes muchos roles. Quita alguno que no uses.';
    end if;
    if exists (select 1 from public.roles_equipo where restaurante_id = v_rest and activo and lower(nombre) = lower(v_nombre)) then
      raise exception 'Ya hay un rol con ese nombre.';
    end if;
    -- Un rol que se había quitado con ese nombre vuelve, con lo que se eligió ahora (y sin nadie: ver abajo).
    select id into v_id from public.roles_equipo
     where restaurante_id = v_rest and not activo and lower(nombre) = lower(v_nombre)
     order by created_at desc limit 1;
    if v_id is not null then
      update public.roles_equipo
         set activo = true, nombre = v_nombre, areas = v_areas,
             orden = (select coalesce(max(orden), 0) + 1 from public.roles_equipo where restaurante_id = v_rest and activo)
       where id = v_id and restaurante_id = v_rest;
      return jsonb_build_object('id', v_id, 'recuperado', true);
    end if;
    insert into public.roles_equipo (restaurante_id, nombre, areas, orden)
    values (v_rest, v_nombre, v_areas, (select coalesce(max(orden), 0) + 1 from public.roles_equipo where restaurante_id = v_rest))
    returning id into v_id;
    return jsonb_build_object('id', v_id);
  end if;

  perform 1 from public.roles_equipo where id = p_id and restaurante_id = v_rest and activo for update;
  if not found then
    raise exception 'El rol no existe.' using errcode = 'P0002';
  end if;

  begin
    update public.roles_equipo set nombre = v_nombre, areas = v_areas, activo = v_activo
     where id = p_id and restaurante_id = v_rest;
  exception when unique_violation then
    raise exception 'Ya hay un rol con ese nombre.';
  end;

  -- Quitar un rol se lo quita a quienes lo tenían: si algún día vuelve, nadie recupera permisos sin que el dueño lo diga.
  if not v_activo then
    delete from public.perfil_roles where restaurante_id = v_rest and rol_id = p_id;
  end if;
  return jsonb_build_object('id', p_id);
end $$;

-- Los roles de una persona del equipo (reemplaza los que tenía). p_roles: arreglo jsonb de ids de rol; [] = ninguno.
create or replace function public.asignar_roles(p_user_id uuid, p_roles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_roles uuid[];
begin
  perform 1 from public.perfiles where user_id = p_user_id and restaurante_id = v_rest for update;
  if not found then
    raise exception 'Esa persona no es de tu equipo.' using errcode = 'P0002';
  end if;
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
       where restaurante_id = v_rest and activo and id = any (v_roles)) <> cardinality(v_roles) then
    raise exception 'El rol no existe.' using errcode = 'P0002';
  end if;

  delete from public.perfil_roles
   where restaurante_id = v_rest and user_id = p_user_id and not (rol_id = any (v_roles));
  insert into public.perfil_roles (restaurante_id, user_id, rol_id)
  select v_rest, p_user_id, r from unnest(v_roles) as r
  on conflict (user_id, rol_id) do nothing;

  return jsonb_build_object('user_id', p_user_id, 'areas', to_jsonb(public.fn_areas_de(p_user_id)));
end $$;

select public.fn_aplicar_permisos();
