# Configuración de Supabase - Guía Completa

Esta guía te ayudará a configurar completamente tu proyecto de Supabase desde cero.

## 📋 Archivos en esta carpeta

- **`schema.sql`** - Schema completo de la base de datos (tablas, políticas, triggers)
- **`seed_data.sql`** - Datos de ejemplo opcionales para probar
- **`public_reservations_policy.sql`** - Solo las políticas para reservas públicas (si ya tienes el schema)
- **`README.md`** - Este archivo

## 🚀 Inicio Rápido (Nuevo Proyecto)

### Paso 1: Crear proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com)
2. Click en "New Project"
3. Elige nombre, región y contraseña de base de datos
4. Espera a que el proyecto se cree (~2 minutos)

### Paso 2: Obtener credenciales

1. En el Dashboard, ve a **Settings** > **API**
2. Copia:
   - **Project URL** (URL)
   - **anon/public key** (API Key pública)

### Paso 3: Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu-anon-key-aqui
```

### Paso 4: Ejecutar el schema

1. En Supabase Dashboard, ve a **SQL Editor**
2. Click en **New Query**
3. Copia TODO el contenido de `schema.sql`
4. Pega en el editor
5. Click en **RUN** o presiona `Ctrl/Cmd + Enter`
6. ✅ Deberías ver "Success. No rows returned"

### Paso 5: Verificar la instalación

Ejecuta estos queries para verificar:

```sql
-- Ver tablas creadas
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Deberías ver: profiles, raffles, raffle_numbers
```

```sql
-- Ver políticas de seguridad
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Deberías ver ~12 políticas
```

### Paso 6: Crear tu primer usuario

1. Ve a **Authentication** > **Users**
2. Click en **Add User**
3. Ingresa:
   - Email: tu@email.com
   - Password: una contraseña segura
   - Auto Confirm: ✅ ON
4. Click **Create User**

**IMPORTANTE**: El perfil se crea automáticamente gracias al trigger `on_auth_user_created`

### Paso 7: Crear datos de prueba (Opcional)

1. Obtén tu User ID:

```sql
SELECT id, email FROM auth.users;
```

2. Copia el UUID de tu usuario

3. Edita `seed_data.sql`:
   - Busca `REEMPLAZA-CON-TU-USER-ID`
   - Reemplázalo con tu UUID
   - Descomenta las secciones que quieras

4. Ejecuta el SQL en el editor

### Paso 8: Probar la aplicación

```bash
# En tu proyecto local
npm install
npm run dev
```

1. Abre http://localhost:8080
2. Inicia sesión con el usuario que creaste
3. Crea una rifa
4. ¡Prueba reservar números desde una ventana de incógnito!

## 🔐 Configuración de Autenticación

### Habilitar Email/Password

1. Ve a **Authentication** > **Providers**
2. Asegúrate que **Email** esté habilitado
3. Configura:
   - **Enable email confirmations**: OFF (para desarrollo)
   - **Enable email confirmations**: ON (para producción)

### Configurar Email Templates (Opcional)

1. Ve a **Authentication** > **Email Templates**
2. Personaliza los templates de:
   - Confirm signup
   - Reset password
   - Magic link

## 🧪 Probar Reservas Públicas

### Test 1: Usuario sin login puede reservar

1. Abre tu app en incógnito: http://localhost:8080
2. Ve a una rifa (obtén el link desde tu dashboard)
3. Click en un número disponible (verde)
4. Completa el formulario
5. Click "Reservar 24hs"
6. ✅ El número debería cambiar a amarillo (reservado)

### Test 2: Propietario puede editar cualquier número

1. Inicia sesión como propietario
2. Ve a tu rifa
3. Click en "Vista Pública"
4. Click en cualquier número (disponible, reservado o vendido)
5. ✅ Deberías ver el formulario de edición con dropdown de estado

### Test 3: Expiración de reservas

```sql
-- Simular una reserva expirada
UPDATE raffle_numbers
SET reserved_until = now() - interval '1 hour'
WHERE status = 'reserved'
LIMIT 1;

-- Limpiar reservas expiradas
SELECT clean_expired_reservations();

-- El número debería volver a estar disponible
```

## 📊 Queries Útiles

### Ver estadísticas de todas tus rifas

```sql
SELECT
  r.title,
  r.status,
  COUNT(CASE WHEN rn.status = 'available' THEN 1 END) as disponibles,
  COUNT(CASE WHEN rn.status = 'reserved' THEN 1 END) as reservados,
  COUNT(CASE WHEN rn.status = 'sold' THEN 1 END) as vendidos,
  r.price_per_number * COUNT(CASE WHEN rn.status = 'sold' THEN 1 END) as total_recaudado
FROM raffles r
LEFT JOIN raffle_numbers rn ON r.id = rn.raffle_id
GROUP BY r.id, r.title, r.status, r.price_per_number;
```

### Ver todas las reservas activas

```sql
SELECT
  r.title,
  rn.number,
  rn.buyer_name,
  rn.buyer_phone,
  rn.reserved_until,
  EXTRACT(EPOCH FROM (rn.reserved_until - now()))/3600 as horas_restantes
FROM raffle_numbers rn
JOIN raffles r ON r.id = rn.raffle_id
WHERE rn.status = 'reserved'
AND rn.reserved_until > now()
ORDER BY rn.reserved_until;
```

### Limpiar reservas expiradas

```sql
SELECT clean_expired_reservations();
```

### Ver números vendidos de una rifa

```sql
SELECT
  number,
  buyer_name,
  buyer_email,
  buyer_phone,
  sold_at
FROM raffle_numbers
WHERE raffle_id = 'TU-RAFFLE-ID'
AND status = 'sold'
ORDER BY number;
```

## 🔧 Troubleshooting

### Error: "relation does not exist"

**Problema**: La tabla no se creó correctamente.

**Solución**:
```sql
-- Verificar que existan las tablas
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### Error: "new row violates row-level security policy"

**Problema**: Las políticas RLS están bloqueando la operación.

**Solución**:
```sql
-- Verificar que RLS esté habilitado
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('raffles', 'raffle_numbers');

-- Verificar políticas
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'raffle_numbers';
```

### Error: "permission denied for table"

**Problema**: Faltan permisos para el rol anon.

**Solución**:
```sql
GRANT SELECT, UPDATE ON raffle_numbers TO anon;
GRANT SELECT ON raffles TO anon;
GRANT SELECT ON profiles TO anon;
```

### Los números no se crean automáticamente

**Problema**: El trigger no está funcionando.

**Solución**:
```sql
-- Verificar que el trigger existe
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_create_raffle_numbers';

-- Si no existe, ejecuta la sección del trigger de schema.sql
```

### Las reservas no expiran

**Solución**: Ejecuta manualmente la función de limpieza:
```sql
SELECT clean_expired_reservations();
```

Para automatizar esto, considera usar **Supabase Edge Functions** o **pg_cron**.

## 📱 Configuración de Producción

### 1. Habilitar Email Confirmations

```sql
-- En Authentication > Settings
-- Enable email confirmations: ON
```

### 2. Configurar dominio personalizado

1. Ve a **Project Settings** > **Custom Domains**
2. Agrega tu dominio
3. Configura DNS según las instrucciones

### 3. Configurar límites de rate limiting

1. Ve a **Project Settings** > **API**
2. Configura límites apropiados para tu plan

### 4. Backups automáticos

Los backups se configuran automáticamente según tu plan de Supabase.

## 🎯 Próximos Pasos

1. **Automatizar limpieza de reservas**: Usar pg_cron o Edge Functions
2. **Notificaciones**: Configurar emails cuando se reserve un número
3. **Analytics**: Agregar tracking de conversiones
4. **Pagos**: Integrar Stripe/MercadoPago para pagos online
5. **Sorteos**: Agregar función de sorteo aleatorio

## 📚 Referencias

- [Supabase Docs](https://supabase.com/docs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Postgres Functions](https://supabase.com/docs/guides/database/functions)
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
