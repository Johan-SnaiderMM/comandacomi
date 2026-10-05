-- =====================================================================
-- COMANDA · 0004 · FUNCIONES DE ESCRITURA (única vía para crear o cambiar datos)
--
-- Son "security definer": se ejecutan con permisos del dueño de la base y por eso CADA UNA:
--   1. resuelve el restaurante del usuario con requerir_restaurante() / requerir_dueno(),
--   2. filtra TODO por ese restaurante_id (nunca confía en ids que mande el cliente),
--   3. recalcula precios y totales desde la base (el cliente no puede mandar un precio),
--   4. anula con motivo en vez de borrar.
-- Los mensajes de error van en español porque llegan tal cual a la pantalla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------
create or replace function public.fn_pesos(n integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select '$ ' || replace(to_char(n, 'FM999,999,999,999'), ',', '.') $$;

-- Motivo de anulación: obligatorio, recortado a 200 caracteres.
create or replace function public.fn_motivo(p_motivo text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := left(btrim(coalesce(p_motivo, '')), 200);
begin
  if length(v) = 0 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  return v;
end $$;

-- Teléfono -> E.164 (+57...). Acepta "300 123 4567", "573001234567", "+573001234567". Devuelve null si no es válido.
create or replace function public.fn_normalizar_telefono(p_tel text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
begin
  if length(v_digitos) = 10 and left(v_digitos, 1) = '3' then
    return '+57' || v_digitos;
  elsif length(v_digitos) = 12 and left(v_digitos, 2) = '57' then
    return '+' || v_digitos;
  elsif left(btrim(coalesce(p_tel, '')), 1) = '+' and length(v_digitos) between 8 and 15 then
    return '+' || v_digitos;
  end if;
  return null;
end $$;

-- Agrega ítems a un pedido leyendo precios y adiciones DE LA BASE, y recalcula el total.
-- p_items: [{producto_id, cantidad, adiciones: [modificador_id], notas}]
create or replace function public.fn_agregar_items(p_rest uuid, p_pedido uuid, p_items jsonb)
returns void
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
      (restaurante_id, pedido_id, producto_id, nombre, precio_unitario, cantidad, adiciones, adiciones_total, notas, subtotal)
    values
      (p_rest, p_pedido, v_prod.id, v_prod.nombre, v_prod.precio, v_cant, v_adic, v_adic_total, v_notas,
       (v_prod.precio + v_adic_total) * v_cant);
  end loop;

  update public.pedidos
     set total = (select coalesce(sum(subtotal), 0) from public.pedido_items where pedido_id = p_pedido and not anulado)
   where id = p_pedido and restaurante_id = p_rest;
end $$;

-- ---------------------------------------------------------------------
-- 3. Pedidos
-- ---------------------------------------------------------------------
create or replace function public.crear_pedido(
  p_tipo text,
  p_mesa_id uuid,
  p_items jsonb,
  p_contacto_nombre text default null,
  p_contacto_telefono text default null,
  p_direccion text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_id uuid := gen_random_uuid();
  v_num int;
  v_tel text;
  v_total int;
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

  perform public.fn_agregar_items(v_rest, v_id, p_items);

  select total into v_total from public.pedidos where id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num, 'total', v_total);
end $$;

-- Agregar platos a un pedido que todavía no se cobra (la mesa pidió más).
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
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o está anulado.' using errcode = 'P0002';
  end if;
  if v_ped.cobrado_at is not null then
    raise exception 'Este pedido ya está cobrado: crea uno nuevo.';
  end if;

  perform public.fn_agregar_items(v_rest, p_pedido_id, p_items);

  -- Lo nuevo hay que prepararlo: el pedido vuelve a "pendiente".
  update public.pedidos
     set estado = 'pendiente', listo_at = null, entregado_at = null
   where id = p_pedido_id and restaurante_id = v_rest;

  select total into v_total from public.pedidos where id = p_pedido_id;
  return jsonb_build_object('id', p_pedido_id, 'numero', v_ped.numero, 'total', v_total);
end $$;

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

  return jsonb_build_object('id', p_pedido_id, 'estado', p_estado);
end $$;

-- ---------------------------------------------------------------------
-- 5. Cobrar
-- ---------------------------------------------------------------------
-- p_pagos: [{medio: 'efectivo'|'transferencia'|'fiado', monto, recibido?, referencia?, cliente_id?}]
-- La suma de los montos debe ser exactamente total + propina. El vuelto se calcula aquí.
create or replace function public.cobrar_pedido(p_pedido_id uuid, p_propina integer, p_pagos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- ---------------------------------------------------------------------
-- Anulaciones (siempre con motivo; nada se borra)
-- ---------------------------------------------------------------------
create or replace function public.anular_pedido(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id and restaurante_id = v_rest for update;
  if not found or v_ped.anulado then
    raise exception 'El pedido no existe o ya está anulado.' using errcode = 'P0002';
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

-- Deshace un cobro (se equivocaron de medio o de monto): anula los pagos y el pedido queda por cobrar de nuevo.
create or replace function public.anular_cobro(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

  return jsonb_build_object('id', p_item_id, 'pedido_id', v_ped.id);
end $$;

-- ---------------------------------------------------------------------
-- 6. Fiado
-- ---------------------------------------------------------------------
create or replace function public.crear_cliente(p_nombre text, p_telefono text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_tel text := null;
  v_id uuid := gen_random_uuid();
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
  v_rest uuid := public.requerir_restaurante();
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

-- Solo se anulan abonos; un cargo se anula anulando el cobro o el pedido que lo originó.
create or replace function public.anular_abono(p_movimiento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- ---------------------------------------------------------------------
-- 7. Gastos
-- ---------------------------------------------------------------------
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
  v_rest uuid := public.requerir_restaurante();
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
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
  if v_fecha > public.hoy_bogota() or v_fecha < public.hoy_bogota() - 31 then
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
  v_rest uuid := public.requerir_restaurante();
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

-- ---------------------------------------------------------------------
-- 8. Cierre del día
-- ---------------------------------------------------------------------
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
  v_rest uuid := public.requerir_restaurante();
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
  v_base int := coalesce(p_base_caja, 0);
  v_r jsonb;
  v_id uuid := gen_random_uuid();
  v_esperado int;
begin
  if v_fecha > public.hoy_bogota() then
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
  v_rest uuid := public.requerir_restaurante();
  v_motivo text := public.fn_motivo(p_motivo);
begin
  update public.cierres_dia
     set anulado = true, anulado_motivo = v_motivo, anulado_por = auth.uid(), anulado_at = now()
   where id = p_cierre_id and restaurante_id = v_rest and not anulado;
  if not found then
    raise exception 'El cierre no existe o ya está anulado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_cierre_id);
end $$;

-- ---------------------------------------------------------------------
-- 9. Menú (solo el dueño crea y edita; cualquiera del equipo marca "se acabó")
-- ---------------------------------------------------------------------
create or replace function public.guardar_categoria(
  p_id uuid,
  p_nombre text,
  p_icono text default null,
  p_orden integer default null,
  p_activa boolean default true
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
      insert into public.categorias_producto (id, restaurante_id, nombre, icono, orden, activa)
      values (v_id, v_rest, v_nombre, nullif(left(btrim(coalesce(p_icono, '')), 8), ''),
              coalesce(p_orden, (select coalesce(max(orden), 0) + 1 from public.categorias_producto where restaurante_id = v_rest)),
              coalesce(p_activa, true));
    else
      update public.categorias_producto
         set nombre = v_nombre, icono = nullif(left(btrim(coalesce(p_icono, '')), 8), ''),
             orden = coalesce(p_orden, orden), activa = coalesce(p_activa, activa)
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

create or replace function public.guardar_producto(
  p_id uuid,
  p_categoria_id uuid,
  p_nombre text,
  p_precio integer,
  p_disponible boolean default true,
  p_activo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if length(v_nombre) = 0 then
    raise exception 'Escribe el nombre del plato.';
  end if;
  if p_precio is null or p_precio < 0 or p_precio > 10000000 then
    raise exception 'El precio no es válido.';
  end if;
  perform 1 from public.categorias_producto where id = p_categoria_id and restaurante_id = v_rest;
  if not found then
    raise exception 'Elige una categoría.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.productos (id, restaurante_id, categoria_id, nombre, precio, disponible, activo, orden)
    values (v_id, v_rest, p_categoria_id, v_nombre, p_precio, coalesce(p_disponible, true), coalesce(p_activo, true),
            (select coalesce(max(orden), 0) + 1 from public.productos where restaurante_id = v_rest and categoria_id = p_categoria_id));
  else
    update public.productos
       set categoria_id = p_categoria_id, nombre = v_nombre, precio = p_precio,
           disponible = coalesce(p_disponible, disponible), activo = coalesce(p_activo, activo)
     where id = p_id and restaurante_id = v_rest;
    if not found then
      raise exception 'El plato no existe.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.guardar_modificador(
  p_id uuid,
  p_categoria_id uuid,
  p_nombre text,
  p_precio_extra integer,
  p_activo boolean default true
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
    raise exception 'Escribe el nombre de la adición.';
  end if;
  if p_precio_extra is null or p_precio_extra < 0 or p_precio_extra > 1000000 then
    raise exception 'El precio de la adición no es válido.';
  end if;
  if p_categoria_id is not null then
    perform 1 from public.categorias_producto where id = p_categoria_id and restaurante_id = v_rest;
    if not found then
      raise exception 'La categoría no existe.' using errcode = 'P0002';
    end if;
  end if;

  if p_id is null then
    insert into public.modificadores (id, restaurante_id, categoria_id, nombre, precio_extra, activo)
    values (v_id, v_rest, p_categoria_id, v_nombre, p_precio_extra, coalesce(p_activo, true));
  else
    update public.modificadores
       set categoria_id = p_categoria_id, nombre = v_nombre, precio_extra = p_precio_extra,
           activo = coalesce(p_activo, activo)
     where id = p_id and restaurante_id = v_rest;
    if not found then
      raise exception 'La adición no existe.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.cambiar_disponibilidad(p_producto_id uuid, p_disponible boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
begin
  update public.productos
     set disponible = coalesce(p_disponible, true)
   where id = p_producto_id and restaurante_id = v_rest and activo;
  if not found then
    raise exception 'El plato no existe.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', p_producto_id, 'disponible', coalesce(p_disponible, true));
end $$;
