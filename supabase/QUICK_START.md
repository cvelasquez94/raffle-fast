# 🚀 Quick Start - Configuración Rápida de Supabase

Sigue estos pasos en orden para configurar tu proyecto de Supabase en **menos de 10 minutos**.

## ✅ Checklist de Configuración

### 1️⃣ Crear Proyecto en Supabase (2 min)

- [ ] Ve a [supabase.com](https://supabase.com)
- [ ] Click en "New Project"
- [ ] Completa:
  - **Name**: raffle-fast (o el nombre que prefieras)
  - **Database Password**: Genera una segura y guárdala
  - **Region**: Elige la más cercana a tus usuarios
- [ ] Click "Create new project"
- [ ] ⏳ Espera 2-3 minutos a que se cree

### 2️⃣ Obtener Credenciales (1 min)

- [ ] Ve a **Settings** > **API**
- [ ] Copia estos dos valores:
  - [ ] **Project URL**: `https://xxxxx.supabase.co`
  - [ ] **anon public**: `eyJhbGc...` (clave larga)

### 3️⃣ Configurar Variables de Entorno (1 min)

- [ ] En la raíz del proyecto, copia `.env.example` a `.env.local`:
  ```bash
  cp .env.example .env.local
  ```

- [ ] Edita `.env.local` y pega tus credenciales:
  ```env
  VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
  ```

### 4️⃣ Ejecutar Schema SQL (3 min)

- [ ] En Supabase Dashboard, ve a **SQL Editor**
- [ ] Click en **"+ New query"**
- [ ] Abre el archivo `supabase/schema.sql` en tu editor
- [ ] Copia **TODO** el contenido (Ctrl/Cmd + A, Ctrl/Cmd + C)
- [ ] Pega en el SQL Editor de Supabase (Ctrl/Cmd + V)
- [ ] Click en **"RUN"** o presiona `Ctrl/Cmd + Enter`
- [ ] ✅ Deberías ver: "Success. No rows returned"

### 5️⃣ Verificar Instalación (1 min)

- [ ] En el SQL Editor, crea una **nueva query**
- [ ] Copia y pega el contenido de `supabase/verification.sql`
- [ ] Click en **"RUN"**
- [ ] ✅ Revisa que aparezcan:
  - 3 tablas (profiles, raffles, raffle_numbers)
  - ~12 políticas de seguridad
  - 3 triggers
  - 4 funciones

### 6️⃣ Crear Tu Usuario (2 min)

Opción A - Desde la aplicación (recomendado):
- [ ] Inicia la app: `npm run dev`
- [ ] Ve a http://localhost:8080/auth
- [ ] Regístrate con tu email y contraseña
- [ ] ✅ El perfil se crea automáticamente

Opción B - Desde Supabase Dashboard:
- [ ] Ve a **Authentication** > **Users**
- [ ] Click **"Add User"**
- [ ] Email: tu@email.com
- [ ] Password: una contraseña segura
- [ ] Auto Confirm: ✅ **ON**
- [ ] Click **"Create User"**

### 7️⃣ Probar la Aplicación (2 min)

- [ ] Inicia la app si no está corriendo:
  ```bash
  npm install
  npm run dev
  ```

- [ ] Abre http://localhost:8080

- [ ] Inicia sesión con tu usuario

- [ ] Crea una rifa de prueba:
  - Título: "Rifa de Prueba"
  - Descripción: "Esta es una prueba"
  - Precio: 100
  - WhatsApp: +5491112345678

- [ ] ✅ Deberías ver la grilla con 50 números

### 8️⃣ Probar Reservas Públicas (2 min)

- [ ] Copia el link de tu rifa (ej: `http://localhost:8080/raffle/xxx`)

- [ ] Abre una **ventana de incógnito** (Ctrl/Cmd + Shift + N)

- [ ] Pega el link y navega a la rifa

- [ ] Click en un número verde (disponible)

- [ ] Completa:
  - Nombre: "Usuario de Prueba"
  - Email: test@test.com (opcional)
  - Teléfono: +541112345678 (opcional)

- [ ] Click **"Reservar 24hs"**

- [ ] ✅ El número debería cambiar a amarillo (reservado)

---

## 🎉 ¡Todo listo!

Si llegaste hasta aquí, tu aplicación está 100% funcional.

## 📝 Siguientes Pasos (Opcional)

### Agregar Datos de Prueba

- [ ] Ejecuta `supabase/seed_data.sql` (edita el user_id primero)
- [ ] Esto creará rifas de ejemplo con números vendidos/reservados

### Configurar Email Confirmations

- [ ] Ve a **Authentication** > **Settings**
- [ ] Habilita "Enable email confirmations" para producción
- [ ] Personaliza templates en **Email Templates**

### Habilitar Limpieza Automática de Reservas

Opción: Crear un cron job con pg_cron o Edge Function para ejecutar:
```sql
SELECT clean_expired_reservations();
```

---

## 🆘 ¿Algo no funciona?

### Problema: No puedo reservar desde incógnito

**Solución**: Verifica las políticas RLS:
```sql
SELECT * FROM pg_policies WHERE tablename = 'raffle_numbers';
```

Debe existir: `"Anyone can reserve available numbers"`

### Problema: Los números no se crean automáticamente

**Solución**: Verifica el trigger:
```sql
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'trigger_create_raffle_numbers';
```

Si no existe, re-ejecuta la sección de triggers de `schema.sql`

### Problema: Error de permisos

**Solución**: Ejecuta:
```sql
GRANT SELECT, UPDATE ON raffle_numbers TO anon;
GRANT SELECT ON raffles TO anon;
```

---

## 📚 Más Información

- **Guía Completa**: `supabase/README.md`
- **Schema Completo**: `supabase/schema.sql`
- **Datos de Prueba**: `supabase/seed_data.sql`
- **Verificación**: `supabase/verification.sql`
- **Solo Políticas**: `supabase/public_reservations_policy.sql`

---

## 🔗 Links Útiles

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Supabase Docs](https://supabase.com/docs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [SQL Editor](https://supabase.com/docs/guides/database/overview)
