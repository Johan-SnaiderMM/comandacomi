-- =====================================================================
-- 18 · Los datos de ejemplo de la demo, al día con las migraciones 14 a 17
--
-- fn_cargar_datos_demo es una sola función larga (migración 0005). En vez de repetirla en cada migración que le cambia
-- un detalle, se redefine UNA vez aquí con todo lo nuevo:
--   · Bebidas no pasa por la cocina (migración 14): sus platos no salen en la plancha.
--   · "Hoy" es el día de trabajo (migración 16), no la fecha del calendario: una demo abierta de madrugada trae las
--     ventas de toda la noche, no solo las de después de las 12.
--   · Cada plato trae una descripción para el menú del cliente (migración 17), y las fotos que se les hayan tomado a
--     los platos de ejemplo sobreviven al reinicio.
--   · La demo vuelve a quedar sin horario de atención (migración 17): siempre lista para recibir un pedido de muestra.
-- =====================================================================

create or replace function public.fn_cargar_datos_demo(p_rest uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date;   -- la jornada de ahora (se calcula abajo, ya sin los cierres viejos)
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
  v_fotos jsonb;
begin
  -- Las fotos que alguien les tomó a los platos de ejemplo sobreviven al reinicio (se reconocen por el nombre del
  -- plato): quien enseña la demo no tiene que volver a fotografiarlos en cada visita.
  select coalesce(jsonb_object_agg(lower(nombre), foto_path), '{}'::jsonb) into v_fotos
    from public.productos
   where restaurante_id = p_rest and activo and foto_path is not null;

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
  -- La demo empieza sin horario de atención (migración 17): si en la visita anterior alguien le puso uno, la siguiente
  -- podría encontrar los pedidos en línea "cerrados por horario" justo cuando se quiere enseñar.
  update public.restaurantes set consecutivo_pedido = 0, horario = null where id = p_rest;

  -- "Hoy" es el día de trabajo (migración 16): a la 1:44 a. m. sigue siendo el día que empezó ayer por la tarde.
  v_hoy := public.fn_jornada(p_rest, v_ahora);

  -- 2) Menú
  insert into public.categorias_producto (restaurante_id, nombre, icono, orden, se_prepara) values
    -- Emojis antiguos (Unicode ≤ 6): se ven bien incluso en Androids viejos de gama baja.
    (p_rest, 'Hamburguesas', '🍔', 1, true), (p_rest, 'Perros', '🌭', 2, true), (p_rest, 'Salchipapas', '🍟', 3, true),
    (p_rest, 'A la plancha', '🍖', 4, true), (p_rest, 'Pollo', '🍗', 5, true), (p_rest, 'Arepas', '🌮', 6, true),
    -- Las bebidas se entregan de una vez: no pasan por la cocina ni salen en la plancha.
    (p_rest, 'Bebidas', '🍹', 7, false);

  -- Cada plato con su descripción para el menú del cliente (migración 17). Todo inventado.
  insert into public.productos (restaurante_id, categoria_id, nombre, precio, orden, descripcion)
  select p_rest, c.id, v.nombre, v.precio, v.orden, v.descripcion
    from (values
      ('Hamburguesas', 'Hamburguesa sencilla', 14000, 1, 'Carne de res a la plancha, queso, lechuga, tomate y salsa de la casa.'),
      ('Hamburguesas', 'Hamburguesa doble carne', 19000, 2, 'Dos carnes de res, doble queso, tocineta, lechuga y tomate.'),
      ('Hamburguesas', 'Hamburguesa especial', 22000, 3, 'Carne, pollo desmechado, queso, tocineta, huevo y papas ripio.'),
      ('Perros', 'Perro caliente', 9000, 1, 'Salchicha, queso rallado, papas ripio y salsas.'),
      ('Perros', 'Perro americano', 11000, 2, 'Salchicha americana, queso derretido, tocineta y cebolla.'),
      ('Perros', 'Perro especial', 13000, 3, 'Salchicha, pollo desmechado, queso, tocineta y huevo de codorniz.'),
      ('Salchipapas', 'Salchipapa sencilla', 12000, 1, 'Papas a la francesa con salchicha y salsas.'),
      ('Salchipapas', 'Salchipapa especial', 18000, 2, 'Papas, salchicha, pollo, tocineta y queso gratinado.'),
      ('Salchipapas', 'Salchipapa para dos', 28000, 3, 'Porción grande para compartir: carne, pollo, salchicha y queso.'),
      ('A la plancha', 'Carne a la plancha', 24000, 1, 'Res a la plancha con papas, arroz y ensalada.'),
      ('A la plancha', 'Churrasco', 32000, 2, 'Corte grueso de res con chimichurri, papas y ensalada.'),
      ('A la plancha', 'Cerdo a la plancha', 22000, 3, 'Lomo de cerdo con papas, arroz y ensalada.'),
      ('A la plancha', 'Pechuga a la plancha', 21000, 4, 'Pechuga de pollo con papas, arroz y ensalada.'),
      ('Pollo', 'Pollo asado 1/4', 16000, 1, 'Un cuarto de pollo asado con papa salada y arepa.'),
      ('Pollo', 'Pollo asado 1/2', 29000, 2, 'Medio pollo asado con papa salada y arepa.'),
      ('Pollo', 'Alitas BBQ x6', 18000, 3, 'Seis alitas en salsa BBQ con papas a la francesa.'),
      ('Arepas', 'Arepa rellena de carne', 12000, 1, 'Arepa asada con carne desmechada y queso.'),
      ('Arepas', 'Arepa rellena de pollo', 11000, 2, 'Arepa asada con pollo desmechado y queso.'),
      ('Arepas', 'Arepa con todo', 15000, 3, 'Carne, pollo, queso, huevo y salsa de la casa.'),
      ('Bebidas', 'Gaseosa personal', 3500, 1, null),
      ('Bebidas', 'Gaseosa 1,5 L', 8000, 2, 'Para compartir.'),
      ('Bebidas', 'Jugo en agua', 5500, 3, 'Mora, mango, lulo o maracuyá.'),
      ('Bebidas', 'Jugo en leche', 7000, 4, 'Mora, mango, lulo o guanábana.'),
      ('Bebidas', 'Limonada natural', 5000, 5, 'Recién hecha, con hielo.'),
      ('Bebidas', 'Agua en botella', 2500, 6, null)
    ) as v(categoria, nombre, precio, orden, descripcion)
    join public.categorias_producto c on c.restaurante_id = p_rest and c.nombre = v.categoria;

  update public.productos p
     set foto_path = v_fotos ->> lower(p.nombre)
   where p.restaurante_id = p_rest and v_fotos ? lower(p.nombre);

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
    continue when public.fn_jornada(p_rest, v_ts) <> v_hoy;
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

select public.fn_aplicar_permisos();
