-- =====================================================================
-- 21 · El día que se quedó sin cerrar
--
-- Si nadie cierra el día y pasa la hora de corte (4 a. m.), la pantalla de Cierre ya muestra el día nuevo y el de
-- ayer quedaba sin cierre, sin forma de hacerlo desde la app (la base sí lo permitía: registrar_cierre acepta una
-- fecha pasada). Ahora la base dice cuál es el último día de trabajo que tuvo movimiento y quedó sin cerrar (de los
-- 7 anteriores), para que Inicio y Cierre lo ofrezcan. Cerrarlo tarde no mueve nada: lo de hoy ya es de hoy.
-- =====================================================================

-- El día más reciente, entre los 7 anteriores al de trabajo, con ventas, gastos o abonos y sin un cierre vigente.
create or replace function public.fn_dia_sin_cerrar(p_rest uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(d.dia)
    from generate_series(1, 7) as n(k)
    cross join lateral (
      select (public.fn_fecha_trabajo(now(), (select hora_corte from public.restaurantes where id = p_rest)) - n.k)::date as dia
    ) d
   where not exists (select 1 from public.cierres_dia c
                      where c.restaurante_id = p_rest and c.fecha = d.dia and not c.anulado)
     and (exists (select 1 from public.pedidos p
                   where p.restaurante_id = p_rest and p.fecha_cobro = d.dia and not p.anulado)
          or exists (select 1 from public.gastos g
                      where g.restaurante_id = p_rest and g.fecha = d.dia and not g.anulado)
          or exists (select 1 from public.movimientos_fiado m
                      where m.restaurante_id = p_rest and m.fecha = d.dia and m.tipo = 'abono' and not m.anulado))
$$;

-- Para Inicio: solo a quien ve las cuentas del día. Como texto ('2026-10-13'), igual en Supabase y en el modo local.
create or replace function public.dia_sin_cerrar()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('cierre');
begin
  return public.fn_dia_sin_cerrar(v_rest)::text;
end $$;

-- La pantalla de Cierre: igual que antes, y además `sin_cerrar` (el día que quedó abierto, si lo hay, y si no es el
-- que se está mirando).
create or replace function public.obtener_resumen_dia(p_fecha date default null, p_base integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rest uuid := public.requerir_area('cierre');
  v_fecha date := coalesce(p_fecha, public.dia_de_trabajo());
  v_cierre jsonb;
  v_base int;
  v_sin_cerrar date := public.fn_dia_sin_cerrar(v_rest);
begin
  select to_jsonb(c) into v_cierre
    from public.cierres_dia c
   where c.restaurante_id = v_rest and c.fecha = v_fecha and not c.anulado;

  v_base := coalesce(p_base, (v_cierre ->> 'base_caja')::int, 0);

  return jsonb_build_object(
    'resumen', public.fn_resumen_dia(v_rest, v_fecha, v_base),
    'cierre', v_cierre,
    'jornada', public.fn_jornada(v_rest, now()),
    'sin_cerrar', case when v_sin_cerrar is distinct from v_fecha then v_sin_cerrar end,
    'cierres_recientes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'fecha', c.fecha, 'ventas', c.ventas, 'gastos', c.gastos, 'ganancia', c.ganancia,
               'base_caja', c.base_caja, 'efectivo_esperado', c.efectivo_esperado,
               'efectivo_contado', c.efectivo_contado, 'diferencia', c.diferencia) order by c.fecha desc)
        from (select * from public.cierres_dia
               where restaurante_id = v_rest and not anulado order by fecha desc limit 7) c), '[]'::jsonb)
  );
end $$;

select public.fn_aplicar_permisos();
