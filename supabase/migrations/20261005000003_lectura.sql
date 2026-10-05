-- =====================================================================
-- COMANDA · 0003 · FUNCIONES DE LECTURA (una consulta por pantalla)
--
-- Cada pantalla pide TODO lo que necesita en una sola llamada (menos viajes = más rápido con mala señal).
-- Son "security invoker": se ejecutan con los permisos del usuario, así que el RLS de 0002 filtra por
-- restaurante automáticamente. Devuelven jsonb.
-- Las funciones fn_* son internas: no son ejecutables por usuarios (ver 0006).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internas
-- ---------------------------------------------------------------------

-- Saldo de fiado de un cliente: cargos - abonos (sin anulados).
create or replace function public.fn_saldo_cliente(p_rest uuid, p_cliente uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(case tipo when 'cargo' then monto else -monto end), 0)::integer
    from public.movimientos_fiado
   where restaurante_id = p_rest and cliente_id = p_cliente and not anulado
$$;

-- Resumen de un día (ventas, gastos, ganancia, efectivo esperado). Lo usan el cierre y la pantalla de cierre.
--   ventas            = suma de pedidos cobrados ese día (sin propina), incluidos los fiados
--   ganancia          = ventas - gastos (aproximada: no descuenta costo de platos)
--   efectivo esperado = base + efectivo cobrado (con propina) + abonos en efectivo - gastos que salieron de caja
create or replace function public.fn_resumen_dia(p_rest uuid, p_fecha date, p_base integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ventas int; v_propinas int; v_pedidos int;
  v_efectivo int; v_transf int; v_fiado int;
  v_gastos int; v_gastos_caja int;
  v_abonos_efectivo int; v_abonos_transf int;
begin
  select coalesce(sum(total), 0), coalesce(sum(propina), 0), count(*)
    into v_ventas, v_propinas, v_pedidos
    from public.pedidos
   where restaurante_id = p_rest and fecha_cobro = p_fecha and not anulado;

  select coalesce(sum(monto) filter (where medio = 'efectivo'), 0),
         coalesce(sum(monto) filter (where medio = 'transferencia'), 0),
         coalesce(sum(monto) filter (where medio = 'fiado'), 0)
    into v_efectivo, v_transf, v_fiado
    from public.pagos_pedido
   where restaurante_id = p_rest and fecha = p_fecha and not anulado;

  select coalesce(sum(monto), 0), coalesce(sum(monto) filter (where de_caja), 0)
    into v_gastos, v_gastos_caja
    from public.gastos
   where restaurante_id = p_rest and fecha = p_fecha and not anulado;

  select coalesce(sum(monto) filter (where medio = 'efectivo'), 0),
         coalesce(sum(monto) filter (where medio = 'transferencia'), 0)
    into v_abonos_efectivo, v_abonos_transf
    from public.movimientos_fiado
   where restaurante_id = p_rest and fecha = p_fecha and tipo = 'abono' and not anulado;

  return jsonb_build_object(
    'fecha', p_fecha,
    'pedidos', v_pedidos,
    'ventas', v_ventas,
    'propinas', v_propinas,
    'cobrado_efectivo', v_efectivo,
    'cobrado_transferencia', v_transf,
    'fiado_nuevo', v_fiado,
    'abonos_efectivo', v_abonos_efectivo,
    'abonos_transferencia', v_abonos_transf,
    'gastos', v_gastos,
    'gastos_caja', v_gastos_caja,
    'ganancia', v_ventas - v_gastos,
    'base_caja', p_base,
    'efectivo_esperado', p_base + v_efectivo + v_abonos_efectivo - v_gastos_caja
  );
end $$;

-- ---------------------------------------------------------------------
-- Contexto de la sesión (nombre del restaurante, rol)
-- ---------------------------------------------------------------------
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurante', (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'es_demo', r.es_demo)
                      from public.restaurantes r limit 1),
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'rol', p.rol)
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- 2. Inicio: ventas de hoy, ganancia aproximada, por cobrar y pendientes
-- ---------------------------------------------------------------------
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
  v_por_cobrar int; v_deudores int; v_pendientes int; v_sin_cobrar int;
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
   where not anulado and (cobrado_at is null or estado <> 'entregado');

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
    'pedidos_sin_cobrar', v_sin_cobrar
  );
end $$;

-- Solo el contador de la insignia de la barra de navegación (consulta mínima).
create or replace function public.contar_pendientes()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.pedidos where not anulado and (cobrado_at is null or estado <> 'entregado')
$$;

-- ---------------------------------------------------------------------
-- 3. Tomar pedido: menú, adiciones y mesas (con su estado) en una sola llamada
-- ---------------------------------------------------------------------
create or replace function public.obtener_menu_para_pedido()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'icono', c.icono) order by c.orden, c.nombre)
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

-- ---------------------------------------------------------------------
-- 4. Pedidos pendientes (cocina simple): por entregar o por cobrar, el más viejo primero
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
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                                     'notas', i.notas, 'adiciones', i.adiciones)
                                  order by i.created_at, i.id)
                   from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb)
             ) as fila
        from public.pedidos p
        left join public.mesas m on m.id = p.mesa_id
       where not p.anulado and (p.cobrado_at is null or p.estado <> 'entregado')
    ) x
$$;

-- Pedidos cobrados hoy (para revisar o anular un cobro con motivo).
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
       where not p.anulado and p.fecha_cobro = public.hoy_bogota()
       order by p.cobrado_at desc
       limit 40
    ) x
$$;

-- ---------------------------------------------------------------------
-- 5. Cobrar: el pedido con sus ítems y los clientes que pueden fiar
-- ---------------------------------------------------------------------
create or replace function public.obtener_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'pedido', jsonb_build_object(
      'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'estado', p.estado, 'created_at', p.created_at,
      'mesa', m.nombre, 'contacto_nombre', p.contacto_nombre, 'contacto_telefono', p.contacto_telefono,
      'direccion', p.direccion, 'notas', p.notas, 'total', p.total, 'propina', p.propina,
      'cobrado', p.cobrado_at is not null, 'cobrado_at', p.cobrado_at, 'anulado', p.anulado
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                          'precio_unitario', i.precio_unitario, 'adiciones', i.adiciones,
                                          'adiciones_total', i.adiciones_total, 'notas', i.notas,
                                          'subtotal', i.subtotal)
                       order by i.created_at, i.id)
        from public.pedido_items i where i.pedido_id = p.id and not i.anulado), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'medio', g.medio, 'monto', g.monto, 'recibido', g.recibido,
                                          'vuelto', g.vuelto, 'referencia', g.referencia, 'cliente_id', g.cliente_id)
                       order by g.created_at, g.id)
        from public.pagos_pedido g where g.pedido_id = p.id and not g.anulado), '[]'::jsonb)
  )
    into v
    from public.pedidos p
    left join public.mesas m on m.id = p.mesa_id
   where p.id = p_pedido_id;

  if v is null then
    raise exception 'El pedido no existe.' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 6. Fiado: quién debe y cuánto
-- ---------------------------------------------------------------------
-- Clientes activos con su saldo y desde cuándo deben (las deudas se pagan de la más vieja a la más nueva).
create or replace function public.listar_clientes()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.fila order by x.saldo desc, x.nombre), '[]'::jsonb)
    from (
      select c.nombre, s.saldo,
             jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'telefono', c.telefono, 'saldo', s.saldo,
               'debe_desde', case when s.saldo > 0 then (
                 select min(y.fecha)
                   from (
                     select g.fecha,
                            sum(g.monto) over (order by g.created_at desc, g.id desc
                                               rows between unbounded preceding and 1 preceding) as antes
                       from public.movimientos_fiado g
                      where g.cliente_id = c.id and g.tipo = 'cargo' and not g.anulado
                   ) y
                  where coalesce(y.antes, 0) < s.saldo
               ) end
             ) as fila
        from public.clientes c
        cross join lateral (
          select coalesce(sum(case g.tipo when 'cargo' then g.monto else -g.monto end), 0)::integer as saldo
            from public.movimientos_fiado g
           where g.cliente_id = c.id and not g.anulado
        ) s
       where c.activo
    ) x
$$;

create or replace function public.obtener_cliente_fiado(p_cliente_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'cliente', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'telefono', c.telefono),
    'saldo', (select coalesce(sum(case g.tipo when 'cargo' then g.monto else -g.monto end), 0)
                from public.movimientos_fiado g where g.cliente_id = c.id and not g.anulado),
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'tipo', g.tipo, 'monto', g.monto, 'medio', g.medio, 'referencia', g.referencia,
               'pedido_numero', o.numero, 'created_at', g.created_at, 'fecha', g.fecha,
               'anulado', g.anulado, 'anulado_motivo', g.anulado_motivo)
             order by g.created_at desc, g.id desc)
        from (select * from public.movimientos_fiado
               where cliente_id = c.id order by created_at desc, id desc limit 60) g
        left join public.pedidos o on o.id = g.pedido_id), '[]'::jsonb)
  )
    into v
    from public.clientes c
   where c.id = p_cliente_id;

  if v is null then
    raise exception 'El cliente no existe.' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. Gastos del día
-- ---------------------------------------------------------------------
create or replace function public.listar_gastos(p_fecha date default null)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
begin
  return jsonb_build_object(
    'fecha', v_fecha,
    'total', (select coalesce(sum(monto), 0) from public.gastos where fecha = v_fecha and not anulado),
    'gastos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'monto', g.monto, 'categoria', g.categoria, 'nota', g.nota, 'foto_path', g.foto_path,
               'de_caja', g.de_caja, 'created_at', g.created_at, 'anulado', g.anulado,
               'anulado_motivo', g.anulado_motivo) order by g.created_at desc, g.id desc)
        from public.gastos g where g.fecha = v_fecha), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 8. Cierre del día
-- ---------------------------------------------------------------------
create or replace function public.obtener_resumen_dia(p_fecha date default null, p_base integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_fecha date := coalesce(p_fecha, public.hoy_bogota());
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
    'cierres_recientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'fecha', c.fecha, 'ventas', c.ventas, 'gastos', c.gastos, 'ganancia', c.ganancia,
               'efectivo_esperado', c.efectivo_esperado, 'efectivo_contado', c.efectivo_contado,
               'diferencia', c.diferencia) order by c.fecha desc)
        from (select * from public.cierres_dia
               where restaurante_id = v_rest and not anulado order by fecha desc limit 7) c), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- 9. Menú (administración)
-- ---------------------------------------------------------------------
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
        from public.modificadores m where m.activo), '[]'::jsonb)
  )
$$;
