-- =====================================================================
-- COMANDA · SEED DE LA DEMO (datos ficticios) · IDEMPOTENTE
--
-- Cómo usarlo (Supabase > SQL Editor), DESPUÉS de correr las migraciones:
--   1. Authentication > Users > "Add user" > crea el usuario de la demo (correo + contraseña) con
--      "Auto Confirm User" activado. Esos mismos valores van en DEMO_EMAIL y DEMO_PASSWORD.
--   2. Cambia el correo de la línea marcada abajo por el del usuario que acabas de crear.
--   3. Ejecuta este script completo. Se puede ejecutar de nuevo cuando quieras: borra lo del
--      restaurante demo y vuelve a cargar los datos de ejemplo (igual que el botón "Reiniciar demo").
--
-- No contiene claves ni datos reales: nombres y teléfonos son inventados.
-- =====================================================================
do $$
declare
  v_correo constant text := 'demo@ejemplo.com';   -- <-- CAMBIA ESTE CORREO por el del usuario demo
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_correo);
  if v_user is null then
    raise exception 'No existe el usuario %. Créalo primero en Authentication > Users.', v_correo;
  end if;

  perform public.fn_provisionar_demo(v_user, 'La Plancha de Don Beto', 'Don Beto');
end $$;
