# 🚨 SOLUCIÓN RÁPIDA - "Database error saving new user"

## Error que estás viendo:
```
{"code":"unexpected_failure","message":"Database error saving new user"}
```

## ✅ Solución en 3 pasos (5 minutos)

### Paso 1: Ejecutar el script de reparación

1. **Abre Supabase Dashboard**: https://supabase.com/dashboard
2. **Ve a tu proyecto**
3. **SQL Editor** > **New query**
4. **Copia y pega TODO** el contenido de: `supabase/FIX_REGISTRATION_ERROR.sql`
5. **Click "RUN"** o presiona `Ctrl/Cmd + Enter`

✅ Deberías ver en la salida:
```
✓ Tabla profiles ya existe
✓ Trigger anterior eliminado
✓ Función handle_new_user creada
✓ Trigger on_auth_user_created creado
✓ Permisos configurados
✓ Políticas RLS creadas
✅ TODO CORRECTO - Todos los usuarios tienen perfil
```

### Paso 2: Desactivar confirmación de email (Desarrollo)

1. En Supabase Dashboard: **Authentication** > **Providers**
2. Click en **Email**
3. **Desactiva** "Confirm email"
4. Click **Save**

### Paso 3: Probar de nuevo

1. Reinicia tu app local si está corriendo:
   ```bash
   # Detener (Ctrl + C) y reiniciar
   npm run dev
   ```

2. Ve a http://localhost:8080/auth

3. Intenta crear un usuario nuevo:
   - Nombre: Test User
   - Email: test@test.com
   - Contraseña: test123

4. **Abre la consola del navegador** (F12)

5. Busca estos logs:
   - ✅ `SignUp response: {user: {...}, session: {...}}`
   - ❌ `Auth error: ...` (si falla)

---

## 🔍 Si aún falla después del Paso 1

### Opción A: Verificación Manual

Ejecuta este SQL para verificar:

```sql
-- Ver si el trigger existe
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Debe devolver 1 fila

-- Ver si la función existe
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'handle_new_user';
-- Debe devolver 1 fila

-- Ver políticas
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
-- Debe devolver 4 filas
```

### Opción B: Crear usuario manualmente desde Dashboard

1. **Authentication** > **Users** > **Add user**
2. Email: tu@email.com
3. Password: tu contraseña
4. **Auto Confirm User**: ✅ **ON** (importante)
5. Click **Create new user**

Luego verifica que el perfil se creó:

```sql
SELECT u.email, p.full_name
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'tu@email.com';
```

Si `full_name` es NULL, ejecuta:

```sql
INSERT INTO profiles (id, full_name)
SELECT id, 'Tu Nombre'
FROM auth.users
WHERE email = 'tu@email.com'
ON CONFLICT (id) DO NOTHING;
```

---

## 🆘 Si NADA funciona - Reset Completo

**⚠️ ADVERTENCIA: Esto eliminará todos los datos**

```sql
-- 1. Eliminar todo
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 2. Recrear desde cero
-- Ejecuta el archivo completo: supabase/schema.sql
```

---

## 📋 Checklist de Verificación

Después de ejecutar la solución rápida, verifica:

- [ ] Trigger `on_auth_user_created` existe
- [ ] Función `handle_new_user` existe
- [ ] Tabla `profiles` existe con RLS habilitado
- [ ] 4 políticas en tabla `profiles`
- [ ] Email confirmation desactivado (desarrollo)
- [ ] Console del navegador muestra "SignUp response"

---

## 💡 Por qué ocurre este error

Este error ocurre cuando:

1. **El trigger no existe** → El perfil no se crea automáticamente
2. **El trigger no tiene permisos** → SECURITY DEFINER falta
3. **Las políticas RLS bloquean** → No puede insertar en profiles
4. **La tabla profiles no existe** → Error obvio

El script `FIX_REGISTRATION_ERROR.sql` soluciona TODOS estos casos.

---

## ✅ Después de solucionar

Una vez que funcione, recuerda:

1. **Para producción**: Habilita Email Confirmation de nuevo
2. **Configura Email Templates** en Authentication > Email Templates
3. **Prueba el flow completo** incluyendo confirmación de email
