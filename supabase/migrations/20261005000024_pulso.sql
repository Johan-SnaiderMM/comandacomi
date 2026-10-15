-- =====================================================================
-- 24 · El pulso: una consulta liviana para saber si algo cambió
--
-- Las pantallas "en vivo" del personal (Pendientes, la plancha, el aviso de pedidos en línea y la copia sin conexión)
-- preguntaban cada pocos segundos por TODO, aunque nada hubiera cambiado. Ahora preguntan por el pulso: un resumen de
-- pocos bytes (la "huella" de los pedidos y lo que necesita el aviso), y solo si la huella cambió traen los datos.
-- Todo es de solo lectura y con el RLS de quien pregunta (no son security definer): cada quien ve lo de su local.
-- =====================================================================

-- La huella: cambia si cambia cualquier pedido que se ve en Pendientes, en la plancha, por confirmar o en los
-- cobrados de hoy (un pedido nuevo, un plato agregado, quitado o marcado listo, un cobro, una entrega, una
-- anulación…). Cuenta la fila entera de cada pedido y de cada plato: no hay que acordarse de agregar columnas.
create or replace function public.huella_pedidos()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select md5(coalesce(string_agg(
           p::text || coalesce((select string_agg(i::text, ';' order by i.id)
                                  from public.pedido_items i where i.pedido_id = p.id), ''),
           '|' order by p.id), ''))
    from public.pedidos p
   where not p.anulado
     and (p.cobrado_at is null or p.estado <> 'entregado' or p.fecha_cobro = public.jornada_actual())
$$;

-- El aviso de pedidos en línea (copia de la migración 10) con un dato más: `atiende` dice si AHORA puede llegar un
-- pedido (pedidos en línea encendidos y dentro del horario de atención). Si no puede llegar ninguno y no hay ninguno
-- esperando, la app pregunta con calma. Pasa a security definer para poder usar fn_abierto_por_horario (cerrada al
-- público): por eso filtra a mano por el local de quien pregunta, en vez de dejárselo al RLS.
create or replace function public.resumen_por_confirmar()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with r as (select pedidos_en_linea, horario from public.restaurantes where id = public.mi_restaurante()),
       esperando as (select p.* from public.pedidos p
                      where p.restaurante_id = public.mi_restaurante()
                        and p.origen = 'cliente' and p.confirmado_at is null and not p.anulado)
  select jsonb_build_object(
    'activo', coalesce((select pedidos_en_linea from r), false),
    'atiende', coalesce((select pedidos_en_linea and public.fn_abierto_por_horario(horario, now()) from r), false),
    'cantidad', (select count(*) from esperando),
    'recientes', coalesce((
      select jsonb_agg(f.fila order by f.created_at desc)
        from (
          select e.created_at,
                 jsonb_build_object('id', e.id, 'numero', e.numero, 'tipo', e.tipo, 'total', e.total,
                                    'contacto_nombre', e.contacto_nombre, 'created_at', e.created_at) as fila
            from esperando e
           order by e.created_at desc
           limit 5
        ) f), '[]'::jsonb)
  )
$$;

-- El pulso: lo único que se pregunta cada pocos segundos. El resumen del aviso solo va a quien toma pedidos.
create or replace function public.pulso()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'huella', public.huella_pedidos(),
    'por_confirmar', case when public.tiene_area('pedidos') then public.resumen_por_confirmar() end
  )
$$;

-- La plancha (copia de la migración 14) trae la huella con la que se armó: así no vuelve a pedirlo todo por un
-- cambio que ya tiene (el que acaba de marcar ella misma).
create or replace function public.listar_plancha()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ahora', now(),
    'huella', public.huella_pedidos(),
    'pedidos', coalesce((
      select jsonb_agg(x.fila order by x.created_at, x.numero)
        from (
          select p.created_at, p.numero,
                 jsonb_build_object(
                   'id', p.id, 'numero', p.numero, 'tipo', p.tipo, 'estado', p.estado, 'origen', p.origen,
                   'created_at', p.created_at, 'confirmado_at', p.confirmado_at, 'listo_at', p.listo_at,
                   'mesa', m.nombre, 'contacto_nombre', p.contacto_nombre, 'notas', p.notas,
                   'tiempo_estimado_min', p.tiempo_estimado_min,
                   'items', coalesce((
                     select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'cantidad', i.cantidad,
                                                         'notas', i.notas, 'adiciones', i.adiciones,
                                                         'listo', i.listo_at is not null)
                                      order by i.created_at, i.seq)
                       from public.pedido_items i
                      where i.pedido_id = p.id and not i.anulado and i.se_prepara), '[]'::jsonb)
                 ) as fila
            from public.pedidos p
            left join public.mesas m on m.id = p.mesa_id
           where not p.anulado and p.en_cocina and p.estado <> 'entregado'
             and (p.estado = 'pendiente' or p.listo_at > now() - interval '15 minutes')
             and exists (select 1 from public.pedido_items i
                          where i.pedido_id = p.id and not i.anulado and i.se_prepara)
        ) x), '[]'::jsonb)
  )
$$;

select public.fn_aplicar_permisos();
