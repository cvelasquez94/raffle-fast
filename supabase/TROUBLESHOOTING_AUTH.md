# 🔧 Troubleshooting - Problemas de Autenticación

Guía para resolver problemas comunes al crear usuarios en Supabase.

## 🚨 Problema: No puedo crear usuarios nuevos

### Diagnóstico Rápido

1. **Abre la consola del navegador** (F12 o Ctrl/Cmd + Shift + I)
2. Ve a la pestaña **Console**
3. Intenta registrar un usuario
4. Busca el mensaje: `SignUp response:` y `Auth error:`

---

## ✅ Solución 1: Desactivar Email Confirmations (Desarrollo)

**Síntoma**: El usuario se crea pero no puedes iniciar sesión, o recibes un error de "Email not confirmed".

**Causa**: Por defecto, Supabase requiere que los usuarios confirmen su email.

**Solución**:

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Authentication** > **Providers**
4. Click en **Email** (en la lista de providers)
5. Desactiva **"Confirm email"**
6. Guarda los cambios
7. Intenta registrarte de nuevo

**Para confirmar usuarios existentes**:

1. Ve a **Authentication** > **Users**
2. Encuentra el usuario
3. Click en los 3 puntos (⋮) al lado del usuario
4. Click en **"Confirm email"**

---

## ✅ Solución 2: Verificar el Trigger de Creación de Perfil

**Síntoma**: El usuario se crea en `auth.users` pero no en la tabla `profiles`, causando errores al usar la aplicación.

**Diagnóstico**:

Ejecuta este SQL en **SQL Editor**:

```sql
-- Verificar si el trigger existe
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

Si **NO devuelve ninguna fila**, el trigger no existe.

**Solución**:

Ejecuta este SQL completo en **SQL Editor**:

```sql
-- Crear la función
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear el trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

**Verificar que funcione**:

```sql
-- Ver usuarios en auth.users
SELECT id, email, created_at FROM auth.users;

-- Ver perfiles creados
SELECT id, full_name, created_at FROM profiles;

-- Deben tener la misma cantidad de filas
```

---

## ✅ Solución 3: Arreglar Perfiles Faltantes

**Síntoma**: Tienes usuarios en `auth.users` pero no en `profiles`.

**Diagnóstico**:

```sql
-- Encontrar usuarios sin perfil
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL;
```

**Solución - Crear perfiles manualmente**:

```sql
-- Crear perfiles para usuarios existentes
INSERT INTO profiles (id, full_name, phone)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Usuario'),
  u.raw_user_meta_data->>'phone'
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
```

---

## ✅ Solución 4: Verificar Políticas RLS en Profiles

**Síntoma**: Error "new row violates row-level security policy" al crear usuario.

**Diagnóstico**:

```sql
-- Ver políticas de la tabla profiles
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'profiles';
```

Debe existir una política llamada **"Users can insert own profile"** con `cmd = 'INSERT'`.

**Solución**:

```sql
-- Habilitar RLS si no está habilitado
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Crear política de inserción
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Crear otras políticas necesarias
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Anyone can view profiles"
  ON profiles
  FOR SELECT
  TO public
  USING (true);
```

---

## ✅ Solución 5: Verificar Variables de Entorno

**Síntoma**: Errores de "Invalid API key" o problemas de conexión.

**Verificación**:

1. Revisa que `.env.local` exista en la raíz del proyecto
2. Verifica que contenga:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
```

3. **IMPORTANTE**: Reinicia el servidor después de cambiar `.env`:

```bash
# Detén el servidor (Ctrl + C)
# Inicia de nuevo
npm run dev
```

**Obtener las credenciales correctas**:

1. Ve a Supabase Dashboard > **Settings** > **API**
2. Copia:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## ✅ Solución 6: Verificar Contraseña

**Síntoma**: Error al crear usuario sin mensaje específico.

**Causa**: Supabase requiere contraseñas de al menos 6 caracteres.

**Solución**: Asegúrate que la contraseña tenga al menos 6 caracteres.

El código ya tiene validación: `minLength={6}` en el input.

---

## ✅ Solución 7: Limpiar Cache del Navegador

**Síntoma**: Errores extraños que no deberían ocurrir.

**Solución**:

1. Abre DevTools (F12)
2. Click derecho en el botón de **Reload**
3. Selecciona **"Empty Cache and Hard Reload"**

O navega en modo incógnito para probar.

---

## 🧪 Probar la Creación de Usuarios

### Test Manual

1. Ve a http://localhost:8080/auth
2. Abre la consola del navegador (F12)
3. Click en **"¿No tienes cuenta? Regístrate"**
4. Completa el formulario:
   - Nombre: Test User
   - Email: test@ejemplo.com
   - Contraseña: test123
5. Click **"Crear Cuenta"**
6. Revisa la consola:
   - Debe aparecer: `SignUp response: {...}`
   - Si hay error, aparecerá: `Auth error: {...}`

### Test desde SQL

```sql
-- Ver usuarios creados
SELECT
  u.id,
  u.email,
  u.created_at as user_created,
  u.confirmed_at,
  p.full_name,
  p.created_at as profile_created
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
ORDER BY u.created_at DESC
LIMIT 5;
```

---

## 🔍 Diagnóstico Avanzado

### Ver logs de autenticación en Supabase

1. Ve a **Logs** > **Auth Logs** en Supabase Dashboard
2. Busca tu email o timestamp del error
3. Revisa el detalle del error

### Verificar toda la configuración

Ejecuta este SQL completo:

```sql
-- 1. Verificar que la tabla profiles existe
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'profiles'
) as profiles_exists;

-- 2. Verificar que RLS está habilitado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'profiles';
-- rowsecurity debe ser 'true'

-- 3. Verificar trigger
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Debe devolver una fila

-- 4. Verificar políticas
SELECT policyname
FROM pg_policies
WHERE tablename = 'profiles';
-- Debe devolver al menos 2-3 políticas

-- 5. Verificar función
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'handle_new_user';
-- Debe devolver una fila
```

Si alguno falla, ejecuta el `supabase/schema.sql` completo.

---

## 📞 Soporte Adicional

Si ninguna solución funcionó:

1. **Revisa los logs del navegador**:
   - Console → busca errores en rojo
   - Network → busca requests fallidas a Supabase

2. **Revisa los logs de Supabase**:
   - Dashboard → Logs → Auth Logs

3. **Ejecuta el schema completo**:
   - Copia `supabase/schema.sql`
   - Ejecuta en SQL Editor
   - Luego ejecuta `supabase/verification.sql` para verificar

4. **Último recurso - Recrear las tablas**:

```sql
-- ⚠️ ADVERTENCIA: Esto eliminará todos tus datos
DROP TABLE IF EXISTS raffle_numbers CASCADE;
DROP TABLE IF EXISTS raffles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;

-- Luego ejecuta supabase/schema.sql completo
```

---

## ✅ Checklist de Verificación

Usa esto para verificar que todo esté correcto:

- [ ] Variables de entorno configuradas en `.env.local`
- [ ] Servidor reiniciado después de cambiar `.env`
- [ ] Email confirmations desactivado (para desarrollo)
- [ ] Tabla `profiles` existe
- [ ] RLS habilitado en `profiles`
- [ ] Trigger `on_auth_user_created` existe
- [ ] Función `handle_new_user` existe
- [ ] Políticas de INSERT/SELECT en `profiles` existen
- [ ] Contraseña tiene al menos 6 caracteres
- [ ] Consola del navegador abierta para ver errores
