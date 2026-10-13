-- =====================================================================
-- 17 · Lo que ve el cliente: foto y descripción de cada plato, y horario de atención automático
--
--   1. Cada plato puede llevar una descripción corta y una foto. Las fotos viven en un bucket PÚBLICO de Storage
--      ("platos-fotos"): el menú lo ve cualquiera con el enlace, así que la foto también. Solo el dueño sube, y solo a
--      la carpeta de su restaurante (<restaurante_id>/<archivo>). Nadie edita ni borra: cambiar la foto es subir otra.
--   2. Horario de atención: el dueño dice a qué hora abre y cierra cada día y los pedidos en línea se abren y se cierran
--      solos. El interruptor manual sigue mandando (apagado = no se recibe aunque sea hora de atención). Sin horario
--      todo sigue como antes: solo el interruptor.
--      Formato (restaurantes.horario): un arreglo de 7 posiciones, 0 = domingo … 6 = sábado; cada una es null (ese día
--      no se atiende) o {"abre": "HH:MM", "cierra": "HH:MM"} en hora de Bogotá. Si "cierra" es menor que "abre", la
--      franja pasa de medianoche (18:00 → 02:00 atiende hasta las 2 a. m. del día siguiente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Descripción y foto del plato
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists descripcion text;
alter table public.productos add column if not exists foto_path text;
comment on column public.productos.descripcion is 'Texto corto para el menú del cliente (qué trae el plato). Máximo 160 caracteres.';
comment on column public.productos.foto_path is 'Ruta de la foto en el bucket público platos-fotos: <restaurante_id>/<archivo>.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_producto_descripcion') then
    alter table public.productos add constraint chk_producto_descripcion
      check (descripcion is null or (length(descripcion) between 1 and 160));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_producto_foto') then
    alter table public.productos add constraint chk_producto_foto
      check (foto_path is null or foto_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platos-fotos', 'platos-fotos', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Subir: solo el dueño y solo dentro de la carpeta de su restaurante. No hay política de lectura: las fotos se ven por
-- su dirección pública (el bucket es público) y nadie puede listar la carpeta de otro. Sin UPDATE ni DELETE.
drop policy if exists platos_fotos_insert on storage.objects;
create policy platos_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'platos-fotos'
    and (storage.foldername(name))[1] = ((select public.mi_restaurante())::text)
    and (select public.es_dueno())
  );

-- Guardar plato: dos parámetros más. null = no cambia lo que hay; '' = se quita.
drop function if exists public.guardar_producto(uuid, uuid, text, integer, boolean, boolean);

create or replace function public.guardar_producto(
  p_id uuid,
  p_categoria_id uuid,
  p_nombre text,
  p_precio integer,
  p_disponible boolean default true,
  p_activo boolean default true,
  p_descripcion text default null,
  p_foto_path text default null
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
  v_desc text := nullif(left(btrim(regexp_replace(coalesce(p_descripcion, ''), '\s+', ' ', 'g')), 160), '');
  v_foto text := nullif(btrim(coalesce(p_foto_path, '')), '');
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
  -- La foto vive en la carpeta del restaurante: no se acepta una ruta de otro.
  if v_foto is not null and (v_foto !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' or left(v_foto, 37) <> (v_rest::text || '/')) then
    raise exception 'La foto no es válida.';
  end if;

  if p_id is null then
    insert into public.productos (id, restaurante_id, categoria_id, nombre, precio, disponible, activo, orden, descripcion, foto_path)
    values (v_id, v_rest, p_categoria_id, v_nombre, p_precio, coalesce(p_disponible, true), coalesce(p_activo, true),
            (select coalesce(max(orden), 0) + 1 from public.productos where restaurante_id = v_rest and categoria_id = p_categoria_id),
            v_desc, v_foto);
  else
    update public.productos
       set categoria_id = p_categoria_id, nombre = v_nombre, precio = p_precio,
           disponible = coalesce(p_disponible, disponible), activo = coalesce(p_activo, activo),
           descripcion = case when p_descripcion is null then descripcion else v_desc end,
           foto_path = case when p_foto_path is null then foto_path else v_foto end
     where id = p_id and restaurante_id = v_rest;
    if not found then
      raise exception 'El plato no existe.' using errcode = 'P0002';
    end if;
  end if;

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
                                                     'disponible', p.disponible, 'orden', p.orden,
                                                     'descripcion', p.descripcion, 'foto_path', p.foto_path)
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

-- ---------------------------------------------------------------------
-- 2. Horario de atención
-- ---------------------------------------------------------------------
alter table public.restaurantes add column if not exists horario jsonb;
comment on column public.restaurantes.horario is 'Horario de atención de los pedidos en línea: 7 posiciones (0 = domingo); null o {"abre","cierra"} "HH:MM" de Bogotá. null = sin horario (solo el interruptor).';

-- "18:30" -> 1110 (minutos desde medianoche); null si no es una hora.
create or replace function public.fn_minutos_del_dia(p_hora text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
              then substring(p_hora from 1 for 2)::int * 60 + substring(p_hora from 4 for 2)::int end
$$;

create or replace function public.fn_horario_valido(p_horario jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_dia jsonb;
begin
  if p_horario is null or jsonb_typeof(p_horario) <> 'array' or jsonb_array_length(p_horario) <> 7 then
    return false;
  end if;
  for v_dia in select value from jsonb_array_elements(p_horario) loop
    if jsonb_typeof(v_dia) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_dia) <> 'object'
       or public.fn_minutos_del_dia(v_dia ->> 'abre') is null
       or public.fn_minutos_del_dia(v_dia ->> 'cierra') is null
       or (v_dia ->> 'abre') = (v_dia ->> 'cierra') then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- ¿A esa hora se atiende? Sin horario, siempre. (La misma cuenta, en TypeScript: lib/horario.ts; una prueba las compara.)
create or replace function public.fn_abierto_por_horario(p_horario jsonb, p_ts timestamptz)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_local timestamp := p_ts at time zone 'America/Bogota';
  v_dia int := extract(dow from v_local)::int;
  v_min int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_hoy jsonb;
  v_ayer jsonb;
  v_abre int;
  v_cierra int;
begin
  if p_horario is null or jsonb_typeof(p_horario) <> 'array' then
    return true;
  end if;
  v_hoy := p_horario -> v_dia;
  v_ayer := p_horario -> ((v_dia + 6) % 7);

  if jsonb_typeof(v_hoy) = 'object' then
    v_abre := public.fn_minutos_del_dia(v_hoy ->> 'abre');
    v_cierra := public.fn_minutos_del_dia(v_hoy ->> 'cierra');
    if v_abre < v_cierra and v_min >= v_abre and v_min < v_cierra then
      return true;
    end if;
    if v_abre > v_cierra and v_min >= v_abre then
      return true;   -- franja que pasa de medianoche: la parte de hoy
    end if;
  end if;
  if jsonb_typeof(v_ayer) = 'object' then
    v_abre := public.fn_minutos_del_dia(v_ayer ->> 'abre');
    v_cierra := public.fn_minutos_del_dia(v_ayer ->> 'cierra');
    if v_abre > v_cierra and v_min < v_cierra then
      return true;   -- la madrugada de la franja de ayer
    end if;
  end if;
  return false;
end $$;

-- Guardar el horario (solo el dueño). null = sin horario: manda solo el interruptor.
create or replace function public.configurar_horario(p_horario jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_h jsonb := case when p_horario is null or jsonb_typeof(p_horario) = 'null' then null else p_horario end;
begin
  if v_h is not null and not public.fn_horario_valido(v_h) then
    raise exception 'El horario no es válido. Revisa las horas de cada día.';
  end if;
  if v_h is not null and not exists (select 1 from jsonb_array_elements(v_h) d where jsonb_typeof(d) = 'object') then
    raise exception 'Marca al menos un día de atención, o quita el horario.';
  end if;
  update public.restaurantes set horario = v_h where id = v_rest;
  return jsonb_build_object('horario', v_h);
end $$;

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
    'perfil', (select jsonb_build_object('nombre', p.nombre, 'rol', p.rol)
                 from public.perfiles p where p.user_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- 3. API pública: el menú trae descripción, foto y horario; fuera de horario no se reciben pedidos
-- ---------------------------------------------------------------------
-- restaurante.abierto = interruptor encendido Y en horario. `recibe` es solo el interruptor y `horario` el horario,
-- para que el panel explique POR QUÉ está cerrado y cuándo abre.
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
  select * into v_r from public.restaurantes where id = public.fn_restaurante_por_slug(p_slug);
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'restaurante', jsonb_build_object('nombre', v_r.nombre, 'slug', v_r.slug, 'es_demo', v_r.es_demo,
                                      'abierto', v_r.pedidos_en_linea and public.fn_abierto_por_horario(v_r.horario, now()),
                                      'recibe', v_r.pedidos_en_linea, 'horario', v_r.horario),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'icono', c.icono) order by c.orden, c.nombre)
        from public.categorias_producto c where c.restaurante_id = v_r.id and c.activa), '[]'::jsonb),
    'productos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'nombre', p.nombre,
                                          'precio', p.precio, 'disponible', p.disponible,
                                          'descripcion', p.descripcion, 'foto', p.foto_path) order by p.orden, p.nombre)
        from public.productos p
        join public.categorias_producto c on c.id = p.categoria_id and c.restaurante_id = p.restaurante_id
       where p.restaurante_id = v_r.id and p.activo and c.activa), '[]'::jsonb),
    'modificadores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'categoria_id', m.categoria_id, 'nombre', m.nombre,
                                          'precio_extra', m.precio_extra) order by m.precio_extra, m.nombre)
        from public.modificadores m where m.restaurante_id = v_r.id and m.activo), '[]'::jsonb)
  );
end $$;

-- Igual que antes, más la regla del horario.
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
    (id, restaurante_id, numero, tipo, origen, contacto_nombre, contacto_telefono, direccion, notas)
  values
    (v_id, v_r.id, v_num, p_tipo, 'cliente', v_nombre, v_tel, v_dir,
     nullif(left(btrim(coalesce(p_notas, '')), 200), ''))
  returning token_seguimiento into v_token;

  perform public.fn_agregar_items(v_r.id, v_id, p_items);

  select total into v_total from public.pedidos where id = v_id;
  return jsonb_build_object('token', v_token, 'numero', v_num, 'total', v_total);
end $$;

select public.fn_aplicar_permisos();
