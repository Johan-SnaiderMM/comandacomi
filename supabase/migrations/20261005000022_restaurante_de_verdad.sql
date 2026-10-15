-- =====================================================================
-- 22 · Dar de alta un restaurante DE VERDAD (no demo), con su dueño
--
-- La demo se abre con un toque ("Entrar a la demo") y por eso cualquiera es su dueño. Un restaurante de verdad no:
-- su dueño entra con SU correo y SU contraseña, y el equipo con códigos de invitación (migración 20).
--
-- Cómo se da de alta (lo hace quien administra, a mano, sin service_role):
--   1. Supabase → Authentication → Users → Add user: el correo del dueño y una contraseña temporal, con
--      "Auto Confirm User".
--   2. SQL Editor:  select public.fn_crear_restaurante('correo@del-dueno.com', 'Nombre del local', 'Nombre del dueño');
--   3. Se le entrega al dueño su correo y la contraseña temporal: entra en /entrar y la cambia en Más → Mi contraseña.
--
-- El restaurante nace vacío (sin platos ni mesas: los arma el dueño), con los roles de siempre, los pedidos en línea
-- apagados y su enlace público listo. fn_* = nadie la puede llamar desde la app.
-- =====================================================================

create or replace function public.fn_crear_restaurante(p_correo text, p_nombre text, p_dueno text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_dueno text := btrim(regexp_replace(coalesce(p_dueno, ''), '\s+', ' ', 'g'));
  v_user uuid;
  v_rest uuid;
  v_slug text;
begin
  if length(v_nombre) = 0 or length(v_nombre) > 60 then
    raise exception 'Escribe el nombre del restaurante (máximo 60 caracteres).';
  end if;
  if length(v_dueno) = 0 or length(v_dueno) > 40 then
    raise exception 'Escribe el nombre del dueño (máximo 40 caracteres).';
  end if;

  select id into v_user from auth.users where lower(email) = v_correo;
  if v_user is null then
    raise exception 'No existe el usuario %. Créalo primero en Authentication > Users (con "Auto Confirm User").', v_correo;
  end if;
  if exists (select 1 from public.perfiles where user_id = v_user) then
    raise exception 'El usuario % ya tiene un restaurante.', v_correo;
  end if;

  insert into public.restaurantes (nombre, es_demo, pedidos_en_linea)
  values (v_nombre, false, false)
  returning id, slug into v_rest, v_slug;
  insert into public.perfiles (user_id, restaurante_id, rol, nombre) values (v_user, v_rest, 'dueno', v_dueno);

  return jsonb_build_object('restaurante_id', v_rest, 'nombre', v_nombre, 'dueno', v_dueno, 'enlace_clientes', '/pedir/' || v_slug);
end $$;

select public.fn_aplicar_permisos();
