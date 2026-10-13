-- =====================================================================
-- 16 · El día de trabajo no cambia a medianoche: cambia a la hora de corte (4 a. m.) o cuando el dueño lo cierra
--
-- Antes "hoy" era la fecha del calendario: a la 1:44 a. m. un local nocturno veía tres pedidos y "aún no cubres los
-- gastos", porque lo vendido antes de las 12 ya era "ayer". Ahora cada venta, pago, abono y gasto pertenece a una
-- JORNADA (su columna `fecha`), que se decide así:
--
--   1. Día de trabajo de un instante = la fecha de Bogotá corrida por la hora de corte del restaurante
--      (restaurantes.hora_corte, 4 por defecto): la 1:44 a. m. del martes todavía es lunes; a las 4:00 ya es martes.
--   2. Si el dueño CERRÓ ese día a mano antes de ese instante (cierre vigente), el instante ya pertenece al día
--      siguiente. Así lo que se venda después de cerrar la caja no altera las cifras del día cerrado.
--
-- Como la regla depende de datos (la hora de corte y los cierres), las fechas dejan de ser columnas generadas: las
-- pone un trigger al insertar y cuando cambia el instante (lo que ocurre al subir operaciones hechas sin conexión,
-- que traen su hora real). Anular un cierre devuelve a ese día lo que se había pasado al siguiente.
--
-- Dos preguntas distintas, dos funciones:
--   jornada_actual()  → a qué día entra lo que se registre AHORA (lo que muestra Inicio y Cobrados hoy).
--   dia_de_trabajo()  → qué día es según el reloj y la hora de corte (el que muestra y cierra la pantalla de Cierre).
-- Solo difieren entre un cierre manual y la hora de corte: ahí el día de trabajo ya está cerrado y la jornada es la
-- de mañana.
-- =====================================================================

alter table public.restaurantes add column if not exists hora_corte smallint not null default 4;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_restaurantes_hora_corte') then
    alter table public.restaurantes add constraint chk_restaurantes_hora_corte check (hora_corte between 0 and 12);
  end if;
end $$;
comment on column public.restaurantes.hora_corte is 'Hora (0–12, de Bogotá) en que termina el día de trabajo. 4 = lo vendido hasta las 3:59 a. m. cuenta para el día anterior.';

-- ---------------------------------------------------------------------
-- 1. A qué día pertenece un instante
-- ---------------------------------------------------------------------
create or replace function public.fn_fecha_trabajo(p_ts timestamptz, p_hora_corte integer)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$ select ((p_ts at time zone 'America/Bogota') - make_interval(hours => coalesce(p_hora_corte, 0)))::date $$;

create or replace function public.fn_jornada(p_rest uuid, p_ts timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dia date := public.fn_fecha_trabajo(p_ts, (select hora_corte from public.restaurantes where id = p_rest));
begin
  -- ¿Ese día ya estaba cerrado cuando ocurrió esto? Entonces es del siguiente.
  if exists (select 1 from public.cierres_dia c
              where c.restaurante_id = p_rest and c.fecha = v_dia and not c.anulado and c.created_at <= p_ts) then
    return v_dia + 1;
  end if;
  return v_dia;
end $$;

-- Para las funciones de lectura (que corren con los permisos del usuario y no pueden llamar a las fn_*).
create or replace function public.jornada_actual()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.fn_jornada(public.mi_restaurante(), now()) $$;

create or replace function public.dia_de_trabajo()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fn_fecha_trabajo(now(), (select hora_corte from public.restaurantes where id = public.mi_restaurante()))
$$;

-- ---------------------------------------------------------------------
-- 2. Las fechas dejan de ser generadas: se ponen al día con la regla nueva y desde ahora las mantiene un trigger
-- ---------------------------------------------------------------------
alter table public.pedidos           alter column fecha       drop expression if exists;
alter table public.pedidos           alter column fecha_cobro drop expression if exists;
alter table public.pagos_pedido      alter column fecha       drop expression if exists;
alter table public.movimientos_fiado alter column fecha       drop expression if exists;

-- Lo que ya existe: se vuelve a fechar con la hora de corte (sin correr por cierres: los de antes se hicieron con la
-- regla vieja). Los gastos solo si no se habían fechado a mano en otro día.
update public.pedidos p
   set fecha = public.fn_fecha_trabajo(p.created_at, r.hora_corte),
       fecha_cobro = case when p.cobrado_at is not null then public.fn_fecha_trabajo(p.cobrado_at, r.hora_corte) end
  from public.restaurantes r
 where r.id = p.restaurante_id;
update public.pagos_pedido g
   set fecha = public.fn_fecha_trabajo(g.created_at, r.hora_corte)
  from public.restaurantes r where r.id = g.restaurante_id;
update public.movimientos_fiado g
   set fecha = public.fn_fecha_trabajo(g.created_at, r.hora_corte)
  from public.restaurantes r where r.id = g.restaurante_id;
update public.gastos g
   set fecha = public.fn_fecha_trabajo(g.created_at, r.hora_corte)
  from public.restaurantes r
 where r.id = g.restaurante_id and g.fecha = public.fecha_bogota(g.created_at)
   and g.fecha <> public.fn_fecha_trabajo(g.created_at, r.hora_corte);

create or replace function public.fn_fechas_de_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.created_at is distinct from old.created_at then
    new.fecha := public.fn_jornada(new.restaurante_id, new.created_at);
  end if;
  if new.cobrado_at is null then
    new.fecha_cobro := null;
  elsif tg_op = 'INSERT' or new.cobrado_at is distinct from old.cobrado_at then
    new.fecha_cobro := public.fn_jornada(new.restaurante_id, new.cobrado_at);
  end if;
  return new;
end $$;

drop trigger if exists trg_fechas_de_pedido on public.pedidos;
create trigger trg_fechas_de_pedido
  before insert or update on public.pedidos
  for each row execute function public.fn_fechas_de_pedido();

-- Pagos y movimientos de fiado: su jornada sale de cuándo ocurrieron.
create or replace function public.fn_fecha_de_registro()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.created_at is distinct from old.created_at then
    new.fecha := public.fn_jornada(new.restaurante_id, new.created_at);
  end if;
  return new;
end $$;

drop trigger if exists trg_fecha_de_registro on public.pagos_pedido;
create trigger trg_fecha_de_registro
  before insert or update on public.pagos_pedido
  for each row execute function public.fn_fecha_de_registro();

drop trigger if exists trg_fecha_de_registro on public.movimientos_fiado;
create trigger trg_fecha_de_registro
  before insert or update on public.movimientos_fiado
  for each row execute function public.fn_fecha_de_registro();

-- ---------------------------------------------------------------------
-- 3. "Hoy" en las lecturas es la jornada
-- ---------------------------------------------------------------------
create or replace function public.obtener_contexto()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurante', (select jsonb_build_object('id', r.id, 'nombre', r.nombre, 'es_demo', r.es_demo,
                                              'slug', r.slug, 'pedidos_en_linea', r.pedidos_en_linea,
                                              'reinicio_con_pin', r.reinicio_con_pin, 'hora_corte', r.hora_corte)
                      from public.restaurantes r limit 1),
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'rol', p.rol)
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

create or replace function public.obtener_inicio()
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.jornada_actual();
  v_ayer date := public.jornada_actual() - 1;
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
       order by p.cobrado_at desc
       limit 40
    ) x
$$;

create or replace function public.listar_gastos(p_fecha date default null)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_fecha date := coalesce(p_fecha, public.jornada_actual());
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

-- La pantalla de Cierre mira el DÍA DE TRABAJO (el del reloj): recién cerrado sigue mostrando ese día, con sus cifras
-- guardadas, hasta la hora de corte. `jornada` dice a qué día está entrando lo que se registre ahora.
create or replace function public.obtener_resumen_dia(p_fecha date default null, p_base integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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
-- 4. Escrituras
-- ---------------------------------------------------------------------
-- Un gasto sin fecha entra a la jornada de ahora. Con fecha (para anotar uno de días pasados) vale hasta 31 días atrás.
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

-- Cerrar el día. Sin fecha cierra el día de trabajo (el del reloj). Desde ese momento lo que se registre entra al
-- día siguiente: las cifras del cierre ya no se mueven.
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

-- Anular un cierre reabre ese día: lo que se registró después de cerrarlo (y por eso se pasó al día siguiente) vuelve.
create or replace function public.anular_cierre(p_cierre_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- Operaciones hechas sin conexión: el gasto entra a la jornada de CUANDO se hizo, no a la de cuando se subió.
create or replace function public.aplicar_operacion(
  p_clave uuid,
  p_tipo text,
  p_args jsonb,
  p_ocurrido_en timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
  v_previo jsonb;
  v_ts timestamptz := coalesce(p_ocurrido_en, now());
  v_res jsonb;
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_pedido uuid;
  v_listo_antes timestamptz;
  v_creado timestamptz;
begin
  if p_clave is null then
    raise exception 'Falta la clave de la operación.';
  end if;

  -- Dos envíos de la misma clave a la vez se atienden uno detrás de otro: el segundo ve el resultado del primero.
  perform pg_advisory_xact_lock(hashtextextended(v_rest::text || p_clave::text, 0));

  select resultado into v_previo from public.operaciones_aplicadas where restaurante_id = v_rest and clave = p_clave;
  if found then
    return v_previo;
  end if;

  if v_ts > now() then
    v_ts := now();   -- reloj del celular adelantado
  end if;
  if v_ts < now() - interval '7 days' then
    raise exception 'Esta operación lleva más de 7 días sin subirse y ya no se puede aplicar.';
  end if;

  case p_tipo
    when 'crear_pedido' then
      v_res := public.crear_pedido(
        p_tipo => v_args ->> 'p_tipo',
        p_mesa_id => nullif(v_args ->> 'p_mesa_id', '')::uuid,
        p_items => v_args -> 'p_items',
        p_contacto_nombre => v_args ->> 'p_contacto_nombre',
        p_contacto_telefono => v_args ->> 'p_contacto_telefono',
        p_direccion => v_args ->> 'p_direccion',
        p_notas => v_args ->> 'p_notas',
        p_id => nullif(v_args ->> 'p_id', '')::uuid
      );
      update public.pedidos set created_at = v_ts
       where id = (v_res ->> 'id')::uuid and restaurante_id = v_rest;

    when 'agregar_items' then
      v_res := public.agregar_items_pedido(
        p_pedido_id => (v_args ->> 'p_pedido_id')::uuid,
        p_items => v_args -> 'p_items'
      );

    when 'cambiar_estado' then
      v_pedido := (v_args ->> 'p_pedido_id')::uuid;
      select listo_at, created_at into v_listo_antes, v_creado
        from public.pedidos where id = v_pedido and restaurante_id = v_rest;
      v_res := public.cambiar_estado_pedido(p_pedido_id => v_pedido, p_estado => v_args ->> 'p_estado');
      update public.pedidos
         set listo_at = case v_args ->> 'p_estado'
                          when 'pendiente' then null
                          else coalesce(v_listo_antes, greatest(v_ts, v_creado)) end,
             entregado_at = case when v_args ->> 'p_estado' = 'entregado' then greatest(v_ts, v_creado) else null end
       where id = v_pedido and restaurante_id = v_rest;

    when 'cobrar' then
      v_pedido := (v_args ->> 'p_pedido_id')::uuid;
      v_res := public.cobrar_pedido(
        p_pedido_id => v_pedido,
        p_propina => (v_args ->> 'p_propina')::int,
        p_pagos => v_args -> 'p_pagos'
      );
      select created_at into v_creado from public.pedidos where id = v_pedido and restaurante_id = v_rest;
      update public.pedidos set cobrado_at = greatest(v_ts, v_creado) where id = v_pedido and restaurante_id = v_rest;
      update public.pagos_pedido set created_at = v_ts
       where pedido_id = v_pedido and restaurante_id = v_rest and not anulado;
      update public.movimientos_fiado set created_at = v_ts
       where pedido_id = v_pedido and restaurante_id = v_rest and tipo = 'cargo' and not anulado;

    when 'crear_cliente' then
      v_res := public.crear_cliente(
        p_nombre => v_args ->> 'p_nombre',
        p_telefono => v_args ->> 'p_telefono',
        p_id => nullif(v_args ->> 'p_id', '')::uuid
      );

    when 'abonar' then
      v_res := public.registrar_abono(
        p_cliente_id => (v_args ->> 'p_cliente_id')::uuid,
        p_monto => (v_args ->> 'p_monto')::int,
        p_medio => v_args ->> 'p_medio',
        p_referencia => v_args ->> 'p_referencia'
      );
      update public.movimientos_fiado set created_at = v_ts
       where id = (v_res ->> 'id')::uuid and restaurante_id = v_rest;

    when 'gasto' then
      v_res := public.registrar_gasto(
        p_monto => (v_args ->> 'p_monto')::int,
        p_categoria => v_args ->> 'p_categoria',
        p_nota => v_args ->> 'p_nota',
        p_foto_path => v_args ->> 'p_foto_path',
        p_de_caja => coalesce((v_args ->> 'p_de_caja')::boolean, true),
        p_fecha => public.fn_jornada(v_rest, v_ts)
      );
      update public.gastos set created_at = v_ts
       where id = (v_res ->> 'id')::uuid and restaurante_id = v_rest;

    else
      raise exception 'La operación no es válida.';
  end case;

  insert into public.operaciones_aplicadas (restaurante_id, clave, tipo, resultado)
  values (v_rest, p_clave, p_tipo, v_res);

  -- Limpieza oportunista: las claves de más de 30 días ya no pueden llegar (el máximo es 7 días).
  delete from public.operaciones_aplicadas where created_at < now() - interval '30 days';

  return v_res;
end $$;

select public.fn_aplicar_permisos();
