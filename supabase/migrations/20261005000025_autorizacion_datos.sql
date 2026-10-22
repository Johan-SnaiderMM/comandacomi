-- =====================================================================
-- 25 · Autorización de tratamiento de datos (Ley 1581 de 2012)
--
-- El cliente que pide en línea deja su nombre, su celular y, si es a domicilio, su dirección. Antes de enviar tiene
-- que aceptar la política de datos del restaurante (página /pedir/<local>/datos), y la ley pide poder DEMOSTRAR esa
-- autorización: cada pedido guarda cuándo la dio. Sin aceptarla, la base no recibe el pedido.
-- =====================================================================

alter table public.pedidos add column if not exists datos_autorizados_at timestamptz;
comment on column public.pedidos.datos_autorizados_at is
  'Cuándo el cliente en línea aceptó la política de datos (Ley 1581): la prueba de su autorización. Null en los del mostrador.';

-- La de la migración 17 con un argumento más. Se borra la anterior: si quedara, se podría pedir sin aceptar.
drop function if exists public.publico_crear_pedido(text, text, text, text, text, text, jsonb);

create or replace function public.publico_crear_pedido(
  p_slug text,
  p_tipo text,
  p_nombre text,
  p_telefono text,
  p_direccion text,
  p_notas text,
  p_items jsonb,
  p_acepta_datos boolean default null
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
  if p_acepta_datos is not true then
    raise exception 'Para enviar el pedido, acepta el tratamiento de tus datos.';
  end if;

  -- Se bloquea la fila del restaurante: los pedidos en línea de un mismo local se atienden de a uno
  -- (así los topes de abajo y el consecutivo no se pisan).
  select * into v_r from public.restaurantes where slug = lower(btrim(coalesce(p_slug, ''))) for update;
  if not found then
    raise exception 'Este restaurante no existe.' using errcode = 'P0002';
  end if;
  if not v_r.pedidos_en_linea then
    raise exception 'Por ahora este restaurante no está recibiendo pedidos en línea.';
  end if;
  if not public.fn_abierto_por_horario(v_r.horario, now()) then
    raise exception 'A esta hora el restaurante está cerrado. Mira el horario y vuelve a pedir cuando abra.';
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
    (id, restaurante_id, numero, tipo, origen, contacto_nombre, contacto_telefono, direccion, notas, datos_autorizados_at)
  values
    (v_id, v_r.id, v_num, p_tipo, 'cliente', v_nombre, v_tel, v_dir,
     nullif(left(btrim(coalesce(p_notas, '')), 200), ''), now())
  returning token_seguimiento into v_token;

  perform public.fn_agregar_items(v_r.id, v_id, p_items);

  select total into v_total from public.pedidos where id = v_id;
  return jsonb_build_object('token', v_token, 'numero', v_num, 'total', v_total);
end $$;

select public.fn_aplicar_permisos();
