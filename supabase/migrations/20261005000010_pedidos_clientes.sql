-- =====================================================================
-- COMANDA · 0010 · PEDIDOS DE CLIENTES, ESTADO POR PLATO Y PANEL PLANCHA
--
-- Qué agrega:
--   1. Identidad pública del restaurante (slug) y un interruptor "recibir pedidos en línea".
--   2. Pedidos hechos por el cliente SIN cuenta (origen = 'cliente'). Entran "por confirmar": no llegan a la
--      cocina hasta que el restaurante los acepta (con tiempo estimado) o los rechaza con motivo.
--   3. Estado por plato (pedido_items.listo_at): la plancha marca cada plato; el pedido pasa a "listo" solo
--      cuando todos sus platos lo están.
--   4. Seguimiento: cada pedido tiene un código secreto (token_seguimiento) con el que su cliente lo consulta.
--
-- Seguridad (lo único NUEVO que toca un visitante anónimo son cuatro funciones publico_*):
--   * anon NO lee ninguna tabla. Solo puede EJECUTAR funciones cuyo nombre empieza por publico_
--     (fn_aplicar_permisos lo aplica; una prueba verifica la lista exacta).
--   * Cada función pública valida todo, lee precios de la base y filtra por el restaurante del slug.
--   * Anti-abuso en la base: máximo de pedidos por confirmar, por teléfono y por minuto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Slug del restaurante
-- ---------------------------------------------------------------------
alter table public.restaurantes add column if not exists slug text;
alter table public.restaurantes add column if not exists pedidos_en_linea boolean not null default true;
comment on column public.restaurantes.slug is 'Nombre corto para la dirección pública: /pedir/<slug>. Minúsculas, números y guiones.';
comment on column public.restaurantes.pedidos_en_linea is 'false = el panel del cliente avisa que hoy no se reciben pedidos en línea.';

-- "La Plancha de Don Beto" -> "la-plancha-de-don-beto"
create or replace function public.fn_slug(p_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(nullif(
    trim(both '-' from left(
      regexp_replace(
        lower(translate(coalesce(p_texto, ''),
                        'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ',
                        'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun')),
        '[^a-z0-9]+', '-', 'g'),
      40)),
    ''), 'restaurante')
$$;

-- Slug libre: si ya existe (o es una palabra reservada) agrega -2, -3…  security definer: ve TODOS los restaurantes.
create or replace function public.fn_slug_unico(p_texto text, p_excluir uuid default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text := public.fn_slug(p_texto);
  v text;
  n int := 1;
  v_reservados constant text[] := array[
    'www', 'app', 'admin', 'api', 'soporte', 'demo', 'login', 'salir', 'sc', 'pedir', 'seguimiento', 'plancha',
    'inicio', 'pedidos', 'fiado', 'gastos', 'menu', 'mas', 'cierre', 'restaurante'];
begin
  if length(v_base) < 3 then
    v_base := v_base || '-local';
  end if;
  v := v_base;
  while v = any (v_reservados)
     or exists (select 1 from public.restaurantes r where r.slug = v and r.id is distinct from p_excluir)
  loop
    n := n + 1;
    v := trim(both '-' from left(v_base, 40 - length(n::text) - 1)) || '-' || n;
  end loop;
  return v;
end $$;

-- Los restaurantes que ya existen reciben su slug (uno por vuelta, para que cada uno vea al anterior).
do $$
declare
  r record;
begin
  for r in select id, nombre from public.restaurantes where slug is null order by created_at, id loop
    update public.restaurantes set slug = public.fn_slug_unico(r.nombre, r.id) where id = r.id;
  end loop;
end $$;

alter table public.restaurantes alter column slug set not null;
create unique index if not exists ux_restaurantes_slug on public.restaurantes (slug);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_restaurantes_slug') then
    alter table public.restaurantes
      add constraint chk_restaurantes_slug
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40);
  end if;
end $$;

-- Cualquier restaurante nuevo (seed, pruebas, futuro alta de clientes) nace con su slug.
create or replace function public.fn_restaurante_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.fn_slug_unico(new.nombre, new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_restaurante_slug on public.restaurantes;
create trigger trg_restaurante_slug
  before insert on public.restaurantes
  for each row execute function public.fn_restaurante_slug();

-- ---------------------------------------------------------------------
-- 2. Pedidos de clientes y seguimiento
-- ---------------------------------------------------------------------
alter table public.pedidos add column if not exists origen text not null default 'mostrador';
alter table public.pedidos add column if not exists token_seguimiento uuid not null default gen_random_uuid();
alter table public.pedidos add column if not exists confirmado_at timestamptz;
alter table public.pedidos add column if not exists confirmado_por uuid references auth.users(id) on delete set null;
alter table public.pedidos add column if not exists tiempo_estimado_min integer;
-- "En la cocina": los del mostrador desde el primer momento; los de clientes cuando el restaurante los acepta.
alter table public.pedidos add column if not exists en_cocina boolean
  generated always as (origen = 'mostrador' or confirmado_at is not null) stored;

comment on column public.pedidos.origen is 'mostrador = lo toma el personal; cliente = lo hizo el cliente en línea (entra por confirmar).';
comment on column public.pedidos.token_seguimiento is 'Código secreto con el que el cliente consulta SU pedido (no adivinable).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_origen') then
    alter table public.pedidos add constraint chk_pedido_origen check (origen in ('mostrador', 'cliente'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_pedido_tiempo') then
    alter table public.pedidos add constraint chk_pedido_tiempo
      check (tiempo_estimado_min is null or tiempo_estimado_min between 1 and 240);
  end if;
end $$;

create unique index if not exists ux_pedidos_token on public.pedidos (token_seguimiento);
create index if not exists idx_pedidos_por_confirmar on public.pedidos (restaurante_id, created_at)
  where origen = 'cliente' and confirmado_at is null and not anulado;
create index if not exists idx_pedidos_cliente_tel on public.pedidos (restaurante_id, contacto_telefono, created_at)
  where origen = 'cliente';

-- Un pedido de cliente sin aceptar no se mueve ni se cobra: primero se acepta (o se rechaza = anular).
create or replace function public.fn_pedido_requiere_confirmacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.origen = 'cliente' and new.confirmado_at is null and not new.anulado then
    if new.estado is distinct from old.estado or new.cobrado_at is distinct from old.cobrado_at then
      raise exception 'Primero acepta el pedido del cliente.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedido_requiere_confirmacion on public.pedidos;
create trigger trg_pedido_requiere_confirmacion
  before update on public.pedidos
  for each row execute function public.fn_pedido_requiere_confirmacion();

-- ---------------------------------------------------------------------
-- 3. Estado por plato
-- ---------------------------------------------------------------------
-- Orden en que se agregaron los platos (los de un mismo pedido comparten created_at: sin esto salían al azar).
alter table public.pedido_items add column if not exists seq bigint generated always as identity;
alter table public.pedido_items add column if not exists listo_at timestamptz;
alter table public.pedido_items add column if not exists listo_por uuid references auth.users(id) on delete set null;
comment on column public.pedido_items.listo_at is 'Cuándo la plancha marcó este plato como listo (null = por preparar).';

-- ---------------------------------------------------------------------
-- 4. Lo que ya existía, ahora sabiendo de pedidos por confirmar y de platos listos
-- ---------------------------------------------------------------------
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurante', (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'es_demo', r.es_demo,
                                              'slug', r.slug, 'pedidos_en_linea', r.pedidos_en_linea)
                      from public.restaurantes r limit 1),
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'rol', p.rol)
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

create or replace function public.contar_pendientes()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.pedidos
   where not anulado and en_cocina and (cobrado_at is null or estado <> 'entregado')
$$;

create or replace function public.obtener_inicio()
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.hoy_bogota();
  v_ayer date := public.hoy_bogota() - 1;
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
    'ventas_hoy', v_ventas_hoy,
    'gastos_hoy', v_gastos_hoy,
    'ganancia_hoy', v_ventas_hoy - v_gastos_hoy,
    'pedidos_hoy', v_pedidos_hoy,
    'ventas_ayer', v_ventas_ayer,
    'gastos_ayer', v_gastos_ayer,
    'ganancia_ayer', v_ventas_ayer - v_gastos_ayer,
    'por_cobrar', v_por_cobrar,
    'clientes_con_deuda', v_deudores,
    'pedidos_pendientes', v_pendientes,
    'pedidos_sin_cobrar', v_sin_cobrar,
    'pedidos_por_confirmar', v_por_confirmar
  );
end $$;

create or replace function public.listar_pedidos_pendientes()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.created_at, x.numero), '[]'::jsonb)
    from (
      select p.created_at, p.numero,
             jsonb_build_object(
               'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'estado', p.estado,
               'created_at', p.created_at, 'total', p.total, 'cobrado', p.cobrado_at is not null,
               'mesa', m.nombre, 'contacto_nombre', p.contacto_nombre,
               'contacto_telefono', p.contacto_telefono, 'direccion', p.direccion, 'notas', p.notas,
               'origen', p.origen, 'token', p.token_seguimiento, 'tiempo_estimado_min', p.tiempo_estimado_min,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                                     'notas', i.notas, 'adiciones', i.adiciones,
                                                     'listo', i.listo_at is not null)
                                  order by i.created_at, i.seq)
                   from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
        left join public.mesas m on m.id = p.mesa_id
       where not p.anulado and p.en_cocina and (p.cobrado_at is null or p.estado <> 'entregado')
    ) x
$$;

-- Marcar un pedido listo/entregado marca todos sus platos; volver a pendiente los vuelve a poner por preparar.
create or replace function public.cambiar_estado_pedido(p_pedido_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- Anular un plato: si con eso ya no queda nada por preparar, el pedido pasa a listo.
create or replace function public.anular_item_pedido(p_item_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
  v_item public.pedido_items%rowtype;
  v_ped public.pedidos%rowtype;
begin
  select * into v_item from public.pedido_items where id = p_item_id and restaurante_id = v_rest for update;
  if not found or v_item.anulado then
    raise exception 'El plato no existe o ya está anulado.' using errcode = 'P0002';
  end if;

  select * into v_ped from public.pedidos where id = v_item.pedido_id and restaurante_id = v_rest for update;
  if v_ped.anulado or v_ped.cobrado_at is not null then
    raise exception 'El pedido ya está cobrado o anulado: anula el cobro primero.';
  end if;

  update public.pedido_items
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_item_id and restaurante_id = v_rest;

  update public.pedidos
     set total = (select coalesce(sum(subtotal), 0) from public.pedido_items where pedido_id = v_ped.id and not anulado)
   where id = v_ped.id and restaurante_id = v_rest;

  if v_ped.en_cocina and v_ped.estado = 'pendiente'
     and exists (select 1 from public.pedido_items
                  where pedido_id = v_ped.id and restaurante_id = v_rest and not anulado)
     and not exists (select 1 from public.pedido_items
                      where pedido_id = v_ped.id and restaurante_id = v_rest and not anulado and listo_at is null) then
    update public.pedidos set estado = 'listo', listo_at = coalesce(listo_at, now())
     where id = v_ped.id and restaurante_id = v_rest;
  end if;

  return jsonb_build_object('id', p_item_id, 'pedido_id', v_ped.id);
end $$;

-- La demo: los pedidos de ejemplo que ya van "listos" o "entregados" traen sus platos marcados.
create or replace function public.fn_demo_pedido(
  p_rest uuid,
  p_ts timestamptz,
  p_s integer,
  p_tipo text,
  p_mesa uuid,
  p_medio text,
  p_cliente uuid,
  p_estado text,
  p_cobrar boolean,
  p_contacto text default null,
  p_direccion text default null,
  p_nota_pedido text default null,
  p_nota_item text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_pago uuid := gen_random_uuid();
  v_num int;
  v_mains uuid[];
  v_bebidas uuid[];
  v_items jsonb;
  v_m1 uuid;
  v_cat1 uuid;
  v_mod uuid;
  v_adic jsonb := '[]'::jsonb;
  v_nota text;
  v_total int;
  v_prop int := 0;
  v_due int;
  v_recibido int;
  v_t_cobro timestamptz;
  v_s text := p_s::text;
begin
  select array_agg(p.id order by p.orden, p.nombre) filter (where c.nombre <> 'Bebidas'),
         array_agg(p.id order by p.orden, p.nombre) filter (where c.nombre = 'Bebidas')
    into v_mains, v_bebidas
    from public.productos p
    join public.categorias_producto c on c.id = p.categoria_id
   where p.restaurante_id = p_rest and p.activo;

  v_m1 := v_mains[1 + public.fn_demo_hash(v_s || 'a', cardinality(v_mains))];
  select categoria_id into v_cat1 from public.productos where id = v_m1;

  if public.fn_demo_hash(v_s || 'q', 100) < 30 then
    select id into v_mod from public.modificadores
     where restaurante_id = p_rest and activo and categoria_id = v_cat1
     order by precio_extra, nombre limit 1;
    if v_mod is not null then
      v_adic := jsonb_build_array(v_mod);
    end if;
  end if;

  v_nota := coalesce(p_nota_item,
    case when public.fn_demo_hash(v_s || 'z', 100) < 18
      then (array['Sin cebolla', 'Sin salsa', 'Bien cocida', 'Poca sal'])[1 + public.fn_demo_hash(v_s || 'y', 4)]
    end);

  v_items := jsonb_build_array(jsonb_build_object(
    'producto_id', v_m1,
    'cantidad', case when public.fn_demo_hash(v_s || 'n', 100) < 20 then 2 else 1 end,
    'adiciones', v_adic,
    'notas', v_nota));

  if public.fn_demo_hash(v_s || 'b', 100) < 35 then
    v_items := v_items || jsonb_build_object(
      'producto_id', v_mains[1 + public.fn_demo_hash(v_s || 'c', cardinality(v_mains))], 'cantidad', 1);
  end if;
  if public.fn_demo_hash(v_s || 'd', 100) < 75 then
    v_items := v_items || jsonb_build_object(
      'producto_id', v_bebidas[1 + public.fn_demo_hash(v_s || 'e', cardinality(v_bebidas))], 'cantidad', 1);
  end if;

  update public.restaurantes set consecutivo_pedido = consecutivo_pedido + 1
   where id = p_rest returning consecutivo_pedido into v_num;

  insert into public.pedidos
    (id, restaurante_id, numero, tipo, mesa_id, cliente_id, contacto_nombre, direccion, notas, estado,
     listo_at, entregado_at, created_at)
  values
    (v_id, p_rest, v_num, p_tipo, p_mesa, p_cliente, p_contacto, p_direccion, p_nota_pedido, p_estado,
     case when p_estado in ('listo', 'entregado') then p_ts + interval '12 minutes' end,
     case when p_estado = 'entregado' then p_ts + interval '18 minutes' end,
     p_ts);

  perform public.fn_agregar_items(p_rest, v_id, v_items);
  update public.pedido_items
     set created_at = p_ts,
         listo_at = case when p_estado in ('listo', 'entregado') then p_ts + interval '12 minutes' end
   where pedido_id = v_id;

  if not p_cobrar then
    return v_id;
  end if;

  select total into v_total from public.pedidos where id = v_id;
  if p_tipo = 'mesa' and p_medio <> 'fiado' and public.fn_demo_hash(v_s || 'p', 100) < 40 then
    v_prop := (round(v_total * 0.10 / 500.0) * 500)::int;
  end if;
  v_due := v_total + v_prop;
  v_t_cobro := p_ts + case p_tipo when 'mesa' then interval '38 minutes'
                                  when 'llevar' then interval '14 minutes'
                                  else interval '32 minutes' end;

  if p_medio = 'efectivo' then
    v_recibido := case
      when public.fn_demo_hash(v_s || 'r', 10) < 3 then v_due
      when public.fn_demo_hash(v_s || 'r', 10) < 7 then (ceil(v_due / 10000.0) * 10000)::int
      else (ceil(v_due / 5000.0) * 5000)::int end;
    insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, recibido, vuelto, created_at)
    values (v_pago, p_rest, v_id, 'efectivo', v_due, v_recibido, v_recibido - v_due, v_t_cobro);
  elsif p_medio = 'transferencia' then
    insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, referencia, created_at)
    values (v_pago, p_rest, v_id, 'transferencia', v_due,
            'NEQ' || lpad(public.fn_demo_hash(v_s || 'f', 999999)::text, 6, '0'), v_t_cobro);
  else
    insert into public.pagos_pedido (id, restaurante_id, pedido_id, medio, monto, cliente_id, created_at)
    values (v_pago, p_rest, v_id, 'fiado', v_due, p_cliente, v_t_cobro);
    insert into public.movimientos_fiado (restaurante_id, cliente_id, tipo, monto, pedido_id, pago_id, created_at)
    values (p_rest, p_cliente, 'cargo', v_due, v_id, v_pago, v_t_cobro);
  end if;

  update public.pedidos
     set propina = v_prop, cobrado_at = v_t_cobro, estado = 'entregado',
         listo_at = coalesce(listo_at, p_ts + interval '12 minutes'),
         entregado_at = coalesce(entregado_at, p_ts + interval '18 minutes')
   where id = v_id;
  update public.pedido_items set listo_at = coalesce(listo_at, p_ts + interval '12 minutes') where pedido_id = v_id;

  return v_id;
end $$;

-- Reiniciar la demo: además del nombre, el enlace público (slug) sigue al nombre y los pedidos en línea se abren.
create or replace function public.reiniciar_demo(p_nombre text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if not coalesce((select es_demo from public.restaurantes where id = v_rest), false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  if p_nombre is not null and v_nombre is null then
    raise exception 'Escribe el nombre del restaurante.' using errcode = '22023';
  end if;
  if length(coalesce(v_nombre, '')) > 60 then
    raise exception 'El nombre es muy largo (máximo 60 caracteres).' using errcode = '22023';
  end if;

  if v_nombre is not null then
    update public.restaurantes
       set nombre = v_nombre, slug = public.fn_slug_unico(v_nombre, v_rest)
     where id = v_rest;
  end if;
  update public.restaurantes set pedidos_en_linea = true where id = v_rest;
  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. Personal: pedidos de clientes por confirmar
-- ---------------------------------------------------------------------
create or replace function public.listar_pedidos_por_confirmar()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.created_at, x.numero), '[]'::jsonb)
    from (
      select p.created_at, p.numero,
             jsonb_build_object(
               'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'created_at', p.created_at, 'total', p.total,
               'contacto_nombre', p.contacto_nombre, 'contacto_telefono', p.contacto_telefono,
               'direccion', p.direccion, 'notas', p.notas, 'token', p.token_seguimiento,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                                     'notas', i.notas, 'adiciones', i.adiciones)
                                  order by i.created_at, i.seq)
                   from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
       where p.origen = 'cliente' and p.confirmado_at is null and not p.anulado
    ) x
$$;

-- Consulta mínima para el aviso (se pregunta cada pocos segundos): cuántos hay y los más recientes. `activo` dice si
-- el restaurante recibe pedidos en línea: si no los recibe (y no hay ninguno pendiente) la app pregunta con calma.
create or replace function public.resumen_por_confirmar()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'activo', coalesce((select r.pedidos_en_linea from public.restaurantes r limit 1), false),
    'cantidad', (select count(*) from public.pedidos p
                  where p.origen = 'cliente' and p.confirmado_at is null and not p.anulado),
    'recientes', coalesce((
      select jsonb_agg(f.fila order by f.created_at desc)
        from (
          select p.created_at,
                 jsonb_build_object('id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'total', p.total,
                                    'contacto_nombre', p.contacto_nombre, 'created_at', p.created_at) as fila
            from public.pedidos p
           where p.origen = 'cliente' and p.confirmado_at is null and not p.anulado
           order by p.created_at desc
           limit 5
        ) f), '[]'::jsonb)
  )
$$;

-- Aceptar: el pedido pasa a la cocina (aparece en Pendientes y en la plancha). Rechazar = anular_pedido con motivo.
create or replace function public.confirmar_pedido_cliente(p_pedido_id uuid, p_minutos integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_p public.pedidos%rowtype;
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

  return jsonb_build_object('id', v_p.id, 'numero', v_p.numero);
end $$;

-- Abrir o cerrar la recepción de pedidos en línea (solo el dueño).
create or replace function public.configurar_pedidos_en_linea(p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
begin
  if p_activo is null then
    raise exception 'Indica si se reciben pedidos en línea.';
  end if;
  update public.restaurantes set pedidos_en_linea = p_activo where id = v_rest;
  return jsonb_build_object('pedidos_en_linea', p_activo);
end $$;

-- ---------------------------------------------------------------------
-- 6. Plancha: lo que hay que cocinar, plato por plato
-- ---------------------------------------------------------------------
-- Por preparar (pendiente) + los que se marcaron listos hace poco (para deshacer un error de dedo).
create or replace function public.listar_plancha()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ahora', now(),
    'pedidos', coalesce((
      select jsonb_agg(x.fila order by x.created_at, x.numero)
        from (
          select p.created_at, p.numero,
                 jsonb_build_object(
                   'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'estado', p.estado, 'origen', p.origen,
                   'created_at', p.created_at, 'confirmado_at', p.confirmado_at, 'listo_at', p.listo_at,
                   'mesa', m.nombre, 'contacto_nombre', p.contacto_nombre, 'notas', p.notas,
                   'tiempo_estimado_min', p.tiempo_estimado_min,
                   'items', coalesce((
                     select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                                         'notas', i.notas, 'adiciones', i.adiciones,
                                                         'listo', i.listo_at is not null)
                                      order by i.created_at, i.seq)
                       from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb)
                 ) as fila
            from public.pedidos p
            left join public.mesas m on m.id = p.mesa_id
           where not p.anulado and p.en_cocina and p.estado <> 'entregado'
             and (p.estado = 'pendiente' or p.listo_at > now() - interval '15 minutes')
        ) x), '[]'::jsonb)
  )
$$;

-- Marca (o desmarca) UN plato. Si con eso todos los platos del pedido quedan listos, el pedido pasa a "listo".
create or replace function public.marcar_item_listo(p_item_id uuid, p_listo boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

  select count(*), count(*) filter (where listo_at is null)
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

-- ---------------------------------------------------------------------
-- 7. API pública (sin cuenta). TODO lo anónimo vive aquí y se llama publico_*.
-- ---------------------------------------------------------------------

-- Menú del restaurante para el panel del cliente (null si el enlace no existe).
create or replace function public.publico_menu(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.restaurantes%rowtype;
begin
  select * into v_r from public.restaurantes where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'restaurante', jsonb_build_object('nombre', v_r.nombre, 'slug', v_r.slug,
                                      'es_demo', v_r.es_demo, 'abierto', v_r.pedidos_en_linea),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'icono', c.icono) order by c.orden, c.nombre)
        from public.categorias_producto c where c.restaurante_id = v_r.id and c.activa), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'nombre', p.nombre,
                                          'precio', p.precio, 'disponible', p.disponible) order by p.orden, p.nombre)
        from public.productos p
        join public.categorias_producto c on c.id = p.categoria_id and c.restaurante_id = p.restaurante_id
       where p.restaurante_id = v_r.id and p.activo and c.activa), '[]'::jsonb),
    'modificadores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'categoria_id', m.categoria_id, 'nombre', m.nombre,
                                          'precio_extra', m.precio_extra) order by m.precio_extra, m.nombre)
        from public.modificadores m where m.restaurante_id = v_r.id and m.activo), '[]'::jsonb)
  );
end $$;

-- El cliente envía su pedido. Entra "por confirmar". Precios y disponibilidad los lee la base (fn_agregar_items).
create or replace function public.publico_crear_pedido(
  p_slug text,
  p_tipo text,
  p_nombre text,
  p_telefono text,
  p_direccion text,
  p_notas text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_r public.restaurantes%rowtype;
  v_id uuid := gen_random_uuid();
  v_num int;
  v_nombre text;
  v_tel text;
  v_dir text;
  v_it jsonb;
  v_token uuid;
  v_total int;
begin
  -- Se bloquea la fila del restaurante: los pedidos en línea de un mismo local se atienden de a uno
  -- (así los topes de abajo y el consecutivo no se pisan).
  select * into v_r from public.restaurantes where slug = lower(btrim(coalesce(p_slug, ''))) for update;
  if not found then
    raise exception 'Este restaurante no existe.' using errcode = 'P0002';
  end if;
  if not v_r.pedidos_en_linea then
    raise exception 'Por ahora este restaurante no está recibiendo pedidos en línea.';
  end if;

  if p_tipo is null or p_tipo not in ('llevar', 'domicilio') then
    raise exception 'Elige si pasas a recogerlo o si te lo llevamos.';
  end if;

  v_nombre := left(btrim(coalesce(p_nombre, '')), 60);
  if length(v_nombre) < 2 then
    raise exception 'Escribe tu nombre.';
  end if;

  v_tel := public.fn_normalizar_telefono(p_telefono);
  if v_tel is null then
    raise exception 'El teléfono no es válido. Escríbelo con 10 dígitos, por ejemplo 300 123 4567.';
  end if;

  v_dir := left(btrim(coalesce(p_direccion, '')), 120);
  if p_tipo = 'domicilio' and length(v_dir) < 5 then
    raise exception 'Escribe la dirección del domicilio (barrio, calle y número).';
  end if;
  if p_tipo = 'llevar' then
    v_dir := null;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Agrega al menos un plato (máximo 30 por pedido).';
  end if;
  for v_it in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_it) <> 'object' then
      raise exception 'El pedido no es válido.';
    end if;
    if coalesce((v_it ->> 'cantidad')::int, 1) not between 1 and 20 then
      raise exception 'La cantidad máxima por plato es 20.';
    end if;
    if jsonb_typeof(coalesce(v_it -> 'adiciones', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_it -> 'adiciones', '[]'::jsonb)) > 8 then
      raise exception 'Demasiadas adiciones en un plato.';
    end if;
  end loop;

  -- Topes contra abuso (sin servicios externos: todo se cuenta en la base).
  if (select count(*) from public.pedidos
       where restaurante_id = v_r.id and origen = 'cliente' and confirmado_at is null and not anulado) >= 25 then
    raise exception 'El restaurante tiene muchos pedidos por confirmar. Intenta de nuevo en unos minutos.';
  end if;
  if (select count(*) from public.pedidos
       where restaurante_id = v_r.id and origen = 'cliente' and contacto_telefono = v_tel
         and created_at > now() - interval '30 minutes') >= 3 then
    raise exception 'Ya hiciste varios pedidos hace poco. Espera un momento o llama al restaurante.';
  end if;
  if (select count(*) from public.pedidos
       where restaurante_id = v_r.id and origen = 'cliente' and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Estamos recibiendo muchos pedidos a la vez. Intenta de nuevo en un minuto.';
  end if;

  update public.restaurantes set consecutivo_pedido = consecutivo_pedido + 1
   where id = v_r.id returning consecutivo_pedido into v_num;

  insert into public.pedidos
    (id, restaurante_id, numero, tipo, origen, contacto_nombre, contacto_telefono, direccion, notas)
  values
    (v_id, v_r.id, v_num, p_tipo, 'cliente', v_nombre, v_tel, v_dir,
     nullif(left(btrim(coalesce(p_notas, '')), 200), ''))
  returning token_seguimiento into v_token;

  perform public.fn_agregar_items(v_r.id, v_id, p_items);

  select total into v_total from public.pedidos where id = v_id;
  return jsonb_build_object('token', v_token, 'numero', v_num, 'total', v_total);
end $$;

-- Seguimiento: SOLO el pedido de ese código (nunca otros) y solo lo que el cliente necesita ver.
create or replace function public.publico_ver_pedido(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.pedidos%rowtype;
  v_r public.restaurantes%rowtype;
  v_etapa text;
begin
  if p_token is null then
    return null;
  end if;
  select * into v_p from public.pedidos where token_seguimiento = p_token;
  if not found then
    return null;
  end if;
  select * into v_r from public.restaurantes where id = v_p.restaurante_id;

  v_etapa := case
    when v_p.anulado then 'cancelado'
    when v_p.origen = 'cliente' and v_p.confirmado_at is null then 'por_confirmar'
    when v_p.estado = 'entregado' then 'entregado'
    when v_p.estado = 'listo' then 'listo'
    else 'preparando'
  end;

  return jsonb_build_object(
    'ahora', now(),
    'restaurante', jsonb_build_object('nombre', v_r.nombre, 'slug', v_r.slug),
    'pedido', jsonb_build_object(
      'numero', v_p.numero, 'tipo', v_p.tipo, 'origen', v_p.origen, 'etapa', v_etapa,
      'created_at', v_p.created_at, 'confirmado_at', v_p.confirmado_at, 'listo_at', v_p.listo_at,
      'entregado_at', v_p.entregado_at, 'tiempo_estimado_min', v_p.tiempo_estimado_min,
      'total', v_p.total, 'contacto_nombre', v_p.contacto_nombre, 'direccion', v_p.direccion,
      -- El motivo solo se muestra si el restaurante RECHAZÓ el pedido (antes de aceptarlo).
      'motivo', case when v_p.anulado and v_p.confirmado_at is null then v_p.anulado_motivo end),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', i.nombre, 'cantidad', i.cantidad, 'notas', i.notas,
               'adiciones', (select coalesce(jsonb_agg(a ->> 'nombre'), '[]'::jsonb) from jsonb_array_elements(i.adiciones) a),
               'listo', i.listo_at is not null) order by i.created_at, i.seq)
        from public.pedido_items i where i.pedido_id = v_p.id and not i.anulado), '[]'::jsonb)
  );
end $$;

-- El cliente cancela su pedido mientras el restaurante todavía no lo acepta.
create or replace function public.publico_cancelar_pedido(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p public.pedidos%rowtype;
begin
  if p_token is null then
    raise exception 'No encontramos ese pedido.' using errcode = 'P0002';
  end if;
  select * into v_p from public.pedidos where token_seguimiento = p_token for update;
  if not found then
    raise exception 'No encontramos ese pedido.' using errcode = 'P0002';
  end if;
  if v_p.anulado then
    return jsonb_build_object('ok', true);
  end if;
  if v_p.origen <> 'cliente' or v_p.confirmado_at is not null then
    raise exception 'El restaurante ya aceptó tu pedido. Llámalos si necesitas cambiarlo.';
  end if;

  update public.pedidos
     set anulado = true, anulado_motivo = 'Cancelado por el cliente', anulado_at = now()
   where id = v_p.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 8. Permisos: anon ejecuta SOLO publico_*  (se reemplaza fn_aplicar_permisos de la migración 0006)
-- ---------------------------------------------------------------------
create or replace function public.fn_aplicar_permisos()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as firma, p.proname as nombre
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.firma);
    if r.nombre not like 'fn\_%' and r.nombre not like 'requerir\_%' then
      execute format('grant execute on function %s to authenticated', r.firma);
    end if;
    -- API pública (clientes sin cuenta): únicamente las funciones publico_*
    if r.nombre like 'publico\_%' then
      execute format('grant execute on function %s to anon', r.firma);
    end if;
  end loop;
end $$;

select public.fn_aplicar_permisos();
