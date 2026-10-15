-- =====================================================================
-- 23 · Primeros pasos de un local nuevo
--
-- Un restaurante de verdad nace vacío (migración 22). Inicio le muestra al dueño una guía corta (arma tu menú, agrega
-- mesas, invita a tu equipo, toma tu primer pedido, recibe pedidos por internet) y cada paso se marca solo con lo que
-- ya hay. Esta función le dice a Inicio qué hay: solo cuenta, no cambia nada.
-- =====================================================================

create or replace function public.primeros_pasos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_dueno();
begin
  return jsonb_build_object(
    'platos', (select count(*) from public.productos where restaurante_id = v_rest and activo),
    'mesas', (select count(*) from public.mesas where restaurante_id = v_rest and activa),
    'personas', (select count(*) from public.perfiles where restaurante_id = v_rest and rol <> 'dueno'),
    'invitaciones', (select count(*) from public.invitaciones_equipo
                      where restaurante_id = v_rest and usada_at is null and anulada_at is null and expira_at > now()),
    -- Basta con saber si ya hubo uno (no se cuentan todos en cada Inicio).
    'pedidos', (select count(*) from (select 1 from public.pedidos where restaurante_id = v_rest and not anulado limit 1) p),
    'en_linea', (select pedidos_en_linea from public.restaurantes where id = v_rest)
  );
end $$;

select public.fn_aplicar_permisos();
