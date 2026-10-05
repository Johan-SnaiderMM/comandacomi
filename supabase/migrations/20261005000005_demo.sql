-- =====================================================================
-- COMANDA · 0005 · DATOS DE LA DEMO (ficticios) y reinicio
--
-- Un restaurante inventado de comida rápida / plancha: 25 platos, 6 mesas, 8 clientes con fiado y los
-- últimos 7 días de ventas, gastos y cierres. TODO ES FICTICIO (nombres y teléfonos inventados).
--
--   fn_cargar_datos_demo(restaurante)  borra lo del restaurante y vuelve a cargar los datos de ejemplo.
--                                      Es idempotente: se puede correr cuantas veces se quiera.
--   fn_provisionar_demo(usuario, ...)  crea el restaurante demo + perfil de dueño y carga los datos
--                                      (lo usan supabase/seed.sql y las pruebas).
--   reiniciar_demo()                   lo llama el botón "Reiniciar demo". Solo funciona en restaurantes
--                                      marcados es_demo y solo para el dueño.
--
-- Las cifras se generan de forma DETERMINISTA (hash de la posición, sin azar) y relativas a "hoy", así los
-- totales siempre se ven vivos y dos reinicios dan los mismos datos.
-- Es el único lugar donde se borran filas de dinero (activa app.reiniciando_demo para el trigger de 0002).
-- =====================================================================

create or replace function public.fn_demo_hash(p_texto text, p_modulo integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$ select (abs(hashtext(p_texto)::bigint) % p_modulo)::integer $$;

-- Crea un pedido de ejemplo con ítems elegidos de forma determinista y, si p_cobrar, su cobro.
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
  update public.pedido_items set created_at = p_ts where pedido_id = v_id;

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

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Carga completa de la demo para un restaurante
-- ---------------------------------------------------------------------
create or replace function public.fn_cargar_datos_demo(p_rest uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.hoy_bogota();
  v_ahora timestamptz := now();
  v_cli uuid[] := array(select gen_random_uuid() from generate_series(1, 8));
  v_mesas uuid[];
  v_conteos int[] := array[17, 19, 16, 22, 25, 21];   -- pedidos por día: hace 6, 5, 4, 3, 2 y 1 días
  v_direcciones text[] := array['Cra 15 #8-22', 'Calle 20 #4-10, apto 201', 'Mz C casa 7, Los Pinos', 'Cll 9 #12-40', 'Cra 7 #19-33, local 2'];
  v_nombres text[] := array['Marleny Ríos', 'Don Jairo Cárdenas', 'Yeison Torres', 'Luisa Gómez', 'Camilo Ortega', 'Doña Nubia', 'Andrés Rojas', 'Stiven Castaño'];
  v_d int; v_k int; v_n int; v_seq int := 0; v_fiado_n int := 0;
  v_min int; v_ts timestamptz; v_r int; v_tipo text; v_mesa uuid; v_medio text; v_cliente uuid;
  v_contacto text; v_dir text;
  v_res jsonb; v_adj int[] := array[0, -2000, 0, 5000, -1000, 0];   -- diferencia de caja de hace 6..1 días
  v_dia date; v_abono int; v_cargos int; v_c int;
  v_anular uuid;
begin
  -- 1) Limpiar (es la única excepción al "no se borra": solo en la demo y solo aquí).
  perform set_config('app.reiniciando_demo', 'on', true);
  delete from public.movimientos_fiado where restaurante_id = p_rest;
  delete from public.pagos_pedido      where restaurante_id = p_rest;
  delete from public.pedido_items      where restaurante_id = p_rest;
  delete from public.pedidos           where restaurante_id = p_rest;
  delete from public.gastos            where restaurante_id = p_rest;
  delete from public.cierres_dia       where restaurante_id = p_rest;
  perform set_config('app.reiniciando_demo', 'off', true);
  delete from public.modificadores       where restaurante_id = p_rest;
  delete from public.productos           where restaurante_id = p_rest;
  delete from public.categorias_producto where restaurante_id = p_rest;
  delete from public.mesas               where restaurante_id = p_rest;
  delete from public.clientes            where restaurante_id = p_rest;
  update public.restaurantes set consecutivo_pedido = 0 where id = p_rest;

  -- 2) Menú
  insert into public.categorias_producto (restaurante_id, nombre, icono, orden) values
    -- Emojis antiguos (Unicode ≤ 6): se ven bien incluso en Androids viejos de gama baja.
    (p_rest, 'Hamburguesas', '🍔', 1), (p_rest, 'Perros', '🌭', 2), (p_rest, 'Salchipapas', '🍟', 3),
    (p_rest, 'A la plancha', '🍖', 4), (p_rest, 'Pollo', '🍗', 5), (p_rest, 'Arepas', '🌮', 6),
    (p_rest, 'Bebidas', '🍹', 7);

  insert into public.productos (restaurante_id, categoria_id, nombre, precio, orden)
  select p_rest, c.id, v.nombre, v.precio, v.orden
    from (values
      ('Hamburguesas', 'Hamburguesa sencilla', 14000, 1),
      ('Hamburguesas', 'Hamburguesa doble carne', 19000, 2),
      ('Hamburguesas', 'Hamburguesa especial', 22000, 3),
      ('Perros', 'Perro caliente', 9000, 1),
      ('Perros', 'Perro americano', 11000, 2),
      ('Perros', 'Perro especial', 13000, 3),
      ('Salchipapas', 'Salchipapa sencilla', 12000, 1),
      ('Salchipapas', 'Salchipapa especial', 18000, 2),
      ('Salchipapas', 'Salchipapa para dos', 28000, 3),
      ('A la plancha', 'Carne a la plancha', 24000, 1),
      ('A la plancha', 'Churrasco', 32000, 2),
      ('A la plancha', 'Cerdo a la plancha', 22000, 3),
      ('A la plancha', 'Pechuga a la plancha', 21000, 4),
      ('Pollo', 'Pollo asado 1/4', 16000, 1),
      ('Pollo', 'Pollo asado 1/2', 29000, 2),
      ('Pollo', 'Alitas BBQ x6', 18000, 3),
      ('Arepas', 'Arepa rellena de carne', 12000, 1),
      ('Arepas', 'Arepa rellena de pollo', 11000, 2),
      ('Arepas', 'Arepa con todo', 15000, 3),
      ('Bebidas', 'Gaseosa personal', 3500, 1),
      ('Bebidas', 'Gaseosa 1,5 L', 8000, 2),
      ('Bebidas', 'Jugo en agua', 5500, 3),
      ('Bebidas', 'Jugo en leche', 7000, 4),
      ('Bebidas', 'Limonada natural', 5000, 5),
      ('Bebidas', 'Agua en botella', 2500, 6)
    ) as v(categoria, nombre, precio, orden)
    join public.categorias_producto c on c.restaurante_id = p_rest and c.nombre = v.categoria;

  insert into public.modificadores (restaurante_id, categoria_id, nombre, precio_extra)
  select p_rest, c.id, v.nombre, v.precio
    from (values
      ('Hamburguesas', 'Queso extra', 2000), ('Hamburguesas', 'Tocineta', 3000),
      ('Hamburguesas', 'Huevo', 2000), ('Hamburguesas', 'Carne extra', 6000),
      ('Perros', 'Queso extra', 2000), ('Perros', 'Tocineta', 3000), ('Perros', 'Papitas', 1500),
      ('Salchipapas', 'Queso gratinado', 3000), ('Salchipapas', 'Huevo', 2000), ('Salchipapas', 'Papas extra', 4000),
      ('A la plancha', 'Porción de papas', 4000), ('A la plancha', 'Arroz', 3000), ('A la plancha', 'Ensalada', 2500),
      ('Pollo', 'Porción de papas', 4000), ('Pollo', 'Arroz', 3000), ('Pollo', 'Ensalada', 2500),
      ('Arepas', 'Queso extra', 2000), ('Arepas', 'Aguacate', 2500)
    ) as v(categoria, nombre, precio)
    join public.categorias_producto c on c.restaurante_id = p_rest and c.nombre = v.categoria;
  insert into public.modificadores (restaurante_id, categoria_id, nombre, precio_extra)
  values (p_rest, null, 'Salsa de la casa', 500);

  insert into public.mesas (restaurante_id, nombre, orden)
  select p_rest, 'Mesa ' || i, i from generate_series(1, 6) i;
  select array_agg(id order by orden) into v_mesas from public.mesas where restaurante_id = p_rest;

  -- 3) Clientes (nombres y teléfonos INVENTADOS)
  insert into public.clientes (id, restaurante_id, nombre, telefono)
  select v_cli[n.i], p_rest, n.nombre, '+5730000001' || lpad(n.i::text, 2, '0')
    from unnest(v_nombres) with ordinality as n(nombre, i);

  -- 4) Ventas de los 6 días anteriores (de más viejo a más nuevo, para que el consecutivo sea cronológico)
  for v_d in reverse 6..1 loop
    v_n := v_conteos[7 - v_d];
    for v_k in 1..v_n loop
      v_seq := v_seq + 1;
      v_min := 11 * 60 + ((v_k - 1) * 600 / v_n) + public.fn_demo_hash('h' || v_seq, 12);
      v_ts := ((v_hoy - v_d)::timestamp + make_interval(mins => v_min)) at time zone 'America/Bogota';
      v_r := public.fn_demo_hash('t' || v_seq, 100);
      v_tipo := case when v_r < 58 then 'mesa' when v_r < 82 then 'llevar' else 'domicilio' end;
      v_mesa := case when v_tipo = 'mesa' then v_mesas[1 + public.fn_demo_hash('m' || v_seq, 6)] end;
      v_cliente := null; v_contacto := null; v_dir := null;

      if v_seq % 9 = 0 then
        v_fiado_n := v_fiado_n + 1;
        v_medio := 'fiado';
        v_cliente := v_cli[1 + (v_fiado_n - 1) % 8];
        v_contacto := v_nombres[1 + (v_fiado_n - 1) % 8];
      else
        v_medio := case when public.fn_demo_hash('p' || v_seq, 100) < 62 then 'efectivo' else 'transferencia' end;
      end if;
      if v_tipo = 'domicilio' then
        v_dir := v_direcciones[1 + public.fn_demo_hash('d' || v_seq, 5)];
        v_contacto := coalesce(v_contacto, v_nombres[1 + public.fn_demo_hash('c' || v_seq, 8)]);
      end if;

      perform public.fn_demo_pedido(p_rest, v_ts, v_seq, v_tipo, v_mesa, v_medio, v_cliente, 'entregado', true, v_contacto, v_dir);
    end loop;
  end loop;

  -- 5) Hoy: cobrados (hacia atrás desde ahora, cada 27 min, mientras sigan siendo de hoy) ...
  for v_k in reverse 10..1 loop
    v_ts := v_ahora - make_interval(mins => 40 + (v_k - 1) * 27);
    continue when public.fecha_bogota(v_ts) <> v_hoy;
    v_seq := v_seq + 1;
    v_r := public.fn_demo_hash('t' || v_seq, 100);
    v_tipo := case when v_r < 58 then 'mesa' when v_r < 82 then 'llevar' else 'domicilio' end;
    v_mesa := case when v_tipo = 'mesa' then v_mesas[1 + public.fn_demo_hash('m' || v_seq, 6)] end;
    v_cliente := null; v_contacto := null; v_dir := null;
    if v_seq % 9 = 0 then
      v_fiado_n := v_fiado_n + 1;
      v_medio := 'fiado';
      v_cliente := v_cli[1 + (v_fiado_n - 1) % 8];
      v_contacto := v_nombres[1 + (v_fiado_n - 1) % 8];
    else
      v_medio := case when public.fn_demo_hash('p' || v_seq, 100) < 62 then 'efectivo' else 'transferencia' end;
    end if;
    if v_tipo = 'domicilio' then
      v_dir := v_direcciones[1 + public.fn_demo_hash('d' || v_seq, 5)];
      v_contacto := coalesce(v_contacto, v_nombres[1 + public.fn_demo_hash('c' || v_seq, 8)]);
    end if;
    perform public.fn_demo_pedido(p_rest, v_ts, v_seq, v_tipo, v_mesa, v_medio, v_cliente, 'entregado', true, v_contacto, v_dir);
  end loop;

  -- ... y cuatro pedidos en curso para que "Pendientes" se vea vivo (con tiempos de espera distintos).
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '31 minutes', 901, 'mesa', v_mesas[5], 'efectivo', null,
                                'entregado', false, null, null, null, 'Sin picante');
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '17 minutes', 902, 'llevar', null, 'efectivo', null,
                                'listo', false, 'Daniela', null, null, null);
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '9 minutes', 903, 'domicilio', null, 'efectivo', null,
                                'pendiente', false, v_nombres[3], 'Cll 9 #12-40, apto 301', 'Llamar al llegar', null);
  perform public.fn_demo_pedido(p_rest, v_ahora - interval '4 minutes', 904, 'mesa', v_mesas[2], 'efectivo', null,
                                'pendiente', false, null, null, null, 'Sin cebolla');

  -- 6) Abonos de fiado (el 50 % de lo que debían hasta ese día) para que haya movimiento y saldos distintos
  for v_c in select unnest(array[1, 4, 6]) loop
    v_dia := v_hoy - (array[4, 3, 2])[array_position(array[1, 4, 6], v_c)];
    v_ts := ((v_dia)::timestamp + interval '15 hours 20 minutes') at time zone 'America/Bogota';
    select coalesce(sum(monto), 0) into v_cargos from public.movimientos_fiado
     where restaurante_id = p_rest and cliente_id = v_cli[v_c] and tipo = 'cargo' and created_at <= v_ts;
    v_abono := (floor(v_cargos * 0.5 / 1000.0) * 1000)::int;
    if v_abono > 0 then
      insert into public.movimientos_fiado (restaurante_id, cliente_id, tipo, monto, medio, referencia, created_at)
      values (p_rest, v_cli[v_c], 'abono', v_abono,
              case when v_c = 4 then 'transferencia' else 'efectivo' end,
              case when v_c = 4 then 'NEQ' || lpad(public.fn_demo_hash('ab' || v_c, 999999)::text, 6, '0') end,
              v_ts);
    end if;
  end loop;

  -- 7) Gastos de los últimos 7 días
  for v_d in reverse 6..0 loop
    v_dia := v_hoy - v_d;
    v_ts := least(v_ahora - interval '5 minutes', ((v_dia)::timestamp + interval '8 hours 30 minutes') at time zone 'America/Bogota');
    -- La carne y las bebidas se pagan por transferencia al proveedor (no salen del efectivo de la caja).
    insert into public.gastos (restaurante_id, fecha, monto, categoria, nota, de_caja, created_at)
    select p_rest, v_dia, g.monto, g.categoria, g.nota, g.de_caja, v_ts
      from (values
        ('carnes', 110000 + 8000 * public.fn_demo_hash('g1' || v_d, 5), 'Carne molida, res y chorizo', true, false),
        ('pan', 26000 + 3000 * public.fn_demo_hash('g2' || v_d, 3), 'Pan de hamburguesa y perro', true, true),
        ('verduras', 21000 + 2000 * public.fn_demo_hash('g3' || v_d, 4), 'Tomate, cebolla, lechuga', true, true),
        ('ayudante', 40000, 'Jornal del ayudante', v_d > 0, true),
        ('bebidas', 45000, 'Gaseosas y jugos', v_d in (6, 3), false),
        ('gas', 52000, 'Pipeta de gas', v_d in (5, 1), true),
        ('domiciliario', 18000, 'Domiciliario', v_d in (6, 4, 2), true),
        ('empaques', 22000, 'Cajas y servilletas', v_d = 4, true)
      ) as g(categoria, monto, nota, aplica, de_caja)
     where g.aplica;
  end loop;
  -- Un gasto anulado ayer (para ver la anulación con motivo en acción).
  insert into public.gastos (restaurante_id, fecha, monto, categoria, nota, created_at, anulado, anulado_motivo, anulado_at)
  values (p_rest, v_hoy - 1, 180000, 'domiciliario', 'Domiciliario',
          ((v_hoy - 1)::timestamp + interval '17 hours') at time zone 'America/Bogota',
          true, 'Monto mal digitado (eran $ 18.000)', ((v_hoy - 1)::timestamp + interval '17 hours 5 minutes') at time zone 'America/Bogota');

  -- 8) Un pedido anulado hace dos días (con su cobro) para ver la anulación con motivo
  select id into v_anular from public.pedidos p
   where p.restaurante_id = p_rest and p.fecha = v_hoy - 2
     and not exists (select 1 from public.pagos_pedido g where g.pedido_id = p.id and g.medio = 'fiado')
   order by p.numero offset 3 limit 1;
  if v_anular is not null then
    update public.pedidos set anulado = true, anulado_motivo = 'Cliente se fue antes de que estuviera listo',
           anulado_at = created_at + interval '25 minutes' where id = v_anular;
    update public.pagos_pedido set anulado = true, anulado_motivo = 'Pedido anulado: Cliente se fue antes de que estuviera listo',
           anulado_at = created_at where pedido_id = v_anular;
  end if;

  -- 9) Cierres de los 6 días anteriores (con pequeñas diferencias de caja)
  for v_d in reverse 6..1 loop
    v_dia := v_hoy - v_d;
    v_res := public.fn_resumen_dia(p_rest, v_dia, 100000);
    insert into public.cierres_dia
      (restaurante_id, fecha, ventas, propinas, gastos, ganancia, cobrado_efectivo, cobrado_transferencia, fiado_nuevo,
       abonos_efectivo, abonos_transferencia, gastos_caja, base_caja, efectivo_esperado, efectivo_contado, diferencia, created_at)
    values
      (p_rest, v_dia, (v_res ->> 'ventas')::int, (v_res ->> 'propinas')::int, (v_res ->> 'gastos')::int,
       (v_res ->> 'ganancia')::int, (v_res ->> 'cobrado_efectivo')::int, (v_res ->> 'cobrado_transferencia')::int,
       (v_res ->> 'fiado_nuevo')::int, (v_res ->> 'abonos_efectivo')::int, (v_res ->> 'abonos_transferencia')::int,
       (v_res ->> 'gastos_caja')::int, 100000, (v_res ->> 'efectivo_esperado')::int,
       (v_res ->> 'efectivo_esperado')::int + v_adj[7 - v_d], v_adj[7 - v_d],
       ((v_dia)::timestamp + interval '21 hours 40 minutes') at time zone 'America/Bogota');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Crear (o reutilizar) el restaurante demo de un usuario y cargarle los datos
-- ---------------------------------------------------------------------
create or replace function public.fn_provisionar_demo(p_user uuid, p_nombre_restaurante text, p_nombre_dueno text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid;
begin
  select restaurante_id into v_rest from public.perfiles where user_id = p_user;
  if v_rest is null then
    insert into public.restaurantes (nombre, es_demo) values (p_nombre_restaurante, true) returning id into v_rest;
    insert into public.perfiles (user_id, restaurante_id, rol, nombre) values (p_user, v_rest, 'dueno', p_nombre_dueno);
  end if;
  perform public.fn_cargar_datos_demo(v_rest);
  return v_rest;
end $$;

-- ---------------------------------------------------------------------
-- Botón "Reiniciar demo"
-- ---------------------------------------------------------------------
create or replace function public.reiniciar_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
begin
  if not coalesce((select es_demo from public.restaurantes where id = v_rest), false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;
