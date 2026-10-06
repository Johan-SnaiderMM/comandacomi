-- =====================================================================
-- Cambiar el nombre del restaurante de la demo al reiniciarla
--
-- Para enseñar la misma demo en varios locales: "Más > Reiniciar demo" pide el nombre del local, lo guarda y
-- vuelve a cargar los datos de ejemplo. Sigue siendo solo para el dueño y solo en restaurantes de demostración.
-- =====================================================================
drop function if exists public.reiniciar_demo();

create or replace function public.reiniciar_demo(p_nombre text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
begin
  if not coalesce((select es_demo from public.restaurantes where id = v_rest), false) then
    raise exception 'Solo la demo se puede reiniciar.' using errcode = '42501';
  end if;
  if p_nombre is not null and v_nombre is null then
    raise exception 'Escribe el nombre del restaurante.' using errcode = '22023';
  end if;
  if length(coalesce(v_nombre, '')) > 60 then
    raise exception 'El nombre es muy largo (máximo 60 caracteres).' using errcode = '22023';
  end if;

  if v_nombre is not null then
    update public.restaurantes set nombre = v_nombre where id = v_rest;
  end if;
  perform public.fn_cargar_datos_demo(v_rest);
  return jsonb_build_object('ok', true);
end $$;

select public.fn_aplicar_permisos();
