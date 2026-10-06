-- =====================================================================
-- Trabajar sin conexión: operaciones idempotentes
--
-- La app guarda en el celular lo que se hace sin señal y lo sube después. Para que subir dos veces la misma
-- operación (la respuesta se perdió, el celular reintentó) NO duplique nada:
--   * cada operación lleva una clave única (uuid) que genera el celular;
--   * aplicar_operacion() la ejecuta una sola vez y, si llega de nuevo, devuelve el resultado guardado;
--   * el celular genera los ids de los pedidos y clientes nuevos (crear_pedido / crear_cliente aceptan p_id), así
--     las operaciones siguientes (cobrar, abonar) pueden referirse a ellos antes de que el servidor los conozca;
--   * cada operación trae CUÁNDO ocurrió: el cobro hecho a las 11 p. m. sin señal cuenta en ese día aunque se
--     suba al día siguiente (máximo 7 días; un reloj adelantado se limita a "ahora").
-- Nada de lo anterior da permisos nuevos: dentro se llaman las mismas funciones de siempre, que validan
-- restaurante y rol. La clave solo vale dentro del propio restaurante (la llave primaria la incluye).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Claves ya aplicadas
-- ---------------------------------------------------------------------
create table if not exists public.operaciones_aplicadas (
  restaurante_id uuid not null references public.restaurantes(id),
  clave          uuid not null,
  tipo           text not null,
  resultado      jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (restaurante_id, clave)
);
create index if not exists idx_operaciones_aplicadas_fecha on public.operaciones_aplicadas (created_at);
alter table public.operaciones_aplicadas enable row level security;
-- Sin políticas y sin permisos: solo aplicar_operacion() (security definer) la toca.
revoke all on public.operaciones_aplicadas from anon, authenticated;
comment on table public.operaciones_aplicadas is 'Claves de operaciones ya aplicadas (idempotencia del trabajo sin conexión). Se purgan a los 30 días.';

-- ---------------------------------------------------------------------
-- 2. El celular puede elegir el id de un pedido o cliente nuevo
--    (se vuelven a crear con un parámetro más; los llamados anteriores siguen funcionando)
-- ---------------------------------------------------------------------
drop function if exists public.crear_pedido(text, uuid, jsonb, text, text, text, text);

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

drop function if exists public.crear_cliente(text, text);

create or replace function public.crear_cliente(p_nombre text, p_telefono text default null, p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_restaurante();
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

-- ---------------------------------------------------------------------
-- 3. Aplicar una operación una sola vez
--    p_tipo: crear_pedido | agregar_items | cambiar_estado | cobrar | crear_cliente | abonar | gasto
--    p_args: los mismos parámetros (con los mismos nombres) de la función que se llama por dentro.
-- ---------------------------------------------------------------------
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
        p_fecha => public.fecha_bogota(v_ts)
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
