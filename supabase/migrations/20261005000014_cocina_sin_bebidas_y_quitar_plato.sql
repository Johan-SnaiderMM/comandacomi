-- =====================================================================
-- 14 · La plancha solo ve lo que se cocina, y quitar un plato de un pedido
--
--   1. Las bebidas salían en la plancha como platos por preparar, y un pedido de "una hamburguesa y una gaseosa" no
--      quedaba listo hasta que alguien marcara la gaseosa. Ahora cada categoría dice si sus platos SE PREPARAN en la
--      cocina (por defecto sí). Lo que no se prepara:
--        · no aparece en la plancha ni cuenta para saber si el pedido ya está listo;
--        · un pedido que solo trae cosas así nace "listo" (no hay nada que cocinar);
--        · agregarle solo eso a un pedido no lo devuelve a la cocina.
--      El dato se copia a cada línea del pedido al venderla (igual que el nombre y el precio): cambiar la categoría
--      después no altera los pedidos que ya están andando.
--   2. Quitar un plato de un pedido (anular_item_pedido) ya existía; faltaba la pantalla. Aquí solo se agrega una
--      regla: el último plato no se quita, se anula el pedido completo (un pedido sin platos no se puede cobrar).
-- =====================================================================

alter table public.categorias_producto add column if not exists se_prepara boolean not null default true;
comment on column public.categorias_producto.se_prepara is 'false = sus platos no pasan por la cocina (bebidas, empacados): no salen en la plancha.';

alter table public.pedido_items add column if not exists se_prepara boolean not null default true;
comment on column public.pedido_items.se_prepara is 'Copia de categorias_producto.se_prepara al momento de vender.';

-- ---------------------------------------------------------------------
-- Agregar ítems: ahora devuelve CUÁNTAS de las líneas agregadas hay que preparar
-- ---------------------------------------------------------------------
drop function if exists public.fn_agregar_items(uuid, uuid, jsonb);

create function public.fn_agregar_items(p_rest uuid, p_pedido uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_it jsonb;
  v_prod public.productos%rowtype;
  v_cant int;
  v_ids uuid[];
  v_pedidas int;
  v_encontradas int;
  v_adic jsonb;
  v_adic_total int;
  v_notas text;
  v_prepara boolean;
  v_para_cocina int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un plato.';
  end if;
  if jsonb_array_length(p_items) > 60 then
    raise exception 'El pedido tiene demasiados platos.';
  end if;

  for v_it in select value from jsonb_array_elements(p_items) loop
    v_cant := coalesce((v_it ->> 'cantidad')::int, 1);
    if v_cant < 1 or v_cant > 99 then
      raise exception 'La cantidad debe estar entre 1 y 99.';
    end if;

    select * into v_prod
      from public.productos
     where id = (v_it ->> 'producto_id')::uuid and restaurante_id = p_rest and activo;
    if not found then
      raise exception 'Uno de los platos ya no existe.' using errcode = 'P0002';
    end if;
    if not v_prod.disponible then
      raise exception '% no está disponible hoy.', v_prod.nombre;
    end if;

    select c.se_prepara into v_prepara
      from public.categorias_producto c
     where c.id = v_prod.categoria_id and c.restaurante_id = p_rest;
    v_prepara := coalesce(v_prepara, true);

    select coalesce(array_agg(distinct value::uuid), '{}')
      into v_ids
      from jsonb_array_elements_text(coalesce(v_it -> 'adiciones', '[]'::jsonb));
    v_pedidas := coalesce(array_length(v_ids, 1), 0);

    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'precio', m.precio_extra)
                              order by m.precio_extra, m.nombre), '[]'::jsonb),
           coalesce(sum(m.precio_extra), 0)::int,
           count(*)
      into v_adic, v_adic_total, v_encontradas
      from public.modificadores m
     where m.restaurante_id = p_rest and m.activo and m.id = any (v_ids)
       and (m.categoria_id is null or m.categoria_id = v_prod.categoria_id);
    if v_encontradas <> v_pedidas then
      raise exception 'Una adición de % ya no está disponible.', v_prod.nombre;
    end if;

    v_notas := nullif(left(btrim(coalesce(v_it ->> 'notas', '')), 120), '');

    insert into public.pedido_items
      (restaurante_id, pedido_id, producto_id, nombre, precio_unitario, cantidad, adiciones, adiciones_total, notas,
       subtotal, se_prepara)
    values
      (p_rest, p_pedido, v_prod.id, v_prod.nombre, v_prod.precio, v_cant, v_adic, v_adic_total, v_notas,
       (v_prod.precio + v_adic_total) * v_cant, v_prepara);
    if v_prepara then
      v_para_cocina := v_para_cocina + 1;
    end if;
  end loop;

  update public.pedidos
     set total = (select coalesce(sum(subtotal), 0) from public.pedido_items where pedido_id = p_pedido and not anulado)
   where id = p_pedido and restaurante_id = p_rest;

  return v_para_cocina;
end $$;

-- ---------------------------------------------------------------------
-- Pedidos del mostrador
-- ---------------------------------------------------------------------
-- Igual que antes; si nada de lo pedido se cocina, el pedido nace "listo". Devuelve además `para_cocina`.
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
  v_rest uuid := public.requerir_restaurante();
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

-- Agregar platos: vuelve a la cocina solo si lo nuevo se cocina. Si era un pedido ya entregado y le agregan una bebida,
-- queda "listo" (hay que entregarla), no "pendiente".
create or replace function public.agregar_items_pedido(p_pedido_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- Aceptar el pedido de un cliente: si no trae nada que cocinar, pasa directo a "listo".
create or replace function public.confirmar_pedido_cliente(p_pedido_id uuid, p_minutos integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- ---------------------------------------------------------------------
-- Plancha
-- ---------------------------------------------------------------------
-- Solo los pedidos que tienen algo que cocinar, y de ellos solo esas líneas.
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
                       from public.pedido_items i
                      where i.pedido_id = p.id and not i.anulado and i.se_prepara), '[]'::jsonb)
                 ) as fila
            from public.pedidos p
            left join public.mesas m on m.id = p.mesa_id
           where not p.anulado and p.en_cocina and p.estado <> 'entregado'
             and (p.estado = 'pendiente' or p.listo_at > now() - interval '15 minutes')
             and exists (select 1 from public.pedido_items i
                          where i.pedido_id = p.id and not i.anulado and i.se_prepara)
        ) x), '[]'::jsonb)
  )
$$;

-- Marca (o desmarca) UN plato. El pedido pasa a "listo" cuando no queda nada POR COCINAR.
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

-- ---------------------------------------------------------------------
-- Quitar un plato
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Lecturas: cada línea dice si se prepara. Lo que no se prepara figura "listo" cuando el pedido lo está.
-- ---------------------------------------------------------------------
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
                                                     'se_prepara', i.se_prepara,
                                                     'listo', i.listo_at is not null
                                                              or (not i.se_prepara and p.estado <> 'pendiente'))
                                  order by i.created_at, i.seq)
                   from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
        left join public.mesas m on m.id = p.mesa_id
       where not p.anulado and p.en_cocina and (p.cobrado_at is null or p.estado <> 'entregado')
    ) x
$$;

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
               -- Lo que no se cocina (una gaseosa) figura listo cuando el pedido lo está.
               'listo', i.listo_at is not null
                        or (not i.se_prepara and v_etapa in ('listo', 'entregado'))) order by i.created_at, i.seq)
        from public.pedido_items i where i.pedido_id = v_p.id and not i.anulado), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- Menú: la categoría dice si sus platos se preparan
-- ---------------------------------------------------------------------
drop function if exists public.guardar_categoria(uuid, text, text, integer, boolean);

create or replace function public.guardar_categoria(
  p_id uuid,
  p_nombre text,
  p_icono text default null,
  p_orden integer default null,
  p_activa boolean default true,
  p_se_prepara boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 40);
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre de la categoría.';
  end if;

  begin
    if p_id is null then
      insert into public.categorias_producto (id, restaurante_id, nombre, icono, orden, activa, se_prepara)
      values (v_id, v_rest, v_nombre, nullif(left(btrim(coalesce(p_icono, '')), 8), ''),
              coalesce(p_orden, (select coalesce(max(orden), 0) + 1 from public.categorias_producto where restaurante_id = v_rest)),
              coalesce(p_activa, true), coalesce(p_se_prepara, true));
    else
      update public.categorias_producto
         set nombre = v_nombre, icono = nullif(left(btrim(coalesce(p_icono, '')), 8), ''),
             orden = coalesce(p_orden, orden), activa = coalesce(p_activa, activa),
             se_prepara = coalesce(p_se_prepara, se_prepara)
       where id = p_id and restaurante_id = v_rest;
      if not found then
        raise exception 'La categoría no existe.' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una categoría con ese nombre.';
  end;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.listar_menu_admin()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'icono', c.icono, 'orden', c.orden, 'activa', c.activa,
               'se_prepara', c.se_prepara,
               'productos', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'precio', p.precio,
                                                     'disponible', p.disponible, 'orden', p.orden)
                                  order by p.orden, p.nombre)
                   from public.productos p where p.categoria_id = c.id and p.activo), '[]'::jsonb)
             ) order by c.orden, c.nombre)
        from public.categorias_producto c), '[]'::jsonb),
    'modificadores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'categoria_id', m.categoria_id, 'nombre', m.nombre,
                                          'precio_extra', m.precio_extra) order by m.categoria_id nulls first, m.nombre)
        from public.modificadores m where m.activo), '[]'::jsonb),
    -- Platos que se quitaron del menú (no se borran: los pedidos de antes los conservan).
    'quitados', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'categoria', c.nombre,
                                          'nombre', p.nombre, 'precio', p.precio)
                       order by lower(p.nombre), p.id)
        from public.productos p
        join public.categorias_producto c on c.id = p.categoria_id
       where not p.activo), '[]'::jsonb)
  )
$$;

-- El menú para tomar pedidos también lo trae: sin señal, el celular sabe si un pedido nuevo va a la cocina.
create or replace function public.obtener_menu_para_pedido()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'icono', c.icono, 'se_prepara', c.se_prepara)
                       order by c.orden, c.nombre)
        from public.categorias_producto c where c.activa), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'nombre', p.nombre,
                                          'precio', p.precio, 'disponible', p.disponible) order by p.orden, p.nombre)
        from public.productos p where p.activo), '[]'::jsonb),
    'modificadores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'categoria_id', m.categoria_id, 'nombre', m.nombre,
                                          'precio_extra', m.precio_extra) order by m.precio_extra, m.nombre)
        from public.modificadores m where m.activo), '[]'::jsonb),
    'mesas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'nombre', t.nombre,
               'pedido_abierto', (select o.id from public.pedidos o
                                   where o.mesa_id = t.id and not o.anulado and o.cobrado_at is null
                                   order by o.created_at desc limit 1)
             ) order by t.orden, t.nombre)
        from public.mesas t where t.activa), '[]'::jsonb)
  )
$$;

select public.fn_aplicar_permisos();
