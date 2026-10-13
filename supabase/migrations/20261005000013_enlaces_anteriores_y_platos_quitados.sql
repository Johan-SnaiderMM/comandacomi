-- =====================================================================
-- 13 · Enlaces anteriores que siguen funcionando, y platos quitados que se pueden recuperar
--
--   1. El enlace para pedir (/pedir/<slug>) sale del nombre del local. Al renombrar la demo el enlace cambiaba y el
--      anterior dejaba de existir: quien lo tenía guardado, impreso en un QR o agregado a su pantalla de inicio caía
--      en "esa pantalla no existe". Ahora cada restaurante recuerda sus enlaces anteriores y el menú público los
--      resuelve al actual (la página redirige). Nadie más puede quedarse con un enlace que fue de otro.
--   2. "Quitar del menú" archivaba el plato y no había forma de verlo ni de volver a ponerlo. El menú de
--      administración ahora también lista los platos quitados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enlaces anteriores
-- ---------------------------------------------------------------------
alter table public.restaurantes add column if not exists slugs_anteriores text[] not null default '{}';
comment on column public.restaurantes.slugs_anteriores is 'Enlaces (/pedir/<slug>) que tuvo antes este restaurante: siguen funcionando y llevan al actual. Se guardan los 20 últimos.';
create index if not exists idx_restaurantes_slugs_anteriores on public.restaurantes using gin (slugs_anteriores);

-- Slug libre: tampoco vale uno que fue de OTRO restaurante (su enlace anterior sigue llevando a él).
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
     or exists (select 1 from public.restaurantes r
                 where r.id is distinct from p_excluir
                   and (r.slug = v or r.slugs_anteriores @> array[v]))
  loop
    n := n + 1;
    v := trim(both '-' from left(v_base, 40 - length(n::text) - 1)) || '-' || n;
  end loop;
  return v;
end $$;

-- El restaurante de un enlace: por su slug actual o, si no, por uno anterior. null si el enlace nunca existió.
create or replace function public.fn_restaurante_por_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select r.id from public.restaurantes r where r.slug = lower(btrim(coalesce(p_slug, '')))),
    (select r.id from public.restaurantes r
      where r.slugs_anteriores @> array[lower(btrim(coalesce(p_slug, '')))]
      order by r.created_at, r.id
      limit 1)
  )
$$;

-- Menú público: igual que antes, pero un enlace anterior también lo encuentra. Devuelve SIEMPRE el slug actual en
-- restaurante.slug: si no coincide con el que se pidió, la página redirige al enlace vigente.
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

-- Reiniciar la demo con otro nombre: el enlace sigue al nombre, y el que tenía pasa a ser un enlace anterior.
create or replace function public.reiniciar_demo(p_nombre text default null, p_conservar_endpoint text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_r public.restaurantes%rowtype;
  v_slug text;
  v_viejos text[];
begin
  select * into v_r from public.restaurantes where id = v_rest for update;
  if not coalesce(v_r.es_demo, false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  if p_nombre is not null and v_nombre is null then
    raise exception 'Escribe el nombre del restaurante.' using errcode = '22023';
  end if;
  if length(coalesce(v_nombre, '')) > 60 then
    raise exception 'El nombre es muy largo (máximo 60 caracteres).' using errcode = '22023';
  end if;

  if v_nombre is not null then
    v_slug := public.fn_slug_unico(v_nombre, v_rest);
    -- El enlace que tenía se guarda (sin repetir, y sin el que vuelve a ser el actual). Se conservan los 20 últimos.
    v_viejos := array_remove(array_remove(v_r.slugs_anteriores, v_r.slug), v_slug);
    if v_r.slug <> v_slug then
      v_viejos := v_viejos || v_r.slug;
    end if;
    if cardinality(v_viejos) > 20 then
      v_viejos := v_viejos[cardinality(v_viejos) - 19 : cardinality(v_viejos)];
    end if;
    update public.restaurantes
       set nombre = v_nombre, slug = v_slug, slugs_anteriores = v_viejos
     where id = v_rest;
  end if;
  update public.restaurantes set pedidos_en_linea = true where id = v_rest;

  -- Cada visita empieza limpia: quien probó la demo antes deja de recibir los pedidos de la siguiente.
  delete from public.suscripciones_push
   where restaurante_id = v_rest and pedido_id is null
     and endpoint is distinct from p_conservar_endpoint;

  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 2. Platos quitados del menú (para verlos y volver a ponerlos)
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

select public.fn_aplicar_permisos();
